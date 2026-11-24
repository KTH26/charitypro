/**
 * "Ask AI": a chat where staff ask questions about CharityPro in plain words.
 *
 * Step 1 = read only. Claude gets one tool, get_data, that can only make GET requests to an
 * allow-list of the site's own list/report pages. Those requests go through the same login and
 * permission checks as the person asking, so the AI sees only what that person may see, and it
 * can never change anything.
 *
 * Needs the Cloudflare secret ANTHROPIC_API_KEY (set in the Cloudflare dashboard, never in code).
 */
import Anthropic from '@anthropic-ai/sdk';
import { hasPermission } from './permissions';

const MODEL = 'claude-opus-5-5';
const MAX_TOOL_ROUNDS = 10;
const MAX_RESULT_CHARS = 30000;

// Technical fields the AI never needs (versions, sync flags, internal links). Dropping them makes answers faster and cheaper.
const NOISE = new Set(['revision', 'updatedAt', 'updated_at', 'invoiceSaved', 'sponsor', 'category', 'gatewayResult', 'history', 'pledgeAutoLinked', 'pledgeAutoLinkedAt', 'coveredExpectationIds', 'coveredScheduledPaymentIds', 'expectationId', 'exchangeRateSource', 'solaBatchId', 'batchTransactionId', 'last_operation_id', 'invoiceId', 'appliedPayments', 'pendingPayments', 'cards', 'sponsorshipDays', 'fundraiserAllocations', 'paymentMethodId', 'idempotencyKey', 'requestId']);
const slim = (value: any, depth = 0): any => {
  if (Array.isArray(value)) return value.map(item => slim(item, depth + 1));
  if (!value || typeof value !== 'object' || depth > 6) return value;
  const out: any = {};
  for (const [key, item] of Object.entries(value)) { if (NOISE.has(key) || item === null || item === '' || (Array.isArray(item) && !item.length)) continue; out[key] = slim(item, depth + 1); }
  return out;
};

// The pages the AI may read. {id} = one record's id. Nothing here can change data (GET only).
const ALLOWED_PATHS: { path: string; what: string }[] = [
  { path: '/v3/summary', what: 'Overall totals (received, pending, declined, pledged, expenses).' },
  { path: '/v3/donors', what: 'Donors list. Query: search, page, limit (max 100), sort (name|yiddish|phone|email|address|city|total|openBalance), direction (asc|desc), f_<column> filters.' },
  { path: '/v3/donors/{id}/profile', what: 'One donor: details, payments (with campaign), pledges (with paid/balance/campaign), recurring schedules (with the pledge each pays), calls, totals, business links.' },
  { path: '/v3/donors/{id}/statement', what: 'One donor statement. Query: from, to (YYYY-MM-DD).' },
  { path: '/v3/pledges', what: 'Pledges list with paid, scheduled and open balance. Query: search, from, to, page, limit, sort (date|donor|yiddish|campaign|tags|amount|paid|scheduled|balance), direction, f_<column>.' },
  { path: '/v3/pledges/{id}/details', what: 'One pledge with its payments.' },
  { path: '/v3/payments', what: 'Payments list. Query: status (approved|pending|declined|postdated|all; default approved), search, method (credit_card|check|cash|e_transfer|wire|vouchers|eizer|bnei_leivy|other), from, to, page, limit, sort (date|donor|amount|method|status|campaign|campaignYear|pledgeDate|...), direction, f_<column> (e.g. f_campaignYear=2025..2025, f_campaign=^campaign 2025). Response has total and totalCAD for all matches.' },
  { path: '/v3/schedules', what: 'Recurring schedules. Query: status (all|active|paused), search, from, to, page, limit, sort (nextDate|donor|amount|frequency|method|status|pledge), direction.' },
  { path: '/v3/ledger', what: 'All money movements (payments, expenses, transfers). Query: kind (payment|bill|transfer), account (account id), status, method, search, from, to, page, limit, sort, direction.' },
  { path: '/v3/bills', what: 'Expenses / bills. Query: status (all|paid|unpaid), category, account, search, from, to, page, limit, sort, direction.' },
  { path: '/v3/vendors', what: 'Vendors with totals. Query: search, page, limit, sort (name|total|balance|count), direction.' },
  { path: '/v3/accounts', what: 'Chart of accounts with balances. Query: types (asset,liability,expense,revenue,equity), search, page, limit.' },
  { path: '/v3/accounts/{id}/ledger', what: 'Every entry of one account.' },
  { path: '/v3/profit-loss', what: 'Profit and loss. Query: from, to.' },
  { path: '/v3/tasks', what: 'Tasks / reminders. Query: status (pending|completed|all), taskType, priority, search, from, to, page, limit.' },
  { path: '/v3/receipts', what: 'Official receipts. Query: status (waiting|sent|void|failed|all), search, from, to, page, limit.' },
  { path: '/v3/expected-income', what: 'Money expected to come in (schedules and waiting payments) by method. Query: from, to.' },
  { path: '/v3/loans-payable', what: 'Loans still to pay back with due dates.' },
  { path: '/v3/credit-cards-due', what: 'Credit card bills due.' },
  { path: '/v3/donor-contacts', what: 'Call tracker entries.' },
  { path: '/v3/records/campaigns', what: 'Campaign records (name, dates, parentId for sub-campaigns, special).' },
  { path: '/v3/report-data', what: 'Full report rows. Query: source = payments|pledges|donors|bills|vendors|schedules|expected|transfers|bank|accounts|campaigns|projects|tasks|receipts|employees|messages. Campaigns rows have totals per campaign (main campaigns include their sub-campaigns). Can be large; prefer the list pages with filters when you can.' },
];

const pathPattern = (path: string) => new RegExp(`^${path.replace(/\{id\}/g, '[A-Za-z0-9_.:-]{1,120}')}$`);
const allowedPath = (path: string) => ALLOWED_PATHS.some(item => pathPattern(item.path).test(path));

const SYSTEM_PROMPT = `You are the CharityPro assistant for Hatzolah Tosh, a Canadian charity (amounts are CAD unless marked USD).
Staff ask you about donors, pledges, payments, schedules, campaigns, receipts and the accounting. Answer from the data only.

How to work:
- Be quick: ask for exactly what you need with filters, a date range and a sort, instead of reading whole lists. Totals (total, totalCAD) come with every list.
- Use the get_data tool to look things up. Call it as many times as you need (in parallel when the calls don't depend on each other). Use the filters, sort and totals the pages already give rather than reading every row.
- Never guess a number. If the data doesn't show it, say so. If a list was cut off (more pages), say how many there are in total and that you looked at part.
- You can only read. If asked to change something (add, edit, delete, send, charge), say that you can't do that yet and tell them where on the site to do it.
- Donors have an English name and often a Yiddish/Hebrew name; search works with either.

How to answer:
- Short and plain. The person is not technical.
- Start with the answer (the number or the list), then one line on how you got it if useful.
- For lists use short lines starting with "- ". For up to ~15 rows a simple table in markdown is fine.
- Money like $1,234.56. Dates like Nov 23, 2026.`;

const tools: Anthropic.Beta.BetaTool[] = [{
  name: 'get_data',
  // The tool input streams as it is written; getData checks every input (allowed path, simple query) before using it.
  eager_input_streaming: true,
  description: `Read data from CharityPro (read only). path must be one of these (replace {id} with a real id from an earlier result):\n${ALLOWED_PATHS.map(item => `- ${item.path}: ${item.what}`).join('\n')}\nquery holds the URL query parameters as strings. Lists return {items, total, totalPages} (page size up to 100).`,
  input_schema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'One of the allowed paths, e.g. /v3/payments or /v3/donors/abc123/profile' },
      query: { type: 'object', additionalProperties: { type: 'string' }, description: 'Query parameters, e.g. {"status":"all","from":"2026-01-01","limit":"100"}' },
    },
    required: ['path'],
    additionalProperties: false,
  },
}];

type ChatTurn = { role: 'user' | 'assistant'; text: string };

// "Looking at payments: search 'moshe', from 2026-11-01" - what a look-up reads, in plain words.
const PAGE_NAMES: [RegExp, string][] = [
  [/^\/v3\/donors\/[^/]+\/profile$/, 'a donor’s page'], [/^\/v3\/donors\/[^/]+\/statement$/, 'a donor statement'], [/^\/v3\/donors$/, 'donors'],
  [/^\/v3\/pledges\/[^/]+\/details$/, 'one pledge'], [/^\/v3\/pledges$/, 'pledges'], [/^\/v3\/payments$/, 'payments'], [/^\/v3\/schedules$/, 'schedules'],
  [/^\/v3\/ledger$/, 'all money movements'], [/^\/v3\/bills$/, 'expenses'], [/^\/v3\/vendors$/, 'vendors'], [/^\/v3\/accounts\/[^/]+\/ledger$/, 'one account'],
  [/^\/v3\/accounts$/, 'the chart of accounts'], [/^\/v3\/profit-loss$/, 'profit and loss'], [/^\/v3\/tasks$/, 'tasks'], [/^\/v3\/receipts$/, 'receipts'],
  [/^\/v3\/expected-income$/, 'money expected to come in'], [/^\/v3\/loans-payable$/, 'loans'], [/^\/v3\/credit-cards-due$/, 'credit cards due'],
  [/^\/v3\/donor-contacts$/, 'the call tracker'], [/^\/v3\/records\/campaigns$/, 'campaigns'], [/^\/v3\/report-data$/, 'a full report'], [/^\/v3\/summary$/, 'the overall totals'],
];
const QUERY_WORDS: Record<string, string> = { search: 'search', from: 'from', to: 'to', status: 'status', method: 'method', source: 'report', sort: 'sorted by', page: 'page' };
const rangeWords = (value: string) => {
  if (value.startsWith('^')) return `starts with ${value.slice(1)}`; if (value.startsWith('=')) return `is ${value.slice(1)}`;
  if (!value.includes('..')) return `contains ${value}`;
  const [from, to] = value.split('..');
  return from && to ? (from === to ? `is ${from}` : `${from} to ${to}`) : from ? `${from} or more` : `up to ${to}`;
};
export const describeLookup = (input: any) => {
  const path = String(input?.path || '').split('?')[0];
  const name = PAGE_NAMES.find(([pattern]) => pattern.test(path))?.[1] || path;
  const query = Object.entries(input?.query || {}).filter(([key, value]) => String(value || '') && (QUERY_WORDS[key] || key.startsWith('f_'))).slice(0, 4)
    .map(([key, value]) => key.startsWith('f_') ? `${key.slice(2)} ${rangeWords(String(value))}` : `${QUERY_WORDS[key]} ${key === 'search' ? `“${value}”` : value}`);
  return query.length ? `${name}: ${query.join(', ')}` : name;
};

export const registerAiChatRoutes = (app: any, prefix = '') => {
  app.post('/v3/ai/chat', async (c: any) => {
    const roles = (c.get('userRoles') || []) as string[];
    if (!hasPermission(roles, 'transactions.read')) return c.json({ success: false, error: 'You do not have access to the AI assistant.' }, 403);
    const apiKey = String(c.env.ANTHROPIC_API_KEY || '');
    if (!apiKey) return c.json({ success: false, error: 'The AI key is not set up yet (ANTHROPIC_API_KEY in Cloudflare).' }, 503);
    const body = await c.req.json().catch(() => ({}));
    const history: ChatTurn[] = (Array.isArray(body.messages) ? body.messages : [])
      .filter((turn: any) => (turn?.role === 'user' || turn?.role === 'assistant') && String(turn?.text || '').trim())
      .slice(-20)
      .map((turn: any) => ({ role: turn.role, text: String(turn.text).slice(0, 8000) }));
    if (!history.length || history[history.length - 1].role !== 'user') return c.json({ success: false, error: 'Type a question.' }, 400);
    while (history.length && history[0].role !== 'user') history.shift();

    // Reads a page of the site as the person asking (same login, same permissions). GET only.
    const headers = new Headers(); for (const [key, value] of c.req.raw.headers) if (!['content-type', 'content-length', 'idempotency-key'].includes(key.toLowerCase())) headers.set(key, value);
    const getData = async (input: any) => {
      const path = String(input?.path || '').split('?')[0];
      if (!allowedPath(path)) return { error: `Not allowed: ${path}. Use one of the listed paths.` };
      const query = new URLSearchParams(); for (const [key, value] of Object.entries(input?.query || {})) if (/^[\w.-]{1,40}$/.test(key)) query.set(key, String(value).slice(0, 200));
      if (query.has('limit') && Number(query.get('limit')) > 100) query.set('limit', '100');
      let executionCtx: any; try { executionCtx = c.executionCtx; } catch { executionCtx = undefined; }
      const response = await app.request(`${prefix}${path}${query.size ? `?${query}` : ''}`, { method: 'GET', headers }, c.env, executionCtx);
      const raw = await response.text();
      let text = raw; try { text = JSON.stringify(slim(JSON.parse(raw))); } catch { /* not JSON: keep as is */ }
      return { status: response.status, body: text.length > MAX_RESULT_CHARS ? `${text.slice(0, MAX_RESULT_CHARS)} …[cut: the result was ${text.length} characters; use filters, a smaller limit or another page]` : text };
    };

    const client = new Anthropic({ apiKey });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const messages: Anthropic.Beta.BetaMessageParam[] = history.map(turn => ({ role: turn.role, content: turn.text }));
    // Today's date goes after the conversation (not in the system prompt), so the system prompt stays cacheable.
    messages.push({ role: 'system', content: `Today is ${today} (Toronto).` } as any);
    const lookups: string[] = [];
    const question = history[history.length - 1].text;

    // The answer is sent as it happens, one JSON line per event, so the chat window can show every step live:
    //   {type:"status", text}  what it is doing now        {type:"step", text}  a look-up it made
    //   {type:"text", delta}   the answer as it is written  {type:"reset"}       drop the text so far (it was a note before a look-up)
    //   {type:"done", reply, lookups}                        {type:"error", error}
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start: async controller => {
        const send = (event: any) => { try { controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`)); } catch { /* the window was closed */ } };
        // A small signal every 5 seconds, so the connection never goes quiet (a quiet connection can be cut on the way).
        const heartbeat = setInterval(() => send({ type: 'ping' }), 5000);
        const seen = new Map<string, string>(); // the same look-up twice gets the first answer back
        const started = Date.now();
        console.log('ai-chat start', JSON.stringify({ user: String(c.get('userEmail') || ''), question: question.slice(0, 200) }));
        try {
          for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
            send({ type: 'status', text: round === 0 ? 'Thinking about your question…' : 'Reading what it found…' });
            const runner = client.beta.messages.stream({
              model: MODEL,
              max_tokens: 16000,
              system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
              tools,
              messages,
              output_config: { effort: 'low' }, // quick look-ups: low effort answers much faster, and is enough for reading lists and adding up
              betas: ['server-side-fallback-2026-07-01'],
              fallbacks: 'default',
            } as any);
            let writing = false;
            runner.on('text', (delta: string) => { if (!writing) { writing = true; send({ type: 'status', text: 'Writing…' }); } send({ type: 'text', delta }); });
            runner.on('streamEvent', (event: any) => { if (event?.type === 'content_block_start' && event.content_block?.type === 'tool_use') send({ type: 'status', text: 'Choosing what to look up…' }); });
            const response = await runner.finalMessage() as Anthropic.Beta.BetaMessage;
            if (response.stop_reason === 'refusal') { send({ type: 'reset' }); send({ type: 'done', reply: 'Sorry, I can’t help with that question.', lookups }); return; }
            const toolUses = response.content.filter((block): block is Anthropic.Beta.BetaToolUseBlock => block.type === 'tool_use');
            if (response.stop_reason !== 'tool_use' || !toolUses.length) {
              const reply = response.content.filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text').map(block => block.text).join('\n').trim();
              await logQuestion(c, question, reply, lookups);
              send({ type: 'done', reply: reply || (response.stop_reason === 'max_tokens' ? 'The answer was too long. Please ask a narrower question.' : 'No answer.'), lookups });
              return;
            }
            // Text written before a look-up is a note, not the answer: show it as a step and clear it.
            const note = response.content.filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === 'text').map(block => block.text).join(' ').trim();
            if (writing) send({ type: 'reset' });
            if (note) send({ type: 'step', text: note.length > 160 ? `${note.slice(0, 160)}…` : note });
            messages.push({ role: 'assistant', content: response.content as any });
            const results = await Promise.all(toolUses.map(async block => {
              const input: any = block.input || {};
              lookups.push(`${String(input.path || '')}${input.query && Object.keys(input.query).length ? ` ${JSON.stringify(input.query)}` : ''}`);
              const key = JSON.stringify({ path: input.path, query: input.query || {} });
              const label = `Looking at ${describeLookup(input)}`;
              if (seen.has(key)) { send({ type: 'step', text: `${label} (already read)` }); return { type: 'tool_result' as const, tool_use_id: block.id, content: `You already read exactly this a moment ago; it has not changed. Use that result, or change the filters or page.\n${seen.get(key)}` }; }
              const lookupStarted = Date.now();
              try {
                const result: any = await getData(input);
                const failed = 'error' in result || Number(result.status) >= 400;
                const seconds = ((Date.now() - lookupStarted) / 1000).toFixed(1);
                console.log('ai-chat lookup', JSON.stringify({ path: input.path, query: input.query || {}, status: result.status ?? 'refused', seconds, size: String(result.body || '').length }));
                send({ type: 'step', text: failed ? `${label}: could not read it (${result.error ? 'not allowed' : `error ${result.status}`})` : label });
                const content = JSON.stringify(result); if (!failed) seen.set(key, content);
                return { type: 'tool_result' as const, tool_use_id: block.id, content, ...(failed ? { is_error: true } : {}) };
              } catch (reason: any) {
                console.log('ai-chat lookup failed', JSON.stringify({ path: input.path, error: String(reason?.message || reason).slice(0, 300) }));
                send({ type: 'step', text: `${label}: could not read it (${String(reason?.message || 'error').slice(0, 80)})` });
                return { type: 'tool_result' as const, tool_use_id: block.id, content: `Error: ${reason?.message || 'could not read'}`, is_error: true };
              }
            }));
            messages.push({ role: 'user', content: results });
          }
          send({ type: 'done', reply: 'This question needed too many look-ups. Please ask a narrower question.', lookups });
        } catch (error: any) {
          console.log('ai-chat error', String(error?.status || ''), String(error?.message || error).slice(0, 500));
          send({ type: 'error', error: error instanceof Anthropic.AuthenticationError ? 'The AI key in Cloudflare is not valid. Create a new key and update ANTHROPIC_API_KEY.'
            : error instanceof Anthropic.RateLimitError ? 'The AI is busy (or the Anthropic account has no credit left). Try again in a minute.'
            : error instanceof Anthropic.APIError ? `The AI could not answer (${error.status ?? 'error'}): ${String(error.message || '').slice(0, 200)}`
            : 'The AI could not answer. Please try again.' });
        } finally {
          clearInterval(heartbeat);
          console.log('ai-chat end', JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), lookups: lookups.length }));
          try { controller.close(); } catch { /* already closed */ }
        }
      },
    });
    return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
  });
};

// Every question is kept in the audit history (who asked, the question, the start of the answer).
const logQuestion = async (c: any, question: string, reply: string, lookups: string[]) => {
  try {
    const now = Date.now(); const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'aiChat','insert',NULL,NULL,NULL,?,?,?,?,?,?,?)")
      .bind(id, JSON.stringify({ question: question.slice(0, 2000), answer: reply.slice(0, 2000), lookups: lookups.slice(0, 30) }), String(c.get('userId') || 'unknown'), String(c.get('userEmail') || 'unknown'), now, `ai-${id}`, `ai-${id}`, 'Question to the AI assistant').run();
  } catch { /* the answer still goes back even if logging fails */ }
};

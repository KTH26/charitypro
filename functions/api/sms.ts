/**
 * The balance text number. Mendel or a partner texts the Twilio number:
 *   "2163"  → the donor whose phone ends with 2163: his balance this year and all years
 *             (if a few donors match, a numbered list comes back; answer with the number)
 *   "P"     → his payments this year      "A" → his last payments (all years)
 *   "L"     → his pledges                  "?" → help
 * Only phones listed in Settings may use it. Twilio signs every message; unsigned ones are refused.
 */
import { getMessagingSettings, getSecret, logMessage, normalizePhone, splitList, validTwilioSignature } from './messaging';

type Deps = {
  loadDonorAccount: (db: any, donorId: string) => Promise<any>;
  donorDisplayName: (donor: any) => string;
};
const parse = (raw: unknown, fallback: any) => { try { return JSON.parse(String(raw)); } catch { return fallback; } };
const cad = (value: number) => '$' + Number(value || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const METHODS: Record<string, string> = { credit_card: 'card', check: 'check', cash: 'cash', e_transfer: 'e-transfer', wire: 'wire', vouchers: 'vouchers', eizer: 'Eizer', bnei_leivy: 'Bnei Leivy', other: 'other', ach: 'ACH' };
const xml = (text: string) => text.replace(/[&<>]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' } as any)[ch]);
const twiml = (text: string) => new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${text ? `<Message>${xml(text.slice(0, 1550))}</Message>` : ''}</Response>`, { headers: { 'Content-Type': 'text/xml' } });
const HELP = 'Send the last 4 digits of the donor\'s phone (for example 2163) to get his balance. Then: P = payments this year, A = all payments, L = pledges.';

/** Donors whose phone (any of his phones) ends with these digits. */
export const findDonorsByPhoneEnding = async (db: any, digits: string) => {
  const clean = (column: string) => `REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(json_extract(data,'$.${column}'),''),'-',''),' ',''),'(',''),')',''),'.',''),'+','')`;
  const rows = await db.prepare(`SELECT id,data FROM sync_records WHERE type='donors' AND is_deleted=0 AND (${['phone', 'mobilePhone', 'homePhone'].map(column => `${clean(column)} LIKE ?`).join(' OR ')}) ORDER BY lower(json_extract(data,'$.name')) LIMIT 20`).bind(`%${digits}`, `%${digits}`, `%${digits}`).all();
  return (rows.results || []).map((row: any) => ({ id: String(row.id), ...parse(row.data, {}) }));
};

export const smsReply = async (db: any, deps: Deps, from: string, rawBody: string) => {
  const body = String(rawBody || '').trim();
  const sessionKey = `sms_session_${from}`;
  const session = parse((await db.prepare('SELECT value FROM sync_metadata WHERE key=?').bind(sessionKey).first() as any)?.value, {});
  const saveSession = (value: any) => db.prepare('INSERT INTO sync_metadata(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(sessionKey, JSON.stringify({ ...value, at: Date.now() }), Date.now()).run();
  const summary = async (donorId: string) => {
    const account = await deps.loadDonorAccount(db, donorId); if (!account) return 'That donor was not found.';
    await saveSession({ donorId });
    const name = deps.donorDisplayName(account.donor); const english = String(account.donor.name || '');
    return `${name}${english && english !== name ? ` (${english})` : ''}\nBalance ${account.year}: ${cad(account.balanceThisYear)} (pledged ${cad(account.pledgedThisYear)}, paid ${cad(account.paidThisYear)})\nAll years: ${cad(account.balanceTotal)}\nReply P = payments ${account.year}, A = all payments, L = pledges.`;
  };
  if (!body || /^(\?|help|h)$/i.test(body)) return HELP;
  if (/^\d{4}$/.test(body)) {
    const donors = await findDonorsByPhoneEnding(db, body);
    if (!donors.length) return `No donor has a phone ending with ${body}.`;
    if (donors.length === 1) return summary(donors[0].id);
    await saveSession({ choices: donors.slice(0, 9).map(donor => donor.id) });
    return `${donors.length} donors have a phone ending ${body}:\n${donors.slice(0, 9).map((donor, index) => `${index + 1}. ${deps.donorDisplayName(donor)}${donor.name && deps.donorDisplayName(donor) !== donor.name ? ` (${donor.name})` : ''} ${donor.phone || donor.mobilePhone || ''}`).join('\n')}\nReply with the number.`;
  }
  const fresh = session.at && Date.now() - Number(session.at) < 6 * 60 * 60 * 1000;
  if (/^[1-9]$/.test(body) && fresh && Array.isArray(session.choices)) {
    const donorId = session.choices[Number(body) - 1]; return donorId ? summary(donorId) : 'Please answer with one of the numbers in the list.';
  }
  if (/^[PAL]$/i.test(body)) {
    if (!fresh || !session.donorId) return 'First send the last 4 digits of the donor\'s phone.';
    const account = await deps.loadDonorAccount(db, session.donorId); if (!account) return 'That donor was not found.';
    await saveSession({ donorId: session.donorId });
    const name = deps.donorDisplayName(account.donor);
    if (/^l$/i.test(body)) {
      const pledges = account.pledges.slice(-10).reverse();
      return pledges.length ? `${name} – pledges:\n${pledges.map((pledge: any) => `${pledge.date}: ${cad(Number(pledge.amount || 0))}${pledge.currency === 'USD' ? ' US' : ''}, paid ${cad(Number(pledge.paid || 0))}, owes ${cad(Number(pledge.balance || 0))}`).join('\n')}` : `${name} has no pledges.`;
    }
    const thisYear = /^p$/i.test(body);
    const payments = [...account.approvedPayments].sort((a: any, b: any) => String(b.date).localeCompare(String(a.date))).filter((payment: any) => !thisYear || String(payment.date || '').startsWith(String(account.year)));
    if (!payments.length) return `${name}: no payments${thisYear ? ` in ${account.year}` : ''}.`;
    const shown = payments.slice(0, 15); const sum = payments.reduce((total: number, payment: any) => total + Number(payment.amountCAD ?? payment.amount ?? 0), 0);
    return `${name} – payments${thisYear ? ` ${account.year}` : ''} (${payments.length}, total ${cad(sum)}):\n${shown.map((payment: any) => `${payment.date}: ${cad(Number(payment.amount || 0))}${payment.currency === 'USD' ? ' US' : ''} ${METHODS[payment.method] || payment.method || ''}${payment.checkNumber ? ` #${payment.checkNumber}` : ''}`).join('\n')}${payments.length > shown.length ? `\n…and ${payments.length - shown.length} more` : ''}`;
  }
  return HELP;
};

export const registerSmsRoutes = (app: any, deps: Deps) => {
  // Twilio calls this when a text comes in. (It is not behind the login: it checks Twilio's signature instead.)
  app.post('/v3/sms/inbound', async (c: any) => {
    const form = await c.req.parseBody().catch(() => ({}));
    const params: Record<string, string> = {}; for (const [key, value] of Object.entries(form)) params[key] = String(value);
    const token = await getSecret(c, 'TWILIO_AUTH_TOKEN');
    if (!(await validTwilioSignature(token, c.req.url, params, String(c.req.header('X-Twilio-Signature') || '')))) return c.text('Forbidden', 403);
    const from = normalizePhone(params.From || ''); const body = String(params.Body || '').trim();
    const settings = await getMessagingSettings(c.env.DB);
    const allowed = splitList(settings.smsSenders).map(normalizePhone).filter(Boolean);
    await logMessage(c, { channel: 'sms', to: from, body, kind: 'balance-lookup', status: 'sent', direction: 'in' });
    if (!from || !allowed.includes(from)) return twiml(''); // strangers get no answer
    const reply = await smsReply(c.env.DB, deps, from, body);
    await logMessage(c, { channel: 'sms', to: from, body: reply, kind: 'balance-lookup', status: 'sent', direction: 'out' });
    return twiml(reply);
  });
};

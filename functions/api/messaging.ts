/**
 * Sending emails (through a Google Apps Script on the organization's Gmail) and text messages (through Twilio).
 * Every message that goes out is written to the message log (sync_records type 'messages'), so you can see
 * who got what, and when.
 */

export type MessagingSettings = {
  orgName: string;
  emailFromName: string;
  replyTo: string;
  reminderByEmail: boolean;
  reminderBySms: boolean;
  reminderEmails: string;   // comma separated
  reminderPhones: string;   // comma separated
  smsSenders: string;       // phones that may text the balance number (comma separated)
  smsSenderNames: string;   // optional "phone=name" pairs, comma separated
  receiptAuto: boolean;     // send the official receipt by itself (card right away, check when deposited)
  receiptCc: string;        // optional copy of every receipt
};
export const defaultMessagingSettings: MessagingSettings = {
  orgName: 'Hatzolah Tosh', emailFromName: 'Hatzolah Tosh', replyTo: '', reminderByEmail: false, reminderBySms: false,
  reminderEmails: '', reminderPhones: '', smsSenders: '', smsSenderNames: '', receiptAuto: false, receiptCc: ''
};

const parse = (raw: unknown, fallback: any) => { try { return JSON.parse(String(raw)); } catch { return fallback; } };
export const splitList = (value: string) => String(value || '').split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);
export const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());

/** Phone numbers in the form +15145551234 (North America is assumed when there is no country code). */
export const normalizePhone = (value: string) => {
  const digits = String(value || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return /^\+\d{8,15}$/.test(digits) ? digits : '';
  const only = digits.replace(/\D/g, '');
  if (only.length === 10) return `+1${only}`;
  if (only.length === 11 && only.startsWith('1')) return `+${only}`;
  return '';
};

const ensureSecrets = async (db: any) => db.prepare('CREATE TABLE IF NOT EXISTS server_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
export const getSecret = async (c: any, key: string) => {
  if (c.env?.[key]) return String(c.env[key]).trim();
  try { const row: any = await c.env.DB.prepare('SELECT value FROM server_secrets WHERE key=? LIMIT 1').bind(key).first(); return String(row?.value || '').trim(); } catch { return ''; }
};
export const setSecret = async (c: any, key: string, value: string) => {
  await ensureSecrets(c.env.DB);
  if (!value) { await c.env.DB.prepare('DELETE FROM server_secrets WHERE key=?').bind(key).run(); return; }
  await c.env.DB.prepare('INSERT INTO server_secrets(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at').bind(key, value, Date.now()).run();
};
export const getMessagingSettings = async (db: any): Promise<MessagingSettings> => {
  const row: any = await db.prepare("SELECT value FROM sync_metadata WHERE key='messaging_settings'").first();
  return { ...defaultMessagingSettings, ...parse(row?.value, {}) };
};

export type MessageLog = { channel: 'email' | 'sms'; to: string; subject?: string; body: string; kind: string; donorId?: string; relatedId?: string; status: 'sent' | 'failed'; error?: string; direction?: 'out' | 'in' };
export const logMessage = async (c: any, entry: MessageLog) => {
  const id = `msg-${crypto.randomUUID()}`; const now = Date.now();
  const data = JSON.stringify({ id, ...entry, body: String(entry.body || '').slice(0, 4000), sentAt: new Date(now).toISOString(), sentBy: String(c.get?.('userEmail') || 'system') });
  try { await c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted) VALUES(?,'messages',?,?,1,0)").bind(id, data, now).run(); } catch { /* the log must never stop a message */ }
  return id;
};

export type EmailAttachment = { filename: string; html?: string; base64?: string; mimeType?: string };
/** Send one email through the Google Apps Script web app. HTML attachments are turned into PDF by the script. */
export const sendEmail = async (c: any, message: { to: string; subject: string; html: string; text?: string; attachments?: EmailAttachment[]; bcc?: string; kind: string; donorId?: string; relatedId?: string }) => {
  const url = await getSecret(c, 'GOOGLE_SCRIPT_URL'); const secret = await getSecret(c, 'GOOGLE_SCRIPT_SECRET');
  const settings = await getMessagingSettings(c.env.DB);
  let result: { ok: boolean; error?: string };
  if (!url || !secret) result = { ok: false, error: 'Email is not set up yet (Settings → Email & text messages).' };
  else if (!isEmail(message.to)) result = { ok: false, error: 'This email address is not valid.' };
  else {
    try {
      const response = await fetch(url, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ secret, to: message.to, subject: message.subject, html: message.html, text: message.text || '', attachments: message.attachments || [], bcc: message.bcc || '', fromName: settings.emailFromName || settings.orgName, replyTo: settings.replyTo || '' }) });
      const text = await response.text(); const data = parse(text, null);
      result = data?.ok ? { ok: true } : { ok: false, error: data?.error || `The Google script answered ${response.status}. Check that it is deployed for "Anyone".` };
    } catch (reason: any) { result = { ok: false, error: `Could not reach the Google script: ${reason?.message || 'network error'}` }; }
  }
  await logMessage(c, { channel: 'email', to: message.to, subject: message.subject, body: message.text || message.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), kind: message.kind, donorId: message.donorId, relatedId: message.relatedId, status: result.ok ? 'sent' : 'failed', error: result.error });
  return result;
};

/** Send one text message through Twilio. */
export const sendSms = async (c: any, message: { to: string; body: string; kind: string; donorId?: string; relatedId?: string }) => {
  const sid = await getSecret(c, 'TWILIO_ACCOUNT_SID'); const token = await getSecret(c, 'TWILIO_AUTH_TOKEN'); const from = await getSecret(c, 'TWILIO_FROM_NUMBER');
  const to = normalizePhone(message.to);
  let result: { ok: boolean; error?: string };
  if (!sid || !token || !from) result = { ok: false, error: 'Text messages are not set up yet (Settings → Email & text messages).' };
  else if (!to) result = { ok: false, error: 'This phone number is not valid.' };
  else {
    try {
      const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, { method: 'POST', headers: { Authorization: `Basic ${btoa(`${sid}:${token}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ To: to, From: from, Body: message.body.slice(0, 1500) }).toString() });
      const data: any = await response.json().catch(() => ({}));
      result = response.ok ? { ok: true } : { ok: false, error: data?.message || `Twilio answered ${response.status}.` };
    } catch (reason: any) { result = { ok: false, error: `Could not reach Twilio: ${reason?.message || 'network error'}` }; }
  }
  await logMessage(c, { channel: 'sms', to: to || message.to, body: message.body, kind: message.kind, donorId: message.donorId, relatedId: message.relatedId, status: result.ok ? 'sent' : 'failed', error: result.error });
  return result;
};

/** Twilio signs every incoming webhook: HMAC-SHA1 of the full URL plus the sorted form fields, with the auth token. */
export const validTwilioSignature = async (token: string, url: string, params: Record<string, string>, signature: string) => {
  if (!token || !signature) return false;
  const payload = url + Object.keys(params).sort().map(key => key + params[key]).join('');
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(token), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload)));
  const expected = btoa(String.fromCharCode(...mac));
  if (expected.length !== signature.length) return false;
  let diff = 0; for (let index = 0; index < expected.length; index += 1) diff |= expected.charCodeAt(index) ^ signature.charCodeAt(index);
  return diff === 0;
};

/** The code to paste in Google Apps Script (Extensions → Apps Script), deployed as a web app for "Anyone". */
export const googleScriptCode = (secret: string) => `// CharityPro email sender. Sends from this Gmail account.
const SECRET = '${secret}';

function doPost(e) {
  const req = JSON.parse(e.postData.contents);
  if (req.secret !== SECRET) return reply({ ok: false, error: 'Wrong secret' });
  try {
    const attachments = (req.attachments || []).map(function (a) {
      if (a.html) return Utilities.newBlob(a.html, 'text/html', 'file.html').getAs('application/pdf').setName(a.filename);
      return Utilities.newBlob(Utilities.base64Decode(a.base64), a.mimeType || 'application/octet-stream', a.filename);
    });
    const options = { htmlBody: req.html, attachments: attachments };
    if (req.fromName) options.name = req.fromName;
    if (req.replyTo) options.replyTo = req.replyTo;
    if (req.bcc) options.bcc = req.bcc;
    GmailApp.sendEmail(req.to, req.subject, req.text || '', options);
    return reply({ ok: true });
  } catch (err) {
    return reply({ ok: false, error: String(err) });
  }
}

function reply(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;

/** Settings → Email & text messages. */
export const registerMessagingRoutes = (app: any, requirePermission: (c: any, permission: string) => any) => {
  app.get('/v3/messaging/settings', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    let secret = await getSecret(c, 'GOOGLE_SCRIPT_SECRET');
    if (!secret) { secret = [...crypto.getRandomValues(new Uint8Array(18))].map(value => value.toString(16).padStart(2, '0')).join(''); await setSecret(c, 'GOOGLE_SCRIPT_SECRET', secret); }
    const [scriptUrl, sid, token, from] = await Promise.all(['GOOGLE_SCRIPT_URL', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER'].map(key => getSecret(c, key)));
    const origin = new URL(c.req.url).origin;
    return c.json({ success: true, settings: await getMessagingSettings(c.env.DB), email: { configured: Boolean(scriptUrl), scriptUrl, scriptCode: googleScriptCode(secret) }, sms: { configured: Boolean(sid && token && from), accountSid: sid ? `${sid.slice(0, 6)}…${sid.slice(-4)}` : '', fromNumber: from, tokenSaved: Boolean(token), inboundUrl: `${origin}/api/v3/sms/inbound` } });
  });
  app.put('/v3/messaging/settings', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    if (body.settings) {
      const current = await getMessagingSettings(c.env.DB); const incoming = body.settings || {};
      const next: any = { ...current };
      for (const key of Object.keys(defaultMessagingSettings)) if (key in incoming) next[key] = typeof (defaultMessagingSettings as any)[key] === 'boolean' ? Boolean(incoming[key]) : String(incoming[key] ?? '').slice(0, 2000);
      const badEmail = [...splitList(next.reminderEmails), ...splitList(next.receiptCc), ...(next.replyTo ? [next.replyTo] : [])].find(email => !isEmail(email));
      if (badEmail) return c.json({ success: false, error: `This email is not valid: ${badEmail}` }, 400);
      const badPhone = [...splitList(next.reminderPhones), ...splitList(next.smsSenders)].find(phone => !normalizePhone(phone));
      if (badPhone) return c.json({ success: false, error: `This phone number is not valid: ${badPhone}` }, 400);
      await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('messaging_settings',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(next), Date.now()).run();
    }
    if (typeof body.scriptUrl === 'string') { const url = body.scriptUrl.trim(); if (url && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(url)) return c.json({ success: false, error: 'Paste the web app link that ends with /exec.' }, 400); await setSecret(c, 'GOOGLE_SCRIPT_URL', url); }
    if (typeof body.twilioSid === 'string' && body.twilioSid.trim()) { if (!/^AC[0-9a-f]{32}$/i.test(body.twilioSid.trim())) return c.json({ success: false, error: 'The Twilio Account SID starts with AC and has 34 characters.' }, 400); await setSecret(c, 'TWILIO_ACCOUNT_SID', body.twilioSid.trim()); }
    if (typeof body.twilioToken === 'string' && body.twilioToken.trim()) await setSecret(c, 'TWILIO_AUTH_TOKEN', body.twilioToken.trim());
    if (typeof body.twilioFrom === 'string') { const from = body.twilioFrom.trim() ? normalizePhone(body.twilioFrom) : ''; if (body.twilioFrom.trim() && !from) return c.json({ success: false, error: 'Enter the Twilio phone number, for example +15145551234.' }, 400); await setSecret(c, 'TWILIO_FROM_NUMBER', from); }
    return c.json({ success: true });
  });
  app.post('/v3/messaging/test', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const settings = await getMessagingSettings(c.env.DB);
    const result = body.channel === 'sms'
      ? await sendSms(c, { to: String(body.to || ''), body: `Test from ${settings.orgName} CharityPro. Text messages work!`, kind: 'test' })
      : await sendEmail(c, { to: String(body.to || ''), subject: `Test from ${settings.orgName} CharityPro`, html: `<p>Emails from CharityPro work!</p>`, text: 'Emails from CharityPro work!', kind: 'test' });
    return c.json(result.ok ? { success: true } : { success: false, error: result.error }, result.ok ? 200 : 400);
  });
  // The message log: everything sent (and texts received). Filter by donor or by kind.
  app.get('/v3/messages', async (c: any) => {
    const denied = requirePermission(c, 'donors.read'); if (denied) return denied;
    const donorId = String(c.req.query('donorId') || ''); const kind = String(c.req.query('kind') || ''); const relatedId = String(c.req.query('relatedId') || '');
    let where = "type='messages' AND is_deleted=0"; const binds: any[] = [];
    if (donorId) { where += " AND json_extract(data,'$.donorId')=?"; binds.push(donorId); }
    if (kind) { where += " AND json_extract(data,'$.kind')=?"; binds.push(kind); }
    if (relatedId) { where += " AND json_extract(data,'$.relatedId')=?"; binds.push(relatedId); }
    const rows = await c.env.DB.prepare(`SELECT id,data FROM sync_records WHERE ${where} ORDER BY updated_at DESC LIMIT 200`).bind(...binds).all();
    return c.json({ success: true, items: (rows.results || []).map((row: any) => parse(row.data, {})) });
  });
};

/**
 * US-dollar card payments through Stripe.
 * 1. The program asks Stripe for a payment (POST /v3/stripe/payment-intent).
 * 2. The card is typed into Stripe's own secure box in the browser, and Stripe charges it.
 * 3. The payment is saved with POST /v3/payments and the Stripe payment id. The server asks Stripe
 *    whether it really succeeded, for that amount, and that it was never saved before.
 */
import { getSecret, setSecret } from './messaging';

const stripeApi = async (c: any, path: string, init: { method?: string; form?: Record<string, string>; idempotencyKey?: string } = {}) => {
  const key = await getSecret(c, 'STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe is not set up yet (Settings → US dollar cards).');
  const response = await fetch(`https://api.stripe.com/v1/${path}`, { method: init.method || 'GET', headers: { Authorization: `Bearer ${key}`, ...(init.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(init.idempotencyKey ? { 'Idempotency-Key': init.idempotencyKey } : {}) }, body: init.form ? new URLSearchParams(init.form).toString() : undefined });
  const data: any = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || `Stripe answered ${response.status}.`);
  return data;
};

/** Checks that a Stripe payment really went through for this donor and amount. Returns the card details or an error. */
export const verifyStripePayment = async (c: any, paymentIntentId: string, donorId: string, amount: number, currency: string) => {
  if (!/^pi_[A-Za-z0-9]+$/.test(paymentIntentId)) return { ok: false as const, error: 'The Stripe payment id is not valid.' };
  const used: any = await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.stripePaymentIntentId')=? LIMIT 1").bind(paymentIntentId).first();
  if (used) return { ok: false as const, error: 'This Stripe payment was already saved.' };
  let intent: any;
  try { intent = await stripeApi(c, `payment_intents/${encodeURIComponent(paymentIntentId)}?expand[]=latest_charge`); } catch (reason: any) { return { ok: false as const, error: reason.message }; }
  if (intent.status !== 'succeeded') return { ok: false as const, error: `The card was not charged (Stripe says: ${intent.status}).` };
  if (Number(intent.amount_received ?? intent.amount) !== Math.round(amount * 100) || String(intent.currency).toUpperCase() !== currency) return { ok: false as const, error: 'The amount charged in Stripe is not the same as this payment.' };
  if (String(intent.metadata?.donorId || '') !== donorId) return { ok: false as const, error: 'This Stripe payment belongs to another donor.' };
  const card = intent.latest_charge?.payment_method_details?.card || {};
  return { ok: true as const, last4: String(card.last4 || ''), brand: String(card.brand || ''), chargeId: String(intent.latest_charge?.id || '') };
};

const torontoDay = (unixSeconds: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(unixSeconds * 1000));
const words = (s: string) => new Set(String(s || '').toLowerCase().replace(/[^a-z֐-׿ ]/g, ' ').split(/\s+/).filter(w => w.length > 2));
const daysApart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;

export type StripeCharge = { id: string; paymentIntentId: string; date: string; amount: number; currency: string; refunded: number; status: string; name: string; email: string; card: string; description: string; donorId: string; cadAmount: number | null; cadFee: number | null; rate: number | null; payoutCurrency: string };

/** Turns Stripe's charge objects into simple rows. */
export const simplifyCharge = (ch: any): StripeCharge => {
  const bt = typeof ch.balance_transaction === 'object' && ch.balance_transaction ? ch.balance_transaction : null;
  const card = ch.payment_method_details?.card || {};
  return { id: String(ch.id), paymentIntentId: String(ch.payment_intent || ''), date: torontoDay(Number(ch.created)), amount: Number(ch.amount || 0) / 100, currency: String(ch.currency || '').toUpperCase(), refunded: Number(ch.amount_refunded || 0) / 100, status: ch.refunded ? 'Refunded' : ch.amount_refunded ? 'Part refunded' : ch.status === 'succeeded' ? 'Paid' : String(ch.status || ''), name: String(ch.billing_details?.name || ch.metadata?.name || ''), email: String(ch.billing_details?.email || ch.receipt_email || ''), card: card.last4 ? `${card.brand || 'card'} ${card.last4}` : '', description: String(ch.description || ''), donorId: String(ch.metadata?.donorId || ''), cadAmount: bt ? Number(bt.amount) / 100 : null, cadFee: bt ? Number(bt.fee) / 100 : null, rate: bt && bt.exchange_rate ? Number(bt.exchange_rate) : null, payoutCurrency: bt ? String(bt.currency || '').toUpperCase() : '' };
};

/** Matches Stripe charges to CharityPro payments: Stripe payment id first, then donor + amount + date, then amount + date + similar name. */
export const matchStripe = (charges: StripeCharge[], payments: any[], donorName: (id: string) => string) => {
  const used = new Set<string>(); const matched: { charge: StripeCharge; payment: any; how: string }[] = []; const left: StripeCharge[] = [];
  const amountOf = (p: any) => Math.round(Number(p.amount || 0) * 100);
  const take = (charge: StripeCharge, payment: any, how: string) => { used.add(payment.id); matched.push({ charge, payment, how }); };
  const pending = [...charges];
  for (const charge of pending) { const p = payments.find(p => !used.has(p.id) && ((p.stripePaymentIntentId && p.stripePaymentIntentId === charge.paymentIntentId) || (p.stripeChargeId && p.stripeChargeId === charge.id) || String(p.notes || '').includes(charge.id) || (charge.paymentIntentId && String(p.notes || '').includes(charge.paymentIntentId)))); if (p) take(charge, p, 'Stripe payment number'); }
  const rest = () => pending.filter(ch => !matched.some(m => m.charge === ch));
  for (const charge of rest()) { if (!charge.donorId) continue; const p = payments.filter(p => !used.has(p.id) && String(p.donorId) === charge.donorId && amountOf(p) === Math.round(charge.amount * 100) && daysApart(p.date, charge.date) <= 3).sort((a, b) => daysApart(a.date, charge.date) - daysApart(b.date, charge.date))[0]; if (p) take(charge, p, 'Same donor, amount and date'); }
  for (const charge of rest()) { const nameWords = words(`${charge.name} ${charge.description}`); const p = payments.filter(p => !used.has(p.id) && amountOf(p) === Math.round(charge.amount * 100) && String(p.currency || 'CAD') === charge.currency && daysApart(p.date, charge.date) <= 3).map(p => ({ p, score: [...words(donorName(String(p.donorId)))].filter(w => nameWords.has(w)).length })).filter(x => x.score > 0).sort((a, b) => b.score - a.score || daysApart(a.p.date, charge.date) - daysApart(b.p.date, charge.date))[0]?.p; if (p) take(charge, p, 'Same amount and date, similar name'); }
  for (const charge of rest()) left.push(charge);
  return { matched, onlyStripe: left, onlyCharityPro: payments.filter(p => !used.has(p.id)) };
};

/** The donor's pledge for a date: the pledge in the campaign of that date, else his last pledge before it. */
export const pickPledge = (pledges: any[], campaigns: any[], date: string) => {
  const campaign = campaigns.find(c => String(c.startDate) <= date && String(c.endDate) >= date);
  const sorted = [...pledges].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  return (campaign && sorted.filter(p => String(p.campaignId || '') === String(campaign.id)).pop()) || sorted.filter(p => String(p.date) <= date).pop() || null;
};
const writeRecord = (db: any, c: any, type: string, id: string, data: any, oldRow: any, reason: string) => {
  const now = Date.now(); const json = JSON.stringify(data); const revision = oldRow ? Number(oldRow.revision) + 1 : 1; const op = `stripe-sync-${id}-${now}`;
  const user = String(c.get?.('userId') || 'system'); const email = String(c.get?.('userEmail') || 'system');
  return [
    oldRow ? db.prepare('UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type=? AND id=? AND revision=? AND is_deleted=0').bind(json, revision, now, op, type, id, oldRow.revision)
      : db.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,?,?,?,1,0,?)').bind(id, type, json, now, op),
    db.prepare('INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,?,?,?,?,?,?,?)').bind(id, type, revision, oldRow ? 'update' : 'insert', json, now, op, op),
    db.prepare('INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id, type, oldRow ? 'update' : 'insert', oldRow ? oldRow.revision : null, revision, oldRow ? oldRow.data : null, json, user, email, now, op, op, reason),
  ];
};
const ignoredList = async (db: any): Promise<string[]> => { const row: any = await db.prepare("SELECT value FROM sync_metadata WHERE key='stripe_ignored'").first(); try { return JSON.parse(String(row?.value || '[]')); } catch { return []; } };
const alreadySaved = async (db: any, ch: StripeCharge) => db.prepare("SELECT id FROM sync_records WHERE type='transactions' AND is_deleted=0 AND (json_extract(data,'$.stripeChargeId')=? OR (?<>'' AND json_extract(data,'$.stripePaymentIntentId')=?)) LIMIT 1").bind(ch.id, ch.paymentIntentId, ch.paymentIntentId).first();

export const registerStripeRoutes = (app: any, requirePermission: (c: any, permission: string) => any) => {
  // Add one Stripe charge to CharityPro for the chosen donor (US amount + the Canadian amount Stripe paid out).
  app.post('/v3/stripe/import', async (c: any) => {
    const denied = requirePermission(c, 'transactions.create'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({})); const chargeId = String(body.chargeId || ''); const donorId = String(body.donorId || '');
    if (!/^(ch|py)_[A-Za-z0-9]+$/.test(chargeId) || !donorId) return c.json({ success: false, error: 'Choose a donor.' }, 400);
    const db = c.env.DB;
    const donor: any = await db.prepare("SELECT id FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(donorId).first(); if (!donor) return c.json({ success: false, error: 'Donor not found.' }, 404);
    let ch: StripeCharge; try { ch = simplifyCharge(await stripeApi(c, `charges/${chargeId}?expand[]=balance_transaction`)); } catch (reason: any) { return c.json({ success: false, error: reason.message }, 502); }
    if (ch.status !== 'Paid' && ch.status !== 'Part refunded') return c.json({ success: false, error: `This Stripe charge is ${ch.status.toLowerCase()} - nothing to add.` }, 400);
    if (await alreadySaved(db, ch)) return c.json({ success: false, error: 'This Stripe charge is already in CharityPro.' }, 409);
    const amount = Math.round((ch.amount - ch.refunded) * 100) / 100;
    const rateRow: any = await db.prepare("SELECT data FROM sync_records WHERE type='exchangeRate' AND is_deleted=0 LIMIT 1").first();
    const settingRate = Number(JSON.parse(String(rateRow?.data || '{}')).value ?? JSON.parse(String(rateRow?.data || '1.35'))) || 1.35;
    const chosenRate = Number(body.exchangeRate);
    const cad = ch.currency === 'CAD' ? amount : chosenRate > 0 && chosenRate < 100 ? Math.round(amount * chosenRate * 100) / 100 : ch.payoutCurrency === 'CAD' && ch.cadAmount !== null ? Math.round(ch.cadAmount * (amount / ch.amount) * 100) / 100 : Math.round(amount * settingRate * 100) / 100;
    const [pledgeRows, campaignRows] = await db.batch([db.prepare("SELECT id,data FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(donorId), db.prepare("SELECT id,data FROM sync_records WHERE type='campaigns' AND is_deleted=0")]);
    const pledge = pickPledge((pledgeRows.results || []).map((r: any) => ({ ...JSON.parse(String(r.data)), id: String(r.id) })), (campaignRows.results || []).map((r: any) => ({ ...JSON.parse(String(r.data)), id: String(r.id) })), ch.date);
    const id = `stripe-${ch.id}`;
    const item: any = { id, donorId, amount, amountCAD: cad, currency: ch.currency || 'USD', ...(ch.currency === 'USD' ? { exchangeRate: Math.round((cad / amount) * 10000) / 10000, exchangeRateSource: chosenRate > 0 && chosenRate < 100 ? 'agreed' : ch.payoutCurrency === 'CAD' ? 'stripe' : 'settings' } : {}), date: ch.date, type: 'approved', method: 'credit_card', category: 'Donation', depositStatus: 'undeposited', sourceAccountId: 'sys-undeposited-funds', offsetAccountId: ch.currency === 'USD' ? '204' : '203', stripeChargeId: ch.id, ...(ch.paymentIntentId ? { stripePaymentIntentId: ch.paymentIntentId } : {}), ...(ch.card ? { cardLast4: ch.card.split(' ').pop() } : {}), ...(pledge ? { pledgeId: pledge.id } : {}), notes: `Added from Stripe Sync. Stripe ${ch.id}${ch.name ? ' · ' + ch.name : ''}${ch.refunded ? ` · refunded $${ch.refunded}` : ''}` };
    await db.batch(writeRecord(db, c, 'transactions', id, item, null, `Stripe charge ${ch.id} added`));
    return c.json({ success: true, id, pledgeId: pledge?.id || null, amountCAD: cad });
  });
  // Mark an existing CharityPro payment as this Stripe charge.
  app.post('/v3/stripe/link', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({})); const chargeId = String(body.chargeId || ''); const paymentId = String(body.paymentId || '');
    if (!/^(ch|py)_[A-Za-z0-9]+$/.test(chargeId) || !paymentId) return c.json({ success: false, error: 'Choose a payment.' }, 400);
    const db = c.env.DB; const row: any = await db.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id=? AND is_deleted=0").bind(paymentId).first(); if (!row) return c.json({ success: false, error: 'Payment not found.' }, 404);
    let ch: StripeCharge; try { ch = simplifyCharge(await stripeApi(c, `charges/${chargeId}?expand[]=balance_transaction`)); } catch (reason: any) { return c.json({ success: false, error: reason.message }, 502); }
    if (await alreadySaved(db, ch)) return c.json({ success: false, error: 'This Stripe charge is already linked to a payment.' }, 409);
    const d = JSON.parse(String(row.data));
    // Stripe really charged it: a "pending" payment (planned installment) becomes approved and goes on the donor's pledge.
    const charged = ch.status === 'Paid' || ch.status === 'Part refunded';
    let approve: any = {};
    if (charged && d.type === 'pending') {
      approve = { type: 'approved', depositStatus: d.depositStatus || 'direct', ...(d.sourceAccountId ? {} : { sourceAccountId: 'sys-undeposited-funds' }), ...(d.offsetAccountId ? {} : { offsetAccountId: String(d.currency || 'CAD') === 'USD' ? '204' : '203' }) };
      if (!d.pledgeId && !(Array.isArray(d.pledgeAllocations) && d.pledgeAllocations.length)) {
        const [pledgeRows, campaignRows] = await db.batch([db.prepare("SELECT id,data FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(String(d.donorId || '')), db.prepare("SELECT id,data FROM sync_records WHERE type='campaigns' AND is_deleted=0")]);
        const pledge = pickPledge((pledgeRows.results || []).map((r: any) => ({ ...JSON.parse(String(r.data)), id: String(r.id) })), (campaignRows.results || []).map((r: any) => ({ ...JSON.parse(String(r.data)), id: String(r.id) })), String(d.date || ch.date));
        if (pledge) approve.pledgeId = pledge.id;
      }
    }
    const next = { ...d, ...approve, stripeChargeId: ch.id, ...(ch.paymentIntentId ? { stripePaymentIntentId: ch.paymentIntentId } : {}), ...(ch.currency === 'USD' && ch.payoutCurrency === 'CAD' && ch.cadAmount !== null && Math.round(Number(d.amount) * 100) === Math.round(ch.amount * 100) ? { amountCAD: ch.cadAmount, exchangeRate: Math.round((ch.cadAmount / ch.amount) * 10000) / 10000, exchangeRateSource: 'stripe' } : {}), notes: `${d.notes ? d.notes + ' · ' : ''}Stripe ${ch.id}` };
    const result = await db.batch(writeRecord(db, c, 'transactions', paymentId, next, row, `Linked to Stripe charge ${ch.id}`));
    if (!Number(result?.[0]?.meta?.changes ?? 1)) return c.json({ success: false, error: 'The payment was changed meanwhile - try again.' }, 409);
    return c.json({ success: true, approved: approve.type === 'approved' });
  });
  // Hide a Stripe charge from the "Only in Stripe" list (or show it again).
  app.post('/v3/stripe/ignore', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({})); const chargeId = String(body.chargeId || ''); if (!/^(ch|py)_[A-Za-z0-9]+$/.test(chargeId)) return c.json({ success: false, error: 'Bad charge id.' }, 400);
    const list = new Set(await ignoredList(c.env.DB)); if (body.ignore === false) list.delete(chargeId); else list.add(chargeId);
    await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('stripe_ignored',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify([...list]), Date.now()).run();
    return c.json({ success: true, ignored: [...list] });
  });
  // Read only: every Stripe charge since a date, next to the US-dollar / Stripe payments in CharityPro.
  app.get('/v3/stripe/compare', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(c.req.query('from') || '')) ? String(c.req.query('from')) : '2022-01-01';
    const live = c.req.query('mode') === 'live';
    let charges: StripeCharge[] = []; let after = '';
    if (!live) {
      const saved = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='stripeCharges' AND is_deleted=0 AND json_extract(data,'$.date')>=?").bind(from).all();
      charges = (saved.results || []).map((r: any) => JSON.parse(String(r.data)));
    } else try {
      for (let page = 0; page < 60; page++) {
        const list = await stripeApi(c, `charges?limit=100&created[gte]=${Math.floor(Date.parse(from + 'T00:00:00-05:00') / 1000)}&expand[]=data.balance_transaction${after ? `&starting_after=${after}` : ''}`);
        for (const ch of list.data || []) if (ch.status === 'succeeded' || ch.amount_refunded) charges.push(simplifyCharge(ch));
        if (!list.has_more || !list.data?.length) break; after = list.data[list.data.length - 1].id;
      }
    } catch (reason: any) { return c.json({ success: false, error: reason.message }, 502); }
    if (live) {
      // Save what Stripe sent, so the page shows it next time without reading Stripe again.
      const now = Date.now();
      for (let i = 0; i < charges.length; i += 50) await c.env.DB.batch(charges.slice(i, i + 50).map(ch => c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'stripeCharges',?,?,1,0,?) ON CONFLICT(type,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,revision=sync_records.revision+1,is_deleted=0,last_operation_id=excluded.last_operation_id").bind(ch.id, JSON.stringify(ch), now, `stripe-read-${now}-${ch.id}`)));
      await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('stripe_last_read',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify({ at: new Date(now).toISOString(), from, count: charges.length }), now).run();
    }
    const lastReadRow: any = await c.env.DB.prepare("SELECT value FROM sync_metadata WHERE key='stripe_last_read'").first();
    const lastRead = (() => { try { return JSON.parse(String(lastReadRow?.value || 'null')); } catch { return null; } })();
    const rows = await c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='transactions' AND is_deleted=0 AND COALESCE(json_extract(data,'$.isBatch'),0)=0 AND json_extract(data,'$.type') IN ('approved','pending') AND json_extract(data,'$.date')>=? AND (json_extract(data,'$.currency')='USD' OR json_extract(data,'$.stripePaymentIntentId') IS NOT NULL)").bind(from).all();
    const payments = (rows.results || []).map((r: any) => ({ ...JSON.parse(String(r.data)), id: String(r.id), revision: Number(r.revision) }));
    const donorRows = await c.env.DB.prepare("SELECT id,json_extract(data,'$.name') AS name FROM sync_records WHERE type='donors' AND is_deleted=0").all();
    const names = new Map((donorRows.results || []).map((r: any) => [String(r.id), String(r.name || '')]));
    const ignored = new Set(await ignoredList(c.env.DB));
    const matchedAll = matchStripe(charges, payments, id => names.get(id) || '');
    const result = { ...matchedAll, onlyStripe: matchedAll.onlyStripe.filter(ch => !ignored.has(ch.id)) };
    const ignoredRows = matchedAll.onlyStripe.filter(ch => ignored.has(ch.id)).map(ch => ({ ...ch, donorGuess: names.get(ch.donorId) || '' }));
    const pay = (p: any) => ({ ...p, donorName: names.get(String(p.donorId)) || '', id: p.id, date: p.date, donor: names.get(String(p.donorId)) || '', amount: Number(p.amount || 0), currency: p.currency || 'CAD', amountCAD: Number(p.amountCAD ?? 0) || null, method: p.method || '', status: p.type, notes: String(p.notes || '').slice(0, 160) });
    return c.json({ success: true, from, lastRead, saved: !live, counts: { ignored: ignoredRows.length, stripe: charges.length, charityPro: payments.length, matched: result.matched.length, onlyStripe: result.onlyStripe.length, onlyCharityPro: result.onlyCharityPro.length },
      matched: result.matched.map(m => ({ stripe: m.charge, payment: pay(m.payment), how: m.how })), onlyStripe: result.onlyStripe.map(ch => ({ ...ch, donorGuess: names.get(ch.donorId) || '', donorId: ch.donorId })), onlyCharityPro: result.onlyCharityPro.map(pay), ignored: ignoredRows });
  });
  app.get('/v3/stripe/settings', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const [secret, publishable] = await Promise.all([getSecret(c, 'STRIPE_SECRET_KEY'), getSecret(c, 'STRIPE_PUBLISHABLE_KEY')]);
    return c.json({ success: true, configured: Boolean(secret && publishable), publishableKey: publishable, secretSaved: Boolean(secret), testMode: secret.startsWith('sk_test_') || publishable.startsWith('pk_test_') });
  });
  app.put('/v3/stripe/settings', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const publishable = String(body.publishableKey || '').trim(); const secret = String(body.secretKey || '').trim();
    if (publishable && !/^pk_(live|test)_[A-Za-z0-9]+$/.test(publishable)) return c.json({ success: false, error: 'The publishable key starts with pk_live_ (or pk_test_).' }, 400);
    if (secret && !/^(sk|rk)_(live|test)_[A-Za-z0-9]+$/.test(secret)) return c.json({ success: false, error: 'The secret key starts with sk_live_ (or rk_live_ for a restricted key).' }, 400);
    if (publishable) await setSecret(c, 'STRIPE_PUBLISHABLE_KEY', publishable);
    if (secret) await setSecret(c, 'STRIPE_SECRET_KEY', secret);
    return c.json({ success: true });
  });
  // Step 1: ask Stripe for a payment of this amount. The card is entered in the browser after this.
  app.post('/v3/stripe/payment-intent', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const body = await c.req.json().catch(() => ({}));
    const donorId = String(body.donorId || ''); const amount = Number(body.amount); const requestId = String(body.requestId || '').trim();
    const currency = body.currency === 'CAD' ? 'CAD' : 'USD';
    if (!donorId || !(amount > 0) || amount > 1_000_000 || !requestId) return c.json({ success: false, error: 'Donor, amount and request id are needed.' }, 400);
    const donor: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(donorId).first();
    if (!donor) return c.json({ success: false, error: 'Donor not found.' }, 404);
    const name = String(JSON.parse(String(donor.data)).name || '');
    try {
      const intent = await stripeApi(c, 'payment_intents', { method: 'POST', idempotencyKey: `charitypro-${requestId}`, form: { amount: String(Math.round(amount * 100)), currency: currency.toLowerCase(), 'payment_method_types[]': 'card', description: `Donation – ${name}`.slice(0, 300), 'metadata[donorId]': donorId, 'metadata[requestId]': requestId } });
      return c.json({ success: true, id: intent.id, clientSecret: intent.client_secret, publishableKey: await getSecret(c, 'STRIPE_PUBLISHABLE_KEY') });
    } catch (reason: any) { return c.json({ success: false, error: reason.message }, 502); }
  });
};

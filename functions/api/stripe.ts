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

export const registerStripeRoutes = (app: any, requirePermission: (c: any, permission: string) => any) => {
  // Read only: every Stripe charge since a date, next to the US-dollar / Stripe payments in CharityPro.
  app.get('/v3/stripe/compare', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const from = /^\d{4}-\d{2}-\d{2}$/.test(String(c.req.query('from') || '')) ? String(c.req.query('from')) : '2022-01-01';
    const charges: StripeCharge[] = []; let after = '';
    try {
      for (let page = 0; page < 60; page++) {
        const list = await stripeApi(c, `charges?limit=100&created[gte]=${Math.floor(Date.parse(from + 'T00:00:00-05:00') / 1000)}&expand[]=data.balance_transaction${after ? `&starting_after=${after}` : ''}`);
        for (const ch of list.data || []) if (ch.status === 'succeeded' || ch.amount_refunded) charges.push(simplifyCharge(ch));
        if (!list.has_more || !list.data?.length) break; after = list.data[list.data.length - 1].id;
      }
    } catch (reason: any) { return c.json({ success: false, error: reason.message }, 502); }
    const rows = await c.env.DB.prepare("SELECT id,data FROM sync_records WHERE type='transactions' AND is_deleted=0 AND COALESCE(json_extract(data,'$.isBatch'),0)=0 AND json_extract(data,'$.type') IN ('approved','pending') AND json_extract(data,'$.date')>=? AND (json_extract(data,'$.currency')='USD' OR json_extract(data,'$.stripePaymentIntentId') IS NOT NULL)").bind(from).all();
    const payments = (rows.results || []).map((r: any) => ({ ...JSON.parse(String(r.data)), id: String(r.id) }));
    const donorRows = await c.env.DB.prepare("SELECT id,json_extract(data,'$.name') AS name FROM sync_records WHERE type='donors' AND is_deleted=0").all();
    const names = new Map((donorRows.results || []).map((r: any) => [String(r.id), String(r.name || '')]));
    const result = matchStripe(charges, payments, id => names.get(id) || '');
    const pay = (p: any) => ({ id: p.id, date: p.date, donor: names.get(String(p.donorId)) || '', amount: Number(p.amount || 0), currency: p.currency || 'CAD', amountCAD: Number(p.amountCAD ?? 0) || null, method: p.method || '', status: p.type, notes: String(p.notes || '').slice(0, 160) });
    return c.json({ success: true, from, counts: { stripe: charges.length, charityPro: payments.length, matched: result.matched.length, onlyStripe: result.onlyStripe.length, onlyCharityPro: result.onlyCharityPro.length },
      matched: result.matched.map(m => ({ stripe: m.charge, payment: pay(m.payment), how: m.how })), onlyStripe: result.onlyStripe.map(ch => ({ ...ch, donorGuess: names.get(ch.donorId) || '' })), onlyCharityPro: result.onlyCharityPro.map(pay) });
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

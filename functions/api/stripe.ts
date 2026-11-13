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

export const registerStripeRoutes = (app: any, requirePermission: (c: any, permission: string) => any) => {
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

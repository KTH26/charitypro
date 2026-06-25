import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono<{ Bindings: { DB: D1Database, PLAID_CLIENT_ID: string, PLAID_SECRET: string, PLAID_ENV?: string } }>().basePath('/api')

app.get('/sync', async (c) => {
  try {
    const result = await c.env.DB.prepare('SELECT data FROM store WHERE id = 1').first()
    return c.json({ value: result?.data || null })
  } catch (e) {
    return c.json({ value: null })
  }
})

app.post('/sync', async (c) => {
  const { value } = await c.req.json()
  await c.env.DB.prepare(
    'INSERT INTO store (id, data) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
  ).bind(value).run()
  return c.json({ success: true })
})

// Plaid Integration
// Set PLAID_ENV=development in Cloudflare dashboard / .dev.vars for real bank connections.

app.post('/plaid/create_link_token', async (c) => {
  const PLAID_ENV = c.env.PLAID_ENV || 'development';
  const PLAID_URL = `https://${PLAID_ENV}.plaid.com`;

  const reqBody = {
    client_id: c.env.PLAID_CLIENT_ID,
    secret: c.env.PLAID_SECRET,
    client_name: "Charity App",
    country_codes: ["US", "CA"],
    language: "en",
    user: { client_user_id: "user_1" },
    products: ["transactions"]
  };

  const res = await fetch(`${PLAID_URL}/link/token/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody)
  });
  
  const data = await res.json();
  return c.json(data);
});

app.post('/plaid/exchange_public_token', async (c) => {
  const PLAID_ENV = c.env.PLAID_ENV || 'development';
  const PLAID_URL = `https://${PLAID_ENV}.plaid.com`;

  const { public_token } = await c.req.json();
  
  const reqBody = {
    client_id: c.env.PLAID_CLIENT_ID,
    secret: c.env.PLAID_SECRET,
    public_token
  };

  const res = await fetch(`${PLAID_URL}/item/public_token/exchange`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(reqBody)
  });
  
  const data = await res.json();
  // We store the access_token securely in the D1 database (id = 2)
  if (data.access_token) {
    await c.env.DB.prepare(
      'INSERT INTO store (id, data) VALUES (2, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
    ).bind(data.access_token).run();
  }

  return c.json({ success: true });
});

app.post('/plaid/transactions', async (c) => {
  const PLAID_ENV = c.env.PLAID_ENV || 'development';
  const PLAID_URL = `https://${PLAID_ENV}.plaid.com`;

  try {
    const result = await c.env.DB.prepare('SELECT data FROM store WHERE id = 2').first();
    const access_token = result?.data as string;

    if (!access_token) return c.json({ error: 'No access token' }, 400);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // fetch last 30 days
    const endDate = new Date();

    const reqBody = {
      client_id: c.env.PLAID_CLIENT_ID,
      secret: c.env.PLAID_SECRET,
      access_token,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0]
    };

    const res = await fetch(`${PLAID_URL}/transactions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    
    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export const onRequest = handle(app)

import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'

const app = new Hono<{ Bindings: { DB: D1Database, PLAID_CLIENT_ID: string, PLAID_SECRET: string, PLAID_ENV?: string } }>().basePath('/api')

app.get('/sync', async (c) => {
  try {
    const results = await c.env.DB.prepare('SELECT data FROM store WHERE id >= 1000 ORDER BY id ASC').all()
    if (results && results.results && results.results.length > 0) {
      const fullString = results.results.map((r: any) => r.data).join('');
      return c.json({ value: fullString })
    }

    // Fallback to legacy id=1 if no chunks exist
    const legacy = await c.env.DB.prepare('SELECT data FROM store WHERE id = 1').first()
    return c.json({ value: legacy?.data || null })
  } catch (e) {
    return c.json({ value: null })
  }
})

app.post('/sync', async (c) => {
  try {
    const { value } = await c.req.json()
    if (!value) return c.json({ success: true })

    const chunkSize = 500000;
    const chunks = [];
    for (let i = 0; i < value.length; i += chunkSize) {
      chunks.push(value.slice(i, i + chunkSize));
    }

    await c.env.DB.prepare('DELETE FROM store WHERE id >= 1000').run();
    
    for (let i = 0; i < chunks.length; i++) {
      await c.env.DB.prepare('INSERT INTO store (id, data) VALUES (?, ?)').bind(1000 + i, chunks[i]).run();
    }

    return c.json({ success: true })
  } catch (err: any) {
    console.error(err);
    return c.json({ success: false, error: err.message }, 500)
  }
})

app.get('/init-db', async (c) => {
  try {
    await c.env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS store_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT,
        action TEXT,
        payload TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    return c.json({ success: true, message: 'Real-time event table created successfully.' });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.get('/events', async (c) => {
  try {
    const since = parseInt(c.req.query('since') || '0', 10);
    const results = await c.env.DB.prepare('SELECT id, client_id, action, payload FROM store_events WHERE id > ? ORDER BY id ASC LIMIT 500').bind(since).all();
    return c.json({ success: true, events: results.results || [] });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

app.post('/events', async (c) => {
  try {
    const { clientId, action, payload } = await c.req.json();
    if (!clientId || !action) return c.json({ success: false, error: 'Missing fields' }, 400);

    const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);
    
    // Chunk massive events if payload is too large (>500KB) to avoid D1 limits.
    // In our case, the frontend will chunk bulkAddTransactions directly, so we just insert.
    const result = await c.env.DB.prepare(
      'INSERT INTO store_events (client_id, action, payload) VALUES (?, ?, ?) RETURNING id'
    ).bind(clientId, action, payloadStr).first();
    
    return c.json({ success: true, id: result?.id });
  } catch (err: any) {
    return c.json({ success: false, error: err.message }, 500);
  }
});

// Plaid Integration
// Set PLAID_ENV=development in Cloudflare dashboard / .dev.vars for real bank connections.

const getPlaidUrl = (envVal?: string) => {
  const env = envVal?.trim().toLowerCase() || '';
  if (env.includes('production')) return 'https://production.plaid.com';
  return 'https://sandbox.plaid.com'; // Development environment was deprecated in 2024
};

app.post('/plaid/create_link_token', async (c) => {
  try {
    const PLAID_URL = getPlaidUrl(c.env.PLAID_ENV);

    const reqBody = {
      client_id: c.env.PLAID_CLIENT_ID?.trim(),
      secret: c.env.PLAID_SECRET?.trim(),
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
    
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: 'Plaid API error', status: res.status, details: text }, 400);
    }

    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: 'Worker crash', message: err.message, stack: err.stack }, 500);
  }
});

app.post('/plaid/exchange_public_token', async (c) => {
  try {
    const PLAID_URL = getPlaidUrl(c.env.PLAID_ENV);

    const { public_token } = await c.req.json();
    
    const reqBody = {
      client_id: c.env.PLAID_CLIENT_ID?.trim(),
      secret: c.env.PLAID_SECRET?.trim(),
      public_token
    };

    const res = await fetch(`${PLAID_URL}/item/public_token/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: 'Plaid API error', status: res.status, details: text }, 400);
    }

    const data = await res.json();
    if (data.access_token) {
      await c.env.DB.prepare(
        'INSERT INTO store (id, data) VALUES (2, ?) ON CONFLICT(id) DO UPDATE SET data = excluded.data'
      ).bind(data.access_token).run();
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Worker crash', message: err.message, stack: err.stack }, 500);
  }
});

app.post('/plaid/transactions', async (c) => {
  try {
    const PLAID_URL = getPlaidUrl(c.env.PLAID_ENV);

    const result = await c.env.DB.prepare('SELECT data FROM store WHERE id = 2').first();
    const access_token = result?.data as string;

    if (!access_token) return c.json({ error: 'No access token' }, 400);

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30); // fetch last 30 days
    const endDate = new Date();

    const reqBody = {
      client_id: c.env.PLAID_CLIENT_ID?.trim(),
      secret: c.env.PLAID_SECRET?.trim(),
      access_token,
      start_date: startDate.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0]
    };

    const res = await fetch(`${PLAID_URL}/transactions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: 'Plaid API error', status: res.status, details: text }, 400);
    }

    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: 'Worker crash', message: err.message, stack: err.stack }, 500);
  }
});

// Sola (Cardknox) Integration Proxy
app.post('/sola/report', async (c) => {
  try {
    const { apiKey, startDate, endDate } = await c.req.json();
    if (!apiKey) return c.json({ error: 'API Key is required' }, 400);

    const reqBody = {
      xKey: apiKey,
      xVersion: '4.5.9',
      xSoftwareName: 'CharityApp',
      xSoftwareVersion: '1.0',
      xCommand: 'report:approved',
      xBeginDate: startDate,
      xEndDate: endDate,
    };

    const res = await fetch('https://x1.cardknox.com/reportjson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });


    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: 'Sola API error', status: res.status, details: text }, 400);
    }

    const data = await res.json();
    return c.json(data);
  } catch (err: any) {
    return c.json({ error: 'Worker crash', message: err.message, stack: err.stack }, 500);
  }
});

// Sola Live Charge Proxy
app.post('/sola/charge', async (c) => {
  try {
    const { apiKey, amount, cardNum, exp, cvv, name } = await c.req.json();
    if (!apiKey || !amount || !cardNum) return c.json({ error: 'Missing required fields' }, 400);

    const reqBody = {
      xKey: apiKey,
      xVersion: '4.5.9',
      xSoftwareName: 'CharityApp',
      xSoftwareVersion: '1.0',
      xCommand: 'cc:sale',
      xAmount: amount.toString(),
      xCardNum: cardNum,
      xExp: exp,
      xCvv: cvv,
      xName: name
    };

    const res = await fetch('https://x1.cardknox.com/gatewayjson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    const data = await res.json();
    
    // Cardknox returns xResult: 'A' (Approved), 'D' (Declined), 'E' (Error)
    if (data.xResult === 'A') {
      return c.json({ success: true, ref: data.xRefNum });
    } else {
      return c.json({ success: false, error: data.xError || 'Declined' });
    }
  } catch (err: any) {
    return c.json({ success: false, error: 'Network error communicating with gateway.' }, 500);
  }
});

// Sola Recurring Setup Proxy
app.post('/sola/recurring', async (c) => {
  try {
    const { apiKey, amount, cardNum, exp, name, schedule, nextDate } = await c.req.json();
    if (!apiKey || !amount || !cardNum) return c.json({ error: 'Missing required fields' }, 400);

    const reqBody = {
      xKey: apiKey,
      xVersion: '4.5.9',
      xSoftwareName: 'CharityApp',
      xSoftwareVersion: '1.0',
      xCommand: 'recurring:add',
      xAmount: amount.toString(),
      xCardNum: cardNum,
      xExp: exp,
      xName: name,
      xSchedule: schedule, // e.g. 'monthly'
      xNextDate: nextDate // e.g. YYYYMMDD or MM/DD/YYYY
    };

    const res = await fetch('https://x1.cardknox.com/gatewayjson', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });

    const data = await res.json();
    
    if (data.xResult === 'A') {
      return c.json({ success: true, ref: data.xRefNum });
    } else {
      return c.json({ success: false, error: data.xError || 'Declined' });
    }
  } catch (err: any) {
    return c.json({ success: false, error: 'Network error communicating with gateway.' }, 500);
  }
});

export const onRequest = handle(app)

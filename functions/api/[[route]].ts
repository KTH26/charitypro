import { Hono } from 'hono'
import { handle } from 'hono/cloudflare-pages'
import { requireAuth } from './middleware';
import { getRequiredPermission, hasPermission } from './permissions';
import { validatePayload } from './validation';

const app = new Hono<{ Bindings: { DB: D1Database, PLAID_CLIENT_ID: string, PLAID_SECRET: string, PLAID_ENV?: string } }>().basePath('/api')

app.use('*', requireAuth);

const goneHandler = (c: any) => c.json({ error: 'Endpoint deprecated and removed.' }, 410);

app.all('/sync', goneHandler);
app.all('/sync-legacy', goneHandler);
app.all('/events', goneHandler);
app.all('/sync2/pull', goneHandler);
app.all('/sync2/push', goneHandler);

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
      products: ["transactions"],
      transactions: {
        days_requested: 730
      }
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

    const { public_token, accountId } = await c.req.json();
    if (!accountId) return c.json({ error: 'accountId is required' }, 400);
    
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
      await c.env.DB.prepare(`CREATE TABLE IF NOT EXISTS plaid_tokens (account_id TEXT PRIMARY KEY, access_token TEXT)`).run();
      await c.env.DB.prepare(
        'INSERT INTO plaid_tokens (account_id, access_token) VALUES (?, ?) ON CONFLICT(account_id) DO UPDATE SET access_token = excluded.access_token'
      ).bind(accountId, data.access_token).run();
    }

    return c.json({ success: true });
  } catch (err: any) {
    return c.json({ error: 'Worker crash', message: err.message, stack: err.stack }, 500);
  }
});

app.post('/plaid/transactions', async (c) => {
  try {
    const PLAID_URL = getPlaidUrl(c.env.PLAID_ENV);

    const { accountId, startDate: clientStartDate, endDate: clientEndDate } = await c.req.json();
    if (!accountId) return c.json({ error: 'accountId is required' }, 400);

    let access_token = null;
    try {
      const result = await c.env.DB.prepare('SELECT access_token FROM plaid_tokens WHERE account_id = ?').bind(accountId).first();
      access_token = result?.access_token as string;
    } catch (e) {
      // Table might not exist yet if they never exchanged a token successfully
    }

    if (!access_token) return c.json({ error: 'No access token' }, 400);

    let startDateObj = new Date();
    startDateObj.setDate(startDateObj.getDate() - 730); // fetch last 2 years by default
    if (clientStartDate) startDateObj = new Date(clientStartDate);

    let endDateObj = new Date();
    if (clientEndDate) endDateObj = new Date(clientEndDate);

    const reqBody = {
      client_id: c.env.PLAID_CLIENT_ID?.trim(),
      secret: c.env.PLAID_SECRET?.trim(),
      access_token,
      start_date: startDateObj.toISOString().split('T')[0],
      end_date: endDateObj.toISOString().split('T')[0],
      options: {
        count: 500,
        offset: 0
      }
    };

    let allTransactions: any[] = [];
    let totalTransactions = 0;
    
    const res = await fetch(`${PLAID_URL}/transactions/get`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(reqBody)
    });
    
    if (!res.ok) {
      const text = await res.text();
      return c.json({ error: 'Plaid API error', status: res.status, details: text }, 400);
    }

    const data: any = await res.json();
    allTransactions = allTransactions.concat(data.transactions || []);
    totalTransactions = data.total_transactions || 0;
    
    while (allTransactions.length < totalTransactions) {
      reqBody.options.offset = allTransactions.length;
      const nextRes = await fetch(`${PLAID_URL}/transactions/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody)
      });
      if (!nextRes.ok) break;
      const nextData: any = await nextRes.json();
      if (!nextData.transactions || nextData.transactions.length === 0) break;
      allTransactions = allTransactions.concat(nextData.transactions);
    }

    data.transactions = allTransactions;
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
      xCommand: 'report:all',
      xBeginDate: startDate.includes(':') ? startDate : `${startDate.replace(/-/g, '')}`,
      xEndDate: endDate.includes(':') ? endDate : `${endDate.replace(/-/g, '')}`,
    };
    
    // Fallback if Cardknox explicitly wants the dashed format with timestamp
    if (reqBody.xBeginDate.length === 8) {
      // 20240707 -> 2024-07-07 00:00:00
      reqBody.xBeginDate = `${reqBody.xBeginDate.slice(0,4)}-${reqBody.xBeginDate.slice(4,6)}-${reqBody.xBeginDate.slice(6,8)} 00:00:00`;
    }
    if (reqBody.xEndDate.length === 8) {
      reqBody.xEndDate = `${reqBody.xEndDate.slice(0,4)}-${reqBody.xEndDate.slice(4,6)}-${reqBody.xEndDate.slice(6,8)} 23:59:59`;
    }

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





app.get('/sync2/hardened/pull', async (c) => {
  const after = c.req.query('after') || '0';
  const limit = parseInt(c.req.query('limit') || '500');
  const userRoles = c.get('userRoles') || [];
  
  const changes = await c.env.DB.prepare('SELECT * FROM sync_changes WHERE change_id > ? ORDER BY change_id ASC LIMIT ?')
    .bind(after, limit).all();
    
  const permittedChanges = [];
  let hasMore = false;
  let nextCursor = after;
  
  if (changes.results && changes.results.length > 0) {
    if (changes.results.length === limit) {
      hasMore = true;
    }
    nextCursor = changes.results[changes.results.length - 1].change_id as string;
    
    for (const change of changes.results) {
       // Scope-level filtering logic would go here if needed per-user.
       // For now, collection-level RBAC is strictly enforced.
       const reqPerm = getRequiredPermission(change.type, 'read');
       if (hasPermission(userRoles, reqPerm)) {
          permittedChanges.push(change);
       }
    }
  }
  
  const genRec = await c.env.DB.prepare("SELECT value FROM sync_metadata WHERE key = 'sync_generation'").first();
  const syncGeneration = 7; // BUMP TO 7 to force full re-sync from cursor 0
  
  const jsonStr = JSON.stringify({
    changes: permittedChanges,
    hasMore,
    nextCursor,
    syncGeneration
  });
  
  // Base64 encode to bypass strict transparent MITM internet filters (e.g. Geder/TechLoq)
  const b64 = btoa(unescape(encodeURIComponent(jsonStr)));
  
  return c.json({
    _encoded: true,
    payload: b64
  });
});

app.post('/sync2/hardened/push', async (c) => {
  try {
    const { mutation_id, operations } = await c.req.json();
    if (!mutation_id) return c.json({ success: false, error: 'mutation_id required' }, 400);
    
    const userEmail = c.get('userEmail');
    const userId = c.get('userId');
    const userRoles = c.get('userRoles') || [];

    if (!operations || operations.length === 0) {
      return c.json({ success: true, results: [] });
    }

    const results: any[] = [];
    const serverTime = Date.now();
    
    // Check if entire mutation is already processed (Idempotency)
    const existingMut = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id = ?').bind(mutation_id).first();
    if (existingMut && existingMut.result_json) {
      return c.json({ success: true, results: JSON.parse(existingMut.result_json as string) });
    }

    for (const op of operations) {
      const opId = op.operationId;
      if (!opId) {
        results.push({ status: 'invalid', error: 'Missing operationId' });
        continue;
      }

      // Validation
      if (op.operation === 'delete' || op.operation === 'restore') {
         if (!op.reason || op.baseRevision === undefined) {
             results.push({ status: 'invalid', operationId: opId, error: 'Deletes and restores require baseRevision and reason' });
             continue;
         }
      } else {
         const valResult = validatePayload(op.type, op.data);
         if (!valResult.success) {
            results.push({ status: 'invalid', operationId: opId, error: `Validation failed: ${valResult.error.message}` });
            continue;
         }
      }
      
      // RBAC
      const reqPerm = getRequiredPermission(op.type, op.operation);
      if (!hasPermission(userRoles, reqPerm)) {
         results.push({ status: 'forbidden', operationId: opId, error: `Forbidden: Missing permission ${reqPerm}` });
         continue;
      }
      
      // Build Atomic Batch
      const stmts: any[] = [];
      let nextRev = 1;
      
      if (op.operation === 'delete') {
          nextRev = op.baseRevision + 1;
          stmts.push(c.env.DB.prepare(`
              UPDATE sync_records 
              SET is_deleted = 1, revision = revision + 1, updated_at = ?
              WHERE id = ? AND revision = ? AND is_deleted = 0
          `).bind(serverTime, op.id, op.baseRevision));
      } else if (op.operation === 'restore') {
          nextRev = op.baseRevision + 1;
          stmts.push(c.env.DB.prepare(`
              UPDATE sync_records 
              SET is_deleted = 0, data = ?, revision = revision + 1, updated_at = ?
              WHERE id = ? AND revision = ? AND is_deleted = 1
          `).bind(JSON.stringify(op.data || {}), serverTime, op.id, op.baseRevision));
      } else if (op.operation === 'insert' && op.baseRevision === 0) {
          stmts.push(c.env.DB.prepare(`
              INSERT INTO sync_records (id, type, data, updated_at, revision, is_deleted)
              VALUES (?, ?, ?, ?, 1, 0)
          `).bind(op.id, op.type, JSON.stringify(op.data), serverTime));
      } else { 
          nextRev = op.baseRevision + 1;
          stmts.push(c.env.DB.prepare(`
              UPDATE sync_records
              SET data = ?, revision = revision + 1, updated_at = ?
              WHERE id = ? AND revision = ? AND is_deleted = 0
          `).bind(JSON.stringify(op.data), serverTime, op.id, op.baseRevision));
      }

      const dataStr = op.operation === 'delete' ? '{}' : JSON.stringify(op.data || {});
      const changeId = 'chg_' + serverTime + '_' + opId;

      stmts.push(c.env.DB.prepare(`
          INSERT INTO sync_changes (change_id, record_id, type, revision, operation, data, changed_at)
          SELECT ?, id, type, revision, ?, data, updated_at
          FROM sync_records WHERE id = ? AND revision = ?
      `).bind(changeId, op.operation, op.id, nextRev));

      stmts.push(c.env.DB.prepare(`
          INSERT INTO audit_log (record_id, record_type, action, old_revision, new_revision, old_data, new_data, changed_by_user_id, changed_by_email, changed_at, mutation_id, request_id, reason)
          SELECT id, type, ?, ?, revision, '', data, ?, ?, updated_at, ?, ?, ?
          FROM sync_records WHERE id = ? AND revision = ?
      `).bind(op.operation, op.baseRevision, userId, userEmail, mutation_id, opId, op.reason || '', op.id, nextRev));

      const successResult = { status: 'accepted', operationId: opId, recordId: op.id, revision: nextRev };

      try {
        await c.env.DB.batch(stmts);
        results.push(successResult);
      } catch (err: any) {
        if (err.message.includes('CHECK constraint failed') || err.message.includes('UNIQUE constraint failed')) {
           // It's a true OCC Conflict!
           const current = await c.env.DB.prepare('SELECT revision, data, is_deleted FROM sync_records WHERE id = ?').bind(op.id).first();
           const conflictPayload = {
              status: 'conflict',
              operationId: opId,
              mutationId: mutation_id,
              recordId: op.id,
              recordType: op.type,
              operation: op.operation,
              baseRevision: op.baseRevision,
              serverRevision: current ? current.revision : null,
              serverData: current ? JSON.parse(current.data as string) : null,
              serverIsDeleted: current ? (current.is_deleted === 1) : true,
              detectedAt: serverTime
           };
           results.push(conflictPayload);
        } else {
           results.push({ status: 'integrity_error', operationId: opId, error: err.message });
        }
      }
    }
    
    // Save mutation idempotency
    await c.env.DB.prepare('INSERT INTO processed_mutations (mutation_id, result_json, server_time) VALUES (?, ?, ?) ON CONFLICT(mutation_id) DO NOTHING')
        .bind(mutation_id, JSON.stringify(results), serverTime).run();

    return c.json({ success: true, results });
    
  } catch (e: any) {
    return c.json({ success: false, error: e.message }, 500);
  }
});

app.get('/sync2/hardened/audit', async (c) => {
  const userRoles = c.get('userRoles') || [];
  if (!hasPermission(userRoles, 'audit.read')) {
     return c.json({ success: false, error: 'Forbidden: Missing audit.read permission' }, 403);
  }
  
  const limit = parseInt(c.req.query('limit') || '100');
  const offset = parseInt(c.req.query('offset') || '0');
  
  const logs = await c.env.DB.prepare('SELECT * FROM audit_log ORDER BY changed_at DESC LIMIT ? OFFSET ?')
    .bind(limit, offset).all();
    
  return c.json({ success: true, logs: logs.results || [] });
});

app.get('/debug/count', async (c) => {
  const records = await c.env.DB.prepare('SELECT count(*) as c FROM sync_records').first();
  const changes = await c.env.DB.prepare('SELECT count(*) as c FROM sync_changes').first();
  return c.json({ records: records?.c, changes: changes?.c });
});

app.get('/debug/fix-sync-changes', async (c) => {
  try {
    await c.env.DB.prepare('DELETE FROM sync_changes').run();
    await c.env.DB.prepare(`
      INSERT INTO sync_changes (record_id, type, revision, operation, data, changed_at, mutation_id, operation_id)
      SELECT id, type, revision, CASE WHEN is_deleted = 1 THEN 'delete' ELSE 'snapshot' END, data, updated_at, 'migration_v2', 'snapshot_' || id
      FROM sync_records
    `).run();
    const changes = await c.env.DB.prepare('SELECT count(*) as c FROM sync_changes').first();
    return c.json({ success: true, newCount: changes?.c });
  } catch (e: any) {
    return c.json({ success: false, error: e.message });
  }
});

app.get('/debug/types', async (c) => {
  const types = await c.env.DB.prepare('SELECT type, count(*) as c FROM sync_changes GROUP BY type').all();
  return c.json({ types: types.results });
});

app.get('/debug/invalid', async (c) => {
  const changes = await c.env.DB.prepare('SELECT change_id, type, data FROM sync_changes').all();
  let invalidCount = 0;
  let firstInvalid = null;
  for (const row of changes.results) {
    try {
      JSON.parse(row.data as string);
    } catch (e) {
      invalidCount++;
      if (!firstInvalid) firstInvalid = row;
    }
  }
  return c.json({ invalidCount, firstInvalid });
});

app.get('/debug/users', async (c) => {
  const users = await c.env.DB.prepare('SELECT * FROM users').all();
  return c.json(users.results);
});

app.get('/debug/types2', async (c) => {
  const res = await c.env.DB.prepare('SELECT type, COUNT(*) as count FROM sync_records GROUP BY type').all();
  return c.json(res.results);
});

app.get('/debug/sample-tx', async (c) => {
  const res = await c.env.DB.prepare("SELECT * FROM sync_changes WHERE type = 'transactions' LIMIT 1").first();
  return c.json(res);
});

app.get('/debug/super-fix', async (c) => {
  try {
    await c.env.DB.prepare(
      "UPDATE sync_changes SET change_id = 'mig-' || substr('0000000000' || rowid, -10, 10)"
    ).run();
    const count = await c.env.DB.prepare('SELECT count(*) as c FROM sync_changes').first();
    const sample = await c.env.DB.prepare('SELECT change_id FROM sync_changes LIMIT 5').all();
    return c.json({ success: true, count: count?.c, sample: sample.results });
  } catch (e: any) {
    return c.json({ success: false, error: e.message });
  }
});

app.get('/debug/last-mutation', async (c) => {
  const res = await c.env.DB.prepare("SELECT * FROM processed_mutations ORDER BY server_time DESC LIMIT 5").all();
  return c.json(res);
});

export const onRequest = handle(app)
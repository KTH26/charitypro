import type { Hono } from 'hono';

const parseRecord = (row: any) => ({
  ...JSON.parse(String(row.data)),
  id: String(row.id),
  revision: Number(row.revision),
  updatedAt: Number(row.updated_at)
});

const boundedLimit = (raw?: string) => Math.min(100, Math.max(1, Number.parseInt(raw || '50', 10) || 50));
const boundedPage = (raw?: string) => Math.max(1, Number.parseInt(raw || '1', 10) || 1);

const requirePermission = (c: any, permission: string) => {
  const roles = (c.get('userRoles') || []) as string[];
  if (roles.includes('administrator')) return null;
  return c.json({ success: false, error: `Forbidden: Missing permission ${permission}` }, 403);
};

export const registerServerDataRoutes = (app: Hono<any>) => {
  app.get('/v3/summary', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;

    const [recordCounts, paymentSummary, latestChange] = await c.env.DB.batch([
      c.env.DB.prepare(`
        SELECT type, COUNT(*) AS count
        FROM sync_records
        WHERE is_deleted = 0
        GROUP BY type
      `),
      c.env.DB.prepare(`
        SELECT
          SUM(CASE WHEN json_extract(data, '$.type') = 'approved' THEN 1 ELSE 0 END) AS approved_count,
          SUM(CASE WHEN json_extract(data, '$.type') = 'pending' THEN 1 ELSE 0 END) AS pending_count,
          SUM(CASE WHEN json_extract(data, '$.type') = 'approved'
            THEN COALESCE(json_extract(data, '$.amountCAD'), json_extract(data, '$.amount'), 0)
            ELSE 0 END) AS approved_total_cad
        FROM sync_records
        WHERE type = 'transactions' AND is_deleted = 0
      `),
      c.env.DB.prepare('SELECT COALESCE(MAX(change_id), 0) AS latest_change_id FROM sync_changes')
    ]);

    return c.json({
      success: true,
      recordCounts: recordCounts.results,
      payments: paymentSummary.results[0] || {},
      latestChangeId: latestChange.results[0]?.latest_change_id || 0
    });
  });

  app.get('/v3/payments', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;

    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = (c.req.query('search') || '').trim().toLowerCase();
    const method = (c.req.query('method') || '').trim();
    const from = (c.req.query('from') || '').trim();
    const to = (c.req.query('to') || '').trim();
    const status = (c.req.query('status') || 'approved').trim();

    const conditions = [
      "t.type = 'transactions'",
      't.is_deleted = 0',
      "json_extract(t.data, '$.type') = ?"
    ];
    const bindings: any[] = [status];
    if (method) { conditions.push("json_extract(t.data, '$.method') = ?"); bindings.push(method); }
    if (from) { conditions.push("json_extract(t.data, '$.date') >= ?"); bindings.push(from); }
    if (to) { conditions.push("json_extract(t.data, '$.date') <= ?"); bindings.push(to); }
    if (search) {
      conditions.push(`(
        lower(COALESCE(json_extract(d.data, '$.name'), '')) LIKE ? OR
        CAST(COALESCE(json_extract(t.data, '$.amount'), '') AS TEXT) LIKE ? OR
        lower(COALESCE(json_extract(t.data, '$.notes'), '')) LIKE ?
      )`);
      const term = `%${search}%`;
      bindings.push(term, term, term);
    }

    const where = conditions.join(' AND ');
    const join = `LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(t.data,'$.donorId') AND d.is_deleted=0`;
    const listSql = `
      SELECT t.id, t.data, t.revision, t.updated_at,
             json_extract(d.data, '$.name') AS donor_name
      FROM sync_records t ${join}
      WHERE ${where}
      ORDER BY json_extract(t.data, '$.date') DESC, t.id DESC
      LIMIT ? OFFSET ?
    `;
    const totalsSql = `
      SELECT COUNT(*) AS count,
             COALESCE(SUM(COALESCE(json_extract(t.data, '$.amountCAD'), json_extract(t.data, '$.amount'), 0)), 0) AS total_cad
      FROM sync_records t ${join}
      WHERE ${where}
    `;

    const [listResult, totalsResult] = await c.env.DB.batch([
      c.env.DB.prepare(listSql).bind(...bindings, limit, offset),
      c.env.DB.prepare(totalsSql).bind(...bindings)
    ]);
    const total = Number(totalsResult.results[0]?.count || 0);
    return c.json({
      success: true,
      items: listResult.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor' })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      totalCAD: Number(totalsResult.results[0]?.total_cad || 0)
    });
  });

  app.get('/v3/donors', async (c: any) => {
    const denied = requirePermission(c, 'donors.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = (c.req.query('search') || '').trim().toLowerCase();
    const condition = search
      ? `AND (lower(COALESCE(json_extract(data,'$.name'),'')) LIKE ? OR lower(COALESCE(json_extract(data,'$.email'),'')) LIKE ? OR COALESCE(json_extract(data,'$.phone'),'') LIKE ?)`
      : '';
    const searchBindings = search ? [`%${search}%`, `%${search}%`, `%${search}%`] : [];
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id,data,revision,updated_at FROM sync_records WHERE type='donors' AND is_deleted=0 ${condition} ORDER BY lower(json_extract(data,'$.name')) LIMIT ? OFFSET ?`).bind(...searchBindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records WHERE type='donors' AND is_deleted=0 ${condition}`).bind(...searchBindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map(parseRecord), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/accounts', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const result = await c.env.DB.prepare(`
      SELECT id,data,revision,updated_at
      FROM sync_records
      WHERE type='accounts' AND is_deleted=0
      ORDER BY json_extract(data,'$.type'), lower(json_extract(data,'$.name'))
    `).all();
    return c.json({ success: true, items: result.results.map(parseRecord) });
  });

  app.post('/v3/payments', async (c: any) => {
    const denied = requirePermission(c, 'transactions.create');
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'requestId is required' }, 400);
    const mutationId = `v3-payment-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));

    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount <= 0) return c.json({ success: false, error: 'Payment amount must be greater than zero.' }, 400);
    const donorId = String(body.donorId || '');
    const sourceAccountId = String(body.sourceAccountId || '');
    const offsetAccountId = String(body.offsetAccountId || '');
    if (!donorId || !sourceAccountId || !offsetAccountId) return c.json({ success: false, error: 'Donor, receiving account, and offset account are required.' }, 400);

    const refs = await c.env.DB.prepare(`
      SELECT type,id FROM sync_records
      WHERE is_deleted=0 AND ((type='donors' AND id=?) OR (type='accounts' AND id IN (?,?)))
    `).bind(donorId, sourceAccountId, offsetAccountId).all();
    const found = new Set(refs.results.map((row: any) => `${row.type}:${row.id}`));
    if (!found.has(`donors:${donorId}`) || !found.has(`accounts:${sourceAccountId}`) || !found.has(`accounts:${offsetAccountId}`)) {
      return c.json({ success: false, error: 'A referenced donor or account does not exist.' }, 409);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const method = String(body.method || 'other');
    const currency = body.currency === 'USD' ? 'USD' : 'CAD';
    const amountCAD = Number.isFinite(Number(body.amountCAD)) ? Number(body.amountCAD) : amount;
    const undeposited = sourceAccountId === 'sys-undeposited-funds' || body.depositStatus === 'undeposited';
    const record = {
      id, donorId, amount, amountCAD,
      date: String(body.date || new Date().toISOString().slice(0, 10)),
      type: body.type === 'pending' ? 'pending' : 'approved',
      method, currency,
      sourceAccountId: undeposited ? 'sys-undeposited-funds' : sourceAccountId,
      offsetAccountId,
      depositStatus: undeposited ? 'undeposited' : 'direct',
      ...(body.fundraiserId ? { fundraiserId: String(body.fundraiserId) } : {}),
      ...(body.projectId ? { projectId: String(body.projectId) } : {}),
      ...(body.pledgeId ? { pledgeId: String(body.pledgeId) } : {}),
      ...(body.sponsor ? { sponsor: String(body.sponsor) } : {}),
      ...(body.notes ? { notes: String(body.notes) } : {})
    };
    const data = JSON.stringify(record);
    const operationId = `${mutationId}-insert`;
    const response = { success: true, item: { ...record, revision: 1, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');

    await c.env.DB.batch([
      c.env.DB.prepare(`INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'transactions',?,?,1,0,?)`).bind(id, data, now, operationId),
      c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'transactions',1,'insert',?,?,?,?)`).bind(id, data, now, mutationId, operationId),
      c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'transactions','insert',NULL,1,NULL,?,?,?,?,?,?,?)`).bind(id, data, userId, userEmail, now, mutationId, operationId, 'Created through server-driven payment API'),
      c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
    ]);
    return c.json(response, 201);
  });

  app.delete('/v3/payments/:id', async (c: any) => {
    const denied = requirePermission(c, 'transactions.reverse');
    if (denied) return denied;
    const id = c.req.param('id');
    const requestId = (c.req.header('Idempotency-Key') || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key header is required.' }, 400);
    const mutationId = `v3-payment-delete-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id=? AND is_deleted=0").bind(id).first();
    if (!current) return c.json({ success: false, error: 'Payment not found.' }, 404);
    const now = Date.now();
    const nextRevision = Number(current.revision) + 1;
    const operationId = `${mutationId}-delete`;
    const response = { success: true, id, revision: nextRevision };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE sync_records SET is_deleted=1,revision=?,updated_at=?,last_operation_id=? WHERE type='transactions' AND id=? AND revision=? AND is_deleted=0").bind(nextRevision, now, operationId, id, current.revision),
      c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'transactions',?,'delete','{}',?,?,?)").bind(id, nextRevision, now, mutationId, operationId),
      c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'transactions','delete',?,?,?,'{}',?,?,?,?,?,?,?)").bind(id, current.revision, nextRevision, current.data, userId, userEmail, now, mutationId, operationId, 'Deleted through server-driven payment API'),
      c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
    ]);
    return c.json(response);
  });
};

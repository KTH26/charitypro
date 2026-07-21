import type { Hono } from 'hono';
import { validatePayload } from './validation';

const parseRecord = (row: any) => ({
  ...JSON.parse(String(row.data)),
  id: String(row.id),
  revision: Number(row.revision),
  updatedAt: Number(row.updated_at)
});

const boundedLimit = (raw?: string) => Math.min(100, Math.max(1, Number.parseInt(raw || '50', 10) || 50));
const boundedPage = (raw?: string) => Math.max(1, Number.parseInt(raw || '1', 10) || 1);

const genericCollections: Record<string, { read: string; create: string; update: string; delete: string }> = {
  pledges: { read: 'transactions.read', create: 'transactions.create', update: 'transactions.approve', delete: 'transactions.reverse' },
  recurringPayments: { read: 'transactions.read', create: 'transactions.create', update: 'transactions.approve', delete: 'transactions.reverse' },
  vendors: { read: 'bills.read', create: 'bills.create', update: 'bills.approve', delete: 'bills.approve' },
  tasks: { read: 'system.manage', create: 'system.manage', update: 'system.manage', delete: 'system.manage' },
  projects: { read: 'system.manage', create: 'system.manage', update: 'system.manage', delete: 'system.manage' },
  fundraisers: { read: 'donors.read', create: 'donors.create', update: 'donors.update', delete: 'donors.delete' },
  employees: { read: 'payroll.read', create: 'payroll.manage', update: 'payroll.manage', delete: 'payroll.manage' },
  t4aSlips: { read: 'payroll.read', create: 'payroll.manage', update: 'payroll.manage', delete: 'payroll.manage' },
  recurringPayroll: { read: 'payroll.read', create: 'payroll.manage', update: 'payroll.manage', delete: 'payroll.manage' },
  recurringExpenses: { read: 'bills.read', create: 'bills.create', update: 'bills.approve', delete: 'bills.approve' },
  accountTransfers: { read: 'transactions.read', create: 'transactions.create', update: 'transactions.approve', delete: 'transactions.reverse' }
};

export const depositCandidateWindow = (bankDate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(bankDate)) return null;
  const date = new Date(`${bankDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  const end = new Date(date);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);
  if (date.getUTCDay() === 1) start.setUTCDate(start.getUTCDate() - 2);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
};

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

  app.get('/v3/records/:type', async (c: any) => {
    const type = String(c.req.param('type') || '');
    const permissions = genericCollections[type];
    if (!permissions) return c.json({ success: false, error: 'Unsupported cloud record type.' }, 404);
    const denied = requirePermission(c, permissions.read);
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase();
    const condition = search ? ' AND lower(data) LIKE ?' : '';
    const bindings = search ? [`%${search}%`] : [];
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id,data,revision,updated_at FROM sync_records WHERE type=? AND is_deleted=0${condition} ORDER BY updated_at DESC,id LIMIT ? OFFSET ?`).bind(type, ...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records WHERE type=? AND is_deleted=0${condition}`).bind(type, ...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map(parseRecord), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.post('/v3/records/:type', async (c: any) => {
    const type = String(c.req.param('type') || '');
    const permissions = genericCollections[type];
    if (!permissions) return c.json({ success: false, error: 'Unsupported cloud record type.' }, 404);
    const denied = requirePermission(c, permissions.create);
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-record-create-${type}-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return c.json({ success: false, error: 'Record data is required.' }, 400);
    const id = String(body.data.id || crypto.randomUUID()).trim();
    if (!id || id.length > 200) return c.json({ success: false, error: 'A valid record ID is required.' }, 400);
    const record = { ...body.data, id };
    const validation = validatePayload(type, record);
    if (!validation.success) return c.json({ success: false, error: 'The record contains invalid data.' }, 400);
    const now = Date.now();
    const data = JSON.stringify(record);
    const operationId = `${mutationId}-insert`;
    const response = { success: true, item: { ...record, revision: 1, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,?,?, ?,1,0,?)').bind(id, type, data, now, operationId),
        c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,?,1,'insert',?,?,?,?)").bind(id, type, data, now, mutationId, operationId),
        c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,?,'insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(id, type, data, userId, userEmail, now, mutationId, operationId, 'Created through generic server-driven record API'),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response, 201);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: `Unable to create cloud record: ${error.message}` }, 409);
    }
  });

  app.put('/v3/records/:type/:id', async (c: any) => {
    const type = String(c.req.param('type') || '');
    const id = String(c.req.param('id') || '');
    const permissions = genericCollections[type];
    if (!permissions) return c.json({ success: false, error: 'Unsupported cloud record type.' }, 404);
    const denied = requirePermission(c, permissions.update);
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-record-update-${type}-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare('SELECT data,revision FROM sync_records WHERE type=? AND id=? AND is_deleted=0').bind(type, id).first();
    if (!current) return c.json({ success: false, error: 'Cloud record not found.' }, 404);
    const expectedRevision = Number(body.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) return c.json({ success: false, error: 'This record was changed by another user. The latest version has been reloaded.', conflict: true }, 409);
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) return c.json({ success: false, error: 'Record data is required.' }, 400);
    const existing = JSON.parse(String(current.data));
    const record = { ...existing, ...body.data, id };
    const validation = validatePayload(type, record);
    if (!validation.success) return c.json({ success: false, error: 'The record contains invalid data.' }, 400);
    const now = Date.now();
    const nextRevision = expectedRevision + 1;
    const data = JSON.stringify(record);
    const operationId = `${mutationId}-update`;
    const response = { success: true, item: { ...record, revision: nextRevision, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type=? AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END').bind(operationId, type, id, expectedRevision),
        c.env.DB.prepare('UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type=? AND id=? AND revision=? AND is_deleted=0').bind(data, nextRevision, now, operationId, type, id, expectedRevision),
        c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type=? AND id=? AND revision=?").bind(mutationId, operationId, type, id, nextRevision),
        c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',?,revision,?,data,?,?,updated_at,?,?,? FROM sync_records WHERE type=? AND id=? AND revision=?").bind(expectedRevision, current.data, userId, userEmail, mutationId, operationId, 'Updated through generic server-driven record API', type, id, nextRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'This record was changed by another user. The latest version has been reloaded.', conflict: true }, 409);
    }
  });

  app.delete('/v3/records/:type/:id', async (c: any) => {
    const type = String(c.req.param('type') || '');
    const id = String(c.req.param('id') || '');
    const permissions = genericCollections[type];
    if (!permissions) return c.json({ success: false, error: 'Unsupported cloud record type.' }, 404);
    const denied = requirePermission(c, permissions.delete);
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-record-delete-${type}-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare('SELECT data,revision FROM sync_records WHERE type=? AND id=? AND is_deleted=0').bind(type, id).first();
    if (!current) return c.json({ success: true, deleted: true, alreadyDeleted: true });
    const expectedRevision = Number(body.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) return c.json({ success: false, error: 'This record was changed by another user. The latest version has been reloaded.', conflict: true }, 409);
    const now = Date.now();
    const nextRevision = expectedRevision + 1;
    const operationId = `${mutationId}-delete`;
    const response = { success: true, deleted: true, id, revision: nextRevision };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare('INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type=? AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END').bind(operationId, type, id, expectedRevision),
        c.env.DB.prepare('UPDATE sync_records SET is_deleted=1,revision=?,updated_at=?,last_operation_id=? WHERE type=? AND id=? AND revision=? AND is_deleted=0').bind(nextRevision, now, operationId, type, id, expectedRevision),
        c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'delete','{}',updated_at,?,? FROM sync_records WHERE type=? AND id=? AND revision=?").bind(mutationId, operationId, type, id, nextRevision),
        c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'delete',?,revision,?,NULL,?,?,updated_at,?,?,? FROM sync_records WHERE type=? AND id=? AND revision=?").bind(expectedRevision, current.data, userId, userEmail, mutationId, operationId, 'Deleted through generic server-driven record API', type, id, nextRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'This record was changed by another user. The latest version has been reloaded.', conflict: true }, 409);
    }
  });

  app.get('/v3/pledges', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase();
    const condition = search ? " AND (lower(COALESCE(json_extract(d.data,'$.name'),'')) LIKE ? OR lower(COALESCE(json_extract(p.data,'$.notes'),'')) LIKE ?)" : '';
    const bindings = search ? [`%${search}%`, `%${search}%`] : [];
    const join = "LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(p.data,'$.donorId') AND d.is_deleted=0";
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT p.id,p.data,p.revision,p.updated_at,json_extract(d.data,'$.name') AS donor_name FROM sync_records p ${join} WHERE p.type='pledges' AND p.is_deleted=0${condition} ORDER BY json_extract(p.data,'$.date') DESC,p.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records p ${join} WHERE p.type='pledges' AND p.is_deleted=0${condition}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor' })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/pledges/:id/details', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const id = String(c.req.param('id') || '');
    const pledge: any = await c.env.DB.prepare(`
      SELECT p.id,p.data,p.revision,p.updated_at,json_extract(d.data,'$.name') AS donor_name
      FROM sync_records p
      LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(p.data,'$.donorId') AND d.is_deleted=0
      WHERE p.type='pledges' AND p.id=? AND p.is_deleted=0
    `).bind(id).first();
    if (!pledge) return c.json({ success: false, error: 'Pledge not found.' }, 404);
    const [payments, paymentSummary, schedules, scheduleSummary] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.pledgeId')=? ORDER BY json_extract(data,'$.date') DESC,id DESC LIMIT 50").bind(id),
      c.env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN json_extract(data,'$.type')='approved' THEN COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0) ELSE 0 END),0) AS paid FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.pledgeId')=?").bind(id),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.pledgeId')=? ORDER BY json_extract(data,'$.nextDate'),id LIMIT 50").bind(id),
      c.env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN COALESCE(json_extract(data,'$.active'),0)=1 THEN COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0) ELSE 0 END),0) AS scheduled FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.pledgeId')=?").bind(id)
    ]);
    const item = { ...parseRecord(pledge), donorName: pledge.donor_name || 'Unknown Donor' };
    const amount = Number(item.amountCAD ?? item.amount ?? 0);
    const paid = Number(paymentSummary.results[0]?.paid || 0);
    const scheduled = Number(scheduleSummary.results[0]?.scheduled || 0);
    return c.json({
      success: true,
      pledge: item,
      payments: payments.results.map(parseRecord),
      schedules: schedules.results.map(parseRecord),
      summary: {
        paymentCount: Number(paymentSummary.results[0]?.count || 0),
        scheduleCount: Number(scheduleSummary.results[0]?.count || 0),
        amount,
        paid,
        scheduled,
        balance: amount - paid - scheduled
      }
    });
  });

  app.get('/v3/schedules', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase();
    const status = String(c.req.query('status') || 'all');
    const conditions = ["r.type='recurringPayments'", 'r.is_deleted=0'];
    const bindings: any[] = [];
    if (status === 'active') conditions.push("COALESCE(json_extract(r.data,'$.active'),0)=1");
    if (status === 'paused') conditions.push("COALESCE(json_extract(r.data,'$.active'),0)=0");
    if (search) { conditions.push("lower(COALESCE(json_extract(d.data,'$.name'),'')) LIKE ?"); bindings.push(`%${search}%`); }
    const where = conditions.join(' AND ');
    const join = "LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(r.data,'$.donorId') AND d.is_deleted=0";
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT r.id,r.data,r.revision,r.updated_at,json_extract(d.data,'$.name') AS donor_name FROM sync_records r ${join} WHERE ${where} ORDER BY json_extract(r.data,'$.nextDate'),r.id LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records r ${join} WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor' })), page, limit, total, totalPages: Math.ceil(total / limit) });
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
    const join = `LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(t.data,'$.donorId') AND d.is_deleted=0
      LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(t.data,'$.sourceAccountId') AND src.is_deleted=0
      LEFT JOIN sync_records off ON off.type='accounts' AND off.id=json_extract(t.data,'$.offsetAccountId') AND off.is_deleted=0`;
    const listSql = `
      SELECT t.id, t.data, t.revision, t.updated_at,
             json_extract(d.data, '$.name') AS donor_name,
             json_extract(src.data, '$.name') AS source_name,
             json_extract(off.data, '$.name') AS offset_name
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
      items: listResult.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor', sourceName: row.source_name || '', offsetName: row.offset_name || '' })),
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      totalCAD: Number(totalsResult.results[0]?.total_cad || 0)
    });
  });

  app.get('/v3/ledger', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase(); const kind = String(c.req.query('kind') || 'all'); const account = String(c.req.query('account') || ''); const status = String(c.req.query('status') || ''); const method = String(c.req.query('method') || ''); const from = String(c.req.query('from') || ''); const to = String(c.req.query('to') || '');
    const conditions = ["r.type IN ('transactions','bills','accountTransfers')", 'r.is_deleted=0', "(r.type<>'transactions' OR json_extract(r.data,'$.batchTransactionId') IS NULL)"]; const bindings: any[] = [];
    if (kind === 'payment') conditions.push("r.type='transactions'"); else if (kind === 'bill') conditions.push("r.type='bills'"); else if (kind === 'transfer') conditions.push("r.type='accountTransfers'");
    if (search) { conditions.push("lower(r.data) LIKE ?"); bindings.push(`%${search}%`); }
    if (account) { conditions.push("(json_extract(r.data,'$.sourceAccountId')=? OR json_extract(r.data,'$.offsetAccountId')=? OR json_extract(r.data,'$.fromAccountId')=? OR json_extract(r.data,'$.toAccountId')=? OR json_extract(r.data,'$.category')=?)"); bindings.push(account, account, account, account, account); }
    if (status) { conditions.push("(json_extract(r.data,'$.type')=? OR json_extract(r.data,'$.status')=?)"); bindings.push(status, status); }
    if (method) { conditions.push("json_extract(r.data,'$.method')=?"); bindings.push(method); }
    const dateExpression = "COALESCE(json_extract(r.data,'$.date'),json_extract(r.data,'$.paidDate'),json_extract(r.data,'$.dueDate'),'')";
    if (from) { conditions.push(`${dateExpression}>=?`); bindings.push(from); } if (to) { conditions.push(`${dateExpression}<=?`); bindings.push(to); }
    const where = conditions.join(' AND ');
    const joins = `LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(r.data,'$.donorId') AND d.is_deleted=0
      LEFT JOIN sync_records src ON src.type='accounts' AND src.id=COALESCE(json_extract(r.data,'$.sourceAccountId'),json_extract(r.data,'$.fromAccountId')) AND src.is_deleted=0
      LEFT JOIN sync_records off ON off.type='accounts' AND off.id=COALESCE(json_extract(r.data,'$.offsetAccountId'),json_extract(r.data,'$.toAccountId'),json_extract(r.data,'$.category')) AND off.is_deleted=0`;
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT r.id,r.type AS record_type,r.data,r.revision,r.updated_at,json_extract(d.data,'$.name') AS donor_name,json_extract(src.data,'$.name') AS source_name,json_extract(off.data,'$.name') AS offset_name FROM sync_records r ${joins} WHERE ${where} ORDER BY ${dateExpression} DESC,r.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records r WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), recordType: row.record_type, donorName: row.donor_name || '', sourceName: row.source_name || '', offsetName: row.offset_name || '' })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/tasks', async (c: any) => {
    const denied = requirePermission(c, 'system.manage');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit; const status = String(c.req.query('status') || 'pending'); const search = String(c.req.query('search') || '').trim().toLowerCase();
    const conditions = ["t.type='tasks'", 't.is_deleted=0']; const bindings: any[] = [];
    if (status === 'pending') conditions.push("COALESCE(json_extract(t.data,'$.completed'),0)=0"); if (status === 'completed') conditions.push("COALESCE(json_extract(t.data,'$.completed'),0)=1");
    if (search) { conditions.push("lower(t.data) LIKE ?"); bindings.push(`%${search}%`); }
    const where = conditions.join(' AND ');
    const [listResult, countResult, summaryResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT t.id,t.data,t.revision,t.updated_at,json_extract(d.data,'$.name') AS donor_name FROM sync_records t LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(t.data,'$.donorId') AND d.is_deleted=0 WHERE ${where} ORDER BY COALESCE(json_extract(t.data,'$.completed'),0),CASE json_extract(t.data,'$.priority') WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,json_extract(t.data,'$.dueDate'),t.id LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records t WHERE ${where}`).bind(...bindings),
      c.env.DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN COALESCE(json_extract(data,'$.completed'),0)=0 THEN 1 ELSE 0 END) AS pending,SUM(CASE WHEN COALESCE(json_extract(data,'$.completed'),0)=0 AND json_extract(data,'$.priority')='high' THEN 1 ELSE 0 END) AS high FROM sync_records WHERE type='tasks' AND is_deleted=0")
    ]);
    const total = Number(countResult.results[0]?.count || 0); const summary: any = summaryResult.results[0] || {};
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || '' })), page, limit, total, totalPages: Math.ceil(total / limit), summary: { total: Number(summary.total || 0), pending: Number(summary.pending || 0), high: Number(summary.high || 0) } });
  });

  app.get('/v3/sponsorship-days', async (c: any) => {
    const denied = requirePermission(c, 'donors.read');
    if (denied) return denied;
    const month = String(c.req.query('month') || '').padStart(2, '0');
    if (!/^(0[1-9]|1[0-2])$/.test(month)) return c.json({ success: false, error: 'Choose a valid calendar month.' }, 400);
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit;
    const dayRows = `FROM sync_records d JOIN json_each(CASE WHEN json_type(d.data,'$.sponsorshipDays')='array' THEN json_extract(d.data,'$.sponsorshipDays') ELSE '[]' END) day WHERE d.type='donors' AND d.is_deleted=0`;
    const fields = "SELECT d.id AS donor_id,d.revision AS donor_revision,json_extract(d.data,'$.name') AS donor_name,day.key AS day_index,day.value AS day_data";
    const [monthResult, monthCountResult, upcomingResult, upcomingCountResult] = await c.env.DB.batch([
      c.env.DB.prepare(`${fields} ${dayRows} AND json_extract(day.value,'$.date') LIKE ? ORDER BY json_extract(day.value,'$.date'),lower(json_extract(d.data,'$.name')) LIMIT ? OFFSET ?`).bind(`${month}-%`, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count ${dayRows} AND json_extract(day.value,'$.date') LIKE ?`).bind(`${month}-%`),
      c.env.DB.prepare(`${fields} ${dayRows} ORDER BY json_extract(day.value,'$.date'),lower(json_extract(d.data,'$.name')) LIMIT 50`),
      c.env.DB.prepare(`SELECT COUNT(*) AS count ${dayRows}`)
    ]);
    const mapDay = (row: any) => { const day = JSON.parse(String(row.day_data)); return { ...day, id: String(day.id || `legacy-${row.day_index}`), donorId: String(row.donor_id), donorRevision: Number(row.donor_revision), donorName: String(row.donor_name || 'Unknown Donor') }; };
    const total = Number(monthCountResult.results[0]?.count || 0);
    return c.json({ success: true, items: monthResult.results.map(mapDay), upcoming: upcomingResult.results.map(mapDay), page, limit, total, totalPages: Math.ceil(total / limit), upcomingTotal: Number(upcomingCountResult.results[0]?.count || 0) });
  });

  const mutateSponsorshipDay = async (c: any, action: 'create' | 'update' | 'delete') => {
    const denied = requirePermission(c, action === 'delete' ? 'donors.delete' : action === 'create' ? 'donors.create' : 'donors.update');
    if (denied) return denied;
    const body = await c.req.json();
    const donorId = String(action === 'create' ? body.donorId || '' : c.req.param('donorId') || '');
    const dayId = String(action === 'create' ? '' : c.req.param('dayId') || '');
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-sponsorship-${action}-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(donorId).first();
    if (!current) return c.json({ success: false, error: 'Donor not found.' }, 404);
    const expectedRevision = Number(body.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) return c.json({ success: false, error: 'This donor was changed by another user. The latest calendar has been reloaded.', conflict: true }, 409);
    const existing = JSON.parse(String(current.data));
    const days: any[] = Array.isArray(existing.sponsorshipDays) ? [...existing.sponsorshipDays] : [];
    let index = action === 'create' ? -1 : days.findIndex(day => String(day?.id || '') === dayId);
    if (index < 0 && /^legacy-\d+$/.test(dayId)) index = Number(dayId.slice(7));
    if (action !== 'create' && (index < 0 || index >= days.length)) return c.json({ success: false, error: 'Sponsorship day not found.' }, 404);
    let changedDay: any = null;
    if (action !== 'delete') {
      const date = String(body.date || '').trim(); const note = String(body.note || '').trim(); const year = Number(body.year || new Date().getUTCFullYear());
      const match = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(date); const check = match ? new Date(Date.UTC(2024, Number(match[1]) - 1, Number(match[2]))) : null;
      if (!match || !check || check.getUTCMonth() !== Number(match[1]) - 1 || !note || note.length > 500 || !Number.isInteger(year) || year < 1900 || year > 2200) return c.json({ success: false, error: 'Enter a valid month-day, year, and occasion.' }, 400);
      changedDay = { ...(action === 'update' ? days[index] : {}), id: action === 'create' ? crypto.randomUUID() : String(days[index]?.id || crypto.randomUUID()), date, note, year };
      if (action === 'create') days.push(changedDay); else days[index] = changedDay;
    } else days.splice(index, 1);
    const next = { ...existing, sponsorshipDays: days }; const now = Date.now(); const nextRevision = expectedRevision + 1; const data = JSON.stringify(next); const operationId = `${mutationId}-update`;
    const response = { success: true, item: changedDay, donorId, donorRevision: nextRevision, updatedAt: now };
    const userId = String(c.get('userId') || 'unknown'); const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type='donors' AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END").bind(operationId, donorId, expectedRevision),
        c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='donors' AND id=? AND revision=? AND is_deleted=0").bind(data, nextRevision, now, operationId, donorId, expectedRevision),
        c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='donors' AND id=? AND revision=?").bind(mutationId, operationId, donorId, nextRevision),
        c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',?,revision,?,data,?,?,updated_at,?,?,? FROM sync_records WHERE type='donors' AND id=? AND revision=?").bind(expectedRevision, current.data, userId, userEmail, mutationId, operationId, `Sponsorship day ${action}`, donorId, nextRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response, action === 'create' ? 201 : 200);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'This donor was changed by another user. The latest calendar has been reloaded.', conflict: true }, 409);
    }
  };

  app.post('/v3/sponsorship-days', (c: any) => mutateSponsorshipDay(c, 'create'));
  app.put('/v3/sponsorship-days/:donorId/:dayId', (c: any) => mutateSponsorshipDay(c, 'update'));
  app.delete('/v3/sponsorship-days/:donorId/:dayId', (c: any) => mutateSponsorshipDay(c, 'delete'));

  app.get('/v3/donors', async (c: any) => {
    const denied = requirePermission(c, 'donors.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = (c.req.query('search') || '').trim().toLowerCase();
    const condition = search
      ? `AND (lower(COALESCE(json_extract(d.data,'$.name'),'')) LIKE ? OR lower(COALESCE(json_extract(d.data,'$.email'),'')) LIKE ? OR COALESCE(json_extract(d.data,'$.phone'),'') LIKE ? OR lower(COALESCE(json_extract(d.data,'$.hebFirstName'),'')) LIKE ? OR lower(COALESCE(json_extract(d.data,'$.hebLastName'),'')) LIKE ? OR lower(COALESCE(json_extract(d.data,'$.displayId'),'')) LIKE ?)`
      : '';
    const searchBindings = search ? Array(6).fill(`%${search}%`) : [];
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`
        WITH donor_totals AS (
          SELECT json_extract(data,'$.donorId') AS donor_id,
            SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)) AS total_given
          FROM sync_records
          WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.type')='approved'
            AND COALESCE(json_extract(data,'$.isBatch'),0)=0
          GROUP BY json_extract(data,'$.donorId')
        )
        SELECT d.id,d.data,d.revision,d.updated_at,COALESCE(dt.total_given,0) AS total_given
        FROM sync_records d LEFT JOIN donor_totals dt ON dt.donor_id=d.id
        WHERE d.type='donors' AND d.is_deleted=0 ${condition}
        ORDER BY lower(json_extract(d.data,'$.name')) LIMIT ? OFFSET ?
      `).bind(...searchBindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records d WHERE d.type='donors' AND d.is_deleted=0 ${condition}`).bind(...searchBindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), totalGiven: Number(row.total_given || 0) })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/donors/:id/profile', async (c: any) => {
    const denied = requirePermission(c, 'donors.read');
    if (denied) return denied;
    const id = String(c.req.param('id') || '');
    const donor: any = await c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(id).first();
    if (!donor) return c.json({ success: false, error: 'Donor not found.' }, 404);
    const [payments, paymentSummary, pledges, pledgeSummary, recurring, recurringSummary] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.date') DESC,id DESC LIMIT 50").bind(id),
      c.env.DB.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN json_extract(data,'$.type')='approved' THEN COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0) ELSE 0 END) AS approved_total,SUM(CASE WHEN json_extract(data,'$.type')='declined' THEN 1 ELSE 0 END) AS declined_count FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(id),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.date') DESC,id DESC LIMIT 50").bind(id),
      c.env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)),0) AS total FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(id),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.nextDate'),id LIMIT 50").bind(id),
      c.env.DB.prepare("SELECT COUNT(*) AS count,SUM(CASE WHEN COALESCE(json_extract(data,'$.active'),0)=1 THEN 1 ELSE 0 END) AS active_count,COALESCE(SUM(CASE WHEN COALESCE(json_extract(data,'$.active'),0)=1 THEN COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0) ELSE 0 END),0) AS active_total FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(id)
    ]);
    const paymentStats: any = paymentSummary.results[0] || {};
    const pledgeStats: any = pledgeSummary.results[0] || {};
    const recurringStats: any = recurringSummary.results[0] || {};
    return c.json({
      success: true,
      donor: { ...parseRecord(donor), totalGiven: Number(paymentStats.approved_total || 0) },
      payments: payments.results.map(parseRecord), pledges: pledges.results.map(parseRecord), recurring: recurring.results.map(parseRecord),
      summary: { paymentCount: Number(paymentStats.count || 0), approvedTotal: Number(paymentStats.approved_total || 0), declinedCount: Number(paymentStats.declined_count || 0), pledgeCount: Number(pledgeStats.count || 0), pledgedTotal: Number(pledgeStats.total || 0), recurringCount: Number(recurringStats.count || 0), activeRecurringCount: Number(recurringStats.active_count || 0), activeRecurringTotal: Number(recurringStats.active_total || 0) }
    });
  });

  app.post('/v3/donors', async (c: any) => {
    const denied = requirePermission(c, 'donors.create');
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'requestId is required.' }, 400);
    const mutationId = `v3-donor-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));

    const firstName = String(body.firstName || '').trim();
    const lastName = String(body.lastName || '').trim();
    const phone = String(body.phone || '').trim();
    const email = String(body.email || '').trim();
    if (!firstName || !lastName || !phone) return c.json({ success: false, error: 'First name, last name, and phone are required.' }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ success: false, error: 'Enter a valid email address.' }, 400);

    const id = crypto.randomUUID();
    const displayId = String(body.displayId || '').trim() || `D-${id.slice(0, 8).toUpperCase()}`;
    const duplicate = await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='donors' AND is_deleted=0 AND lower(json_extract(data,'$.displayId'))=lower(?) LIMIT 1").bind(displayId).first();
    if (duplicate) return c.json({ success: false, error: 'That donor ID is already in use.' }, 409);
    const text = (field: string, max = 500) => String(body[field] || '').trim().slice(0, max);
    const record = {
      id, displayId, firstName, lastName, name: `${firstName} ${lastName}`.trim(), email, phone,
      address: text('address'), notes: text('notes', 2000), totalGiven: 0, balanceOwed: 0,
      preTitle: text('preTitle'), hebFirstName: text('hebFirstName'), hebLastName: text('hebLastName'),
      title: text('title'), postTitle: text('postTitle'), homePhone: text('homePhone'), mobilePhone: text('mobilePhone'),
      cards: [], sponsorshipDays: []
    };
    const now = Date.now();
    const data = JSON.stringify(record);
    const operationId = `${mutationId}-insert`;
    const response = { success: true, item: { ...record, revision: 1, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'donors',?,?,1,0,?)`).bind(id, data, now, operationId),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'donors',1,'insert',?,?,?,?)`).bind(id, data, now, mutationId, operationId),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'donors','insert',NULL,1,NULL,?,?,?,?,?,?,?)`).bind(id, data, userId, userEmail, now, mutationId, operationId, 'Created through server-driven donor API'),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response, 201);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: `Unable to create donor: ${error.message}` }, 409);
    }
  });

  app.put('/v3/donors/:id', async (c: any) => {
    const denied = requirePermission(c, 'donors.update');
    if (denied) return denied;
    const id = c.req.param('id');
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-donor-update-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(id).first();
    if (!current) return c.json({ success: false, error: 'Donor not found.' }, 404);
    const expectedRevision = Number(body.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) {
      return c.json({ success: false, error: 'This donor was changed by another user. The latest version has been reloaded.', conflict: true }, 409);
    }

    const existing = JSON.parse(String(current.data));
    const firstName = String(body.firstName ?? existing.firstName ?? '').trim();
    const lastName = String(body.lastName ?? existing.lastName ?? '').trim();
    const phone = String(body.phone ?? existing.phone ?? '').trim();
    const email = String(body.email ?? existing.email ?? '').trim();
    if (!firstName || !lastName || !phone) return c.json({ success: false, error: 'First name, last name, and phone are required.' }, 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return c.json({ success: false, error: 'Enter a valid email address.' }, 400);
    const textFields = ['address','notes','preTitle','hebFirstName','hebLastName','title','postTitle','homePhone','mobilePhone'];
    const next: any = { ...existing, firstName, lastName, name: `${firstName} ${lastName}`.trim(), phone, email };
    for (const field of textFields) if (body[field] !== undefined) next[field] = String(body[field] || '').trim().slice(0, field === 'notes' ? 2000 : 500);
    if (body.displayId !== undefined) next.displayId = String(body.displayId || '').trim() || existing.displayId || `D-${id.slice(0, 8).toUpperCase()}`;
    const duplicate = await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='donors' AND id<>? AND is_deleted=0 AND lower(json_extract(data,'$.displayId'))=lower(?) LIMIT 1").bind(id, next.displayId).first();
    if (duplicate) return c.json({ success: false, error: 'That donor ID is already in use.' }, 409);

    const now = Date.now();
    const nextRevision = expectedRevision + 1;
    const data = JSON.stringify(next);
    const operationId = `${mutationId}-update`;
    const response = { success: true, item: { ...next, revision: nextRevision, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type='donors' AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END`).bind(operationId, id, expectedRevision),
        c.env.DB.prepare(`UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='donors' AND id=? AND revision=? AND is_deleted=0`).bind(data, nextRevision, now, operationId, id, expectedRevision),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='donors' AND id=? AND revision=?`).bind(mutationId, operationId, id, nextRevision),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',?,revision,?,data,?,?,updated_at,?,?,? FROM sync_records WHERE type='donors' AND id=? AND revision=?`).bind(expectedRevision, current.data, userId, userEmail, mutationId, operationId, 'Updated through server-driven donor API', id, nextRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'This donor was changed by another user. Reloaded the latest version.', conflict: true }, 409);
    }
  });

  app.get('/v3/bills', async (c: any) => {
    const denied = requirePermission(c, 'bills.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = (c.req.query('search') || '').trim().toLowerCase();
    const status = (c.req.query('status') || 'open').trim();
    const conditions = ["b.type='bills'", 'b.is_deleted=0', "COALESCE(json_extract(b.data,'$.isPayroll'),0)=0"];
    const bindings: any[] = [];
    if (status === 'open') conditions.push("json_extract(b.data,'$.status') IN ('pending','urgent','scheduled')");
    else if (status !== 'all') { conditions.push("json_extract(b.data,'$.status')=?"); bindings.push(status); }
    if (search) {
      conditions.push("(lower(COALESCE(json_extract(b.data,'$.vendor'),'')) LIKE ? OR lower(COALESCE(json_extract(b.data,'$.memo'),'')) LIKE ?)");
      bindings.push(`%${search}%`, `%${search}%`);
    }
    const where = conditions.join(' AND ');
    const joins = `LEFT JOIN sync_records cat ON cat.type='accounts' AND cat.id=json_extract(b.data,'$.category') AND cat.is_deleted=0
      LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(b.data,'$.sourceAccountId') AND src.is_deleted=0`;
    const [listResult, totalsResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT b.id,b.data,b.revision,b.updated_at,json_extract(cat.data,'$.name') AS category_name,json_extract(src.data,'$.name') AS source_name FROM sync_records b ${joins} WHERE ${where} ORDER BY json_extract(b.data,'$.dueDate') DESC,b.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN json_extract(b.data,'$.currency')='USD' THEN COALESCE(json_extract(b.data,'$.amount'),0)*COALESCE(json_extract(b.data,'$.exchangeRate'),1.35) ELSE COALESCE(json_extract(b.data,'$.amount'),0) END),0) AS total_cad FROM sync_records b WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(totalsResult.results[0]?.count || 0);
    return c.json({
      success: true,
      items: listResult.results.map((row: any) => ({ ...parseRecord(row), categoryName: row.category_name || 'Uncategorized', sourceName: row.source_name || '' })),
      page, limit, total, totalPages: Math.ceil(total / limit), totalCAD: Number(totalsResult.results[0]?.total_cad || 0)
    });
  });

  app.get('/v3/vendors', async (c: any) => {
    const denied = requirePermission(c, 'bills.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase();
    const condition = search ? " AND lower(COALESCE(json_extract(data,'$.vendor'),'')) LIKE ?" : '';
    const bindings = search ? [`%${search}%`] : [];
    const base = "type='bills' AND is_deleted=0 AND COALESCE(json_extract(data,'$.isPayroll'),0)=0 AND trim(COALESCE(json_extract(data,'$.vendor'),''))<>''";
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT json_extract(data,'$.vendor') AS vendor,COUNT(*) AS bill_count,COALESCE(SUM(json_extract(data,'$.amount')),0) AS total_billed,COALESCE(SUM(CASE WHEN json_extract(data,'$.status')<>'paid' THEN json_extract(data,'$.amount') ELSE 0 END),0) AS balance_owed FROM sync_records WHERE ${base}${condition} GROUP BY json_extract(data,'$.vendor') ORDER BY lower(json_extract(data,'$.vendor')) LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM (SELECT 1 FROM sync_records WHERE ${base}${condition} GROUP BY json_extract(data,'$.vendor'))`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ name: row.vendor, billCount: Number(row.bill_count || 0), totalBilled: Number(row.total_billed || 0), balanceOwed: Number(row.balance_owed || 0) })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/vendors/details', async (c: any) => {
    const denied = requirePermission(c, 'bills.read');
    if (denied) return denied;
    const name = String(c.req.query('name') || '').trim();
    if (!name) return c.json({ success: false, error: 'Vendor name is required.' }, 400);
    const joins = `LEFT JOIN sync_records cat ON cat.type='accounts' AND cat.id=json_extract(b.data,'$.category') AND cat.is_deleted=0
      LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(b.data,'$.sourceAccountId') AND src.is_deleted=0`;
    const [vendor, bills, summary] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='vendors' AND is_deleted=0 AND lower(json_extract(data,'$.name'))=lower(?) LIMIT 1").bind(name),
      c.env.DB.prepare(`SELECT b.id,b.data,b.revision,b.updated_at,json_extract(cat.data,'$.name') AS category_name,json_extract(src.data,'$.name') AS source_name FROM sync_records b ${joins} WHERE b.type='bills' AND b.is_deleted=0 AND lower(json_extract(b.data,'$.vendor'))=lower(?) ORDER BY json_extract(b.data,'$.dueDate') DESC,b.id DESC LIMIT 50`).bind(name),
      c.env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN json_extract(data,'$.status')='paid' THEN json_extract(data,'$.amount') ELSE 0 END),0) AS total_paid,COALESCE(SUM(CASE WHEN json_extract(data,'$.status')<>'paid' THEN json_extract(data,'$.amount') ELSE 0 END),0) AS total_owed FROM sync_records WHERE type='bills' AND is_deleted=0 AND lower(json_extract(data,'$.vendor'))=lower(?)").bind(name)
    ]);
    const vendorRow: any = vendor.results[0];
    const stats: any = summary.results[0] || {};
    return c.json({
      success: true,
      vendor: vendorRow ? parseRecord(vendorRow) : { name },
      bills: bills.results.map((row: any) => ({ ...parseRecord(row), categoryName: row.category_name || 'Uncategorized', sourceName: row.source_name || '' })),
      summary: { billCount: Number(stats.count || 0), totalPaid: Number(stats.total_paid || 0), totalOwed: Number(stats.total_owed || 0) }
    });
  });

  app.get('/v3/checks', async (c: any) => {
    const denied = requirePermission(c, 'bills.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit; const status = String(c.req.query('status') || 'queued');
    const joins = `LEFT JOIN sync_records cat ON cat.type='accounts' AND cat.id=json_extract(b.data,'$.category') AND cat.is_deleted=0 LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(b.data,'$.sourceAccountId') AND src.is_deleted=0`;
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT b.id,b.data,b.revision,b.updated_at,json_extract(cat.data,'$.name') AS category_name,json_extract(src.data,'$.name') AS source_name FROM sync_records b ${joins} WHERE b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.printStatus')=? ORDER BY json_extract(b.data,'$.dueDate'),b.id LIMIT ? OFFSET ?`).bind(status, limit, offset),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='bills' AND is_deleted=0 AND json_extract(data,'$.printStatus')=?").bind(status)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), categoryName: row.category_name || 'Uncategorized', sourceName: row.source_name || '' })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.post('/v3/bills', async (c: any) => {
    const denied = requirePermission(c, 'bills.create');
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'requestId is required.' }, 400);
    const mutationId = `v3-bill-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const vendor = String(body.vendor || '').trim();
    const amount = Number(body.amount);
    const dueDate = String(body.dueDate || '').trim();
    const category = String(body.category || '').trim();
    const status = ['pending','urgent','paid'].includes(body.status) ? body.status : 'pending';
    if (!vendor || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(`${dueDate}T00:00:00Z`)) || !category) {
      return c.json({ success: false, error: 'Vendor, positive amount, due date, and expense category are required.' }, 400);
    }
    const sourceAccountId = String(body.sourceAccountId || '').trim();
    if (status === 'paid' && !sourceAccountId) return c.json({ success: false, error: 'A paid-from account is required for a paid expense.' }, 400);
    const creditAccountId = String(body.creditAccountId || '').trim();
    const refs = await c.env.DB.prepare(`SELECT type,id,data FROM sync_records WHERE is_deleted=0 AND (type='exchangeRate' OR (type='accounts' AND id IN (?,?,?)))`).bind(category, sourceAccountId || '-', creditAccountId || '-').all();
    const categoryRow: any = refs.results.find((row: any) => row.type === 'accounts' && row.id === category);
    const sourceRow: any = refs.results.find((row: any) => row.type === 'accounts' && row.id === sourceAccountId);
    if (!categoryRow || JSON.parse(String(categoryRow.data)).type !== 'expense') return c.json({ success: false, error: 'Choose a valid expense category.' }, 409);
    if (status === 'paid' && !sourceRow) return c.json({ success: false, error: 'Choose a valid paid-from account.' }, 409);
    const exchangeRow: any = refs.results.find((row: any) => row.type === 'exchangeRate');
    const rawRate = exchangeRow ? Number(JSON.parse(String(exchangeRow.data))) : 1.35;
    const exchangeRate = Number.isFinite(rawRate) && rawRate > 0 ? rawRate : 1.35;
    const id = crypto.randomUUID();
    const now = Date.now();
    const currency = body.currency === 'USD' ? 'USD' : 'CAD';
    const record: any = {
      id, vendor, amount, currency, exchangeRate: currency === 'USD' ? exchangeRate : undefined,
      dueDate, status, category, taxable: Boolean(body.taxable), memo: String(body.memo || '').trim().slice(0, 2000)
    };
    if (sourceAccountId) record.sourceAccountId = sourceAccountId;
    if (creditAccountId) record.creditAccountId = creditAccountId;
    if (body.projectId) record.projectId = String(body.projectId);
    if (body.isPayrollExpense) record.isPayroll = true;
    if (body.employeeId) record.employeeId = String(body.employeeId);
    if (body.t4aEligible) record.t4aEligible = true;
    if (body.checkNumber) record.checkNumber = String(body.checkNumber).trim().slice(0, 100);
    if (body.printStatus === 'queued' || body.printStatus === 'printed') record.printStatus = body.printStatus;
    if (body.method) record.method = String(body.method).trim().slice(0, 100);
    if (status === 'paid') { record.paidDate = String(body.paidDate || new Date().toISOString().slice(0, 10)); record.offsetAccountId = category; }
    const data = JSON.stringify(record);
    const operationId = `${mutationId}-insert`;
    const response = { success: true, item: { ...record, revision: 1, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'bills',?,?,1,0,?)`).bind(id, data, now, operationId),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'bills',1,'insert',?,?,?,?)`).bind(id, data, now, mutationId, operationId),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'bills','insert',NULL,1,NULL,?,?,?,?,?,?,?)`).bind(id, data, userId, userEmail, now, mutationId, operationId, 'Created through server-driven expense API'),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response, 201);
    } catch (error: any) {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'Unable to create expense. No record was saved; you can safely try again.' }, 409);
    }
  });

  app.patch('/v3/bills/:id/pay', async (c: any) => {
    const denied = requirePermission(c, 'bills.mark_paid');
    if (denied) return denied;
    const id = c.req.param('id');
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-bill-pay-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='bills' AND id=? AND is_deleted=0").bind(id).first();
    if (!current) return c.json({ success: false, error: 'Expense not found.' }, 404);
    const existing = JSON.parse(String(current.data));
    if (existing.status === 'paid') return c.json({ success: true, item: { ...existing, revision: Number(current.revision) }, alreadyPaid: true });
    const expectedRevision = Number(body.revision);
    if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) return c.json({ success: false, error: 'This expense was changed by another user. Reloaded the latest version.', conflict: true }, 409);
    const sourceAccountId = String(body.sourceAccountId || '').trim();
    const source: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(sourceAccountId).first();
    if (!source || !['asset','liability'].includes(JSON.parse(String(source.data)).type)) return c.json({ success: false, error: 'Choose a valid asset or liability account.' }, 409);
    const next = { ...existing, status: 'paid', paidDate: new Date().toISOString().slice(0, 10), sourceAccountId, offsetAccountId: existing.category };
    const now = Date.now();
    const nextRevision = expectedRevision + 1;
    const data = JSON.stringify(next);
    const operationId = `${mutationId}-update`;
    const response = { success: true, item: { ...next, revision: nextRevision, updatedAt: now } };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type='bills' AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END`).bind(operationId, id, expectedRevision),
        c.env.DB.prepare(`UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='bills' AND id=? AND revision=? AND is_deleted=0`).bind(data, nextRevision, now, operationId, id, expectedRevision),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='bills' AND id=? AND revision=?`).bind(mutationId, operationId, id, nextRevision),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',?,revision,?,data,?,?,updated_at,?,?,? FROM sync_records WHERE type='bills' AND id=? AND revision=?`).bind(expectedRevision, current.data, userId, userEmail, mutationId, operationId, 'Marked paid through server-driven expense API', id, nextRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response);
    } catch {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'This expense was changed by another user. Reloaded the latest version.', conflict: true }, 409);
    }
  });

  app.get('/v3/bank/state', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const [accountResult, matchRecord] = await Promise.all([
      c.env.DB.prepare(`
        SELECT a.id,a.data,a.revision,a.updated_at,
          CASE WHEN p.account_id IS NULL THEN 0 ELSE 1 END AS has_token
        FROM sync_records a LEFT JOIN plaid_tokens p ON p.account_id=a.id
        WHERE a.type='accounts' AND a.is_deleted=0 AND COALESCE(json_extract(a.data,'$.plaidConnected'),0)=1
        ORDER BY lower(json_extract(a.data,'$.name'))
      `).all(),
      c.env.DB.prepare("SELECT data,revision,updated_at FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND is_deleted=0").first()
    ]);
    const matchedIds = matchRecord ? JSON.parse(String((matchRecord as any).data)) : [];
    return c.json({
      success: true,
      accounts: accountResult.results.map((row: any) => ({ ...parseRecord(row), bankConnected: Boolean(row.has_token) })),
      matchedIds: Array.isArray(matchedIds) ? matchedIds : [],
      matchedRevision: Number((matchRecord as any)?.revision || 0),
      updatedAt: Number((matchRecord as any)?.updated_at || 0)
    });
  });

  app.get('/v3/bank/deposit-candidates', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const window = depositCandidateWindow(String(c.req.query('bankDate') || ''));
    if (!window) return c.json({ success: false, error: 'A valid bank date is required.' }, 400);
    const result = await c.env.DB.prepare(`
      SELECT t.id,t.data,t.revision,t.updated_at,json_extract(d.data,'$.name') AS donor_name
      FROM sync_records t
      LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(t.data,'$.donorId') AND d.is_deleted=0
      WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved'
        AND COALESCE(json_extract(t.data,'$.isBatch'),0)=0
        AND json_extract(t.data,'$.sourceAccountId')='sys-undeposited-funds'
        AND COALESCE(json_extract(t.data,'$.depositStatus'),'undeposited')<>'deposited'
        AND COALESCE(json_extract(t.data,'$.bankTransactionId'),'')=''
        AND json_extract(t.data,'$.date') BETWEEN ? AND ?
      ORDER BY json_extract(t.data,'$.date'),lower(COALESCE(json_extract(d.data,'$.name'),'')),t.id
      LIMIT 500
    `).bind(window.start, window.end).all();
    return c.json({ success: true, startDate: window.start, endDate: window.end, items: result.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor' })) });
  });

  app.post('/v3/bank/match-deposit', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve');
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-bank-deposit-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const accountId = String(body.accountId || '').trim();
    const bankTransactionId = String(body.bankTransactionId || '').trim();
    const bankDate = String(body.bankDate || '').trim();
    const description = String(body.description || 'Bank Deposit').trim().slice(0, 500);
    const amount = Number(body.amount);
    const window = depositCandidateWindow(bankDate);
    const transactionIds = [...new Set(Array.isArray(body.transactionIds) ? body.transactionIds.map((id: any) => String(id)) : [])];
    if (!accountId || !bankTransactionId || !window || !Number.isFinite(amount) || amount <= 0 || transactionIds.length === 0 || transactionIds.length > 500) {
      return c.json({ success: false, error: 'Bank account, deposit, positive amount, and selected payments are required.' }, 400);
    }
    const account: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(accountId).first();
    if (!account) return c.json({ success: false, error: 'Bank account not found.' }, 404);
    const accountData = JSON.parse(String(account.data));
    if (accountData.type !== 'asset' || !accountData.plaidConnected) return c.json({ success: false, error: 'Choose a connected asset account.' }, 409);
    const alreadyLinked: any = await c.env.DB.prepare(`SELECT id,type FROM sync_records WHERE is_deleted=0 AND COALESCE(json_extract(data,'$.bankTransactionId'),'')=? LIMIT 1`).bind(bankTransactionId).first();
    if (alreadyLinked) return c.json({ success: false, error: 'This bank deposit is already linked.' }, 409);

    const idsJson = JSON.stringify(transactionIds);
    const selected = await c.env.DB.prepare(`
      SELECT id,data,revision FROM sync_records
      WHERE type='transactions' AND is_deleted=0 AND id IN (SELECT value FROM json_each(?))
        AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0
        AND json_extract(data,'$.sourceAccountId')='sys-undeposited-funds'
        AND COALESCE(json_extract(data,'$.depositStatus'),'undeposited')<>'deposited'
        AND COALESCE(json_extract(data,'$.bankTransactionId'),'')=''
        AND json_extract(data,'$.date') BETWEEN ? AND ?
    `).bind(idsJson, window.start, window.end).all();
    if (selected.results.length !== transactionIds.length) return c.json({ success: false, error: 'One or more selected payments changed. The candidate list has been reloaded.', conflict: true }, 409);
    const selectedTotal = selected.results.reduce((sum: number, row: any) => {
      const data = JSON.parse(String(row.data));
      return sum + Number(data.amountCAD ?? data.amount ?? 0);
    }, 0);
    if (Math.abs(selectedTotal - amount) >= 0.005) return c.json({ success: false, error: `Selected payments total $${selectedTotal.toFixed(2)}, but the bank deposit is $${amount.toFixed(2)}.` }, 409);
    const matchRecord: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND is_deleted=0").first();
    if (!matchRecord) return c.json({ success: false, error: 'Bank match history is unavailable.' }, 500);
    const parsedMatchedIds = JSON.parse(String(matchRecord.data));
    const matchedIds: string[] = Array.isArray(parsedMatchedIds) ? parsedMatchedIds : [];
    if (matchedIds.includes(bankTransactionId)) return c.json({ success: false, error: 'This bank deposit is already matched.' }, 409);

    const batchId = crypto.randomUUID();
    const now = Date.now();
    const operationPrefix = `${mutationId}-child`;
    const assertionId = `${mutationId}-children-assertion`;
    const matchAssertionId = `${mutationId}-match-assertion`;
    const batchOperationId = `${mutationId}-batch-insert`;
    const matchOperationId = `${mutationId}-match-update`;
    const batchRecord = { id: batchId, donorId: 'batch', amount, amountCAD: amount, date: bankDate, type: 'approved', method: 'other', currency: 'CAD', sourceAccountId: accountId, notes: description, isBatch: true, bankTransactionId, depositStatus: 'deposited' };
    const batchData = JSON.stringify(batchRecord);
    const nextMatchedData = JSON.stringify([...new Set([...matchedIds, bankTransactionId])]);
    const nextMatchRevision = Number(matchRecord.revision) + 1;
    const response = { success: true, item: { ...batchRecord, revision: 1, updatedAt: now }, selectedCount: transactionIds.length, selectedTotal };
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(`INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN (SELECT COUNT(*) FROM sync_records WHERE type='transactions' AND is_deleted=0 AND id IN (SELECT value FROM json_each(?)) AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0 AND json_extract(data,'$.sourceAccountId')='sys-undeposited-funds' AND COALESCE(json_extract(data,'$.depositStatus'),'undeposited')<>'deposited' AND COALESCE(json_extract(data,'$.bankTransactionId'),'')='' AND json_extract(data,'$.date') BETWEEN ? AND ?)=? AND ABS((SELECT COALESCE(SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)),0) FROM sync_records WHERE type='transactions' AND is_deleted=0 AND id IN (SELECT value FROM json_each(?)))-?)<0.005 THEN 1 ELSE 0 END`).bind(assertionId, idsJson, window.start, window.end, transactionIds.length, idsJson, amount),
        c.env.DB.prepare(`INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END`).bind(matchAssertionId, matchRecord.revision),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',revision,revision+1,data,json_set(data,'$.batchTransactionId',?,'$.depositStatus','deposited'),?,?,?, ?,? || '-' || id,? FROM sync_records WHERE type='transactions' AND is_deleted=0 AND id IN (SELECT value FROM json_each(?))`).bind(batchId, userId, userEmail, now, mutationId, operationPrefix, 'Included in server-driven bank deposit batch', idsJson),
        c.env.DB.prepare(`UPDATE sync_records SET data=json_set(data,'$.batchTransactionId',?,'$.depositStatus','deposited'),revision=revision+1,updated_at=?,last_operation_id=? || '-' || id WHERE type='transactions' AND is_deleted=0 AND id IN (SELECT value FROM json_each(?))`).bind(batchId, now, operationPrefix, idsJson),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? || '-' || id FROM sync_records WHERE type='transactions' AND id IN (SELECT value FROM json_each(?))`).bind(mutationId, operationPrefix, idsJson),
        c.env.DB.prepare(`INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'transactions',?,?,1,0,?)`).bind(batchId, batchData, now, batchOperationId),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'transactions',1,'insert',?,?,?,?)`).bind(batchId, batchData, now, mutationId, batchOperationId),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'transactions','insert',NULL,1,NULL,?,?,?,?,?,?,?)`).bind(batchId, batchData, userId, userEmail, now, mutationId, batchOperationId, 'Created server-driven bank deposit batch'),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',revision,revision+1,data,?, ?,?,?, ?,?,? FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=?`).bind(nextMatchedData, userId, userEmail, now, mutationId, matchOperationId, 'Added server-driven bank deposit match', matchRecord.revision),
        c.env.DB.prepare(`UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=? AND is_deleted=0`).bind(nextMatchedData, nextMatchRevision, now, matchOperationId, matchRecord.revision),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=?`).bind(mutationId, matchOperationId, nextMatchRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id IN (?,?)').bind(assertionId, matchAssertionId),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response);
    } catch {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'A selected payment or the bank match history changed. The latest cloud records were reloaded.', conflict: true }, 409);
    }
  });

  app.get('/v3/bank/bill-candidates', async (c: any) => {
    const denied = requirePermission(c, 'bills.read');
    if (denied) return denied;
    const accountId = String(c.req.query('accountId') || '');
    const amount = Number(c.req.query('amount'));
    if (!accountId || !Number.isFinite(amount) || amount <= 0) return c.json({ success: false, error: 'Bank account and positive amount are required.' }, 400);
    const account: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(accountId).first();
    if (!account) return c.json({ success: false, error: 'Bank account not found.' }, 404);
    const accountData = JSON.parse(String(account.data));
    const result = await c.env.DB.prepare(`
      SELECT b.id,b.data,b.revision,b.updated_at,json_extract(cat.data,'$.name') AS category_name
      FROM sync_records b LEFT JOIN sync_records cat ON cat.type='accounts' AND cat.id=json_extract(b.data,'$.category') AND cat.is_deleted=0
      WHERE b.type='bills' AND b.is_deleted=0 AND COALESCE(json_extract(b.data,'$.isPayroll'),0)=0
        AND COALESCE(json_extract(b.data,'$.bankTransactionId'),'')=''
      ORDER BY CASE WHEN json_extract(b.data,'$.status')='paid' THEN 1 ELSE 0 END,json_extract(b.data,'$.dueDate') DESC
    `).all();
    const items = result.results.map((row: any) => ({ ...parseRecord(row), categoryName: row.category_name || 'Uncategorized' })).filter((bill: any) => {
      const expected = accountData.currency === 'CAD' && bill.currency === 'USD' ? Number(bill.amount) * Number(bill.exchangeRate || 1.35) : Number(bill.amount);
      return Math.abs(expected - amount) < 0.005;
    });
    return c.json({ success: true, items });
  });

  app.post('/v3/bank/match-outgoing', async (c: any) => {
    const body = await c.req.json();
    const action = String(body.action || '');
    const denied = requirePermission(c, action === 'transfer' ? 'transactions.approve' : 'bills.mark_paid');
    if (denied) return denied;
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    if (!['expense','existing_bill','transfer'].includes(action)) return c.json({ success: false, error: 'Choose a valid outgoing match action.' }, 400);
    const mutationId = `v3-bank-outgoing-${requestId}`;
    const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const accountId = String(body.accountId || '').trim();
    const bankTransactionId = String(body.bankTransactionId || '').trim();
    const bankDate = String(body.bankDate || '').trim();
    const description = String(body.description || 'Bank Transaction').trim().slice(0, 500);
    const amount = Number(body.amount);
    if (!accountId || !bankTransactionId || !/^\d{4}-\d{2}-\d{2}$/.test(bankDate) || Number.isNaN(Date.parse(`${bankDate}T00:00:00Z`)) || !Number.isFinite(amount) || amount <= 0) {
      return c.json({ success: false, error: 'Bank account, transaction, date, and positive amount are required.' }, 400);
    }
    const account: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(accountId).first();
    if (!account) return c.json({ success: false, error: 'Bank account not found.' }, 404);
    const accountData = JSON.parse(String(account.data));
    if (accountData.type !== 'asset' || !accountData.plaidConnected) return c.json({ success: false, error: 'Choose a connected asset account.' }, 409);
    const alreadyLinked: any = await c.env.DB.prepare(`SELECT id,type FROM sync_records WHERE is_deleted=0 AND COALESCE(json_extract(data,'$.bankTransactionId'),'')=? LIMIT 1`).bind(bankTransactionId).first();
    if (alreadyLinked) return c.json({ success: false, error: 'This bank transaction is already linked.' }, 409);
    const matchRecord: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND is_deleted=0").first();
    if (!matchRecord) return c.json({ success: false, error: 'Bank match history is unavailable.' }, 500);
    const parsedMatchedIds = JSON.parse(String(matchRecord.data));
    const matchedIds: string[] = Array.isArray(parsedMatchedIds) ? parsedMatchedIds : [];
    if (matchedIds.includes(bankTransactionId)) return c.json({ success: false, error: 'This bank transaction is already matched.' }, 409);

    const now = Date.now();
    const userId = String(c.get('userId') || 'unknown');
    const userEmail = String(c.get('userEmail') || 'unknown');
    const matchAssertionId = `${mutationId}-match-assertion`;
    const matchOperationId = `${mutationId}-match-update`;
    const nextMatchRevision = Number(matchRecord.revision) + 1;
    const nextMatchedData = JSON.stringify([...new Set([...matchedIds, bankTransactionId])]);
    const statements: any[] = [
      c.env.DB.prepare(`INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END`).bind(matchAssertionId, matchRecord.revision)
    ];
    let resultItem: any;
    let recordAssertionId = '';

    if (action === 'expense') {
      const vendor = String(body.vendor || '').trim();
      const category = String(body.category || '').trim();
      const categoryRow: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(category).first();
      if (!vendor || !categoryRow || JSON.parse(String(categoryRow.data)).type !== 'expense') return c.json({ success: false, error: 'Vendor and a valid expense category are required.' }, 409);
      const id = crypto.randomUUID();
      const operationId = `${mutationId}-bill-insert`;
      const record = { id, vendor, amount, currency: accountData.currency === 'USD' ? 'USD' : 'CAD', dueDate: bankDate, paidDate: bankDate, status: 'paid', category, sourceAccountId: accountId, offsetAccountId: category, taxable: Boolean(body.taxable), memo: description, bankTransactionId };
      const data = JSON.stringify(record);
      resultItem = { ...record, revision: 1, updatedAt: now };
      statements.push(
        c.env.DB.prepare(`INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'bills',?,?,1,0,?)`).bind(id, data, now, operationId),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'bills',1,'insert',?,?,?,?)`).bind(id, data, now, mutationId, operationId),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'bills','insert',NULL,1,NULL,?,?,?,?,?,?,?)`).bind(id, data, userId, userEmail, now, mutationId, operationId, 'Created from server-driven outgoing bank match')
      );
    } else if (action === 'transfer') {
      const targetAccountId = String(body.targetAccountId || '').trim();
      const target: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(targetAccountId).first();
      if (!target || targetAccountId === accountId) return c.json({ success: false, error: 'Choose a different destination account.' }, 409);
      const id = crypto.randomUUID();
      const operationId = `${mutationId}-transfer-insert`;
      const record = { id, fromAccountId: accountId, toAccountId: targetAccountId, amount, date: bankDate, notes: description, bankTransactionId };
      const data = JSON.stringify(record);
      resultItem = { ...record, revision: 1, updatedAt: now };
      statements.push(
        c.env.DB.prepare(`INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'accountTransfers',?,?,1,0,?)`).bind(id, data, now, operationId),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'accountTransfers',1,'insert',?,?,?,?)`).bind(id, data, now, mutationId, operationId),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'accountTransfers','insert',NULL,1,NULL,?,?,?,?,?,?,?)`).bind(id, data, userId, userEmail, now, mutationId, operationId, 'Created from server-driven outgoing bank transfer match')
      );
    } else {
      const billId = String(body.billId || '').trim();
      const current: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='bills' AND id=? AND is_deleted=0").bind(billId).first();
      if (!current) return c.json({ success: false, error: 'Existing bill not found.' }, 404);
      const bill = JSON.parse(String(current.data));
      if (bill.bankTransactionId) return c.json({ success: false, error: 'This bill is already linked to a bank transaction.' }, 409);
      const expectedAmount = accountData.currency === 'CAD' && bill.currency === 'USD' ? Number(bill.amount) * Number(bill.exchangeRate || 1.35) : Number(bill.amount);
      if (Math.abs(expectedAmount - amount) >= 0.005) return c.json({ success: false, error: `The bill is $${expectedAmount.toFixed(2)} in this bank currency, but the bank transaction is $${amount.toFixed(2)}.` }, 409);
      const expectedRevision = Number(body.revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision !== Number(current.revision)) return c.json({ success: false, error: 'This bill was changed by another user. The latest version has been reloaded.', conflict: true }, 409);
      const next = { ...bill, bankTransactionId, ...(bill.status === 'paid' ? {} : { status: 'paid', paidDate: bankDate, sourceAccountId: accountId, offsetAccountId: bill.category }) };
      const nextRevision = expectedRevision + 1;
      const data = JSON.stringify(next);
      const operationId = `${mutationId}-bill-update`;
      recordAssertionId = `${mutationId}-bill-assertion`;
      resultItem = { ...next, revision: nextRevision, updatedAt: now };
      statements.push(
        c.env.DB.prepare(`INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type='bills' AND id=? AND revision=? AND is_deleted=0 AND COALESCE(json_extract(data,'$.bankTransactionId'),'')='') THEN 1 ELSE 0 END`).bind(recordAssertionId, billId, expectedRevision),
        c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',revision,revision+1,data,?, ?,?,?, ?,?,? FROM sync_records WHERE type='bills' AND id=? AND revision=?`).bind(data, userId, userEmail, now, mutationId, operationId, 'Linked through server-driven outgoing bank match', billId, expectedRevision),
        c.env.DB.prepare(`UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='bills' AND id=? AND revision=? AND is_deleted=0`).bind(data, nextRevision, now, operationId, billId, expectedRevision),
        c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='bills' AND id=? AND revision=?`).bind(mutationId, operationId, billId, nextRevision)
      );
    }

    const response = { success: true, action, item: resultItem };
    statements.push(
      c.env.DB.prepare(`INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',revision,revision+1,data,?, ?,?,?, ?,?,? FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=?`).bind(nextMatchedData, userId, userEmail, now, mutationId, matchOperationId, 'Added server-driven outgoing bank match', matchRecord.revision),
      c.env.DB.prepare(`UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=? AND is_deleted=0`).bind(nextMatchedData, nextMatchRevision, now, matchOperationId, matchRecord.revision),
      c.env.DB.prepare(`INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='matchedBankTransactions' AND id='matchedBankTransactions' AND revision=?`).bind(mutationId, matchOperationId, nextMatchRevision),
      recordAssertionId
        ? c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id IN (?,?)').bind(matchAssertionId, recordAssertionId)
        : c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(matchAssertionId),
      c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
    );
    try {
      await c.env.DB.batch(statements);
      return c.json(response);
    } catch {
      const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'The bank match or accounting record changed. The latest cloud records were reloaded.', conflict: true }, 409);
    }
  });

  app.get('/v3/accounts', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase();
    const result = await c.env.DB.prepare(`
      WITH exchange_rate AS (
        SELECT COALESCE((SELECT CAST(json_extract(data,'$') AS REAL) FROM sync_records WHERE type='exchangeRate' AND is_deleted=0 LIMIT 1),1.35) AS value
      ), tx_source AS (
        SELECT a.id AS account_id, SUM(
          CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN -1 ELSE 1 END *
          CASE WHEN json_extract(a.data,'$.currency')='CAD' AND json_extract(t.data,'$.currency')='USD'
            THEN COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0)
            ELSE COALESCE(json_extract(t.data,'$.amount'),0) END) AS amount
        FROM sync_records t JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(t.data,'$.sourceAccountId') AND a.is_deleted=0
        WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved'
          AND NOT (a.id='sys-undeposited-funds' AND json_extract(t.data,'$.depositStatus')='deposited')
        GROUP BY a.id
      ), tx_offset AS (
        SELECT a.id AS account_id, SUM(
          CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN 1 ELSE -1 END *
          CASE WHEN json_extract(a.data,'$.currency')='CAD' AND json_extract(t.data,'$.currency')='USD'
            THEN COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0)
            ELSE COALESCE(json_extract(t.data,'$.amount'),0) END) AS amount
        FROM sync_records t JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(t.data,'$.offsetAccountId') AND a.is_deleted=0
        WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved'
        GROUP BY a.id
      ), bill_source AS (
        SELECT a.id AS account_id, SUM(
          CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN 1 ELSE -1 END *
          COALESCE(json_extract(b.data,'$.amount'),0) * CASE WHEN json_extract(a.data,'$.currency')='CAD' AND json_extract(b.data,'$.currency')='USD' THEN er.value ELSE 1 END) AS amount
        FROM sync_records b JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(b.data,'$.sourceAccountId') AND a.is_deleted=0 CROSS JOIN exchange_rate er
        WHERE b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.status')='paid'
        GROUP BY a.id
      ), bill_credit AS (
        SELECT a.id AS account_id, SUM(
          CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN -1 ELSE 1 END *
          COALESCE(json_extract(b.data,'$.amount'),0) * CASE WHEN json_extract(a.data,'$.currency')='CAD' AND json_extract(b.data,'$.currency')='USD' THEN er.value ELSE 1 END) AS amount
        FROM sync_records b JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(b.data,'$.creditAccountId') AND a.is_deleted=0 CROSS JOIN exchange_rate er
        WHERE b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.status')='paid'
        GROUP BY a.id
      ), bill_category AS (
        SELECT a.id AS account_id, SUM(
          CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN -1 ELSE 1 END *
          COALESCE(json_extract(b.data,'$.amount'),0) * CASE WHEN json_extract(a.data,'$.currency')='CAD' AND json_extract(b.data,'$.currency')='USD' THEN er.value ELSE 1 END) AS amount
        FROM sync_records b JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(b.data,'$.category') AND a.is_deleted=0 CROSS JOIN exchange_rate er
        WHERE b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.status')='paid'
        GROUP BY a.id
      ), transfer_from AS (
        SELECT a.id AS account_id, SUM(CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN 1 ELSE -1 END * COALESCE(json_extract(x.data,'$.amount'),0)) AS amount
        FROM sync_records x JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(x.data,'$.fromAccountId') AND a.is_deleted=0
        WHERE x.type='accountTransfers' AND x.is_deleted=0
        GROUP BY a.id
      ), transfer_to AS (
        SELECT a.id AS account_id, SUM(CASE WHEN json_extract(a.data,'$.type') IN ('liability','revenue','equity') THEN -1 ELSE 1 END * COALESCE(json_extract(x.data,'$.amount'),0)) AS amount
        FROM sync_records x JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(x.data,'$.toAccountId') AND a.is_deleted=0
        WHERE x.type='accountTransfers' AND x.is_deleted=0
        GROUP BY a.id
      )
      SELECT a.id,a.data,a.revision,a.updated_at,
        CAST(COALESCE(json_extract(a.data,'$.startingBalance'),0) AS REAL)
        + COALESCE(ts.amount,0) + COALESCE(txo.amount,0)
        + COALESCE(bs.amount,0) + COALESCE(bc.amount,0) + COALESCE(bcat.amount,0)
        + COALESCE(tf.amount,0) + COALESCE(tt.amount,0) AS calculated_balance
      FROM sync_records a
      LEFT JOIN tx_source ts ON ts.account_id=a.id
      LEFT JOIN tx_offset txo ON txo.account_id=a.id
      LEFT JOIN bill_source bs ON bs.account_id=a.id
      LEFT JOIN bill_credit bc ON bc.account_id=a.id
      LEFT JOIN bill_category bcat ON bcat.account_id=a.id
      LEFT JOIN transfer_from tf ON tf.account_id=a.id
      LEFT JOIN transfer_to tt ON tt.account_id=a.id
      WHERE a.type='accounts' AND a.is_deleted=0
        AND (?='' OR lower(COALESCE(json_extract(a.data,'$.name'),'')) LIKE ?)
      ORDER BY json_extract(a.data,'$.type'), lower(json_extract(a.data,'$.name'))
      LIMIT ? OFFSET ?
    `).bind(search, `%${search}%`, limit, offset).all();
    const countResult: any = await c.env.DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='accounts' AND is_deleted=0 AND (?='' OR lower(COALESCE(json_extract(data,'$.name'),'')) LIKE ?)").bind(search, `%${search}%`).first();
    const total = Number(countResult?.count || 0);
    return c.json({ success: true, items: result.results.map((row: any) => ({ ...parseRecord(row), balance: Number(row.calculated_balance || 0) })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/accounts/:id/ledger', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const id = String(c.req.param('id') || '');
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const account: any = await c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(id).first();
    if (!account) return c.json({ success: false, error: 'Account not found.' }, 404);
    const where = `is_deleted=0 AND (
      (type='transactions' AND json_extract(data,'$.type')='approved' AND (json_extract(data,'$.sourceAccountId')=? OR json_extract(data,'$.offsetAccountId')=?) AND NOT (?='sys-undeposited-funds' AND json_extract(data,'$.depositStatus')='deposited')) OR
      (type='bills' AND json_extract(data,'$.status')='paid' AND (json_extract(data,'$.sourceAccountId')=? OR json_extract(data,'$.creditAccountId')=? OR json_extract(data,'$.category')=?)) OR
      (type='accountTransfers' AND (json_extract(data,'$.fromAccountId')=? OR json_extract(data,'$.toAccountId')=?))
    )`;
    const bindings = [id,id,id,id,id,id,id,id];
    const [rows, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id,type,data,revision,updated_at FROM sync_records WHERE ${where} ORDER BY COALESCE(json_extract(data,'$.date'),json_extract(data,'$.paidDate'),json_extract(data,'$.dueDate')) DESC,updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, account: parseRecord(account), items: rows.results.map((row: any) => ({ ...parseRecord(row), recordType: row.type })), page, limit, total, totalPages: Math.ceil(total / limit) });
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
      SELECT type,id,data FROM sync_records
      WHERE is_deleted=0 AND ((type='donors' AND id=?) OR (type='accounts' AND id IN (?,?)) OR type='exchangeRate')
    `).bind(donorId, sourceAccountId, offsetAccountId).all();
    const found = new Set(refs.results.map((row: any) => `${row.type}:${row.id}`));
    if (!found.has(`donors:${donorId}`) || !found.has(`accounts:${sourceAccountId}`) || !found.has(`accounts:${offsetAccountId}`)) {
      return c.json({ success: false, error: 'A referenced donor or account does not exist.' }, 409);
    }

    const id = crypto.randomUUID();
    const now = Date.now();
    const method = String(body.method || 'other');
    const allowedMethods = new Set(['credit_card', 'check', 'cash', 'e_transfer', 'vouchers', 'eizer', 'bnei_leivy', 'other']);
    if (!allowedMethods.has(method)) return c.json({ success: false, error: 'Invalid payment method.' }, 400);
    const currency = body.currency === 'USD' ? 'USD' : 'CAD';
    const exchangeRow: any = refs.results.find((row: any) => row.type === 'exchangeRate');
    const savedRate = exchangeRow ? Number(JSON.parse(String(exchangeRow.data))) : 1.35;
    const exchangeRate = Number.isFinite(savedRate) && savedRate > 0 ? savedRate : 1.35;
    const amountCAD = currency === 'USD' ? amount * exchangeRate : amount;
    const date = String(body.date || new Date().toISOString().slice(0, 10));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      return c.json({ success: false, error: 'A valid payment date is required.' }, 400);
    }
    const notes = String(body.notes || '').trim();
    if (notes.length > 2000) return c.json({ success: false, error: 'Notes must be 2,000 characters or fewer.' }, 400);
    const undeposited = sourceAccountId === 'sys-undeposited-funds' || body.depositStatus === 'undeposited';
    const record = {
      id, donorId, amount, amountCAD,
      date,
      type: body.type === 'pending' ? 'pending' : 'approved',
      method, currency,
      sourceAccountId: undeposited ? 'sys-undeposited-funds' : sourceAccountId,
      offsetAccountId,
      depositStatus: undeposited ? 'undeposited' : 'direct',
      ...(body.fundraiserId ? { fundraiserId: String(body.fundraiserId) } : {}),
      ...(body.projectId ? { projectId: String(body.projectId) } : {}),
      ...(body.pledgeId ? { pledgeId: String(body.pledgeId) } : {}),
      ...(body.sponsor ? { sponsor: String(body.sponsor) } : {}),
      ...(notes ? { notes } : {})
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

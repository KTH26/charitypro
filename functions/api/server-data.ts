import type { Hono } from 'hono';
import { validatePayload } from './validation';
import { buildDonorSheetPlan } from './donor-sheet';

const parseRecord = (row: any) => ({
  ...JSON.parse(String(row.data)),
  id: String(row.id),
  revision: Number(row.revision),
  updatedAt: Number(row.updated_at)
});

const boundedLimit = (raw?: string) => Math.min(100, Math.max(1, Number.parseInt(raw || '50', 10) || 50));
const boundedPage = (raw?: string) => Math.max(1, Number.parseInt(raw || '1', 10) || 1);
const requestedOrder = (c: any, columns: Record<string, string>, fallback: string) => {
  const key = String(c.req.query('sort') || '');
  const expression = columns[key] || fallback;
  const direction = String(c.req.query('direction') || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  return `${expression} ${direction}`;
};

const isoDate = (value: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
const addUtc = (value: string, frequency: string) => {
  const date = new Date(`${value}T00:00:00Z`);
  if (frequency === 'weekly') date.setUTCDate(date.getUTCDate() + 7);
  else if (frequency === 'quarterly') date.setUTCMonth(date.getUTCMonth() + 3);
  else if (frequency === 'yearly') date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
};
const addYear = (value: string) => addUtc(value, 'yearly');
const solaReference = (payment: any) => String(payment.notes || '').match(/\bRef:\s*([^\s]+)/i)?.[1] || '';
const uniquePaymentsForAccounting = (payments: any[]) => {
  const unique = new Map<string, any>();
  for (const payment of payments) {
    if (payment.type !== 'approved' || payment.isBatch) continue;
    const ref = solaReference(payment);
    const key = ref ? `sola:${ref}` : `id:${payment.id}`;
    const previous = unique.get(key);
    if (!previous || (!previous.pledgeId && payment.pledgeId)) unique.set(key, payment);
  }
  return [...unique.values()];
};

export const calculatePledgeFinancials = (pledgesInput: any[], paymentsInput: any[], schedulesInput: any[]) => {
  const pledges = [...pledgesInput].filter(item => isoDate(item.date)).sort((left, right) => String(left.date).localeCompare(String(right.date)) || String(left.id).localeCompare(String(right.id)));
  const uniquePayments = uniquePaymentsForAccounting(paymentsInput);
  return pledges.map((pledge, index) => {
    const start = isoDate(pledge.date);
    const nextStart = isoDate(pledges[index + 1]?.date);
    const yearlyEnd = addYear(start);
    const end = nextStart && nextStart < yearlyEnd ? nextStart : yearlyEnd;
    const appliedPayments = uniquePayments.filter(payment => {
      if (String(payment.donorId || '') !== String(pledge.donorId || '')) return false;
      if (payment.pledgeId) return String(payment.pledgeId) === String(pledge.id);
      const date = isoDate(payment.date);
      return Boolean(date && date >= start && date < end);
    });
    const paid = appliedPayments.reduce((total, payment) => total + Number(payment.amountCAD ?? payment.amount ?? 0), 0);
    const pendingPayments = paymentsInput.filter(payment => {
      if (payment.type !== 'pending' || payment.isBatch || String(payment.donorId || '') !== String(pledge.donorId || '')) return false;
      if (payment.pledgeId) return String(payment.pledgeId) === String(pledge.id);
      const date = isoDate(payment.date);
      return Boolean(date && date >= start && date < end);
    });
    const pending = pendingPayments.reduce((total, payment) => total + Number(payment.amountCAD ?? payment.amount ?? 0), 0);
    const linkedSchedules = schedulesInput.filter(schedule => schedule.active && String(schedule.donorId || '') === String(pledge.donorId || '') && String(schedule.pledgeId || '') === String(pledge.id));
    const schedules = linkedSchedules.length > 0
      ? linkedSchedules
      : index === pledges.length - 1
        ? schedulesInput.filter(schedule => schedule.active && String(schedule.donorId || '') === String(pledge.donorId || '') && !schedule.pledgeId)
        : [];
    let scheduled = 0;
    for (const schedule of schedules) {
      let occurrence = isoDate(schedule.nextDate);
      const scheduleEnd = isoDate(schedule.endDate);
      let guard = 0;
      while (occurrence && occurrence < start && guard++ < 500) occurrence = addUtc(occurrence, String(schedule.frequency || 'monthly'));
      while (occurrence && occurrence < end && (!scheduleEnd || occurrence <= scheduleEnd) && guard++ < 500) {
        scheduled += Number(schedule.amountCAD ?? schedule.amount ?? 0);
        occurrence = addUtc(occurrence, String(schedule.frequency || 'monthly'));
      }
    }
    const amount = Number(pledge.amountCAD ?? pledge.amount ?? 0);
    return { ...pledge, periodStart: start, periodEnd: end, paid, pending, scheduled, balance: amount - paid - pending - scheduled, appliedPayments, pendingPayments };
  });
};

const genericCollections: Record<string, { read: string; create: string; update: string; delete: string }> = {
  transactions: { read: 'transactions.read', create: 'transactions.create', update: 'transactions.approve', delete: 'transactions.reverse' },
  bills: { read: 'bills.read', create: 'bills.create', update: 'bills.approve', delete: 'bills.approve' },
  accounts: { read: 'transactions.read', create: 'system.manage', update: 'system.manage', delete: 'system.manage' },
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
  expenseQueueItems: { read: 'bills.read', create: 'bills.create', update: 'bills.approve', delete: 'bills.approve' },
  accountTransfers: { read: 'transactions.read', create: 'transactions.create', update: 'transactions.approve', delete: 'transactions.reverse' },
  reconciliations: { read: 'transactions.read', create: 'transactions.approve', update: 'transactions.approve', delete: 'transactions.reverse' }
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
    if (type === 'transactions' && record.pledgeId) {
      const pledge: any = await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='pledges' AND id=? AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(String(record.pledgeId), String(record.donorId || '')).first();
      if (!pledge) return c.json({ success: false, error: 'The selected pledge does not belong to this donor.' }, 409);
    }
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
    const from=String(c.req.query('from')||'');const to=String(c.req.query('to')||'');const conditions=["p.type='pledges'",'p.is_deleted=0'];const bindings:any[]=[];if(search){conditions.push("(lower(p.data) LIKE ? OR lower(COALESCE(json_extract(d.data,'$.name'),'')) LIKE ?)");bindings.push(`%${search}%`,`%${search}%`);}if(from){conditions.push("json_extract(p.data,'$.date')>=?");bindings.push(from);}if(to){conditions.push("json_extract(p.data,'$.date')<=?");bindings.push(to);}const where=conditions.join(' AND ');
    const join = "LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(p.data,'$.donorId') AND d.is_deleted=0";
    const order = requestedOrder(c, { date: "json_extract(p.data,'$.date')", donor: "lower(COALESCE(json_extract(d.data,'$.name'),''))", amount: "CAST(COALESCE(json_extract(p.data,'$.amountCAD'),json_extract(p.data,'$.amount'),0) AS REAL)", currency: "json_extract(p.data,'$.currency')", notes: "lower(COALESCE(json_extract(p.data,'$.notes'),''))" }, "json_extract(p.data,'$.date')");
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT p.id,p.data,p.revision,p.updated_at,json_extract(d.data,'$.name') AS donor_name,json_extract(d.data,'$.preTitle') AS donor_pre_title,json_extract(d.data,'$.hebFirstName') AS donor_heb_first,json_extract(d.data,'$.hebLastName') AS donor_heb_last,json_extract(d.data,'$.title') AS donor_title FROM sync_records p ${join} WHERE ${where} ORDER BY ${order},p.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records p ${join} WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    const donorIds = [...new Set(listResult.results.map((row: any) => String(parseRecord(row).donorId || '')).filter(Boolean))];
    const calculationsById = new Map<string, any>();
    if (donorIds.length) {
      const placeholders = donorIds.map(() => '?').join(',');
      const related = await c.env.DB.prepare(`SELECT id,type,data,revision,updated_at FROM sync_records WHERE type IN ('pledges','transactions','recurringPayments') AND is_deleted=0 AND json_extract(data,'$.donorId') IN (${placeholders})`).bind(...donorIds).all();
      for (const donorId of donorIds) {
        const donorRecords = related.results.filter((row: any) => String(parseSetting(row.data, {})?.donorId || '') === donorId);
        const financials = calculatePledgeFinancials(donorRecords.filter((row: any) => row.type === 'pledges').map(parseRecord), donorRecords.filter((row: any) => row.type === 'transactions').map(parseRecord), donorRecords.filter((row: any) => row.type === 'recurringPayments').map(parseRecord));
        for (const calculation of financials) calculationsById.set(String(calculation.id), calculation);
      }
    }
    const items = listResult.results.map((row: any) => { const item = parseRecord(row); const calculation = calculationsById.get(String(item.id)); return { ...item, donorName: row.donor_name || 'Unknown Donor', donorHebrewName: [row.donor_pre_title,row.donor_heb_first,row.donor_heb_last,row.donor_title].filter(Boolean).join(' '), paid: Number(calculation?.paid || 0), pending: Number(calculation?.pending || 0), scheduled: Number(calculation?.scheduled || 0), balance: Number(calculation?.balance ?? item.amountCAD ?? item.amount ?? 0) }; });
    return c.json({ success: true, items, page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/donors/:id/pledge-choices', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const donorId = String(c.req.param('id') || '');
    const limit = boundedLimit(c.req.query('limit'));
    const [pledgeRows, paymentRows, scheduleRows] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.date'),id LIMIT ?").bind(donorId, limit),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(donorId),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(donorId)
    ]);
    const financials = calculatePledgeFinancials(pledgeRows.results.map(parseRecord), paymentRows.results.map(parseRecord), scheduleRows.results.map(parseRecord));
    return c.json({ success: true, items: financials.map(({ appliedPayments: _appliedPayments, pendingPayments: _pendingPayments, ...item }) => item).sort((left, right) => Number(left.balance <= 0) - Number(right.balance <= 0) || String(right.date).localeCompare(String(left.date))) });
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
    const pledgeData = parseRecord(pledge);
    const donorId = String(pledgeData.donorId || '');
    const [allPledges, allPayments, allSchedules] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(donorId),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(donorId),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(donorId)
    ]);
    const calculations = calculatePledgeFinancials(allPledges.results.map(parseRecord), allPayments.results.map(parseRecord), allSchedules.results.map(parseRecord));
    const calculation: any = calculations.find(item => String(item.id) === id);
    const item = { ...pledgeData, donorName: pledge.donor_name || 'Unknown Donor' };
    const appliedPayments = [...(calculation?.appliedPayments || [])].sort((left, right) => String(right.date).localeCompare(String(left.date)) || String(right.id).localeCompare(String(left.id)));
    const schedules = allSchedules.results.map(parseRecord).filter((schedule: any) => schedule.active && (String(schedule.pledgeId || '') === id || (!schedule.pledgeId && calculations[calculations.length - 1]?.id === id)));
    return c.json({
      success: true,
      pledge: item,
      payments: appliedPayments.slice(0, 50),
      schedules: schedules.slice(0, 50),
      summary: {
        paymentCount: appliedPayments.length,
        scheduleCount: schedules.length,
        amount: Number(item.amountCAD ?? item.amount ?? 0),
        paid: Number(calculation?.paid || 0),
        pending: Number(calculation?.pending || 0),
        scheduled: Number(calculation?.scheduled || 0),
        balance: Number(calculation?.balance ?? Number(item.amountCAD ?? item.amount ?? 0)),
        periodStart: calculation?.periodStart,
        periodEnd: calculation?.periodEnd
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
    const from=String(c.req.query('from')||'');const to=String(c.req.query('to')||'');
    const conditions = ["r.type='recurringPayments'", 'r.is_deleted=0'];
    const bindings: any[] = [];
    if (status === 'active') conditions.push("COALESCE(json_extract(r.data,'$.active'),0)=1");
    if (status === 'paused') conditions.push("COALESCE(json_extract(r.data,'$.active'),0)=0");
    if (search) { conditions.push("(lower(r.data) LIKE ? OR lower(COALESCE(json_extract(d.data,'$.name'),'')) LIKE ?)"); bindings.push(`%${search}%`, `%${search}%`); }
    if(from){conditions.push("json_extract(r.data,'$.nextDate')>=?");bindings.push(from);}if(to){conditions.push("json_extract(r.data,'$.nextDate')<=?");bindings.push(to);}
    const where = conditions.join(' AND ');
    const join = "LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(r.data,'$.donorId') AND d.is_deleted=0";
    const order = requestedOrder(c, { nextDate: "json_extract(r.data,'$.nextDate')", donor: "lower(COALESCE(json_extract(d.data,'$.name'),''))", amount: "CAST(COALESCE(json_extract(r.data,'$.amountCAD'),json_extract(r.data,'$.amount'),0) AS REAL)", frequency: "json_extract(r.data,'$.frequency')", method: "json_extract(r.data,'$.method')", status: "COALESCE(json_extract(r.data,'$.active'),0)" }, "json_extract(r.data,'$.nextDate')");
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT r.id,r.data,r.revision,r.updated_at,json_extract(d.data,'$.name') AS donor_name FROM sync_records r ${join} WHERE ${where} ORDER BY ${order},r.id LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records r ${join} WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor' })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.delete('/v3/schedules', async (c: any) => {
    const denied = requirePermission(c, 'transactions.reverse'); if (denied) return denied;
    const requestId = String(c.req.header('Idempotency-Key') || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-delete-all-schedules-${requestId}`;
    const prior: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const rows = await c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 ORDER BY id").all();
    const now = Date.now(); const userId = String(c.get('userId') || 'unknown'); const userEmail = String(c.get('userEmail') || 'unknown');
    for (let index = 0; index < rows.results.length; index += 20) {
      const statements: any[] = [];
      for (const row of rows.results.slice(index, index + 20) as any[]) {
        const revision = Number(row.revision) + 1; const operationId = `${mutationId}-${row.id}`;
        statements.push(
          c.env.DB.prepare("UPDATE sync_records SET revision=?,updated_at=?,is_deleted=1,last_operation_id=? WHERE type='recurringPayments' AND id=? AND revision=? AND is_deleted=0").bind(revision, now, operationId, row.id, row.revision),
          c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'recurringPayments',?,'delete',?,?,?,?)").bind(row.id, revision, row.data, now, mutationId, operationId),
          c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'recurringPayments','delete',?,?,?,NULL,?,?,?,?,?,?)").bind(row.id, row.revision, revision, row.data, userId, userEmail, now, mutationId, operationId, 'Deleted through Delete all scheduled payments')
        );
      }
      if (statements.length) await c.env.DB.batch(statements);
    }
    const result = { success: true, deleted: rows.results.length };
    await c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(result), now).run();
    return c.json(result);
  });

  app.post('/v3/schedules/process-due', async (c: any) => {
    const denied = requirePermission(c, 'transactions.create');
    if (denied) return denied;
    const today = new Date().toISOString().slice(0, 10);
    const dueRows = await c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND COALESCE(json_extract(data,'$.active'),0)=1 AND json_extract(data,'$.nextDate')<=? ORDER BY json_extract(data,'$.nextDate'),id LIMIT 100").bind(today).all();
    let created = 0;
    for (const row of dueRows.results as any[]) {
      const schedule = { ...JSON.parse(String(row.data)), id: String(row.id) };
      let occurrence = isoDate(schedule.nextDate);
      const endDate = isoDate(schedule.endDate);
      const pending: any[] = [];
      let guard = 0;
      while (occurrence && occurrence <= today && (!endDate || occurrence <= endDate) && guard++ < 36) {
        const id = `scheduled-payment-${schedule.id}-${occurrence}`;
        const existing = await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='transactions' AND id=? LIMIT 1").bind(id).first();
        if (!existing) pending.push({ id, donorId: schedule.donorId, ...(schedule.pledgeId ? { pledgeId: schedule.pledgeId } : {}), amount: Number(schedule.amount || 0), ...(schedule.amountCAD ? { amountCAD: Number(schedule.amountCAD) } : {}), currency: schedule.currency || 'CAD', date: occurrence, type: 'pending', method: schedule.method || 'credit_card', notes: 'Scheduled payment date reached; awaiting Sola verification.', scheduleId: schedule.id });
        occurrence = addUtc(occurrence, String(schedule.frequency || 'monthly'));
      }
      if (!occurrence || occurrence === schedule.nextDate) continue;
      const now = Date.now(); const nextRevision = Number(row.revision) + 1;
      const nextSchedule = { ...schedule, nextDate: occurrence, active: !endDate || occurrence <= endDate };
      const mutationId = `process-due-${schedule.id}-${String(schedule.nextDate)}-${occurrence}`;
      const operationId = `${mutationId}-schedule`;
      const userId = String(c.get('userId') || 'system'); const userEmail = String(c.get('userEmail') || 'system');
      const statements: any[] = [c.env.DB.prepare('INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type=? AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END').bind(operationId, 'recurringPayments', schedule.id, Number(row.revision))];
      for (const item of pending) {
        const data = JSON.stringify(item); const itemOperation = `${mutationId}-${item.id}`;
        statements.push(
          c.env.DB.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,?,?, ?,1,0,?)').bind(item.id, 'transactions', data, now, itemOperation),
          c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,?,1,'insert',?,?,?,?)").bind(item.id, 'transactions', data, now, mutationId, itemOperation),
          c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,?,'insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(item.id, 'transactions', data, userId, userEmail, now, mutationId, itemOperation, 'Materialized due schedule occurrence for Sola verification')
        );
      }
      const scheduleData = JSON.stringify(nextSchedule);
      statements.push(
        c.env.DB.prepare('UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type=? AND id=? AND revision=? AND is_deleted=0').bind(scheduleData, nextRevision, now, operationId, 'recurringPayments', schedule.id, Number(row.revision)),
        c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='recurringPayments' AND id=? AND revision=?").bind(mutationId, operationId, schedule.id, nextRevision),
        c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',?,revision,?,data,?,?,updated_at,?,?,? FROM sync_records WHERE type='recurringPayments' AND id=? AND revision=?").bind(Number(row.revision), row.data, userId, userEmail, mutationId, operationId, 'Advanced schedule after materializing due occurrences', schedule.id, nextRevision),
        c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId)
      );
      try { await c.env.DB.batch(statements); created += pending.length; } catch { /* Another request may have processed this schedule first. */ }
    }
    return c.json({ success: true, created, processed: dueRows.results.length, through: today });
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
        lower(t.data) LIKE ? OR lower(COALESCE(json_extract(d.data, '$.name'), '')) LIKE ? OR
        lower(COALESCE(json_extract(src.data, '$.name'), '')) LIKE ? OR lower(COALESCE(json_extract(off.data, '$.name'), '')) LIKE ?
      )`);
      const term = `%${search}%`;
      bindings.push(term, term, term, term);
    }

    const where = conditions.join(' AND ');
    const join = `LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(t.data,'$.donorId') AND d.is_deleted=0
      LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(t.data,'$.sourceAccountId') AND src.is_deleted=0
      LEFT JOIN sync_records off ON off.type='accounts' AND off.id=json_extract(t.data,'$.offsetAccountId') AND off.is_deleted=0`;
    const order = requestedOrder(c, { date: "json_extract(t.data,'$.date')", donor: "lower(COALESCE(json_extract(d.data,'$.name'),''))", amount: "CAST(COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0) AS REAL)", method: "json_extract(t.data,'$.method')", status: "json_extract(t.data,'$.type')", notes: "lower(COALESCE(json_extract(t.data,'$.notes'),''))" }, "json_extract(t.data,'$.date')");
    const listSql = `
      SELECT t.id, t.data, t.revision, t.updated_at,
             json_extract(d.data, '$.name') AS donor_name,
             json_extract(src.data, '$.name') AS source_name,
             json_extract(off.data, '$.name') AS offset_name
      FROM sync_records t ${join}
      WHERE ${where}
      ORDER BY ${order}, t.id DESC
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
    const order = requestedOrder(c, { date: dateExpression, type: "r.type", name: "lower(COALESCE(json_extract(d.data,'$.name'),json_extract(r.data,'$.vendor'),json_extract(r.data,'$.notes'),''))", status: "COALESCE(json_extract(r.data,'$.type'),json_extract(r.data,'$.status'),'')", source: "lower(COALESCE(json_extract(src.data,'$.name'),''))", offset: "lower(COALESCE(json_extract(off.data,'$.name'),''))", amount: "CAST(COALESCE(json_extract(r.data,'$.amountCAD'),json_extract(r.data,'$.amount'),0) AS REAL)" }, dateExpression);
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT r.id,r.type AS record_type,r.data,r.revision,r.updated_at,json_extract(d.data,'$.name') AS donor_name,json_extract(src.data,'$.name') AS source_name,json_extract(off.data,'$.name') AS offset_name FROM sync_records r ${joins} WHERE ${where} ORDER BY ${order},r.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records r WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), recordType: row.record_type, donorName: row.donor_name || '', sourceName: row.source_name || '', offsetName: row.offset_name || '' })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/tasks', async (c: any) => {
    const denied = requirePermission(c, 'system.manage');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit; const status = String(c.req.query('status') || 'pending'); const search = String(c.req.query('search') || '').trim().toLowerCase(); const priority=String(c.req.query('priority')||''); const taskType=String(c.req.query('taskType')||''); const from=String(c.req.query('from')||''); const to=String(c.req.query('to')||'');
    const conditions = ["t.type='tasks'", 't.is_deleted=0']; const bindings: any[] = [];
    if (status === 'pending') conditions.push("COALESCE(json_extract(t.data,'$.completed'),0)=0"); if (status === 'completed') conditions.push("COALESCE(json_extract(t.data,'$.completed'),0)=1");
    if (search) { conditions.push("lower(t.data) LIKE ?"); bindings.push(`%${search}%`); }
    if(priority){conditions.push("json_extract(t.data,'$.priority')=?");bindings.push(priority);} if(taskType){conditions.push("json_extract(t.data,'$.type')=?");bindings.push(taskType);} if(from){conditions.push("json_extract(t.data,'$.dueDate')>=?");bindings.push(from);} if(to){conditions.push("json_extract(t.data,'$.dueDate')<=?");bindings.push(to);}
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

  app.get('/v3/payroll/entities', async (c: any) => {
    const denied = requirePermission(c, 'payroll.read');
    if (denied) return denied;
    const type = String(c.req.query('type') || 'employees');
    if (!['employees','fundraisers'].includes(type)) return c.json({ success: false, error: 'Choose employees or fundraisers.' }, 400);
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit; const search=String(c.req.query('search')||'').trim().toLowerCase();
    const payrollBalance = `(SELECT COALESCE(SUM(CASE WHEN json_extract(b.data,'$.status')='paid' THEN -COALESCE(json_extract(b.data,'$.amount'),0) ELSE COALESCE(json_extract(b.data,'$.amount'),0) END),0) FROM sync_records b WHERE b.type='bills' AND b.is_deleted=0 AND (COALESCE(json_extract(b.data,'$.isPayroll'),0)=1 OR COALESCE(json_extract(b.data,'$.isPayrollExpense'),0)=1) AND (json_extract(b.data,'$.employeeId')=e.id OR lower(json_extract(b.data,'$.vendor'))=lower('Payroll: '||json_extract(e.data,'$.name'))))`;
    const commissionBalance = type === 'fundraisers' ? `+(SELECT COALESCE(SUM(COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0)*COALESCE(json_extract(e.data,'$.percentage'),0)/100),0) FROM sync_records t WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved' AND json_extract(t.data,'$.fundraiserId')=e.id)` : '';
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT e.id,e.data,e.revision,e.updated_at,(${payrollBalance}${commissionBalance}) AS balance_owed FROM sync_records e WHERE e.type=? AND e.is_deleted=0 AND (?='' OR lower(e.data) LIKE ?) ORDER BY lower(json_extract(e.data,'$.name')) LIMIT ? OFFSET ?`).bind(type,search,`%${search}%`,limit,offset),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type=? AND is_deleted=0 AND (?='' OR lower(data) LIKE ?)").bind(type,search,`%${search}%`)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map((row: any) => ({ ...parseRecord(row), balanceOwed: Number(row.balance_owed || 0) })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/payroll/:entityType/:id/ledger', async (c: any) => {
    const denied = requirePermission(c, 'payroll.read');
    if (denied) return denied;
    const entityType = String(c.req.param('entityType') || ''); const recordType = entityType === 'employee' ? 'employees' : entityType === 'fundraiser' ? 'fundraisers' : '';
    if (!recordType) return c.json({ success: false, error: 'Payroll entity not found.' }, 404);
    const id = String(c.req.param('id') || ''); const entity: any = await c.env.DB.prepare('SELECT data FROM sync_records WHERE type=? AND id=? AND is_deleted=0').bind(recordType, id).first();
    if (!entity) return c.json({ success: false, error: 'Payroll entity not found.' }, 404);
    const name = String(JSON.parse(String(entity.data)).name || ''); const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit;
    const where = "type='bills' AND is_deleted=0 AND (COALESCE(json_extract(data,'$.isPayroll'),0)=1 OR COALESCE(json_extract(data,'$.isPayrollExpense'),0)=1) AND (json_extract(data,'$.employeeId')=? OR lower(json_extract(data,'$.vendor'))=lower(?))";
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT id,data,revision,updated_at FROM sync_records WHERE ${where} ORDER BY COALESCE(json_extract(data,'$.paidDate'),json_extract(data,'$.dueDate')) DESC,id DESC LIMIT ? OFFSET ?`).bind(id, `Payroll: ${name}`, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records WHERE ${where}`).bind(id, `Payroll: ${name}`)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: listResult.results.map(parseRecord), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.post('/v3/payroll/entries', async (c: any) => {
    const denied = requirePermission(c, 'payroll.manage');
    if (denied) return denied;
    const body = await c.req.json(); const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-payroll-entry-${requestId}`; const prior = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const action = body.action === 'payment' ? 'payment' : 'earnings'; const entityType = body.entityType === 'fundraiser' ? 'fundraiser' : 'employee'; const recordType = entityType === 'employee' ? 'employees' : 'fundraisers'; const entityId = String(body.entityId || ''); const amount = Number(body.amount); const date = String(body.date || '');
    if (!entityId || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return c.json({ success: false, error: 'Payroll recipient, positive amount, and date are required.' }, 400);
    const [entity, category] = await Promise.all([
      c.env.DB.prepare('SELECT data FROM sync_records WHERE type=? AND id=? AND is_deleted=0').bind(recordType, entityId).first(),
      c.env.DB.prepare("SELECT id,data FROM sync_records WHERE type='accounts' AND is_deleted=0 AND json_extract(data,'$.type')='expense' ORDER BY CASE WHEN lower(json_extract(data,'$.name'))='payroll expense' THEN 0 WHEN json_extract(data,'$.subType')='payroll' THEN 1 ELSE 2 END,lower(json_extract(data,'$.name')) LIMIT 1").first()
    ]);
    if (!entity) return c.json({ success: false, error: 'Payroll recipient not found.' }, 404);
    if (!category) return c.json({ success: false, error: 'Add a Payroll Expense account before recording payroll.' }, 409);
    const sourceAccountId = String(body.sourceAccountId || '');
    if (action === 'payment') { const source: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='accounts' AND id=? AND is_deleted=0").bind(sourceAccountId).first(); if (!source || !['asset','liability'].includes(JSON.parse(String(source.data)).type)) return c.json({ success: false, error: 'Choose a valid paid-from account.' }, 409); }
    const entityData = JSON.parse(String((entity as any).data)); const id = crypto.randomUUID(); const now = Date.now(); const categoryId = String((category as any).id); const operationId = `${mutationId}-bill`;
    const bill: any = { id, vendor: `Payroll: ${entityData.name}`, employeeId: entityId, payrollEntityType: entityType, amount, currency: 'CAD', dueDate: date, status: action === 'payment' ? 'paid' : 'pending', category: categoryId, isPayroll: true, earningType: String(body.earningType || 'Salary').slice(0,100), t4aEligible: Boolean(body.t4aEligible), memo: String(body.memo || '').trim().slice(0,2000) };
    if (action === 'payment') { bill.sourceAccountId = sourceAccountId; bill.offsetAccountId = categoryId; bill.paidDate = date; }
    const billData = JSON.stringify(bill); const statements: any[] = [
      c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'bills',?,?,1,0,?)").bind(id, billData, now, operationId),
      c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'bills',1,'insert',?,?,?,?)").bind(id, billData, now, mutationId, operationId),
      c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'bills','insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(id, billData, String(c.get('userId') || 'unknown'), String(c.get('userEmail') || 'unknown'), now, mutationId, operationId, action === 'payment' ? 'Recorded payroll payment' : 'Added payroll earnings')
    ];
    let schedule: any = null;
    if (action === 'earnings' && body.recurring) {
      const frequency = ['weekly','biweekly','monthly'].includes(body.frequency) ? body.frequency : 'monthly'; const scheduleId = crypto.randomUUID(); const scheduleOperationId = `${mutationId}-schedule`;
      schedule = { id: scheduleId, entityId, type: entityType, amount, earningType: bill.earningType, t4aEligible: Boolean(body.t4aEligible), frequency, startDate: date, nextDate: date, active: true }; const scheduleData = JSON.stringify(schedule);
      statements.push(c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'recurringPayroll',?,?,1,0,?)").bind(scheduleId, scheduleData, now, scheduleOperationId), c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'recurringPayroll',1,'insert',?,?,?,?)").bind(scheduleId, scheduleData, now, mutationId, scheduleOperationId), c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'recurringPayroll','insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(scheduleId, scheduleData, String(c.get('userId') || 'unknown'), String(c.get('userEmail') || 'unknown'), now, mutationId, scheduleOperationId, 'Created recurring payroll schedule'));
    }
    const response = { success: true, item: { ...bill, revision: 1, updatedAt: now }, schedule: schedule ? { ...schedule, revision: 1, updatedAt: now } : null }; statements.push(c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now));
    try { await c.env.DB.batch(statements); return c.json(response, 201); } catch { const repeated = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first(); if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json))); return c.json({ success: false, error: 'Payroll was not recorded. You can safely try again.' }, 409); }
  });

  app.get('/v3/reports', async (c: any) => {
    const denied = requirePermission(c, 'reports.read');
    if (denied) return denied;
    const tab = String(c.req.query('tab') || 'monthly'); const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit;
    let listSql = ''; let countSql = ''; const bindings: any[] = [];
    if (tab === 'monthly') {
      listSql = "SELECT substr(json_extract(data,'$.date'),1,7) AS label,COUNT(*) AS count,COALESCE(SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)),0) AS total FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0 GROUP BY label ORDER BY label DESC LIMIT 12";
      countSql = "SELECT COUNT(DISTINCT substr(json_extract(data,'$.date'),1,7)) AS count,COALESCE(SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)),0) AS grand_total FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0";
    } else if (tab === 'open_pledges') {
      const base = `WITH pledge AS (SELECT json_extract(data,'$.donorId') donor_id,SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)) pledged FROM sync_records WHERE type='pledges' AND is_deleted=0 GROUP BY donor_id), paid AS (SELECT json_extract(data,'$.donorId') donor_id,SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)) paid FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0 GROUP BY donor_id), scheduled AS (SELECT json_extract(data,'$.donorId') donor_id,SUM(CASE WHEN COALESCE(json_extract(data,'$.active'),0)=1 THEN COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0) ELSE 0 END) scheduled FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 GROUP BY donor_id) `;
      listSql = `${base}SELECT d.id,json_extract(d.data,'$.name') AS name,json_extract(d.data,'$.phone') AS phone,MAX(0,COALESCE(p.pledged,0)-COALESCE(x.paid,0)-COALESCE(s.scheduled,0)) AS balance FROM sync_records d LEFT JOIN pledge p ON p.donor_id=d.id LEFT JOIN paid x ON x.donor_id=d.id LEFT JOIN scheduled s ON s.donor_id=d.id WHERE d.type='donors' AND d.is_deleted=0 AND COALESCE(p.pledged,0)-COALESCE(x.paid,0)-COALESCE(s.scheduled,0)>0 AND NOT EXISTS(SELECT 1 FROM sync_records t WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.donorId')=d.id AND json_extract(t.data,'$.type')='pending') ORDER BY balance DESC LIMIT ? OFFSET ?`; listSql = listSql.replace('MAX(0,','max(0,'); bindings.push(limit,offset);
      countSql = `${base}SELECT COUNT(*) AS count,COALESCE(SUM(max(0,COALESCE(p.pledged,0)-COALESCE(x.paid,0)-COALESCE(s.scheduled,0))),0) AS grand_total FROM sync_records d LEFT JOIN pledge p ON p.donor_id=d.id LEFT JOIN paid x ON x.donor_id=d.id LEFT JOIN scheduled s ON s.donor_id=d.id WHERE d.type='donors' AND d.is_deleted=0 AND COALESCE(p.pledged,0)-COALESCE(x.paid,0)-COALESCE(s.scheduled,0)>0 AND NOT EXISTS(SELECT 1 FROM sync_records t WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.donorId')=d.id AND json_extract(t.data,'$.type')='pending')`;
    } else if (tab === 'by_fundraiser') {
      listSql = "SELECT f.id,json_extract(f.data,'$.name') AS name,json_extract(f.data,'$.email') AS email,COALESCE(json_extract(f.data,'$.percentage'),0) AS percentage,COALESCE(SUM(CASE WHEN json_extract(t.data,'$.type')='approved' THEN COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0) ELSE 0 END),0) AS total,COALESCE(SUM(CASE WHEN json_extract(t.data,'$.type')='approved' THEN COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0) ELSE 0 END),0)*COALESCE(json_extract(f.data,'$.percentage'),0)/100 AS commission FROM sync_records f LEFT JOIN sync_records t ON t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.fundraiserId')=f.id WHERE f.type='fundraisers' AND f.is_deleted=0 GROUP BY f.id ORDER BY total DESC LIMIT ? OFFSET ?"; countSql = "SELECT COUNT(*) AS count FROM sync_records WHERE type='fundraisers' AND is_deleted=0"; bindings.push(limit,offset);
    } else if (tab === 'by_category') {
      listSql = "SELECT COALESCE(json_extract(a.data,'$.name'),json_extract(t.data,'$.category'),'Uncategorized') AS name,COUNT(*) AS count,COALESCE(SUM(COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0)),0) AS total FROM sync_records t LEFT JOIN sync_records a ON a.type='accounts' AND a.id=COALESCE(json_extract(t.data,'$.offsetAccountId'),json_extract(t.data,'$.category')) AND a.is_deleted=0 WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved' AND COALESCE(json_extract(t.data,'$.isBatch'),0)=0 GROUP BY name ORDER BY total DESC LIMIT ? OFFSET ?"; countSql = "SELECT COUNT(*) AS count,COALESCE(SUM(total),0) AS grand_total FROM (SELECT SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)) total FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0 GROUP BY COALESCE(json_extract(data,'$.offsetAccountId'),json_extract(data,'$.category'),'Uncategorized'))"; bindings.push(limit,offset);
    } else if (tab === 'by_donor') {
      listSql = "SELECT d.id,json_extract(d.data,'$.name') AS name,json_extract(d.data,'$.phone') AS phone,COUNT(t.id) AS count,COALESCE(SUM(COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0)),0) AS total,MIN(json_extract(t.data,'$.date')) AS first_date,MAX(json_extract(t.data,'$.date')) AS last_date FROM sync_records d JOIN sync_records t ON t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.donorId')=d.id AND json_extract(t.data,'$.type')='approved' AND COALESCE(json_extract(t.data,'$.isBatch'),0)=0 WHERE d.type='donors' AND d.is_deleted=0 GROUP BY d.id ORDER BY total DESC LIMIT ? OFFSET ?"; countSql = "SELECT COUNT(DISTINCT json_extract(data,'$.donorId')) AS count,COALESCE(SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)),0) AS grand_total FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.type')='approved' AND COALESCE(json_extract(data,'$.isBatch'),0)=0"; bindings.push(limit,offset);
    } else if (tab === 'by_project') {
      const projectTotals = "WITH project_totals AS (SELECT p.id,json_extract(p.data,'$.name') AS name,COALESCE((SELECT SUM(COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0)) FROM sync_records t WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved' AND json_extract(t.data,'$.projectId')=p.id),0) AS income,COALESCE((SELECT SUM(COALESCE(json_extract(b.data,'$.amount'),0)) FROM sync_records b WHERE b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.projectId')=p.id),0) AS cost FROM sync_records p WHERE p.type='projects' AND p.is_deleted=0) ";
      listSql = `${projectTotals}SELECT id,name,income,cost FROM project_totals WHERE income<>0 OR cost<>0 ORDER BY cost DESC LIMIT ? OFFSET ?`; countSql = `${projectTotals}SELECT COUNT(*) AS count FROM project_totals WHERE income<>0 OR cost<>0`; bindings.push(limit,offset);
    } else if (tab === 'tax_summary') {
      listSql = "SELECT substr(json_extract(data,'$.dueDate'),1,4) AS year,COUNT(*) AS count,COALESCE(SUM(json_extract(data,'$.amount')),0) AS total FROM sync_records WHERE type='bills' AND is_deleted=0 AND COALESCE(json_extract(data,'$.taxable'),0)=1 GROUP BY year ORDER BY year DESC LIMIT ? OFFSET ?"; countSql = "SELECT COUNT(DISTINCT substr(json_extract(data,'$.dueDate'),1,4)) AS count,COALESCE(SUM(json_extract(data,'$.amount')),0) AS grand_total FROM sync_records WHERE type='bills' AND is_deleted=0 AND COALESCE(json_extract(data,'$.taxable'),0)=1"; bindings.push(limit,offset);
    } else return c.json({ success: false, error: 'Unknown report.' }, 404);
    const [listResult,countResult]=await c.env.DB.batch([c.env.DB.prepare(listSql).bind(...bindings),c.env.DB.prepare(countSql)]); const summary:any=countResult.results[0]||{}; const total=Number(summary.count||0);
    return c.json({success:true,items:listResult.results,page,limit,total,totalPages:tab==='monthly'?1:Math.ceil(total/limit),grandTotal:Number(summary.grand_total||0)});
  });

  app.get('/v3/profit-loss', async (c: any) => {
    const denied = requirePermission(c, 'reports.read');
    if (denied) return denied;
    const year = new Date().getUTCFullYear();
    const startDate = String(c.req.query('startDate') || `${year}-01-01`);
    const endDate = String(c.req.query('endDate') || `${year}-12-31`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate > endDate) {
      return c.json({ success: false, error: 'Choose a valid report date range.' }, 400);
    }
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const base = `WITH entries AS (
      SELECT a.id AS account_id,json_extract(a.data,'$.name') AS account_name,'revenue' AS section,
        COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0) AS amount
      FROM sync_records t JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(t.data,'$.offsetAccountId') AND a.is_deleted=0
      WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved'
        AND COALESCE(json_extract(t.data,'$.isBatch'),0)=0 AND json_extract(a.data,'$.type')='revenue'
        AND json_extract(t.data,'$.date') BETWEEN ? AND ?
      UNION ALL
      SELECT a.id AS account_id,json_extract(a.data,'$.name') AS account_name,'expense' AS section,
        COALESCE(json_extract(b.data,'$.amount'),0) * CASE WHEN json_extract(b.data,'$.currency')='USD' THEN COALESCE(json_extract(b.data,'$.exchangeRate'),1.35) ELSE 1 END AS amount
      FROM sync_records b JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(b.data,'$.category') AND a.is_deleted=0
      WHERE b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.status')='paid'
        AND json_extract(a.data,'$.type')='expense'
        AND COALESCE(json_extract(b.data,'$.paidDate'),json_extract(b.data,'$.dueDate')) BETWEEN ? AND ?
      UNION ALL
      SELECT a.id AS account_id,json_extract(a.data,'$.name') AS account_name,'expense' AS section,
        COALESCE(json_extract(t.data,'$.amountCAD'),json_extract(t.data,'$.amount'),0) AS amount
      FROM sync_records t JOIN sync_records a ON a.type='accounts' AND a.id=json_extract(t.data,'$.offsetAccountId') AND a.is_deleted=0
      WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.type')='approved'
        AND COALESCE(json_extract(t.data,'$.isBatch'),0)=0 AND json_extract(a.data,'$.type')='expense'
        AND json_extract(t.data,'$.date') BETWEEN ? AND ?
    ), totals AS (
      SELECT section,account_id,account_name,SUM(amount) AS amount FROM entries GROUP BY section,account_id,account_name
    ) `;
    const dateBindings = [startDate,endDate,startDate,endDate,startDate,endDate];
    const [rows,countResult,summaryResult] = await c.env.DB.batch([
      c.env.DB.prepare(`${base}SELECT section,account_id AS id,account_name AS name,amount FROM totals ORDER BY CASE section WHEN 'revenue' THEN 0 ELSE 1 END,amount DESC,lower(account_name) LIMIT ? OFFSET ?`).bind(...dateBindings,limit,offset),
      c.env.DB.prepare(`${base}SELECT COUNT(*) AS count FROM totals`).bind(...dateBindings),
      c.env.DB.prepare(`${base}SELECT COALESCE(SUM(CASE WHEN section='revenue' THEN amount ELSE 0 END),0) AS revenue,COALESCE(SUM(CASE WHEN section='expense' THEN amount ELSE 0 END),0) AS expenses FROM totals`).bind(...dateBindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    const summary: any = summaryResult.results[0] || {};
    const revenue = Number(summary.revenue || 0);
    const expenses = Number(summary.expenses || 0);
    return c.json({ success: true, items: rows.results.map((row: any) => ({ ...row, amount: Number(row.amount || 0) })), startDate, endDate, basis: 'cash', page, limit, total, totalPages: Math.ceil(total / limit), summary: { revenue, expenses, netIncome: revenue - expenses } });
  });

  const settingDefaults: Record<string, any> = { isRtl: false, currency: 'CAD', exchangeRate: 1.35, donorSortBy: 'lastName', googleSheetSyncUrl: '' };
  const parseSetting = (raw: unknown, fallback: any) => { try { return JSON.parse(String(raw)); } catch { return fallback; } };
  const getSolaKey = async (c: any) => {
    if (c.env.SOLA_API_KEY) return String(c.env.SOLA_API_KEY).trim();
    try {
      const secret: any = await c.env.DB.prepare("SELECT value FROM server_secrets WHERE key='SOLA_API_KEY' LIMIT 1").first();
      if (secret?.value) return String(secret.value).trim();
    } catch { /* The server-only secrets table is created on first secure save. */ }
    const row: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='solaApiKey' AND is_deleted=0 ORDER BY updated_at DESC LIMIT 1").first();
    const value = row ? parseSetting(row.data,'') : '';
    return typeof value === 'string' ? value.trim() : String(value?.apiKey || value?.key || '').trim();
  };
  const getDonorSheetCsv = async (c: any) => {
    const row: any = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='googleSheetSyncUrl' AND is_deleted=0 ORDER BY updated_at DESC LIMIT 1").first();
    const configured = row ? String(parseSetting(row.data, '') || '').trim() : '';
    if (!configured) throw new Error('Add the published Google Sheet CSV link in Settings first.');
    let url: URL;
    try { url = new URL(configured); } catch { throw new Error('The saved Google Sheet link is not valid.'); }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || !['docs.google.com', 'docs.googleusercontent.com'].includes(hostname)) {
      throw new Error('For safety, the donor sync accepts only a published Google Sheets CSV link.');
    }
    const response = await fetch(url.toString(), { headers: { Accept: 'text/csv,text/plain;q=0.9,*/*;q=0.1' } });
    if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}. Make sure the sheet is published as CSV.`);
    const csv = await response.text();
    if (!csv.trim()) throw new Error('Google Sheets returned an empty file.');
    if (csv.length > 8_000_000) throw new Error('The Google Sheet CSV is too large to import safely.');
    if (/^\s*<!doctype html/i.test(csv) || /^\s*<html/i.test(csv)) throw new Error('Google returned a web page instead of CSV. Publish the donor tab as CSV and save that link.');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(csv));
    const sheetHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    return { csv, sheetHash };
  };

  app.get('/v3/settings', async (c: any) => {
    const denied = requirePermission(c, 'system.manage');
    if (denied) return denied;
    const result = await c.env.DB.prepare("SELECT type,id,data,revision,updated_at FROM sync_records WHERE type IN ('isRtl','currency','exchangeRate','donorSortBy','googleSheetSyncUrl') AND is_deleted=0 ORDER BY updated_at DESC").all();
    const settings = { ...settingDefaults }; const revisions: Record<string, number> = {};
    for (const row of result.results as any[]) if (revisions[row.type] === undefined) { settings[row.type] = parseSetting(row.data, settingDefaults[row.type]); revisions[row.type] = Number(row.revision); }
    return c.json({ success: true, settings, revisions, solaConfigured: Boolean(await getSolaKey(c)), balances: 'calculated-live' });
  });

  app.put('/v3/settings/:key', async (c: any) => {
    const denied = requirePermission(c, 'system.manage');
    if (denied) return denied;
    const key = String(c.req.param('key') || '');
    if (!(key in settingDefaults)) return c.json({ success: false, error: 'Unknown setting.' }, 404);
    const body = await c.req.json(); const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    let value = body.value;
    if (key === 'isRtl' && typeof value !== 'boolean') return c.json({ success: false, error: 'Choose a valid layout.' }, 400);
    if (key === 'currency' && !['CAD','USD'].includes(value)) return c.json({ success: false, error: 'Choose CAD or USD.' }, 400);
    if (key === 'exchangeRate' && (!Number.isFinite(Number(value)) || Number(value) <= 0 || Number(value) > 100)) return c.json({ success: false, error: 'Enter a valid exchange rate.' }, 400);
    if (key === 'exchangeRate') value = Number(value);
    if (key === 'donorSortBy' && !['lastName','firstName','hebLastName','hebFirstName'].includes(value)) return c.json({ success: false, error: 'Choose a valid donor sort order.' }, 400);
    if (key === 'googleSheetSyncUrl') { value = String(value || '').trim(); if (value.length > 2048 || (value && !/^https:\/\//i.test(value))) return c.json({ success: false, error: 'Enter a valid secure Google Sheets URL.' }, 400); }
    const mutationId = `v3-setting-${key}-${requestId}`; const prior: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const current: any = await c.env.DB.prepare('SELECT id,data,revision FROM sync_records WHERE type=? AND is_deleted=0 ORDER BY updated_at DESC LIMIT 1').bind(key).first();
    const expectedRevision = body.revision == null ? Number(current?.revision || 0) : Number(body.revision);
    if (current && expectedRevision !== Number(current.revision)) return c.json({ success: false, error: 'This setting changed on another computer. The latest value has been reloaded.', conflict: true }, 409);
    const id = String(current?.id || key); const revision = Number(current?.revision || 0) + 1; const data = JSON.stringify(value); const now = Date.now(); const operationId = `${mutationId}-save`; const response = { success: true, key, value, revision };
    const userId = String(c.get('userId') || 'unknown'); const userEmail = String(c.get('userEmail') || 'unknown');
    const statements: any[] = current ? [
      c.env.DB.prepare('UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type=? AND id=? AND revision=? AND is_deleted=0').bind(data,revision,now,operationId,key,id,current.revision),
      c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,?,?,'update',?,?,?,?)").bind(id,key,revision,data,now,mutationId,operationId),
      c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,?,'update',?,?,?,?,?,?,?,?,?,?)").bind(id,key,current.revision,revision,current.data,data,userId,userEmail,now,mutationId,operationId,'Updated online system setting')
    ] : [
      c.env.DB.prepare('INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,?,?,?,1,0,?)').bind(id,key,data,now,operationId),
      c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,?,1,'insert',?,?,?,?)").bind(id,key,data,now,mutationId,operationId),
      c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,?,'insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(id,key,data,userId,userEmail,now,mutationId,operationId,'Created online system setting')
    ];
    statements.push(c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId,JSON.stringify(response),now));
    try { await c.env.DB.batch(statements); return c.json(response); } catch { const repeated: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first(); if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json))); return c.json({ success: false, error: 'This setting changed on another computer. Reload the latest value.', conflict: true }, 409); }
  });

  app.get('/v3/backup', async (c: any) => {
    const denied = requirePermission(c, 'system.manage');
    if (denied) return denied;
    const page = boundedPage(c.req.query('page')); const limit = Math.min(500,Math.max(1,Number.parseInt(c.req.query('limit') || '500',10) || 500)); const offset = (page - 1) * limit;
    const [rows,countResult] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT type,id,data,revision,updated_at FROM sync_records WHERE is_deleted=0 AND type<>'solaApiKey' ORDER BY type,id LIMIT ? OFFSET ?").bind(limit,offset),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE is_deleted=0 AND type<>'solaApiKey'")
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: rows.results.map((row: any) => ({ type: row.type,id: row.id,data: parseSetting(row.data,null),revision: Number(row.revision),updatedAt: Number(row.updated_at) })), page, limit, total, totalPages: Math.ceil(total/limit) });
  });

  app.get('/v3/sola/status', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const key = await getSolaKey(c); const metadata: any = await c.env.DB.prepare("SELECT value FROM sync_metadata WHERE key='sola_sync_status'").first();
    return c.json({ success: true, configured: Boolean(key), sync: metadata ? parseSetting(metadata.value,null) : null });
  });

  app.put('/v3/sola/configuration', async (c: any) => {
    const denied = requirePermission(c, 'system.manage'); if (denied) return denied;
    const body = await c.req.json(); const apiKey = String(body.apiKey || '').trim();
    if (!/^[A-Za-z0-9]{8,250}$/.test(apiKey)) return c.json({ success: false, error: 'Enter a valid Sola production API key.' }, 400);
    const requestId = String(c.req.header('Idempotency-Key') || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-sola-configuration-${requestId}`;
    const prior: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const now = Date.now(); const response = { success: true, configured: true };
    const userId = String(c.get('userId') || 'unknown'); const userEmail = String(c.get('userEmail') || 'unknown');
    try {
      await c.env.DB.prepare('CREATE TABLE IF NOT EXISTS server_secrets (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)').run();
      await c.env.DB.batch([
        c.env.DB.prepare("INSERT INTO server_secrets(key,value,updated_at) VALUES('SOLA_API_KEY',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(apiKey, now),
        c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES('SOLA_API_KEY','serverSecret','update',NULL,NULL,NULL,?,?,?,?,?,?,?)").bind(JSON.stringify({ configured: true, secret: '[REDACTED]' }), userId, userEmail, now, mutationId, `${mutationId}-save`, 'Sola API key configured through secure online settings'),
        c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(response), now)
      ]);
      return c.json(response);
    } catch (reason: any) { return c.json({ success: false, error: `Unable to save the Sola key securely: ${reason.message || 'database error'}` }, 500); }
  });

  app.post('/v3/sola/sync', async (c: any) => {
    const denied = requirePermission(c, 'transactions.approve'); if (denied) return denied;
    const body = await c.req.json(); const startDate = String(body.startDate || ''); const endDate = String(body.endDate || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate) || startDate>endDate) return c.json({ success:false,error:'Choose a valid Sola date range.' },400);
    const key = await getSolaKey(c); if (!key) return c.json({ success:false,error:'Sola is not configured on the server.' },409);
    try {
      const response = await fetch('https://x1.cardknox.com/reportjson',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({xKey:key,xVersion:'4.5.9',xSoftwareName:'CharityApp',xSoftwareVersion:'1.0',xCommand:'report:all',xBeginDate:`${startDate} 00:00:00`,xEndDate:`${endDate} 23:59:59`})});
      if(!response.ok)return c.json({success:false,error:`Sola report request failed (${response.status}).`},502);
      const payload:any=await response.json(); if(payload.xResult==='E')return c.json({success:false,error:String(payload.xError||'Sola returned an error.')},502);
      const raw=Array.isArray(payload.ReportData)?payload.ReportData:Array.isArray(payload.xReportData)?payload.xReportData:[]; const now=Date.now();
      const records=raw.map((item:any)=>({ref:String(item.RefNum||item.xRefNum||'').trim(),name:String(item.Name||item.xName||'Unknown').slice(0,300),date:String(item.Date||item.xEnteredDate||'').slice(0,30),amount:Number(item.Amount||item.xAmount||0),status:String(item.Status||item.xResponseResult||'Unknown').slice(0,50),last4:String(item.Last4||(item.xMaskedCardNumber||'').slice(-4)||'****').slice(-4),cardType:String(item.CardType||'Credit').slice(0,50),batch:String(item.Batch||item.xBatch||'').slice(0,100)})).filter((item:any)=>item.ref&&Number.isFinite(item.amount));
      for(let index=0;index<records.length;index+=50){const statements=records.slice(index,index+50).map((record:any)=>c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'solaTransactions',?,?,1,0,?) ON CONFLICT(type,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,revision=sync_records.revision+1,is_deleted=0,last_operation_id=excluded.last_operation_id").bind(record.ref,JSON.stringify(record),now,`sola-sync-${now}-${record.ref}`));await c.env.DB.batch(statements);}
      const sync={lastSyncAt:now,startDate,endDate,count:records.length};await c.env.DB.prepare("INSERT INTO sync_metadata(key,value,updated_at) VALUES('sola_sync_status',?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at").bind(JSON.stringify(sync),now).run();
      return c.json({success:true,sync});
    } catch(reason:any){return c.json({success:false,error:`Unable to communicate with Sola: ${reason.message||'network error'}`},502);}
  });

  app.post('/v3/sola/schedules/preview', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const key = await getSolaKey(c); if (!key) return c.json({ success: false, error: 'Sola is not configured on the server.' }, 409);
    try {
      const raw: any[] = [];
      let nextToken = '';
      let pages = 0;
      do {
        const response = await fetch('https://api.cardknox.com/v2/ListSchedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: key, 'X-Recurring-Api-Version': '2.1' },
          body: JSON.stringify({ SoftwareName: 'CharityPro', SoftwareVersion: '1.0', PageSize: 100, SortOrder: 'Descending', Filters: { IsDeleted: false }, ...(nextToken ? { NextToken: nextToken } : {}) })
        });
        const text = await response.text(); let payload: any;
        try { payload = JSON.parse(text); } catch { return c.json({ success: false, error: `Sola recurring schedules returned an unreadable response (${response.status}).` }, 502); }
        if (!response.ok || String(payload?.Result || '').toUpperCase() === 'E') return c.json({ success: false, error: String(payload?.Error || payload?.error || payload?.Message || `Sola recurring schedules request failed (${response.status}).`) }, 502);
        const pageItems = Array.isArray(payload) ? payload : Array.isArray(payload?.Schedules) ? payload.Schedules : Array.isArray(payload?.Data) ? payload.Data : Array.isArray(payload?.Results) ? payload.Results : [];
        raw.push(...pageItems);
        nextToken = String(payload?.NextToken || '').trim();
        pages++;
      } while (nextToken && pages < 100);
      const items = raw.map((value: any) => {
        const activeValue = value.IsActive ?? value.Active ?? value.isActive ?? value.active ?? value.Status ?? value.status;
        const normalizedActive = typeof activeValue === 'string' ? activeValue.trim().toLowerCase() : activeValue;
        const active = normalizedActive === true || normalizedActive === 1 || normalizedActive === 'true' || normalizedActive === '1' || normalizedActive === 'active' || normalizedActive === 'enabled';
        return {
        scheduleId: String(value.ScheduleId || value.Id || value.scheduleId || '').trim(),
        customerId: String(value.CustomerId || value.customerId || '').trim(),
        name: String(value.BillName || value.Name || value.CustomerName || [value.BillFirstName || value.FirstName, value.BillLastName || value.LastName].filter(Boolean).join(' ') || 'Unknown').trim(),
        amount: Number(value.Amount || value.amount || 0),
        active,
        frequency: String(value.IntervalType || value.Frequency || value.frequency || ''),
        startDate: String(value.StartDate || value.InitialRunTime || value.startDate || '').slice(0, 10),
        endDate: String(value.EndDate || value.endDate || '').slice(0, 10),
        nextDate: String(value.NextScheduledRunTime || value.NextRunTime || '').slice(0, 10),
        paymentsRemaining: Number(value.PaymentsRemaining ?? value.RemainingPayments ?? 0)
        };
      }).filter((value: any) => value.scheduleId);
      return c.json({ success: true, items, count: items.length, pages, readOnly: true, message: 'Preview only. No CharityPro or Sola records were changed.' });
    } catch (reason: any) { return c.json({ success: false, error: `Unable to read Sola recurring schedules: ${reason.message || 'network error'}` }, 502); }
  });

  app.post('/v3/sola/schedules/import', async (c: any) => {
    const denied = requirePermission(c, 'transactions.create'); if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const mutationId = `v3-sola-schedule-import-${requestId}`;
    const prior: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const schedules = Array.isArray(body.schedules) ? body.schedules.slice(0, 500) : [];
    if (!schedules.length) return c.json({ success: false, error: 'No Sola schedules were supplied.' }, 400);

    const normalizeName = (value: unknown) => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const donorRows = await c.env.DB.prepare("SELECT id,data FROM sync_records WHERE type='donors' AND is_deleted=0").all();
    const donorsByName = new Map<string, any[]>();
    const donorsById = new Map<string, any>();
    for (const row of donorRows.results as any[]) {
      const donor = parseSetting(row.data, {});
      donorsById.set(String(row.id), { id: String(row.id), name: donor.name || `${donor.firstName || ''} ${donor.lastName || ''}`.trim() });
      const names = new Set([donor.name, [donor.firstName, donor.lastName].filter(Boolean).join(' '), [donor.lastName, donor.firstName].filter(Boolean).join(' ')] .map(normalizeName).filter(Boolean));
      for (const name of names) donorsByName.set(name, [...(donorsByName.get(name) || []), { id: row.id, name: donor.name || `${donor.firstName || ''} ${donor.lastName || ''}`.trim() }]);
    }
    const savedMappingRows = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='solaDonorMappings' AND is_deleted=0").all();
    const savedMappings = new Map<string, string>();
    for (const row of savedMappingRows.results as any[]) { const value = parseSetting(row.data, {}); if (value.solaName && value.donorId) savedMappings.set(normalizeName(value.solaName), String(value.donorId)); }

    const imported: any[] = []; const unmatched: any[] = []; const ambiguous: any[] = []; const inactive: any[] = []; const existing: any[] = [];
    const now = Date.now(); const userId = String(c.get('userId') || 'unknown'); const userEmail = String(c.get('userEmail') || 'unknown');
    const frequencyMap: Record<string, string> = { daily: 'daily', weekly: 'weekly', biweekly: 'biweekly', 'bi-weekly': 'biweekly', monthly: 'monthly', quarterly: 'quarterly', yearly: 'yearly', annually: 'yearly', annual: 'yearly' };
    const statements: any[] = []; const mappedNames = new Set<string>(); const seenScheduleIds = new Set<string>();
    for (const source of schedules) {
      const scheduleId = String(source?.scheduleId || '').trim().slice(0, 200);
      const name = String(source?.name || '').trim().slice(0, 300);
      const active = source?.active === true;
      if (!scheduleId || !name) continue;
      if (!active) { inactive.push({ scheduleId, name }); continue; }
      const nameKey = normalizeName(name);
      const matches = donorsByName.get(nameKey) || [];
      const requestedDonorId = String(source?.donorId || '').trim();
      const rememberedDonorId = savedMappings.get(nameKey) || '';
      const selectedDonor = donorsById.get(requestedDonorId) || donorsById.get(rememberedDonorId) || (matches.length === 1 ? matches[0] : null);
      if (!selectedDonor) {
        if (matches.length > 1) ambiguous.push({ scheduleId, name, donorCount: matches.length });
        else unmatched.push({ scheduleId, name, ...(requestedDonorId ? { reason: 'The selected donor no longer exists.' } : {}) });
        continue;
      }
      if (seenScheduleIds.has(scheduleId)) { existing.push({ scheduleId, name, donorId: selectedDonor.id }); continue; }
      seenScheduleIds.add(scheduleId);
      const mappingKey = name.toLowerCase();
      if (!mappedNames.has(mappingKey)) {
        mappedNames.add(mappingKey);
        const mappingId = `sola-map-${encodeURIComponent(mappingKey).slice(0, 170)}`;
        const mapping: any = await c.env.DB.prepare("SELECT revision FROM sync_records WHERE type='solaDonorMappings' AND id=?").bind(mappingId).first();
        const mappingData = JSON.stringify({ id: mappingId, solaName: name, donorId: selectedDonor.id, updatedAt: now });
        const mappingRevision = Number(mapping?.revision || 0) + 1; const mappingOperation = `${mutationId}-mapping-${scheduleId}`;
        if (mapping) statements.push(
          c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,is_deleted=0,last_operation_id=? WHERE type='solaDonorMappings' AND id=? AND revision=?").bind(mappingData, mappingRevision, now, mappingOperation, mappingId, mapping.revision),
          c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'solaDonorMappings',?,'update',?,?,?,?)").bind(mappingId, mappingRevision, mappingData, now, mutationId, mappingOperation)
        ); else statements.push(
          c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'solaDonorMappings',?,?,1,0,?)").bind(mappingId, mappingData, now, mappingOperation),
          c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'solaDonorMappings',1,'insert',?,?,?,?)").bind(mappingId, mappingData, now, mutationId, mappingOperation)
        );
      }
      const id = `sola-schedule-${scheduleId}`;
      const found: any = await c.env.DB.prepare("SELECT id,data,revision,is_deleted FROM sync_records WHERE type='recurringPayments' AND (id=? OR (json_extract(data,'$.solaScheduleId')=? AND is_deleted=0)) ORDER BY CASE WHEN id=? THEN 0 ELSE 1 END LIMIT 1").bind(id, scheduleId, id).first();
      if (found && !Number(found.is_deleted)) { existing.push({ scheduleId, name, donorId: selectedDonor.id }); continue; }
      const amount = Number(source?.amount);
      const nextDate = String(source?.nextDate || source?.startDate || '').slice(0, 10);
      if (!Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(nextDate)) { unmatched.push({ scheduleId, name, reason: 'Missing a valid amount or next payment date.' }); continue; }
      const frequency = frequencyMap[String(source?.frequency || '').trim().toLowerCase()] || 'monthly';
      const record = { id, donorId: selectedDonor.id, amount, currency: 'CAD', frequency, nextDate, ...(String(source?.endDate || '').slice(0, 10) ? { endDate: String(source.endDate).slice(0, 10) } : {}), method: 'credit_card', active: true, solaScheduleId: scheduleId, solaCustomerId: String(source?.customerId || '').slice(0, 200), importedFromSola: true };
      const data = JSON.stringify(record); const operationId = `${mutationId}-${scheduleId}`;
      if (found) {
        const nextRevision = Number(found.revision) + 1;
        statements.push(
          c.env.DB.prepare("UPDATE sync_records SET data=?,updated_at=?,revision=?,is_deleted=0,last_operation_id=? WHERE type='recurringPayments' AND id=? AND revision=?").bind(data, now, nextRevision, operationId, id, found.revision),
          c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'recurringPayments',?,'update',?,?,?,?)").bind(id, nextRevision, data, now, mutationId, operationId),
          c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'recurringPayments','update',?,?,?,?,?,?,?,?,?,?)").bind(id, found.revision, nextRevision, found.data, data, userId, userEmail, now, mutationId, operationId, 'Restored recurring schedule from Sola')
        );
      } else statements.push(
          c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'recurringPayments',?,?,1,0,?)").bind(id, data, now, operationId),
          c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'recurringPayments',1,'insert',?,?,?,?)").bind(id, data, now, mutationId, operationId),
          c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'recurringPayments','insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(id, data, userId, userEmail, now, mutationId, operationId, 'Imported active recurring schedule from Sola')
        );
      imported.push({ scheduleId, name, donorId: selectedDonor.id, donorName: selectedDonor.name, id });
    }
    const result = { success: true, imported, unmatched, ambiguous, inactive, existing, counts: { imported: imported.length, unmatched: unmatched.length, ambiguous: ambiguous.length, inactive: inactive.length, existing: existing.length } };
    statements.push(c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(result), now));
    try { await c.env.DB.batch(statements); return c.json(result); }
    catch (reason: any) { return c.json({ success: false, error: `Unable to import Sola schedules: ${reason.message || 'database error'}` }, 409); }
  });

  app.get('/v3/sola/view', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read'); if (denied) return denied;
    const startDate=String(c.req.query('startDate')||'0000-01-01');const endDate=String(c.req.query('endDate')||'9999-12-31');const page=boundedPage(c.req.query('page'));const limit=boundedLimit(c.req.query('limit'));const offset=(page-1)*limit;
    const dismissedRow:any=await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='dismissedSolaRefs' AND is_deleted=0 ORDER BY updated_at DESC LIMIT 1").first();const dismissed=new Set<string>(Array.isArray(parseSetting(dismissedRow?.data,'') )?parseSetting(dismissedRow.data,[]):[]);
    const [solaRows,appRows,solaCount,appCount,mappingRows]=await c.env.DB.batch([
      c.env.DB.prepare("SELECT data FROM sync_records WHERE type='solaTransactions' AND is_deleted=0 AND lower(json_extract(data,'$.status'))='approved' AND substr(json_extract(data,'$.date'),1,10) BETWEEN ? AND ? ORDER BY json_extract(data,'$.date') DESC,id DESC LIMIT ? OFFSET ?").bind(startDate,endDate,limit*2,offset),
      c.env.DB.prepare("SELECT t.id,t.data,t.revision,t.updated_at,json_extract(d.data,'$.name') AS donor_name,json_extract(d.data,'$.aliases') AS aliases FROM sync_records t LEFT JOIN sync_records d ON d.type='donors' AND d.id=json_extract(t.data,'$.donorId') AND d.is_deleted=0 WHERE t.type='transactions' AND t.is_deleted=0 AND json_extract(t.data,'$.method')='credit_card' AND json_extract(t.data,'$.date') BETWEEN ? AND ? AND (json_extract(t.data,'$.type')='pending' OR (json_extract(t.data,'$.type')='approved' AND instr(COALESCE(json_extract(t.data,'$.notes'),''),'Ref:')=0)) ORDER BY json_extract(t.data,'$.date') DESC,t.id DESC LIMIT ? OFFSET ?").bind(startDate,endDate,limit,offset),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='solaTransactions' AND is_deleted=0 AND lower(json_extract(data,'$.status'))='approved' AND substr(json_extract(data,'$.date'),1,10) BETWEEN ? AND ?").bind(startDate,endDate),
      c.env.DB.prepare("SELECT COUNT(*) AS count FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.method')='credit_card' AND json_extract(data,'$.date') BETWEEN ? AND ? AND (json_extract(data,'$.type')='pending' OR (json_extract(data,'$.type')='approved' AND instr(COALESCE(json_extract(data,'$.notes'),''),'Ref:')=0))").bind(startDate,endDate),
      c.env.DB.prepare("SELECT data FROM sync_records WHERE type='solaDonorMappings' AND is_deleted=0")
    ]);
    const sola=solaRows.results.map((row:any)=>parseSetting(row.data,null)).filter((item:any)=>item&&!dismissed.has(item.ref)).slice(0,limit);const appItems=appRows.results.map((row:any)=>({...parseRecord(row),donorName:row.donor_name||'Unknown',aliases:parseSetting(row.aliases,[])}));
    const mappings=new Map(mappingRows.results.map((row:any)=>{const value=parseSetting(row.data,null);return [String(value?.solaName||'').trim().toLowerCase(),String(value?.donorId||'')];}));
    const autoMatches:any[]=[];const used=new Set<string>();for(const tx of appItems){const amount=Number(tx.amount||0);const names=[tx.donorName,...(Array.isArray(tx.aliases)?tx.aliases:[])].map((name:any)=>String(name).toLowerCase());const match=sola.find((item:any)=>!used.has(item.ref)&&Math.abs(Number(item.amount)-amount)<0.005&&((mappings.get(String(item.name||'').trim().toLowerCase())||'')===String(tx.donorId||'')||names.some(name=>{const first=name.split(' ')[0];const solaFirst=String(item.name).toLowerCase().split(' ')[0];return name===String(item.name).toLowerCase()||(first&&solaFirst&&(first.includes(solaFirst)||solaFirst.includes(first)));})));if(match){used.add(match.ref);const remembered=Boolean(mappings.get(String(match.name||'').trim().toLowerCase()));autoMatches.push({transactionId:tx.id,solaRef:match.ref,...(remembered?{remembered:true}:{})});}}
    return c.json({success:true,sola,appItems,autoMatches,page,limit,totalPages:Math.max(1,Math.ceil(Math.max(Number(solaCount.results[0]?.count||0),Number(appCount.results[0]?.count||0))/limit))});
  });

  app.post('/v3/sola/resolve', async (c:any) => {
    const denied=requirePermission(c,'transactions.approve');if(denied)return denied;const body=await c.req.json();const requestId=String(c.req.header('Idempotency-Key')||'').trim();if(!requestId)return c.json({success:false,error:'Idempotency-Key is required.'},400);const action=String(body.action||'');if(!['match','import','dismiss'].includes(action))return c.json({success:false,error:'Choose a valid Sola action.'},400);
    const mutationId=`v3-sola-${requestId}`;const prior:any=await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();if(prior?.result_json)return c.json(JSON.parse(String(prior.result_json)));const ref=String(body.ref||'');const solaRow:any=await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='solaTransactions' AND id=? AND is_deleted=0").bind(ref).first();if(!solaRow)return c.json({success:false,error:'Sola transaction not found in the saved online report.'},404);const sola=parseSetting(solaRow.data,null);const now=Date.now();const userId=String(c.get('userId')||'unknown');const userEmail=String(c.get('userEmail')||'unknown');const statements:any[]=[];let item:any=null;
    if(action==='match'){const id=String(body.transactionId||'');const current:any=await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='transactions' AND id=? AND is_deleted=0").bind(id).first();if(!current)return c.json({success:false,error:'App transaction not found.'},404);if(Number(body.revision)!==Number(current.revision))return c.json({success:false,error:'This transaction changed on another computer. Reload the latest version.',conflict:true},409);const old=JSON.parse(String(current.data));const donorId=String(body.donorId||old.donorId||'').trim();const donor:any=await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(donorId).first();if(!donor)return c.json({success:false,error:'Choose a valid donor for this match.'},409);const pledgeId=String(body.pledgeId||(donorId===String(old.donorId||'')?old.pledgeId:'')||'').trim();if(pledgeId){const pledge:any=await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='pledges' AND id=? AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(pledgeId,donorId).first();if(!pledge)return c.json({success:false,error:'That pledge does not belong to this transaction donor.'},409);}const next={...old,donorId,type:'approved',depositStatus:'undeposited',sourceAccountId:'sys-undeposited-funds',solaBatchId:sola.batch||'',notes:`Matched via Sola Sync. Ref: ${ref}`,...(pledgeId?{pledgeId}:{pledgeId:null})};const revision=Number(current.revision)+1;const data=JSON.stringify(next);const operationId=`${mutationId}-transaction`;statements.push(c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='transactions' AND id=? AND revision=? AND is_deleted=0").bind(data,revision,now,operationId,id,current.revision),c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'transactions',?,'update',?,?,?,?)").bind(id,revision,data,now,mutationId,operationId),c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'transactions','update',?,?,?,?,?,?,?,?,?,?)").bind(id,current.revision,revision,current.data,data,userId,userEmail,now,mutationId,operationId,'Matched to saved Sola transaction'));item={...next,id,revision,updatedAt:now};}
    if(action==='import'){const donorId=String(body.donorId||'');const donor:any=await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(donorId).first();if(!donor)return c.json({success:false,error:'Choose a valid donor.'},409);const pledgeId=String(body.pledgeId||'').trim();if(pledgeId){const pledge:any=await c.env.DB.prepare("SELECT id FROM sync_records WHERE type='pledges' AND id=? AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(pledgeId,donorId).first();if(!pledge)return c.json({success:false,error:'That pledge does not belong to the selected donor.'},409);}const id=crypto.randomUUID();const date=String(sola.date||'').slice(0,10);const transaction={id,donorId,amount:Number(sola.amount),amountCAD:Number(sola.amount),date,type:'approved',method:'credit_card',currency:'CAD',depositStatus:'undeposited',sourceAccountId:'sys-undeposited-funds',solaBatchId:sola.batch||'',notes:`Imported as new via Sola Sync. Ref: ${ref}`,...(pledgeId?{pledgeId}:{})};const data=JSON.stringify(transaction);const operationId=`${mutationId}-transaction`;statements.push(c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'transactions',?,?,1,0,?)").bind(id,data,now,operationId),c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'transactions',1,'insert',?,?,?,?)").bind(id,data,now,mutationId,operationId),c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'transactions','insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(id,data,userId,userEmail,now,mutationId,operationId,'Imported from saved Sola transaction'));item={...transaction,revision:1,updatedAt:now};}
    if((action==='match'||action==='import')&&item?.donorId){const solaName=String(sola.name||'').trim();if(solaName){const mappingId=`sola-map-${encodeURIComponent(solaName.toLowerCase()).slice(0,170)}`;const mapping:any=await c.env.DB.prepare("SELECT revision FROM sync_records WHERE type='solaDonorMappings' AND id=? AND is_deleted=0").bind(mappingId).first();const mappingData=JSON.stringify({id:mappingId,solaName,donorId:String(item.donorId),updatedAt:now});const mappingRevision=Number(mapping?.revision||0)+1;const mappingOperation=`${mutationId}-mapping`;if(mapping)statements.push(c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='solaDonorMappings' AND id=? AND revision=? AND is_deleted=0").bind(mappingData,mappingRevision,now,mappingOperation,mappingId,mapping.revision),c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'solaDonorMappings',?,'update',?,?,?,?)").bind(mappingId,mappingRevision,mappingData,now,mutationId,mappingOperation));else statements.push(c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'solaDonorMappings',?,?,1,0,?)").bind(mappingId,mappingData,now,mappingOperation),c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'solaDonorMappings',1,'insert',?,?,?,?)").bind(mappingId,mappingData,now,mutationId,mappingOperation));}}
    const dismissedRow:any=await c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='dismissedSolaRefs' AND is_deleted=0 ORDER BY updated_at DESC LIMIT 1").first();const oldDismissed=Array.isArray(parseSetting(dismissedRow?.data,[]))?parseSetting(dismissedRow.data,[]):[];const nextDismissed=oldDismissed.includes(ref)?oldDismissed:[...oldDismissed,ref];const dismissedId=String(dismissedRow?.id||'dismissedSolaRefs');const dismissedData=JSON.stringify(nextDismissed);const dismissedRevision=Number(dismissedRow?.revision||0)+1;const dismissedOperation=`${mutationId}-dismiss`;if(dismissedRow)statements.push(c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='dismissedSolaRefs' AND id=? AND revision=? AND is_deleted=0").bind(dismissedData,dismissedRevision,now,dismissedOperation,dismissedId,dismissedRow.revision),c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'dismissedSolaRefs',?,'update',?,?,?,?)").bind(dismissedId,dismissedRevision,dismissedData,now,mutationId,dismissedOperation));else statements.push(c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'dismissedSolaRefs',?,?,1,0,?)").bind(dismissedId,dismissedData,now,dismissedOperation),c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'dismissedSolaRefs',1,'insert',?,?,?,?)").bind(dismissedId,dismissedData,now,mutationId,dismissedOperation));
    const result={success:true,action,item,ref};statements.push(c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId,JSON.stringify(result),now));try{await c.env.DB.batch(statements);return c.json(result);}catch{return c.json({success:false,error:'A related online record changed. Reload Sola Sync and try again.',conflict:true},409);}
  });

  app.get('/v3/sola/unassigned', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const page = boundedPage(c.req.query('page'));
    const limit = boundedLimit(c.req.query('limit'));
    const offset = (page - 1) * limit;
    const condition = `t.type='transactions' AND t.is_deleted=0
      AND json_extract(t.data,'$.type')='approved'
      AND json_extract(t.data,'$.method')='credit_card'
      AND COALESCE(json_extract(t.data,'$.donorId'),'')<>''
      AND COALESCE(json_extract(t.data,'$.pledgeId'),'')=''
      AND (COALESCE(json_extract(t.data,'$.solaBatchId'),'')<>''
        OR lower(COALESCE(json_extract(t.data,'$.notes'),'')) LIKE '%sola%')`;
    const [rows, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT t.id,t.data,t.revision,t.updated_at,json_extract(d.data,'$.name') AS donor_name
        FROM sync_records t LEFT JOIN sync_records d ON d.type='donors' AND d.is_deleted=0
          AND d.id=json_extract(t.data,'$.donorId')
        WHERE ${condition}
        ORDER BY json_extract(t.data,'$.date') DESC,t.id DESC LIMIT ? OFFSET ?`).bind(limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records t WHERE ${condition}`)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    return c.json({ success: true, items: rows.results.map((row: any) => ({ ...parseRecord(row), donorName: row.donor_name || 'Unknown Donor' })), page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.get('/v3/donors', async (c: any) => {
    const denied = requirePermission(c, 'donors.read');
    if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit'));
    const page = boundedPage(c.req.query('page'));
    const offset = (page - 1) * limit;
    const search = (c.req.query('search') || '').trim().toLowerCase();
    const condition = search ? `AND lower(d.data) LIKE ?` : '';
    const searchBindings = search ? [`%${search}%`] : [];
    const order = requestedOrder(c, { name: "lower(json_extract(d.data,'$.name'))", phone: "lower(COALESCE(json_extract(d.data,'$.phone'),''))", email: "lower(COALESCE(json_extract(d.data,'$.email'),''))", address: "lower(COALESCE(json_extract(d.data,'$.address'),''))", total: 'total_given' }, "lower(json_extract(d.data,'$.name'))");
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
        ORDER BY ${order} LIMIT ? OFFSET ?
      `).bind(...searchBindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records d WHERE d.type='donors' AND d.is_deleted=0 ${condition}`).bind(...searchBindings)
    ]);
    const total = Number(countResult.results[0]?.count || 0);
    const donorIds = listResult.results.map((row: any) => String(row.id));
    const recordsByDonor = new Map<string, { pledges: any[]; payments: any[]; schedules: any[] }>();
    for (const id of donorIds) recordsByDonor.set(id, { pledges: [], payments: [], schedules: [] });
    if (donorIds.length) {
      const placeholders = donorIds.map(() => '?').join(',');
      const related = await c.env.DB.prepare(`SELECT type,data FROM sync_records WHERE type IN ('pledges','transactions','recurringPayments') AND is_deleted=0 AND json_extract(data,'$.donorId') IN (${placeholders})`).bind(...donorIds).all();
      for (const row of related.results as any[]) {
        const value = parseSetting(row.data, null); const group = recordsByDonor.get(String(value?.donorId || '')); if (!group || !value) continue;
        if (row.type === 'pledges') group.pledges.push(value); else if (row.type === 'transactions') group.payments.push(value); else group.schedules.push(value);
      }
    }
    const items = listResult.results.map((row: any) => { const group = recordsByDonor.get(String(row.id)) || { pledges: [], payments: [], schedules: [] }; const openBalance = calculatePledgeFinancials(group.pledges, group.payments, group.schedules).reduce((sum, pledge) => sum + Math.max(0, Number(pledge.balance || 0)), 0); return { ...parseRecord(row), totalGiven: Number(row.total_given || 0), openBalance }; });
    return c.json({ success: true, items, page, limit, total, totalPages: Math.ceil(total / limit) });
  });

  app.post('/v3/donors/google-sheet/preview', async (c: any) => {
    const denied = requirePermission(c, 'donors.update');
    if (denied) return denied;
    const clearBlankFields = false;
    try {
      const [{ csv, sheetHash }, rows] = await Promise.all([
        getDonorSheetCsv(c),
        c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='donors' AND is_deleted=0").all()
      ]);
      const plan = buildDonorSheetPlan(csv, rows.results as any[], clearBlankFields);
      return c.json({ success: true, sheetHash, clearBlankFields, summary: plan.summary, samples: plan.samples, warnings: plan.warnings, columns: plan.columns });
    } catch (error: any) {
      return c.json({ success: false, error: error.message || 'Unable to preview the Google Sheet.' }, 400);
    }
  });

  app.post('/v3/donors/google-sheet/apply', async (c: any) => {
    const denied = requirePermission(c, 'donors.update');
    if (denied) return denied;
    const body = await c.req.json();
    const requestId = String(c.req.header('Idempotency-Key') || body.requestId || '').trim();
    if (!requestId) return c.json({ success: false, error: 'Idempotency-Key is required.' }, 400);
    const expectedHash = String(body.sheetHash || '').trim();
    if (!/^[a-f0-9]{64}$/i.test(expectedHash)) return c.json({ success: false, error: 'Preview the Google Sheet before applying it.' }, 400);
    const mutationId = `v3-donor-sheet-${requestId}`;
    const prior: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
    if (prior?.result_json) return c.json(JSON.parse(String(prior.result_json)));
    const clearBlankFields = false;
    try {
      const { csv, sheetHash } = await getDonorSheetCsv(c);
      if (sheetHash !== expectedHash) return c.json({ success: false, error: 'The Google Sheet changed after the preview. Preview it again before applying.', changed: true }, 409);
      const rows = await c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='donors' AND is_deleted=0").all();
      const plan = buildDonorSheetPlan(csv, rows.results as any[], clearBlankFields);
      const userId = String(c.get('userId') || 'unknown');
      const userEmail = String(c.get('userEmail') || 'unknown');
      let appliedCreates = 0;
      let appliedUpdates = 0;

      for (let start = 0; start < plan.operations.length; start += 18) {
        const chunk = plan.operations.slice(start, start + 18);
        const statements: any[] = [];
        for (let index = 0; index < chunk.length; index++) {
          const operation = chunk[index];
          const now = Date.now();
          const operationId = `${mutationId}-${start + index}`;
          const data = JSON.stringify(operation.data);
          if (operation.action === 'create') {
            statements.push(
              c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'donors',?,?,1,0,?)").bind(operation.id, data, now, operationId),
              c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'donors',1,'insert',?,?,?,?)").bind(operation.id, data, now, mutationId, operationId),
              c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'donors','insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(operation.id, data, userId, userEmail, now, mutationId, operationId, 'Added from Google Sheet donor sync')
            );
          } else {
            const nextRevision = operation.revision + 1;
            statements.push(
              c.env.DB.prepare('INSERT INTO sync_batch_assertions(id,assertion_value) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM sync_records WHERE type=\'donors\' AND id=? AND revision=? AND is_deleted=0) THEN 1 ELSE 0 END').bind(operationId, operation.id, operation.revision),
              c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='donors' AND id=? AND revision=? AND is_deleted=0").bind(data, nextRevision, now, operationId, operation.id, operation.revision),
              c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'update',data,updated_at,?,? FROM sync_records WHERE type='donors' AND id=? AND revision=?").bind(mutationId, operationId, operation.id, nextRevision),
              c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) SELECT id,type,'update',?,revision,?,data,?,?,updated_at,?,?,? FROM sync_records WHERE type='donors' AND id=? AND revision=?").bind(operation.revision, operation.previousData, userId, userEmail, mutationId, operationId, 'Updated from Google Sheet donor sync', operation.id, nextRevision),
              c.env.DB.prepare('DELETE FROM sync_batch_assertions WHERE id=?').bind(operationId)
            );
          }
        }
        await c.env.DB.batch(statements);
        appliedCreates += chunk.filter(operation => operation.action === 'create').length;
        appliedUpdates += chunk.filter(operation => operation.action === 'update').length;
      }

      const result = { success: true, created: appliedCreates, updated: appliedUpdates, unchanged: plan.summary.unchanged, skipped: plan.summary.skipped, conflicts: plan.summary.conflicts, warnings: plan.warnings };
      await c.env.DB.prepare('INSERT INTO processed_mutations(mutation_id,result_json,server_time) VALUES(?,?,?)').bind(mutationId, JSON.stringify(result), Date.now()).run();
      return c.json(result);
    } catch (error: any) {
      const repeated: any = await c.env.DB.prepare('SELECT result_json FROM processed_mutations WHERE mutation_id=?').bind(mutationId).first();
      if (repeated?.result_json) return c.json(JSON.parse(String(repeated.result_json)));
      return c.json({ success: false, error: 'A donor changed while the sheet was being applied. No donor was deleted. Preview again to safely finish the remaining updates.', detail: error.message, conflict: true }, 409);
    }
  });

  app.get('/v3/donors/:id/profile', async (c: any) => {
    const denied = requirePermission(c, 'donors.read');
    if (denied) return denied;
    const id = String(c.req.param('id') || '');
    const donor: any = await c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='donors' AND id=? AND is_deleted=0").bind(id).first();
    if (!donor) return c.json({ success: false, error: 'Donor not found.' }, 404);
    const [payments, pledges, pledgeSummary, recurring] = await c.env.DB.batch([
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='transactions' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.date') DESC,id DESC").bind(id),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.date') DESC,id DESC LIMIT 50").bind(id),
      c.env.DB.prepare("SELECT COUNT(*) AS count,COALESCE(SUM(COALESCE(json_extract(data,'$.amountCAD'),json_extract(data,'$.amount'),0)),0) AS total FROM sync_records WHERE type='pledges' AND is_deleted=0 AND json_extract(data,'$.donorId')=?").bind(id),
      c.env.DB.prepare("SELECT id,data,revision,updated_at FROM sync_records WHERE type='recurringPayments' AND is_deleted=0 AND json_extract(data,'$.donorId')=? ORDER BY json_extract(data,'$.nextDate'),id LIMIT 50").bind(id)
    ]);
    const paymentItems = payments.results.map(parseRecord);
    const pledgeItems = pledges.results.map(parseRecord);
    const recurringItems = recurring.results.map(parseRecord);
    const approvedPayments = uniquePaymentsForAccounting(paymentItems);
    const approvedTotal = approvedPayments.reduce((total, payment) => total + Number(payment.amountCAD ?? payment.amount ?? 0), 0);
    const calculations = calculatePledgeFinancials(pledgeItems, paymentItems, recurringItems);
    const calculationsById = new Map(calculations.map(item => [String(item.id), item]));
    const enrichedPledges = pledgeItems.map(pledge => {
      const calculation: any = calculationsById.get(String(pledge.id));
      return calculation ? { ...pledge, paid: calculation.paid, scheduled: calculation.scheduled, balance: calculation.balance, periodStart: calculation.periodStart, periodEnd: calculation.periodEnd } : pledge;
    });
    const pledgePaidTotal = calculations.reduce((total, item) => total + Number(item.paid || 0), 0);
    const pledgePendingTotal = calculations.reduce((total, item) => total + Number(item.pending || 0), 0);
    const scheduledTotal = calculations.reduce((total, item) => total + Number(item.scheduled || 0), 0);
    const pledgeBalance = calculations.reduce((total, item) => total + Number(item.balance || 0), 0);
    const pledgeStats: any = pledgeSummary.results[0] || {};
    return c.json({
      success: true,
      donor: { ...parseRecord(donor), totalGiven: approvedTotal },
      payments: paymentItems.slice(0, 50), pledges: enrichedPledges, recurring: recurringItems,
      summary: { paymentCount: paymentItems.length, approvedTotal, declinedCount: paymentItems.filter(payment => payment.type === 'declined').length, pledgeCount: Number(pledgeStats.count || 0), pledgedTotal: Number(pledgeStats.total || 0), pledgePaidTotal, pledgePendingTotal, scheduledTotal, pledgeBalance, unappliedTotal: approvedTotal - pledgePaidTotal, recurringCount: recurringItems.length, activeRecurringCount: recurringItems.filter(item => item.active).length, activeRecurringTotal: scheduledTotal }
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
    const status = (c.req.query('status') || 'all').trim();
    const category = String(c.req.query('category') || '').trim();
    const account = String(c.req.query('account') || '').trim();
    const from = String(c.req.query('from') || '').trim();
    const to = String(c.req.query('to') || '').trim();
    const conditions = ["b.type='bills'", 'b.is_deleted=0', "COALESCE(json_extract(b.data,'$.isPayroll'),0)=0"];
    const bindings: any[] = [];
    if (status === 'open') conditions.push("json_extract(b.data,'$.status') IN ('pending','urgent','scheduled')");
    else if (status !== 'all') { conditions.push("json_extract(b.data,'$.status')=?"); bindings.push(status); }
    if (category) { conditions.push("json_extract(b.data,'$.category')=?"); bindings.push(category); }
    if (account) { conditions.push("json_extract(b.data,'$.sourceAccountId')=?"); bindings.push(account); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(from)) { conditions.push("json_extract(b.data,'$.dueDate')>=?"); bindings.push(from); }
    if (/^\d{4}-\d{2}-\d{2}$/.test(to)) { conditions.push("json_extract(b.data,'$.dueDate')<=?"); bindings.push(to); }
    if (search) {
      conditions.push("(lower(COALESCE(json_extract(b.data,'$.vendor'),'')) LIKE ? OR lower(COALESCE(json_extract(b.data,'$.memo'),'')) LIKE ? OR lower(COALESCE(json_extract(cat.data,'$.name'),'')) LIKE ? OR lower(COALESCE(json_extract(src.data,'$.name'),'')) LIKE ? OR lower(COALESCE(json_extract(b.data,'$.status'),'')) LIKE ? OR lower(COALESCE(json_extract(b.data,'$.dueDate'),'')) LIKE ? OR CAST(COALESCE(json_extract(b.data,'$.amount'),0) AS TEXT) LIKE ?)");
      bindings.push(...Array(7).fill(`%${search}%`));
    }
    const where = conditions.join(' AND ');
    const joins = `LEFT JOIN sync_records cat ON cat.type='accounts' AND cat.id=json_extract(b.data,'$.category') AND cat.is_deleted=0
      LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(b.data,'$.sourceAccountId') AND src.is_deleted=0`;
    const order = requestedOrder(c, { dueDate: "json_extract(b.data,'$.dueDate')", vendor: "lower(COALESCE(json_extract(b.data,'$.vendor'),''))", category: "lower(COALESCE(json_extract(cat.data,'$.name'),''))", status: "json_extract(b.data,'$.status')", source: "lower(COALESCE(json_extract(src.data,'$.name'),''))", amount: "CAST(COALESCE(json_extract(b.data,'$.amount'),0) AS REAL)" }, "json_extract(b.data,'$.dueDate')");
    const [listResult, totalsResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT b.id,b.data,b.revision,b.updated_at,json_extract(cat.data,'$.name') AS category_name,json_extract(src.data,'$.name') AS source_name FROM sync_records b ${joins} WHERE ${where} ORDER BY ${order},b.id DESC LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count,COALESCE(SUM(CASE WHEN json_extract(b.data,'$.currency')='USD' THEN COALESCE(json_extract(b.data,'$.amount'),0)*COALESCE(json_extract(b.data,'$.exchangeRate'),1.35) ELSE COALESCE(json_extract(b.data,'$.amount'),0) END),0) AS total_cad FROM sync_records b ${joins} WHERE ${where}`).bind(...bindings)
    ]);
    const total = Number(totalsResult.results[0]?.count || 0);
    return c.json({
      success: true,
      items: listResult.results.map((row: any) => ({ ...parseRecord(row), categoryName: row.category_name || 'Uncategorized', sourceName: row.source_name || '' })),
      page, limit, total, totalPages: Math.ceil(total / limit), totalCAD: Number(totalsResult.results[0]?.total_cad || 0)
    });
  });

  app.get('/v3/expense-categories', async (c: any) => {
    const denied = requirePermission(c, 'bills.read'); if (denied) return denied;
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit;
    const search = String(c.req.query('search') || '').trim().toLowerCase(); const year = /^\d{4}$/.test(String(c.req.query('year') || '')) ? String(c.req.query('year')) : String(new Date().getUTCFullYear());
    const condition = search ? " AND lower(COALESCE(json_extract(a.data,'$.name'),'')) LIKE ?" : ''; const bindings = search ? [`%${search}%`] : [];
    const base = "a.type='accounts' AND a.is_deleted=0 AND json_extract(a.data,'$.type')='expense'";
    const [listResult,countResult,totalResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT a.id,a.data,a.revision,a.updated_at,COALESCE(SUM(CASE WHEN substr(json_extract(b.data,'$.dueDate'),1,4)=? THEN CASE WHEN json_extract(b.data,'$.currency')='USD' THEN COALESCE(json_extract(b.data,'$.amount'),0)*COALESCE(json_extract(b.data,'$.exchangeRate'),1.35) ELSE COALESCE(json_extract(b.data,'$.amount'),0) END ELSE 0 END),0) AS ytd FROM sync_records a LEFT JOIN sync_records b ON b.type='bills' AND b.is_deleted=0 AND json_extract(b.data,'$.category')=a.id WHERE ${base}${condition} GROUP BY a.id ORDER BY lower(json_extract(a.data,'$.name')) LIMIT ? OFFSET ?`).bind(year,...bindings,limit,offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records a WHERE ${base}${condition}`).bind(...bindings),
      c.env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN json_extract(data,'$.currency')='USD' THEN COALESCE(json_extract(data,'$.amount'),0)*COALESCE(json_extract(data,'$.exchangeRate'),1.35) ELSE COALESCE(json_extract(data,'$.amount'),0) END),0) AS total FROM sync_records WHERE type='bills' AND is_deleted=0 AND substr(json_extract(data,'$.dueDate'),1,4)=?").bind(year)
    ]);
    const total=Number(countResult.results[0]?.count||0); return c.json({success:true,items:listResult.results.map((row:any)=>({...parseRecord(row),ytd:Number(row.ytd||0)})),page,limit,total,totalPages:Math.ceil(total/limit),year,totalYTD:Number(totalResult.results[0]?.total||0)});
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
    const order = requestedOrder(c, { name: 'lower(vendor)', total: 'total_billed', balance: 'balance_owed', count: 'bill_count' }, 'lower(vendor)');
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT json_extract(data,'$.vendor') AS vendor,COUNT(*) AS bill_count,COALESCE(SUM(json_extract(data,'$.amount')),0) AS total_billed,COALESCE(SUM(CASE WHEN json_extract(data,'$.status')<>'paid' THEN json_extract(data,'$.amount') ELSE 0 END),0) AS balance_owed FROM sync_records WHERE ${base}${condition} GROUP BY json_extract(data,'$.vendor') ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...bindings, limit, offset),
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
    const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit; const status = String(c.req.query('status') || 'queued'); const search=String(c.req.query('search')||'').trim().toLowerCase(); const account=String(c.req.query('account')||''); const category=String(c.req.query('category')||''); const from=String(c.req.query('from')||''); const to=String(c.req.query('to')||''); const conditions=["b.type='bills'",'b.is_deleted=0',"json_extract(b.data,'$.printStatus')=?"];const bindings:any[]=[status];if(search){conditions.push("(lower(b.data) LIKE ? OR lower(COALESCE(json_extract(cat.data,'$.name'),'')) LIKE ? OR lower(COALESCE(json_extract(src.data,'$.name'),'')) LIKE ?)");bindings.push(`%${search}%`,`%${search}%`,`%${search}%`);}if(account){conditions.push("json_extract(b.data,'$.sourceAccountId')=?");bindings.push(account);}if(category){conditions.push("json_extract(b.data,'$.category')=?");bindings.push(category);}if(from){conditions.push("json_extract(b.data,'$.dueDate')>=?");bindings.push(from);}if(to){conditions.push("json_extract(b.data,'$.dueDate')<=?");bindings.push(to);}const where=conditions.join(' AND ');
    const joins = `LEFT JOIN sync_records cat ON cat.type='accounts' AND cat.id=json_extract(b.data,'$.category') AND cat.is_deleted=0 LEFT JOIN sync_records src ON src.type='accounts' AND src.id=json_extract(b.data,'$.sourceAccountId') AND src.is_deleted=0`;
    const [listResult, countResult] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT b.id,b.data,b.revision,b.updated_at,json_extract(cat.data,'$.name') AS category_name,json_extract(src.data,'$.name') AS source_name FROM sync_records b ${joins} WHERE ${where} ORDER BY json_extract(b.data,'$.dueDate'),b.id LIMIT ? OFFSET ?`).bind(...bindings,limit,offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records b ${joins} WHERE ${where}`).bind(...bindings)
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
    if (body.isPayrollExpense) record.isPayrollExpense = true;
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

  app.get('/v3/bank/feed', async (c: any) => {
    const denied = requirePermission(c, 'transactions.read');
    if (denied) return denied;
    const accountId = String(c.req.query('accountId') || ''); const limit = boundedLimit(c.req.query('limit')); const page = boundedPage(c.req.query('page')); const offset = (page - 1) * limit; const search=String(c.req.query('search')||'').trim().toLowerCase();const from=String(c.req.query('from')||'');const to=String(c.req.query('to')||'');const matchStatus=String(c.req.query('matchStatus')||'');
    if (!accountId) return c.json({ success: false, error: 'Choose a bank account.' }, 400);
    const conditions=["f.type='bankFeedTransactions'",'f.is_deleted=0',"json_extract(f.data,'$.accountId')=?"];const bindings:any[]=[accountId];if(search){conditions.push("lower(f.data) LIKE ?");bindings.push(`%${search}%`);}if(from){conditions.push("json_extract(f.data,'$.date')>=?");bindings.push(from);}if(to){conditions.push("json_extract(f.data,'$.date')<=?");bindings.push(to);}if(matchStatus==='matched')conditions.push("EXISTS(SELECT 1 FROM sync_records m,json_each(m.data) j WHERE m.type='matchedBankTransactions' AND m.is_deleted=0 AND j.value=json_extract(f.data,'$.id'))");if(matchStatus==='unmatched')conditions.push("NOT EXISTS(SELECT 1 FROM sync_records m,json_each(m.data) j WHERE m.type='matchedBankTransactions' AND m.is_deleted=0 AND j.value=json_extract(f.data,'$.id'))");const where=conditions.join(' AND ');
    const [listResult,countResult,syncRow] = await c.env.DB.batch([
      c.env.DB.prepare(`SELECT f.data FROM sync_records f WHERE ${where} ORDER BY json_extract(f.data,'$.date') DESC,f.id DESC LIMIT ? OFFSET ?`).bind(...bindings,limit,offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS count FROM sync_records f WHERE ${where}`).bind(...bindings),
      c.env.DB.prepare('SELECT value,updated_at FROM sync_metadata WHERE key=?').bind(`bank_sync:${accountId}`)
    ]);
    const total=Number(countResult.results[0]?.count||0); const sync:any=syncRow.results[0]; let syncState:any=null; try{syncState=sync?.value?JSON.parse(String(sync.value)):null;}catch{syncState=null;}
    return c.json({success:true,items:listResult.results.map((row:any)=>JSON.parse(String(row.data))),page,limit,total,totalPages:Math.ceil(total/limit),sync:syncState});
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
    const order = requestedOrder(c, { name: "lower(json_extract(a.data,'$.name'))", type: "json_extract(a.data,'$.type')", currency: "json_extract(a.data,'$.currency')", balance: 'calculated_balance' }, "json_extract(a.data,'$.type')");
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
      ORDER BY ${order}, lower(json_extract(a.data,'$.name'))
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

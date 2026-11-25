/**
 * Change requests: anyone signed in can write what should be changed in the program (with screenshots),
 * and they all collect on the "Change requests" page, to copy and give to the programmer.
 * Records: 'changeRequests' (the text) and 'changeRequestImages' (one screenshot each, kept apart so the list stays light).
 */
const MAX_TEXT = 5000;
const MAX_IMAGES = 4;
const MAX_IMAGE_CHARS = 1_400_000; // about 1 MB of picture; the browser shrinks screenshots before sending
const IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

const readJson = (text: unknown, fallback: any) => { try { return JSON.parse(String(text ?? '')); } catch { return fallback; } };
const who = (c: any) => ({ userId: String(c.get('userId') || 'unknown'), email: String(c.get('userEmail') || 'unknown') });

export const registerChangeRequestRoutes = (app: any) => {
  app.get('/v3/change-requests', async (c: any) => {
    const status = String(c.req.query('status') || 'open');
    const rows = await c.env.DB.prepare("SELECT id,data,revision FROM sync_records WHERE type='changeRequests' AND is_deleted=0 ORDER BY updated_at DESC LIMIT 500").all();
    const items = ((rows.results || []) as any[]).map(row => ({ ...readJson(row.data, {}), id: String(row.id), revision: Number(row.revision) }))
      .filter(item => status === 'all' || (status === 'done' ? item.status === 'done' : item.status !== 'done'))
      .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    const open = ((rows.results || []) as any[]).filter(row => readJson(row.data, {}).status !== 'done').length;
    return c.json({ success: true, items, open });
  });

  app.get('/v3/change-requests/:id/images', async (c: any) => {
    const id = String(c.req.param('id') || '');
    const rows = await c.env.DB.prepare("SELECT data FROM sync_records WHERE type='changeRequestImages' AND is_deleted=0 AND json_extract(data,'$.requestId')=? ORDER BY id").bind(id).all();
    return c.json({ success: true, images: ((rows.results || []) as any[]).map(row => String(readJson(row.data, {}).dataUrl || '')).filter(Boolean) });
  });

  app.post('/v3/change-requests', async (c: any) => {
    const body = await c.req.json().catch(() => ({}));
    const text = String(body.text || '').trim();
    const images: string[] = Array.isArray(body.images) ? body.images.map(String) : [];
    if (!text && !images.length) return c.json({ success: false, error: 'Write what should be changed, or add a screenshot.' }, 400);
    if (text.length > MAX_TEXT) return c.json({ success: false, error: `Please keep it under ${MAX_TEXT} letters.` }, 400);
    if (images.length > MAX_IMAGES) return c.json({ success: false, error: `Up to ${MAX_IMAGES} screenshots.` }, 400);
    if (images.some(image => !IMAGE.test(image) || image.length > MAX_IMAGE_CHARS)) return c.json({ success: false, error: 'A screenshot is too big or not a picture. Try a smaller one.' }, 400);
    const { userId, email } = who(c); const now = Date.now(); const id = `change-request-${now}-${crypto.randomUUID().slice(0, 8)}`; const mutationId = `${id}-create`;
    const record = { id, text, page: String(body.page || '').slice(0, 300), pageTitle: String(body.pageTitle || '').slice(0, 200), createdAt: new Date(now).toISOString(), createdBy: email, status: 'open', imageCount: images.length };
    const data = JSON.stringify(record);
    const statements: any[] = [
      c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'changeRequests',?,?,1,0,?)").bind(id, data, now, mutationId),
      c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'changeRequests',1,'insert',?,?,?,?)").bind(id, data, now, mutationId, mutationId),
      c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'changeRequests','insert',NULL,1,NULL,?,?,?,?,?,?,?)").bind(id, data, userId, email, now, mutationId, mutationId, 'Change request sent'),
    ];
    images.forEach((dataUrl, index) => {
      const imageId = `${id}-image-${index + 1}`;
      statements.push(c.env.DB.prepare("INSERT INTO sync_records(id,type,data,updated_at,revision,is_deleted,last_operation_id) VALUES(?,'changeRequestImages',?,?,1,0,?)").bind(imageId, JSON.stringify({ id: imageId, requestId: id, dataUrl }), now, `${mutationId}-image-${index + 1}`));
    });
    await c.env.DB.batch(statements);
    return c.json({ success: true, item: { ...record, revision: 1 } });
  });

  app.put('/v3/change-requests/:id', async (c: any) => {
    const id = String(c.req.param('id') || ''); const body = await c.req.json().catch(() => ({}));
    const status = body.status === 'done' ? 'done' : 'open';
    const row: any = await c.env.DB.prepare("SELECT data,revision FROM sync_records WHERE type='changeRequests' AND id=? AND is_deleted=0").bind(id).first();
    if (!row) return c.json({ success: false, error: 'This request was not found.' }, 404);
    if (body.revision !== undefined && Number(body.revision) !== Number(row.revision)) return c.json({ success: false, error: 'Someone else changed this request. Refresh and try again.' }, 409);
    const { userId, email } = who(c); const now = Date.now(); const revision = Number(row.revision) + 1; const mutationId = `${id}-${status}-${now}`;
    const old = readJson(row.data, {});
    const next = { ...old, status, ...(status === 'done' ? { doneAt: new Date(now).toISOString(), doneBy: email } : { doneAt: undefined, doneBy: undefined }), ...(body.note !== undefined ? { note: String(body.note).slice(0, 2000) } : {}) };
    const data = JSON.stringify(next);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE sync_records SET data=?,revision=?,updated_at=?,last_operation_id=? WHERE type='changeRequests' AND id=? AND revision=? AND is_deleted=0").bind(data, revision, now, mutationId, id, row.revision),
      c.env.DB.prepare("INSERT INTO sync_changes(record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) VALUES(?,'changeRequests',?,'update',?,?,?,?)").bind(id, revision, data, now, mutationId, mutationId),
      c.env.DB.prepare("INSERT INTO audit_log(record_id,record_type,action,old_revision,new_revision,old_data,new_data,changed_by_user_id,changed_by_email,changed_at,mutation_id,operation_id,reason) VALUES(?,'changeRequests','update',?,?,?,?,?,?,?,?,?,?)").bind(id, row.revision, revision, row.data, data, userId, email, now, mutationId, mutationId, status === 'done' ? 'Change request marked done' : 'Change request opened again'),
    ]);
    return c.json({ success: true, item: { ...next, id, revision } });
  });
};

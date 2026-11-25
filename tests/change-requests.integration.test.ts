import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Hono } from 'hono';
import { registerChangeRequestRoutes } from '../functions/api/change-requests';

const { DatabaseSync } = (process as any).getBuiltinModule('node:sqlite');

class MockStatement {
  constructor(private database: any, private sql: string, private values: any[] = []) {}
  bind(...values: any[]) { return new MockStatement(this.database, this.sql, values); }
  async all() { return { results: this.database.prepare(this.sql).all(...this.values) as any[] }; }
  async first() { return (this.database.prepare(this.sql).get(...this.values) as any) || null; }
  async run() { return this.database.prepare(this.sql).run(...this.values); }
  async execute() { return /^\s*(SELECT|WITH)\b/i.test(this.sql) ? this.all() : this.run(); }
}
class MockD1 {
  readonly database = new DatabaseSync(':memory:');
  constructor() { this.database.exec(readFileSync(join(process.cwd(), 'scripts', 'staging-schema.sql'), 'utf8')); }
  prepare(sql: string) { return new MockStatement(this.database, sql); }
  async batch(statements: MockStatement[]) { this.database.exec('BEGIN'); try { const results = []; for (const statement of statements) results.push(await statement.execute()); this.database.exec('COMMIT'); return results; } catch (error) { this.database.exec('ROLLBACK'); throw error; } }
  close() { this.database.close(); }
}
const databases: MockD1[] = [];
afterEach(() => { while (databases.length) databases.pop()!.close(); });

const appFor = () => { const app = new Hono(); app.use('*', async (c: any, next) => { c.set('userId', 'partner'); c.set('userEmail', 'partner@example.com'); await next(); }); registerChangeRequestRoutes(app); return app; };
const PICTURE = 'data:image/jpeg;base64,' + 'A'.repeat(400);

describe('change requests', () => {
  it('saves a request with a screenshot, lists it without the picture, gives the picture, and marks it done', async () => {
    const db = new MockD1(); databases.push(db); const app = appFor(); const env = { DB: db } as any;
    const sent = await app.request('/v3/change-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: 'Add a phone column on Pledges', page: '/pledges', pageTitle: 'Pledges', images: [PICTURE] }) }, env);
    const body: any = await sent.json(); expect(sent.status).toBe(200); expect(body.item).toMatchObject({ text: 'Add a phone column on Pledges', page: '/pledges', createdBy: 'partner@example.com', status: 'open', imageCount: 1 });
    const list: any = await (await app.request('/v3/change-requests?status=open', {}, env)).json();
    expect(list.open).toBe(1); expect(list.items).toHaveLength(1); expect(JSON.stringify(list.items)).not.toContain('base64');
    const pictures: any = await (await app.request(`/v3/change-requests/${body.item.id}/images`, {}, env)).json(); expect(pictures.images).toEqual([PICTURE]);
    const done = await app.request(`/v3/change-requests/${body.item.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'done', revision: 1 }) }, env);
    expect(done.status).toBe(200); expect(((await done.json()) as any).item).toMatchObject({ status: 'done', doneBy: 'partner@example.com', revision: 2 });
    const openNow: any = await (await app.request('/v3/change-requests?status=open', {}, env)).json(); expect(openNow.items).toHaveLength(0);
    const history = db.database.prepare("SELECT action FROM audit_log WHERE record_type='changeRequests' ORDER BY rowid").all().map((row: any) => row.action); expect(history).toEqual(['insert', 'update']);
  });

  it('refuses an empty request, a file that is not a picture, and too many pictures', async () => {
    const db = new MockD1(); databases.push(db); const app = appFor(); const env = { DB: db } as any;
    const post = (body: any) => app.request('/v3/change-requests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env);
    expect((await post({ text: '  ' })).status).toBe(400);
    expect((await post({ text: 'x', images: ['data:text/html;base64,PHNjcmlwdD4='] })).status).toBe(400);
    expect((await post({ text: 'x', images: Array(5).fill(PICTURE) })).status).toBe(400);
    expect(db.database.prepare("SELECT COUNT(*) count FROM sync_records WHERE type LIKE 'changeRequest%'").get().count).toBe(0);
  });
});

/**
 * When the database is briefly too busy ("D1 DB is overloaded. Too many resources consumed within a 10 second window"),
 * wait a moment and try again, so the person using the site does not see the error.
 * A query that failed with this error was not done, so trying it again is safe (writes too).
 */
const BUSY = /overloaded|too many resources consumed|database is locked|SQLITE_BUSY/i;
const WAITS_MS = [500, 1500, 3500];
const WRAPPED = Symbol.for('charitypro.dbRetry');
const RAW = Symbol.for('charitypro.dbRaw');

/** The database itself (not the retrying wrapper), e.g. to remember something per database. */
export const rawDatabase = (db: any) => (db && db[RAW]) || db;

export const isDatabaseBusy = (reason: unknown) => BUSY.test(String((reason as any)?.message || reason || ''));

const retry = async <T>(work: () => Promise<T>, waits = WAITS_MS): Promise<T> => {
  for (let attempt = 0; ; attempt++) {
    try { return await work(); }
    catch (reason) {
      if (attempt >= waits.length || !isDatabaseBusy(reason)) throw reason;
      await new Promise(resolve => setTimeout(resolve, waits[attempt]));
    }
  }
};

class RetryingStatement {
  constructor(readonly inner: any, private readonly waits: number[]) {}
  bind(...values: any[]) { return new RetryingStatement(this.inner.bind(...values), this.waits); }
  first(column?: string) { return retry(() => column === undefined ? this.inner.first() : this.inner.first(column), this.waits); }
  all() { return retry(() => this.inner.all(), this.waits); }
  run() { return retry(() => this.inner.run(), this.waits); }
  raw(options?: any) { return retry(() => this.inner.raw(options), this.waits); }
}

/** The same database, but every query is tried again (up to 3 times) when the database says it is busy. */
export const withDatabaseRetry = <T>(db: T, waits = WAITS_MS): T => {
  if (!db || (db as any)[WRAPPED]) return db;
  const target: any = db;
  return new Proxy(target, {
    get(object, key) {
      if (key === WRAPPED) return true;
      if (key === RAW) return object;
      if (key === 'prepare') return (sql: string) => new RetryingStatement(object.prepare(sql), waits);
      if (key === 'batch') return (statements: any[]) => retry(() => object.batch(statements.map(statement => statement instanceof RetryingStatement ? statement.inner : statement)), waits);
      if (key === 'exec') return (sql: string) => retry(() => object.exec(sql), waits);
      const value = object[key];
      return typeof value === 'function' ? value.bind(object) : value;
    },
  }) as T;
};

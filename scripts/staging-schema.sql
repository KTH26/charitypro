-- CharityPro bootstrap schema for a new, empty D1 database.
-- Safe to run repeatedly only before the database begins serving live data.

CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_records (
  id TEXT NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  last_operation_id TEXT,
  PRIMARY KEY (type, id)
);

CREATE INDEX IF NOT EXISTS idx_sync_records_updated ON sync_records(updated_at);
CREATE INDEX IF NOT EXISTS idx_sync_records_type ON sync_records(type, is_deleted);

CREATE TABLE IF NOT EXISTS sync_changes (
  change_id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL,
  type TEXT NOT NULL,
  revision INTEGER NOT NULL,
  operation TEXT NOT NULL,
  data TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  mutation_id TEXT NOT NULL,
  operation_id TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sync_changes_cursor ON sync_changes(change_id);
CREATE INDEX IF NOT EXISTS idx_sync_changes_record ON sync_changes(record_id, change_id);

CREATE TABLE IF NOT EXISTS processed_mutations (
  mutation_id TEXT PRIMARY KEY,
  result_json TEXT NOT NULL,
  server_time INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS processed_operations (
  operation_id TEXT PRIMARY KEY,
  mutation_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_batch_assertions (
  id TEXT PRIMARY KEY,
  assertion_value INTEGER NOT NULL CHECK(assertion_value = 1)
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL COLLATE NOCASE,
  access_subject TEXT UNIQUE,
  display_name TEXT,
  status TEXT NOT NULL CHECK(status IN ('active', 'suspended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN (
    'administrator',
    'bookkeeper',
    'donor_staff',
    'payroll_manager',
    'fundraiser',
    'read_only',
    'auditor'
  )),
  PRIMARY KEY (user_id, role),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id TEXT NOT NULL,
  record_type TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('insert', 'update', 'delete', 'restore')),
  old_revision INTEGER,
  new_revision INTEGER,
  old_data TEXT,
  new_data TEXT,
  changed_by_user_id TEXT NOT NULL,
  changed_by_email TEXT NOT NULL,
  changed_at INTEGER NOT NULL,
  mutation_id TEXT,
  operation_id TEXT,
  request_id TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_id, audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(changed_by_user_id, changed_at);

INSERT INTO sync_metadata (key, value, updated_at)
VALUES ('sync_generation', '9', strftime('%s','now') * 1000)
ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at;

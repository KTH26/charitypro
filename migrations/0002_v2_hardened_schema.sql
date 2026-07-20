-- Migration: 0002_v2_hardened_schema
-- Description: Applies strict enterprise schemas for the V2 Sync Engine, introduces operation-level atomicity tracking, and safely backfills snapshot records.

-- 1. Create Sync Metadata Table
CREATE TABLE IF NOT EXISTS sync_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- 2. Modify sync_records to include last_operation_id
-- SQLite ALTER TABLE ADD COLUMN allows adding columns.
ALTER TABLE sync_records ADD COLUMN last_operation_id TEXT;

-- 3. Rebuild sync_changes with INTEGER PRIMARY KEY AUTOINCREMENT
DROP TABLE IF EXISTS sync_changes;
CREATE TABLE sync_changes (
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

-- 4. Create Processed Operations Table for Idempotency
CREATE TABLE IF NOT EXISTS processed_operations (
  operation_id TEXT PRIMARY KEY,
  mutation_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  processed_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_processed_operation ON processed_operations(operation_id);

-- 5. Create Batch Assertions Table (Transactions will insert and delete here)
CREATE TABLE IF NOT EXISTS sync_batch_assertions (
  id TEXT PRIMARY KEY,
  assertion_value INTEGER NOT NULL CHECK(assertion_value = 1)
);

-- 6. Add operation tracking to audit_log
ALTER TABLE audit_log ADD COLUMN operation_id TEXT;
-- Note: mutation_id already exists in audit_log

-- 7. Controlled Snapshot Backfill
-- We seed the monotonic sync_changes ledger with all active and tombstoned records to establish continuity.
INSERT INTO sync_changes (record_id, type, revision, operation, data, changed_at, mutation_id, operation_id)
SELECT 
  id, 
  type, 
  revision, 
  CASE WHEN is_deleted = 1 THEN 'delete' ELSE 'snapshot' END, 
  data, 
  updated_at,
  'migration_v2',
  'snapshot_' || id
FROM sync_records;

-- 8. Advance Sync Generation to force all existing clients to rebuild cursors
INSERT INTO sync_metadata (key, value, updated_at) 
VALUES ('sync_generation', '2', strftime('%s','now') * 1000)
ON CONFLICT(key) DO UPDATE SET value = '2', updated_at = strftime('%s','now') * 1000;

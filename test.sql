CREATE TABLE sync_records (id TEXT PRIMARY KEY, data TEXT, revision INTEGER);
INSERT INTO sync_records VALUES ('1', 'old', 1);
INSERT INTO sync_records VALUES ('1', 'new', 1) ON CONFLICT(id) DO UPDATE SET data = excluded.data, revision = sync_records.revision + 1 WHERE sync_records.revision = 2 OR 2 = 0;
SELECT changes();

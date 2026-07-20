
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
    request_id TEXT,
    reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_log(record_id, audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(changed_by_user_id, changed_at);

INSERT OR IGNORE INTO users (id, email, display_name, status, created_at, updated_at)
VALUES ('usr_admin1', 'mendel.kth@gmail.com', 'Admin', 'active', 1712000000000, 1712000000000);

INSERT OR IGNORE INTO user_roles (user_id, role)
VALUES ('usr_admin1', 'administrator');

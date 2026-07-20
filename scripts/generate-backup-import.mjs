import crypto from 'node:crypto';
import fs from 'node:fs';

const [backupPath, outputPath] = process.argv.slice(2);
if (!backupPath || !outputPath) {
  throw new Error('Usage: node scripts/generate-backup-import.mjs <backup.json> <output.sql>');
}

const recordKeys = [
  'donors', 'transactions', 'pledges', 'recurringPayments', 'fundraisers',
  'accounts', 'bills', 'tasks', 'accountTransfers', 'employees', 't4aSlips',
  'vendors', 'projects', 'recurringExpenses', 'recurringPayroll'
];

const emergency = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
if (emergency.format !== 'charitypro-emergency-complete-backup') {
  throw new Error('Refusing to import an unrecognized backup format');
}
const persisted = JSON.parse(emergency.indexedDb?.['charity-store'] || 'null');
const state = persisted?.state;
if (!state) throw new Error('Complete CharityPro state was not found in the backup');

const quote = value => `'${String(value).replaceAll("'", "''")}'`;
const timestamp = Date.parse(emergency.createdAt);
if (!Number.isFinite(timestamp)) throw new Error('Backup timestamp is invalid');

const lines = [
  'PRAGMA defer_foreign_keys=TRUE;'
];
const counts = {};
let total = 0;

for (const type of recordKeys) {
  const records = state[type];
  if (!Array.isArray(records)) throw new Error(`Backup collection ${type} is missing`);
  const ids = new Set();
  counts[type] = records.length;
  for (const record of records) {
    if (!record || record.id === undefined || record.id === null || String(record.id) === '') {
      throw new Error(`A ${type} record has no ID`);
    }
    const id = String(record.id);
    if (ids.has(id)) throw new Error(`Duplicate ${type} ID: ${id}`);
    ids.add(id);
    lines.push(
      `INSERT INTO sync_records (id,type,data,updated_at,revision,is_deleted) VALUES(${quote(id)},${quote(type)},${quote(JSON.stringify(record))},${timestamp},1,0);`
    );
    total += 1;
  }
}

lines.push(
  `INSERT INTO sync_records (id,type,data,updated_at,revision,is_deleted) VALUES('exchangeRate','exchangeRate',${quote(JSON.stringify(state.exchangeRate))},${timestamp},1,0);`,
  `INSERT INTO sync_changes (record_id,type,revision,operation,data,changed_at,mutation_id,operation_id) SELECT id,type,revision,'insert',data,updated_at,'verified-backup-20260720','migration-' || type || '-' || id FROM sync_records;`,
  `UPDATE sync_metadata SET value='7', updated_at=${timestamp} WHERE key='sync_generation';`,
  ''
);

const output = lines.join('\n');
fs.writeFileSync(outputPath, output, 'utf8');
console.log(JSON.stringify({
  totalRecords: total + 1,
  counts: { ...counts, exchangeRate: 1 },
  bytes: Buffer.byteLength(output),
  sha256: crypto.createHash('sha256').update(output).digest('hex')
}, null, 2));

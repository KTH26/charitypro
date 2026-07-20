import fs from 'node:fs';

const [snapshotPath, backupPath] = process.argv.slice(2);
if (!snapshotPath || !backupPath) {
  throw new Error('Usage: node scripts/audit-production-backup.mjs <snapshot.sql> <backup.json>');
}

const sql = fs.readFileSync(snapshotPath, 'utf8');
const production = {};
const recordPattern = /^INSERT INTO "sync_records" \("id","type","data","updated_at","revision","is_deleted"(?:,"last_operation_id")?\) VALUES\('((?:''|[^'])*)','((?:''|[^'])*)','((?:''|[^'])*)',(\d+),(\d+),(\d+)(?:,NULL)?\);$/gm;
for (const match of sql.matchAll(recordPattern)) {
  const [, , encodedType, encodedData, , , isDeleted] = match;
  if (isDeleted === '1') continue;
  const type = encodedType.replaceAll("''", "'");
  const data = JSON.parse(encodedData.replaceAll("''", "'"));
  if (data && typeof data === 'object' && !Array.isArray(data) && 'id' in data) {
    if (!production[type]) production[type] = [];
    production[type].push(data);
  }
}

const emergency = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
const backupPersisted = JSON.parse(emergency.indexedDb['charity-store']);
const backup = backupPersisted.state;

const collectionKeys = Object.keys(backup).filter(key => Array.isArray(backup[key]));
const comparison = [];
const missingRecords = [];

for (const key of collectionKeys) {
  const backupRecords = backup[key];
  const productionRecords = Array.isArray(production[key]) ? production[key] : [];
  const productionById = new Map(productionRecords.map(record => [String(record.id), record]));
  const backupById = new Map(backupRecords.map(record => [String(record.id), record]));
  const missing = backupRecords.filter(record => !productionById.has(String(record.id)));
  const productionOnly = productionRecords.filter(record => !backupById.has(String(record.id)));
  const differing = backupRecords.filter(record => {
    const current = productionById.get(String(record.id));
    return current && JSON.stringify(current) !== JSON.stringify(record);
  });

  if (missing.length || productionOnly.length || differing.length) {
    comparison.push({
      type: key,
      backup: backupRecords.length,
      production: productionRecords.length,
      missing: missing.map(record => String(record.id)),
      productionOnly: productionOnly.map(record => String(record.id)),
      differingCount: differing.length
    });
  }
  for (const record of missing) missingRecords.push({ type: key, id: String(record.id), data: record });
}

console.log(JSON.stringify({
  comparison,
  missingRecords: missingRecords.map(({ type, id }) => ({ type, id })),
  productionRecordCount: Object.values(production).reduce((sum, records) => sum + records.length, 0),
  backupRecordCount: collectionKeys.reduce((sum, key) => sum + backup[key].length, 0)
}, null, 2));

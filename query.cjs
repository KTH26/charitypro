const cp = require('child_process');
console.log(cp.execSync('npx wrangler d1 execute charity-db --remote --command="SELECT * FROM processed_mutations ORDER BY server_time DESC LIMIT 2;"').toString());

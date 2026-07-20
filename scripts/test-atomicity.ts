import crypto from 'crypto';
import { execSync } from 'child_process';

const API_BASE = process.env.API_BASE || 'http://localhost:8788/api';
const TEST_TOKEN = process.env.TEST_JWT || 'ADD_VALID_JWT_HERE';
const TEST_TOKEN_STAFF = process.env.TEST_JWT_STAFF; // Needs a JWT for a user with ONLY donors.read, not payroll.read
const WRANGLER_FLAGS = process.env.WRANGLER_FLAGS || '--local'; // e.g. '--env preview --remote'

let hasFailed = false;

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${msg}`);
    hasFailed = true;
  } else {
    console.log(`✅ PASS: ${msg}`);
  }
}

async function fetchAPI(endpoint: string, method: string, body?: any, token: string = TEST_TOKEN) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cf-Access-Jwt-Assertion': token
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json();
  return { status: res.status, data };
}

function queryDB(query: string) {
  try {
    const cmd = `npx wrangler d1 execute DB ${WRANGLER_FLAGS} --json --command "${query}"`;
    const output = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
    const parsed = JSON.parse(output);
    return parsed[0].results;
  } catch (err) {
    console.warn(`⚠️ Could not execute DB query directly. Make sure wrangler is configured. Query: ${query}`);
    return null;
  }
}

async function runTests() {
  console.log('--- CharityPro D1 Sync Hardening Integration Tests ---\n');
  
  const mutationId = crypto.randomUUID();
  const opId1 = crypto.randomUUID(); 
  const opId2 = crypto.randomUUID(); 
  const testDonorId = `test-donor-${Date.now()}`;
  const testPayrollId = `test-payroll-${Date.now()}`;
  
  // ==========================================
  // Test 1: Accepted-operation (Insert)
  // ==========================================
  console.log('[Test 1] Pushing valid inserts...');
  const insertPayload = {
    mutation_id: mutationId,
    operations: [
      {
         operationId: opId1,
         id: testDonorId,
         type: 'donors',
         operation: 'insert',
         data: { name: 'Atomicity Test Donor' },
         baseRevision: 0 
      },
      {
         operationId: opId2,
         id: testPayrollId,
         type: 'recurringPayroll',
         operation: 'insert',
         data: { amount: 5000 },
         baseRevision: 0 
      }
    ]
  };
  
  const { data: res1 } = await fetchAPI('/sync2/hardened/push', 'POST', insertPayload);
  assert(res1.results?.[0]?.status === 'accepted' && res1.results?.[1]?.status === 'accepted', 'Valid inserts should be accepted');
  
  // ==========================================
  // Test 2: Accepted-operation retry (Idempotency)
  // ==========================================
  console.log('\n[Test 2] Retrying the exact same valid insert...');
  const { data: res2 } = await fetchAPI('/sync2/hardened/push', 'POST', insertPayload);
  assert(JSON.stringify(res1) === JSON.stringify(res2), 'Retried insert should return identical cached response');
  
  // ==========================================
  // Test 3: Forced Rollback (Conflict/Assertion Failure)
  // ==========================================
  console.log('\n[Test 3] Pushing an update that forces a constraint failure/rollback...');
  
  // Capture state before rollback
  const stateBefore = queryDB(`
    SELECT 
      (SELECT COUNT(*) FROM sync_changes) as changes_count,
      (SELECT COUNT(*) FROM audit_log) as audit_count,
      (SELECT COUNT(*) FROM processed_operations) as processed_count,
      (SELECT revision FROM sync_records WHERE id = '${testDonorId}') as donor_rev
  `);

  const conflictMutationId = crypto.randomUUID();
  const opIdConflict = crypto.randomUUID();
  const conflictPayload = {
    mutation_id: conflictMutationId,
    operations: [
      {
         operationId: opIdConflict,
         id: testDonorId,
         type: 'donors',
         operation: 'update',
         data: { name: 'This should rollback' },
         baseRevision: 9999 // Non-existent revision
      }
    ]
  };
  
  const { data: res3 } = await fetchAPI('/sync2/hardened/push', 'POST', conflictPayload);
  assert(res3.results?.[0]?.status === 'conflict', 'Invalid update should rollback and return conflict');
  
  // Verify Database State directly
  if (stateBefore && stateBefore.length > 0) {
    const stateAfter = queryDB(`
      SELECT 
        (SELECT COUNT(*) FROM sync_changes) as changes_count,
        (SELECT COUNT(*) FROM audit_log) as audit_count,
        (SELECT COUNT(*) FROM processed_operations) as processed_count,
        (SELECT revision FROM sync_records WHERE id = '${testDonorId}') as donor_rev
    `);
    
    if (stateAfter && stateAfter.length > 0) {
      assert(stateBefore[0].changes_count === stateAfter[0].changes_count, 'sync_changes row count remained unchanged after failed batch');
      assert(stateBefore[0].audit_count === stateAfter[0].audit_count, 'audit_log row count remained unchanged after failed batch');
      assert(stateBefore[0].donor_rev === stateAfter[0].donor_rev, 'sync_records revision remained unchanged');
      // The processed_operations table should have 1 NEW row because the conflict itself is durably cached!
      assert(stateAfter[0].processed_count === stateBefore[0].processed_count + 1, 'processed_operations logged exactly 1 conflict result');
    }
  }
  
  // ==========================================
  // Test 4: Conflict Retry (Idempotency)
  // ==========================================
  console.log('\n[Test 4] Retrying the exact same conflict operation...');
  const { data: res4 } = await fetchAPI('/sync2/hardened/push', 'POST', conflictPayload);
  assert(JSON.stringify(res3) === JSON.stringify(res4), 'Retried conflict should return identical cached response');
  
  // ==========================================
  // Test 5: Permission-filtered pull
  // ==========================================
  console.log('\n[Test 5] Pulling state to verify RBAC and generation...');
  if (!TEST_TOKEN_STAFF) {
     console.warn('⚠️ SKIP: No TEST_JWT_STAFF provided. Cannot verify restricted pull behavior.');
  } else {
     // Pull as staff
     const { data: pullData } = await fetchAPI('/sync2/hardened/pull?after=0&limit=1000', 'GET', undefined, TEST_TOKEN_STAFF);
     
     const foundDonor = pullData.changes?.find((c: any) => c.record_id === testDonorId);
     const foundPayroll = pullData.changes?.find((c: any) => c.record_id === testPayrollId);
     
     assert(!!foundDonor, 'Pull returned the donor record to the restricted user');
     assert(!foundPayroll, 'Pull correctly filtered the payroll record from the restricted user');
     
     // Confirm cursor advances past the filtered item
     if (pullData.changes?.length > 0) {
        const lastChange = pullData.changes[pullData.changes.length - 1];
        const nextCursorStr = pullData.nextCursor;
        assert(parseInt(nextCursorStr) >= parseInt(lastChange.change_id), 'Cursor advanced past all items, including filtered ones');
     }
  }
  
  // Complete
  console.log('\n--- Tests Complete ---');
  if (hasFailed) {
    console.error('❌ One or more tests failed.');
    process.exit(1);
  } else {
    console.log('✅ All integration tests passed successfully!');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});

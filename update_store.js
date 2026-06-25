const fs = require('fs');
let code = fs.readFileSync('src/store.ts', 'utf8');

// 1. Add clientId and lastEventId to AppState
code = code.replace('interface AppState {', 'interface AppState {\n  clientId: string;\n  lastEventId: number;');

// 2. Add the pushEvent and applyRemoteEvent before useStore
const header = `
export const isRemote = { current: false };

const pushEvent = (action: string, args: any[]) => {
  if (isRemote.current) return;
  const state = useStore.getState();
  fetch('/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId: state.clientId, action, payload: args })
  }).catch(() => {});
};

export const applyRemoteEvent = (action: string, args: any[]) => {
  isRemote.current = true;
  const store = useStore.getState() as any;
  if (typeof store[action] === 'function') {
    store[action](...(Array.isArray(args) ? args : [args]));
  }
  isRemote.current = false;
};

`;
code = code.replace('export const useStore = create<AppState>()(', header + 'export const useStore = create<AppState>()(');

// 3. Add default values to Zustand initial state
code = code.replace('isRtl: false,', 'clientId: Math.random().toString(36).substr(2, 9),\n      lastEventId: 0,\n      isRtl: false,');

// 4. Inject pushEvent into all modifying methods
const methodsToWrap = [
  'addDonor', 'editDonor', 'updateDonorNotes', 'addSponsorshipDay', 'removeSponsorshipDay', 'deleteDonors',
  'addTransaction', 'updateTransaction', 'editTransaction', 'deleteTransactions',
  'addRecurring', 'toggleRecurring',
  'addFundraiser', 'payOutFundraiser', 'chargeToFundraiser',
  'addAccount', 'transferBetweenAccounts',
  'addBill', 'editBill', 'markBillPaid', 'deleteBills',
  'addTask', 'completeTask', 'deleteTask',
  'matchBankTransaction'
];

methodsToWrap.forEach(method => {
  // Case A: method: (args) => set(state => {
  const regexA = new RegExp(`\\b${method}:\\s*\\(([^)]*)\\)\\s*=>\\s*set\\(`, 'g');
  code = code.replace(regexA, (match, args) => {
    const cleanArgs = args.split(',').map(a => a.split(':')[0].trim()).filter(a => a);
    return `${method}: (${args}) => {\n        if (!isRemote.current) pushEvent('${method}', [${cleanArgs.join(', ')}]);\n        return set(`;
  });
});

// bulkAddTransactions needs chunking
const bulkRegex = /bulkAddTransactions:\s*\(([^)]*)\)\s*=>\s*set\(/;
code = code.replace(bulkRegex, `bulkAddTransactions: (txs) => {
        if (!isRemote.current) {
          for (let i = 0; i < txs.length; i += 500) {
            pushEvent('bulkAddTransactions', [txs.slice(i, i + 500)]);
          }
        }
        return set(`);

// Because we replaced `=> set(` with `=> { return set(`, we must append a closing brace `}` to the end of the method call.
// To do this simply, we find `}),\n\n      ` for the next method and insert `}`. 
// A much safer way: We can use a proper parser or just manually do it.
// Wait, `}),` -> `}); },` is very hard to blindly regex.

fs.writeFileSync('src/store.ts.temp', code);
console.log('Done');

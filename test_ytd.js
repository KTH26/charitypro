const accounts = [
  { id: '1', name: 'Travel', parentId: undefined },
  { id: '2', name: 'Gas', parentId: '1' },
  { id: '3', name: 'Office', parentId: undefined },
  { id: '4', name: 'Phone', parentId: '3' }
];
const bills = [
  { amount: 100, category: '2' }
];

const calculateYTD = (accountId) => {
  const children = accounts.filter(a => a.parentId === accountId);
  let total = bills.filter(b => b.category === accountId).reduce((s, b) => s + b.amount, 0);
  for (const child of children) {
    total += calculateYTD(child.id);
  }
  return total;
};

console.log('Travel:', calculateYTD('1'));
console.log('Gas:', calculateYTD('2'));
console.log('Office:', calculateYTD('3'));
console.log('Phone:', calculateYTD('4'));

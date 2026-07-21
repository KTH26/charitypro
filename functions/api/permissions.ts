export const ROLE_PERMISSIONS: Record<string, string[]> = {
  administrator: ['*'], // Grants all permissions
  bookkeeper: [
    'donors.read', 'donors.create', 'donors.update',
    'transactions.read', 'transactions.create', 'transactions.approve', 'transactions.reverse',
    'bills.read', 'bills.create', 'bills.approve', 'bills.mark_paid',
    'audit.read'
  ],
  donor_staff: [
    'donors.read', 'donors.create', 'donors.update',
    'transactions.read', 'transactions.create'
  ],
  payroll_manager: [
    'payroll.read', 'payroll.manage'
  ],
  fundraiser: [
    'donors.read', 'donors.create'
  ],
  read_only: [
    'donors.read', 'transactions.read', 'bills.read', 'payroll.read', 'audit.read'
  ],
  auditor: [
    'audit.read', 'reports.read'
  ]
};

export const hasPermission = (userRoles: string[], permission: string): boolean => {
  for (const role of userRoles) {
    const perms = ROLE_PERMISSIONS[role] || [];
    if (perms.includes('*') || perms.includes(permission)) {
      return true;
    }
  }
  return false;
};

// Map collections/operations to permissions
export const getRequiredPermission = (collection: string, operation: 'insert' | 'update' | 'delete'): string => {
  switch (collection) {
    case 'donors':
      if (operation === 'insert') return 'donors.create';
      if (operation === 'update') return 'donors.update';
      if (operation === 'delete') return 'donors.delete';
      break;
    case 'transactions':
    case 'pledges':
    case 'payments':
      if (operation === 'insert') return 'transactions.create';
      if (operation === 'update') return 'transactions.approve'; // Simplified for now
      if (operation === 'delete') return 'transactions.reverse';
      break;
    case 'matchedBankTransactions':
      if ((operation as string) === 'read') return 'transactions.read';
      if (operation === 'insert') return 'transactions.create';
      if (operation === 'update') return 'transactions.approve';
      if (operation === 'delete') return 'transactions.reverse';
      break;
    case 'bills':
    case 'vendors':
      if (operation === 'insert') return 'bills.create';
      if (operation === 'update') return 'bills.approve';
      if (operation === 'delete') return 'bills.approve';
      break;
    case 'payroll':
      return 'payroll.manage';
    default:
      // Other collections require administrator by default if not mapped
      return 'system.manage';
  }
  return 'system.manage';
};

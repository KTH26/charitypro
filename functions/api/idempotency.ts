export type StoredSyncRecord = {
  type: string;
  revision: number;
  data: string;
  is_deleted: number;
};

export const isOperationAlreadyApplied = (
  currentRecord: StoredSyncRecord | null | undefined,
  operation: { type: string; operation: string; data?: unknown }
): boolean => {
  if (!currentRecord || currentRecord.type !== operation.type) return false;
  if (operation.operation === 'delete') return currentRecord.is_deleted === 1;

  return currentRecord.is_deleted === 0
    && currentRecord.data === JSON.stringify(operation.data || {});
};

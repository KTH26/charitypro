import type { Pledge, Transaction, RecurringPayment } from '../store';

export const getPledgeStats = (
  p: Pledge,
  donorPledgesSorted: Pledge[], // Oldest to newest
  donorTransactions: Transaction[],
  donorRecurring: RecurringPayment[]
) => {
  const isMostRecent = p.id === donorPledgesSorted[donorPledgesSorted.length - 1]?.id;
  
  const idx = donorPledgesSorted.findIndex(x => x.id === p.id);
  const start = new Date(p.date + 'T00:00:00Z');
  const end = idx + 1 < donorPledgesSorted.length
    ? new Date(donorPledgesSorted[idx + 1].date + 'T00:00:00Z')
    : new Date('2099-12-31T00:00:00Z');

  const paid = donorTransactions
    .filter(t => t.type === 'approved' && !t.isBatch)
    .filter(t => {
      if (t.pledgeId === p.id) return true;
      if (t.pledgeId && t.pledgeId !== p.id) return false;
      const d = new Date(t.date + 'T00:00:00Z');
      return d >= start && d < end;
    })
    .reduce((sum, t) => sum + (t.amountCAD ?? t.amount), 0);

  const amount = p.amountCAD ?? p.amount;

  const schedules = donorRecurring.filter(r => r.pledgeId === p.id && r.active);
  if (isMostRecent && schedules.length === 0) {
    schedules.push(...donorRecurring.filter(r => r.active && !r.pledgeId));
  }

  let scheduled = 0;
  for (const schedule of schedules) {
    if (schedule && schedule.amount > 0) {
      const projectionEnd = new Date(start);
      projectionEnd.setUTCFullYear(projectionEnd.getUTCFullYear() + 1);
      let periodEnd = projectionEnd < end ? projectionEnd : end;
      
      if (schedule.endDate) {
        const schedEnd = new Date(schedule.endDate + 'T23:59:59Z');
        if (schedEnd < periodEnd) periodEnd = schedEnd;
      }

      let scheduledFuture = 0;
      let d = new Date(schedule.nextDate + 'T00:00:00Z');

      // If nextDate is somehow after periodEnd, it won't enter the loop.
      while (d < periodEnd) {
        scheduledFuture += (schedule.amountCAD ?? schedule.amount);

        if (schedule.frequency === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1);
        else if (schedule.frequency === 'weekly') d.setUTCDate(d.getUTCDate() + 7);
        else if (schedule.frequency === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
        else d.setUTCMonth(d.getUTCMonth() + 3);
      }

      scheduled += scheduledFuture;
    }
  }

  const balance = amount - paid - scheduled;
  return { amount, paid, scheduled, balance };
};

import { randomBytes } from 'crypto';

/** Generate a cuid2-style random ID (25 chars, starts with letter) */
export function generateId(): string {
  const prefix = String.fromCharCode(97 + Math.floor(Math.random() * 26));
  return prefix + randomBytes(12).toString('base64url').slice(0, 24);
}

/** Safely convert a decimal column string to number */
export function toNum(v: unknown): number {
  return Number(v) || 0;
}

/** Build a monthly income figure from an income array */
export function calcMonthlyIncome(
  incomes: Array<{ amount: unknown; frequency: string }>,
): number {
  return incomes.reduce((s, i) => {
    const a = toNum(i.amount);
    if (i.frequency === 'MONTHLY')   return s + a;
    if (i.frequency === 'WEEKLY')    return s + (a * 52) / 12;
    if (i.frequency === 'BIWEEKLY') return s + (a * 26) / 12;
    if (i.frequency === 'ANNUAL')   return s + a / 12;
    if (i.frequency === 'ONE_TIME') return s; // one-time isn't recurring monthly
    return s + a;
  }, 0);
}

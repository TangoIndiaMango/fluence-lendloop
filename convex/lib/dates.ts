const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's date in UTC as YYYY-MM-DD. */
export function todayUtc(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / DAY_MS);
}

export function addDays(date: string, days: number): string {
  const d = Date.parse(`${date}T00:00:00Z`) + days * DAY_MS;
  return new Date(d).toISOString().slice(0, 10);
}

/** Inclusive date ranges overlap. String comparison works for YYYY-MM-DD. */
export function rangesOverlap(
  a: { startDate: string; endDate: string },
  b: { startDate: string; endDate: string },
): boolean {
  return a.startDate <= b.endDate && b.startDate <= a.endDate;
}

export function fmt(n: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

export function fmtCompact(n: number): string {
  if (n >= 100_000) return `${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0] || "th");
}

export function pluralize(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** Clamp a number between min and max */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Format a percentage with one decimal place */
export function fmtPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** Return "N/A" for null/undefined numbers, otherwise format them */
export function fmtOrNA(n: number | null | undefined, currency = "INR"): string {
  if (n == null) return "N/A";
  return fmt(n, currency);
}

/** Convert ISO date string to a short readable label e.g. "Jun 28" */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { month: "short", day: "numeric" });
}

/** Number of months between two dates */
export function monthsBetween(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

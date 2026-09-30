export function money(n: number | null | undefined, signed = true): string {
  if (n == null || !isFinite(n)) return "—";
  const s = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signed) return `$${s}`;
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}$${s}`;
}

export const pct = (n: number | null | undefined, digits = 1) => (n == null || !isFinite(n) ? "—" : `${(n * 100).toFixed(digits)}%`);

export const pnlClass = (n: number | null | undefined) => (n == null ? "" : n > 0 ? "text-win" : n < 0 ? "text-loss" : "text-muted");

export const num = (n: number | null | undefined, digits = 2) => (n == null || !isFinite(n) ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: digits }));

import Link from "next/link";
import type { DayPnl } from "@/lib/stats";
import { money } from "@/lib/format";

const HEAD = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function shift(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function PnlCalendar({ days, month }: { days: DayPnl[]; month: string }) {
  const byDay = new Map(days.map((d) => [d.day, d]));
  const [y, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: total }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  while (cells.length % 7) cells.push(null);
  const monthPnl = days.filter((d) => d.day.startsWith(month)).reduce((a, d) => a + d.pnl, 0);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <Link className="btn-ghost" href={`/?month=${shift(month, -1)}`} aria-label="Mes anterior">←</Link>
        <div className="text-sm">
          <span className="font-medium">{MONTHS[m - 1]} {y}</span>
          <span className={`ml-2 ${monthPnl > 0 ? "text-win" : monthPnl < 0 ? "text-loss" : "text-muted"}`}>{money(monthPnl)}</span>
        </div>
        <Link className="btn-ghost" href={`/?month=${shift(month, 1)}`} aria-label="Mes siguiente">→</Link>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {HEAD.map((h) => (
          <div key={h} className="py-1 text-muted">{h}</div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const d = byDay.get(c);
          const tone = !d ? "border-line/50 text-muted" : d.pnl > 0 ? "border-win/40 bg-win/10" : d.pnl < 0 ? "border-loss/40 bg-loss/10" : "border-line";
          return (
            <Link
              key={i}
              href={d ? `/trades?day=${c}` : "#"}
              className={`flex min-h-[64px] flex-col items-start justify-between rounded-lg border p-1.5 text-left ${tone}`}
            >
              <span className="text-[11px] text-muted">{Number(c.slice(8))}</span>
              {d && (
                <span className="w-full">
                  <span className={`block text-[12px] font-medium ${d.pnl > 0 ? "text-win" : d.pnl < 0 ? "text-loss" : ""}`}>{money(d.pnl)}</span>
                  <span className="block text-[10px] text-muted">{d.trades} trades</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone ?? ""}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-muted">{sub}</div>}
    </div>
  );
}

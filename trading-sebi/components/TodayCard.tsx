import Link from "next/link";
import type { TodayStatus } from "@/lib/stats";
import { money, pnlClass } from "@/lib/format";

/** Tarjeta de "hoy": P&L del día contra el límite diario de pérdida y el objetivo. */
export function TodayCard({ t, dll, target }: { t: TodayStatus; dll: number | null; target: number | null }) {
  const tone =
    t.level === "stop" ? "border-loss/60 bg-loss/10" : t.level === "warn" ? "border-amber-500/50 bg-amber-500/10" : "border-line";
  const msg =
    t.level === "stop"
      ? "Cerca del límite diario: frená por hoy."
      : t.level === "warn"
        ? "Ya usaste la mitad del límite diario. Bajá el tamaño o pará."
        : target && t.pnl >= target
          ? "Objetivo del día cumplido. Proteger lo ganado."
          : null;
  return (
    <div className={`card ${tone}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="label">Hoy · {t.day.slice(8)}/{t.day.slice(5, 7)}</div>
        <Link href={`/journal?day=${t.day}`} className="text-xs text-accent hover:underline">Journal del día →</Link>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <span className={`text-3xl font-semibold ${pnlClass(t.pnl)}`}>{money(t.pnl)}</span>
        <span className="text-sm text-muted">{t.trades} trades · {t.wins} ganadores</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {dll != null && (
          <Bar
            label={`Límite diario ${money(dll, false)}`}
            right={`quedan ${money(t.dllRemaining, false)}`}
            pct={t.dllUsedPct ?? 0}
            color={t.level === "stop" ? "bg-loss" : t.level === "warn" ? "bg-amber-500" : "bg-slate-500"}
          />
        )}
        {target != null && <Bar label={`Objetivo ${money(target, false)}`} right={`${Math.round((t.targetPct ?? 0) * 100)}%`} pct={t.targetPct ?? 0} color="bg-win" />}
      </div>
      {msg && <p className={`mt-3 text-sm ${t.level === "ok" ? "text-win" : t.level === "warn" ? "text-amber-400" : "text-loss"}`}>{msg}</p>}
    </div>
  );
}

function Bar({ label, right, pct, color }: { label: string; right: string; pct: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-muted">
        <span>{label}</span>
        <span>{right}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(1, pct)) * 100}%` }} />
      </div>
    </div>
  );
}

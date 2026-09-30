import Link from "next/link";
import { getTrades } from "@/lib/db";
import { DISPLAY_TZ, TRADING_TZ } from "@/lib/supabase";
import { pnlOf, rMultiple, computeStats } from "@/lib/stats";
import { durationLabel, formatDateTime, tradingDay } from "@/lib/time";
import { money, num, pct, pnlClass } from "@/lib/format";

export const dynamic = "force-dynamic";

type SP = { day?: string; symbol?: string; setup?: string; result?: string };

export default async function TradesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const all = await getTrades();
  const symbols = [...new Set(all.map((t) => t.symbol))].sort();
  const setups = [...new Set(all.map((t) => t.journal?.setup).filter(Boolean) as string[])].sort();

  const trades = all.filter((t) => {
    if (sp.day && tradingDay(t.closed_at ?? t.opened_at, TRADING_TZ) !== sp.day) return false;
    if (sp.symbol && t.symbol !== sp.symbol) return false;
    if (sp.setup && (t.journal?.setup ?? "") !== sp.setup) return false;
    if (sp.result === "win" && !(t.closed_at && pnlOf(t) > 0)) return false;
    if (sp.result === "loss" && !(t.closed_at && pnlOf(t) < 0)) return false;
    if (sp.result === "open" && t.closed_at) return false;
    return true;
  });
  const s = computeStats(trades);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Trades</h1>
          <p className="text-sm text-muted">
            {trades.length} trades · <span className={pnlClass(s.netPnl)}>{money(s.netPnl)}</span> · win rate {pct(s.winRate)}
          </p>
        </div>
        <form className="flex flex-wrap gap-2" method="get">
          <input className="input w-auto" type="date" name="day" defaultValue={sp.day} />
          <select className="input w-auto" name="symbol" defaultValue={sp.symbol ?? ""}>
            <option value="">Todos los símbolos</option>
            {symbols.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="input w-auto" name="setup" defaultValue={sp.setup ?? ""}>
            <option value="">Todos los setups</option>
            {setups.map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className="input w-auto" name="result" defaultValue={sp.result ?? ""}>
            <option value="">Todos</option>
            <option value="win">Ganadores</option>
            <option value="loss">Perdedores</option>
            <option value="open">Abiertos</option>
          </select>
          <button className="btn">Filtrar</button>
          <Link href="/trades" className="btn-ghost">Limpiar</Link>
        </form>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="table min-w-[880px]">
          <thead>
            <tr>
              <th>Apertura</th>
              <th>Símbolo</th>
              <th>Lado</th>
              <th className="text-right">Contr.</th>
              <th className="text-right">Entrada</th>
              <th className="text-right">Salida</th>
              <th>Duración</th>
              <th className="text-right">P&L neto</th>
              <th className="text-right">R</th>
              <th>Setup</th>
            </tr>
          </thead>
          <tbody>
            {trades.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-muted">No hay trades con estos filtros.</td></tr>
            )}
            {trades.map((t) => {
              const r = rMultiple(t);
              return (
                <tr key={t.id} className="hover:bg-line/40">
                  <td><Link href={`/trades/${encodeURIComponent(t.id)}`} className="text-accent hover:underline">{formatDateTime(t.opened_at, DISPLAY_TZ)}</Link></td>
                  <td>{t.symbol}</td>
                  <td className={t.direction === "long" ? "text-win" : "text-loss"}>{t.direction === "long" ? "Long" : "Short"}</td>
                  <td className="text-right">{num(t.max_qty, 0)}</td>
                  <td className="text-right">{num(t.avg_entry)}</td>
                  <td className="text-right">{num(t.avg_exit)}</td>
                  <td>{durationLabel(t.opened_at, t.closed_at)}</td>
                  <td className={`text-right font-medium ${pnlClass(t.closed_at ? pnlOf(t) : null)}`}>{t.closed_at ? money(pnlOf(t)) : "abierto"}</td>
                  <td className="text-right">{r == null ? "—" : r.toFixed(2)}</td>
                  <td className="text-muted">{t.journal?.setup ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

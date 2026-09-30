import Link from "next/link";
import { accountRules, getAccounts, getRules, getTrades } from "@/lib/db";
import { TRADING_TZ, DISPLAY_TZ } from "@/lib/supabase";
import { byHour, computeStats, dailyPnl, equityCurve, groupBy, rulesImpact, todayStatus, weekdayOf, WEEKDAYS, type GroupRow } from "@/lib/stats";
import { tradingDay } from "@/lib/time";
import { money, pct, pnlClass } from "@/lib/format";
import { EquityChart, PnlBars } from "@/components/Charts";
import { PnlCalendar, Stat } from "@/components/Calendar";
import { AccountPicker } from "@/components/AccountPicker";
import { TodayCard } from "@/components/TodayCard";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ month?: string; account?: string; range?: string }> }) {
  const sp = await searchParams;
  const accounts = await getAccounts();
  const accountId = sp.account || undefined;
  let trades = await getTrades(accountId);
  const acc = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const rules = acc ? accountRules(acc) : null;
  const today = todayStatus(trades, TRADING_TZ, rules?.daily_loss_limit, rules?.daily_profit_target);
  const activeRules = await getRules();

  const range = sp.range ?? "all";
  if (range !== "all") {
    const daysBack = Number(range);
    const cutoff = tradingDay(new Date(Date.now() - daysBack * 864e5), TRADING_TZ);
    trades = trades.filter((t) => t.closed_at && tradingDay(t.closed_at, TRADING_TZ) >= cutoff);
  }

  const stats = computeStats(trades);
  const days = dailyPnl(trades, TRADING_TZ);
  const curve = equityCurve(days);
  const month = sp.month ?? (days.at(-1)?.day ?? tradingDay(new Date(), TRADING_TZ)).slice(0, 7);
  const bySetup = groupBy(trades, (t) => t.journal?.setup || "Sin setup");
  const bySymbol = groupBy(trades, (t) => t.symbol);
  const byWeekday = groupBy(trades, (t) => weekdayOf(tradingDay(t.closed_at!, TRADING_TZ)), WEEKDAYS);
  const hours = byHour(trades, DISPLAY_TZ);
  const openTrades = trades.filter((t) => !t.closed_at).length;
  const impact = rulesImpact(trades, activeRules.map((r) => r.text));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Dashboard</h1>
        <AccountPicker accounts={accounts.map((a) => ({ id: a.id, name: a.label || a.name }))} current={accountId} range={range} />
      </div>

      {accounts.length === 0 && (
        <div className="card text-sm">
          Todavía no hay trades. Instalá la extensión o <Link href="/import" className="text-accent underline">importá un CSV de Tradovate</Link>.
        </div>
      )}

      <TodayCard t={today} dll={rules?.daily_loss_limit ?? null} target={rules?.daily_profit_target ?? null} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="P&L neto" value={money(stats.netPnl)} tone={pnlClass(stats.netPnl)} sub={`${stats.trades} trades cerrados${openTrades ? ` · ${openTrades} abiertos` : ""}`} />
        <Stat label="Win rate" value={pct(stats.winRate)} sub={`${stats.wins} ganadores · ${stats.losses} perdedores`} />
        <Stat label="Profit factor" value={stats.profitFactor == null ? "—" : stats.profitFactor.toFixed(2)} sub={`Expectancy ${money(stats.expectancy)} por trade`} />
        <Stat label="Promedio gan. / perd." value={`${money(stats.avgWin, false)} / ${money(stats.avgLoss, false)}`} sub={stats.avgR == null ? "Cargá el stop para ver R" : `R promedio ${stats.avgR.toFixed(2)}`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="card lg:col-span-3">
          <div className="label mb-2">P&L acumulado</div>
          <EquityChart data={curve} />
          <div className="label mb-2 mt-4">P&L por día</div>
          <PnlBars data={days} xKey="day" height={180} />
        </div>
        <div className="card lg:col-span-2">
          <PnlCalendar days={days} month={month} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <div className="label mb-2">Por hora de entrada (hora Argentina)</div>
          <PnlBars data={hours} xKey="key" height={200} />
        </div>
        <div className="card">
          <div className="label mb-2">Por día de la semana</div>
          <PnlBars data={byWeekday} xKey="key" height={200} />
        </div>
      </div>

      <div className="card">
        <div className="label mb-2">¿Cumplir tus reglas paga?</div>
        {impact.checked === 0 ? (
          <p className="text-sm text-muted">Marcá el checklist de reglas en tus trades y acá vas a ver la diferencia en win rate y P&L.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <ImpactBox title="Cumpliendo todas" d={impact.follow} good />
            <ImpactBox title="Rompiendo alguna" d={impact.broke} />
          </div>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <GroupTable title="Por setup" rows={bySetup} />
        <GroupTable title="Por símbolo" rows={bySymbol} />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Mejor trade" value={money(stats.bestTrade)} tone={pnlClass(stats.bestTrade)} />
        <Stat label="Peor trade" value={money(stats.worstTrade)} tone={pnlClass(stats.worstTrade)} />
        <Stat label="Racha ganadora máx." value={String(stats.maxWinStreak)} />
        <Stat label="Racha perdedora máx." value={String(stats.maxLossStreak)} />
      </div>
    </div>
  );
}

function GroupTable({ title, rows }: { title: string; rows: GroupRow[] }) {
  return (
    <div className="card overflow-x-auto">
      <div className="label mb-2">{title}</div>
      <table className="table">
        <thead>
          <tr>
            <th></th>
            <th className="text-right">Trades</th>
            <th className="text-right">Win rate</th>
            <th className="text-right">P&L</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="text-muted">Sin datos</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.key}>
              <td>{r.key}</td>
              <td className="text-right">{r.trades}</td>
              <td className="text-right">{pct(r.winRate, 0)}</td>
              <td className={`text-right ${pnlClass(r.pnl)}`}>{money(r.pnl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ImpactBox({ title, d, good }: { title: string; d: { trades: number; pnl: number; winRate: number; avg: number }; good?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${good ? "border-win/30" : "border-loss/30"}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="mt-1 text-sm text-muted">
        {d.trades} trades · win rate {pct(d.winRate, 0)} · promedio <span className={pnlClass(d.avg)}>{money(d.avg)}</span>
      </div>
      <div className={`mt-1 text-lg font-semibold ${pnlClass(d.pnl)}`}>{money(d.pnl)}</div>
    </div>
  );
}

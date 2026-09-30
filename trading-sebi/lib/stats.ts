import { hourIn, tradingDay } from "./time";

export type TradeRow = {
  id: string;
  account_id: string;
  symbol: string;
  direction: "long" | "short";
  opened_at: string;
  closed_at: string | null;
  max_qty: number;
  avg_entry: number;
  avg_exit: number | null;
  gross_pnl: number;
  commissions: number;
  net_pnl: number;
  execution_ids: string[];
  journal?: {
    setup: string | null;
    notes: string | null;
    mistakes: string[];
    emotion: string | null;
    rating: number | null;
    planned_stop: number | null;
    planned_target: number | null;
    pnl_override: number | null;
    screenshots: string[];
  } | null;
};

export const pnlOf = (t: TradeRow) => (t.journal?.pnl_override ?? null) ?? t.net_pnl;

/** R múltiple: P&L en puntos dividido por el riesgo planeado (entrada - stop). */
export function rMultiple(t: TradeRow): number | null {
  const stop = t.journal?.planned_stop;
  if (stop == null || t.avg_exit == null) return null;
  const risk = Math.abs(t.avg_entry - stop);
  if (risk === 0) return null;
  const move = (t.avg_exit - t.avg_entry) * (t.direction === "long" ? 1 : -1);
  return Math.round((move / risk) * 100) / 100;
}

export type Stats = {
  trades: number;
  wins: number;
  losses: number;
  breakeven: number;
  winRate: number;
  netPnl: number;
  grossWin: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number | null;
  expectancy: number;
  avgR: number | null;
  bestTrade: number;
  worstTrade: number;
  maxWinStreak: number;
  maxLossStreak: number;
};

export function computeStats(trades: TradeRow[]): Stats {
  const closed = trades.filter((t) => t.closed_at);
  const pnls = closed.map(pnlOf);
  const wins = pnls.filter((p) => p > 0);
  const losses = pnls.filter((p) => p < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const rs = closed.map(rMultiple).filter((r): r is number => r != null);

  let streakW = 0, streakL = 0, maxW = 0, maxL = 0;
  const chrono = [...closed].sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!));
  for (const t of chrono) {
    const p = pnlOf(t);
    if (p > 0) { streakW++; streakL = 0; } else if (p < 0) { streakL++; streakW = 0; } else { streakW = 0; streakL = 0; }
    maxW = Math.max(maxW, streakW);
    maxL = Math.max(maxL, streakL);
  }

  const n = closed.length;
  return {
    trades: n,
    wins: wins.length,
    losses: losses.length,
    breakeven: n - wins.length - losses.length,
    winRate: n ? wins.length / n : 0,
    netPnl: pnls.reduce((a, b) => a + b, 0),
    grossWin,
    grossLoss,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? grossLoss / losses.length : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    expectancy: n ? pnls.reduce((a, b) => a + b, 0) / n : 0,
    avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null,
    bestTrade: pnls.length ? Math.max(...pnls) : 0,
    worstTrade: pnls.length ? Math.min(...pnls) : 0,
    maxWinStreak: maxW,
    maxLossStreak: maxL,
  };
}

export type DayPnl = { day: string; pnl: number; trades: number };

export function dailyPnl(trades: TradeRow[], tz: string): DayPnl[] {
  const map = new Map<string, DayPnl>();
  for (const t of trades) {
    if (!t.closed_at) continue;
    const day = tradingDay(t.closed_at, tz);
    const d = map.get(day) ?? { day, pnl: 0, trades: 0 };
    d.pnl += pnlOf(t);
    d.trades++;
    map.set(day, d);
  }
  return [...map.values()]
    .map((d) => ({ ...d, pnl: Math.round(d.pnl * 100) / 100 }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function equityCurve(days: DayPnl[], start = 0) {
  let acc = start;
  return days.map((d) => {
    acc += d.pnl;
    return { day: d.day, equity: Math.round(acc * 100) / 100, pnl: d.pnl };
  });
}

export type GroupRow = { key: string; trades: number; pnl: number; winRate: number };

export function groupBy(trades: TradeRow[], keyFn: (t: TradeRow) => string, order?: string[]): GroupRow[] {
  const map = new Map<string, TradeRow[]>();
  for (const t of trades) {
    if (!t.closed_at) continue;
    const k = keyFn(t);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(t);
  }
  const rows = [...map.entries()].map(([key, list]) => {
    const pnls = list.map(pnlOf);
    return {
      key,
      trades: list.length,
      pnl: Math.round(pnls.reduce((a, b) => a + b, 0) * 100) / 100,
      winRate: pnls.filter((p) => p > 0).length / list.length,
    };
  });
  if (order) return rows.sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  return rows.sort((a, b) => b.pnl - a.pnl);
}

export const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

export function weekdayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`).getUTCDay();
  return WEEKDAYS[(d + 6) % 7];
}

export const byHour = (trades: TradeRow[], tz: string) =>
  groupBy(trades, (t) => `${String(hourIn(t.opened_at, tz)).padStart(2, "0")}h`).sort((a, b) => a.key.localeCompare(b.key));

// ---------- Reglas de la cuenta Apex ----------

export type AccountRules = {
  starting_balance: number;
  drawdown_amount: number;
  drawdown_type: string;
  consistency_pct: number;
  min_trading_days: number;
};

export type ApexStatus = {
  balance: number;
  profit: number;
  peakBalance: number;
  liquidation: number;
  distanceToLiquidation: number;
  trailingLocked: boolean;
  tradingDays: number;
  profitableDays: number;
  bestDay: DayPnl | null;
  bestDayPct: number | null;
  consistencyOk: boolean;
  profitNeededForConsistency: number;
};

/**
 * Estado aproximado de la cuenta con las reglas de Apex. Ojo: con trailing intradía,
 * Apex sigue el pico incluyendo ganancias NO realizadas. Acá solo vemos P&L realizado,
 * así que el umbral real puede estar más alto que el que mostramos.
 */
export function apexStatus(days: DayPnl[], trades: TradeRow[], rules: AccountRules): ApexStatus {
  const start = rules.starting_balance;
  let balance = start;
  let peak = start;
  const chrono = trades.filter((t) => t.closed_at).sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!));

  if (rules.drawdown_type === "eod_trail") {
    for (const d of days) {
      balance += d.pnl;
      peak = Math.max(peak, balance);
    }
  } else {
    for (const t of chrono) {
      balance += pnlOf(t);
      if (rules.drawdown_type !== "static") peak = Math.max(peak, balance);
    }
  }

  const lockLevel = start + 100;
  const trailing = peak - rules.drawdown_amount;
  const liquidation = rules.drawdown_type === "static" ? start - rules.drawdown_amount : Math.min(trailing, lockLevel);
  const profit = balance - start;
  const best = days.reduce<DayPnl | null>((b, d) => (d.pnl > (b?.pnl ?? 0) ? d : b), null);
  const bestDayPct = best && profit > 0 ? (best.pnl / profit) * 100 : null;
  const consistencyOk = bestDayPct == null ? true : bestDayPct <= rules.consistency_pct;
  const profitNeeded = best ? Math.max(0, best.pnl / (rules.consistency_pct / 100) - profit) : 0;

  return {
    balance: Math.round(balance * 100) / 100,
    profit: Math.round(profit * 100) / 100,
    peakBalance: Math.round(peak * 100) / 100,
    liquidation: Math.round(liquidation * 100) / 100,
    distanceToLiquidation: Math.round((balance - liquidation) * 100) / 100,
    trailingLocked: rules.drawdown_type !== "static" && trailing >= lockLevel,
    tradingDays: days.length,
    profitableDays: days.filter((d) => d.pnl > 0).length,
    bestDay: best,
    bestDayPct: bestDayPct == null ? null : Math.round(bestDayPct * 10) / 10,
    consistencyOk,
    profitNeededForConsistency: Math.round(profitNeeded * 100) / 100,
  };
}

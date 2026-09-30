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
    rules_followed?: string[];
    rules_checked?: boolean;
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
// Por defecto: Apex 4.0, cuenta 50K EOD en PA (reglas publicadas en abril 2026).
// Todo es configurable desde la pantalla Cuenta Apex por si Apex cambia algo.

export type AccountRules = {
  starting_balance: number;
  drawdown_amount: number;
  drawdown_type: string; // eod_trail | intraday_trail | static
  consistency_pct: number;
  min_trading_days: number; // días calificados mínimos para pedir payout
  daily_loss_limit?: number | null;
  daily_profit_target?: number | null;
  min_day_profit?: number | null; // ganancia mínima para que un día califique
  min_payout?: number | null;
  payouts_taken?: number | null;
  last_payout_at?: string | null; // yyyy-mm-dd; la consistencia se mide desde acá
};

export const PAYOUT_CAPS_50K = [1500, 1500, 2000, 2500, 2500, 3000];

/** Límite de contratos (minis; 1 mini = 10 micros) según el profit de la cuenta 50K. */
export function contractLimit50k(profit: number): number {
  if (profit < 1500) return 2;
  if (profit < 3000) return 3;
  return 4;
}

export type ApexStatus = {
  balance: number;
  profit: number;
  peakBalance: number;
  liquidation: number;
  distanceToLiquidation: number;
  trailingLocked: boolean;
  safetyNet: number;
  minPayoutBalance: number;
  tradingDays: number;
  profitableDays: number;
  qualifyingDays: number;
  bestDay: DayPnl | null;
  bestDayPct: number | null;
  consistencyOk: boolean;
  profitNeededForConsistency: number;
  cycleProfit: number;
  payoutEligible: boolean;
  payoutMissing: string[];
  payoutCap: number;
  maxPayoutNow: number;
  contractLimit: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function apexStatus(days: DayPnl[], trades: TradeRow[], rules: AccountRules): ApexStatus {
  const start = rules.starting_balance;
  const dd = rules.drawdown_amount;
  const lockLevel = start + 100;
  let balance = start;
  let peak = start;

  if (rules.drawdown_type === "eod_trail") {
    // El umbral solo sube con el balance de CIERRE de cada día.
    for (const d of days) {
      balance += d.pnl;
      peak = Math.max(peak, balance);
    }
  } else {
    const chrono = trades.filter((t) => t.closed_at).sort((a, b) => Date.parse(a.closed_at!) - Date.parse(b.closed_at!));
    for (const t of chrono) {
      balance += pnlOf(t);
      if (rules.drawdown_type !== "static") peak = Math.max(peak, balance);
    }
  }

  const trailing = peak - dd;
  const liquidation = rules.drawdown_type === "static" ? start - dd : Math.min(trailing, lockLevel);
  const profit = balance - start;
  const safetyNet = start + dd + 100;
  const minPayout = rules.min_payout ?? 500;
  const minPayoutBalance = safetyNet + minPayout;

  // Ciclo actual: desde el último payout.
  const cycle = rules.last_payout_at ? days.filter((d) => d.day > rules.last_payout_at!) : days;
  const cycleProfit = cycle.reduce((a, d) => a + d.pnl, 0);
  const minDay = rules.min_day_profit ?? 250;
  const qualifyingDays = cycle.filter((d) => d.pnl >= minDay).length;
  const best = cycle.reduce<DayPnl | null>((b, d) => (d.pnl > (b?.pnl ?? 0) ? d : b), null);
  const bestDayPct = best && cycleProfit > 0 ? (best.pnl / cycleProfit) * 100 : null;
  const consistencyOk = bestDayPct == null ? true : bestDayPct <= rules.consistency_pct;
  const profitNeeded = best ? Math.max(0, best.pnl / (rules.consistency_pct / 100) - cycleProfit) : 0;

  const payoutCap = PAYOUT_CAPS_50K[Math.min(rules.payouts_taken ?? 0, PAYOUT_CAPS_50K.length - 1)];
  const maxPayoutNow = Math.max(0, Math.min(payoutCap, balance - safetyNet));

  const missing: string[] = [];
  if (qualifyingDays < rules.min_trading_days)
    missing.push(`${rules.min_trading_days - qualifyingDays} día(s) más con +$${minDay} o más`);
  if (!consistencyOk) missing.push(`consistencia: tu mejor día pesa ${Math.round(bestDayPct!)}% (máx. ${rules.consistency_pct}%)`);
  if (balance < minPayoutBalance) missing.push(`$${r2(minPayoutBalance - balance).toLocaleString("en-US")} más de balance (mínimo $${minPayoutBalance.toLocaleString("en-US")})`);

  return {
    balance: r2(balance),
    profit: r2(profit),
    peakBalance: r2(peak),
    liquidation: r2(liquidation),
    distanceToLiquidation: r2(balance - liquidation),
    trailingLocked: rules.drawdown_type !== "static" && trailing >= lockLevel,
    safetyNet,
    minPayoutBalance,
    tradingDays: days.length,
    profitableDays: days.filter((d) => d.pnl > 0).length,
    qualifyingDays,
    bestDay: best,
    bestDayPct: bestDayPct == null ? null : Math.round(bestDayPct * 10) / 10,
    consistencyOk,
    profitNeededForConsistency: r2(profitNeeded),
    cycleProfit: r2(cycleProfit),
    payoutEligible: missing.length === 0,
    payoutMissing: missing,
    payoutCap,
    maxPayoutNow: r2(maxPayoutNow),
    contractLimit: contractLimit50k(profit),
  };
}

export type TodayStatus = {
  day: string;
  pnl: number;
  trades: number;
  wins: number;
  dllRemaining: number | null;
  dllUsedPct: number | null;
  targetPct: number | null;
  level: "ok" | "warn" | "stop";
};

/** P&L de hoy contra el límite diario de pérdida (DLL) y el objetivo. */
export function todayStatus(trades: TradeRow[], tz: string, dll?: number | null, target?: number | null, now = new Date()): TodayStatus {
  const day = tradingDay(now, tz);
  const list = trades.filter((t) => t.closed_at && tradingDay(t.closed_at, tz) === day);
  const pnl = r2(list.reduce((a, t) => a + pnlOf(t), 0));
  const loss = Math.max(0, -pnl);
  const dllUsedPct = dll ? Math.min(1, loss / dll) : null;
  const level = dllUsedPct == null ? "ok" : dllUsedPct >= 0.8 ? "stop" : dllUsedPct >= 0.5 ? "warn" : "ok";
  return {
    day,
    pnl,
    trades: list.length,
    wins: list.filter((t) => pnlOf(t) > 0).length,
    dllRemaining: dll ? r2(dll - loss) : null,
    dllUsedPct,
    targetPct: target && pnl > 0 ? Math.min(1, pnl / target) : target ? 0 : null,
    level,
  };
}

/** Win rate y P&L separando trades donde cumpliste todas tus reglas y donde no. */
export const followedAll = (t: TradeRow, activeRules: string[]) =>
  activeRules.every((r) => (t.journal?.rules_followed ?? []).includes(r));

export function rulesImpact(trades: TradeRow[], activeRules: string[]) {
  const checked = trades.filter((t) => t.closed_at && t.journal?.rules_checked);
  const follow = checked.filter((t) => followedAll(t, activeRules));
  const broke = checked.filter((t) => !followedAll(t, activeRules));
  const agg = (l: TradeRow[]) => ({
    trades: l.length,
    pnl: r2(l.reduce((a, t) => a + pnlOf(t), 0)),
    winRate: l.length ? l.filter((t) => pnlOf(t) > 0).length / l.length : 0,
    avg: l.length ? r2(l.reduce((a, t) => a + pnlOf(t), 0) / l.length) : 0,
  });
  return { checked: checked.length, follow: agg(follow), broke: agg(broke) };
}

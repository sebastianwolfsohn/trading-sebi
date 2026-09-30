import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTrades, type Execution } from "../lib/tradeBuilder";
import { symbolRoot, normalizeSymbol, type Instrument } from "../lib/instruments";
import { parseTradovateCsv } from "../lib/csv";
import { tradingDay, parseBrokerDate } from "../lib/time";
import { computeStats, dailyPnl, apexStatus, todayStatus, type TradeRow } from "../lib/stats";

const inst = new Map<string, Instrument>([
  ["MNQ", { root: "MNQ", point_value: 2, tick_size: 0.25, commission_per_side: 0.5 }],
  ["NQ", { root: "NQ", point_value: 20, tick_size: 0.25, commission_per_side: 2 }],
]);

let n = 0;
const ex = (side: "buy" | "sell", qty: number, price: number, t: string, symbol = "MNQZ6"): Execution => ({
  id: `e${String(++n).padStart(3, "0")}`,
  account_id: "acc",
  symbol,
  side,
  qty,
  price,
  commission: null,
  executed_at: `2026-09-29T${t}:00.000Z`,
});

test("símbolos", () => {
  assert.equal(symbolRoot("MNQZ6"), "MNQ");
  assert.equal(symbolRoot("NQZ6"), "NQ");
  assert.equal(symbolRoot("ESZ2026"), "ES");
  assert.equal(symbolRoot("M2KZ6"), "M2K");
  assert.equal(normalizeSymbol("CME_MINI:MNQZ2026"), "MNQZ6");
  assert.equal(normalizeSymbol("MNQZ6"), "MNQ" + "Z6");
});

test("long simple con comisión", () => {
  const [t] = buildTrades([ex("buy", 2, 20000, "14:00"), ex("sell", 2, 20010, "14:05")], inst);
  assert.equal(t.direction, "long");
  assert.equal(t.gross_pnl, 40); // 10 pts * 2 contratos * $2
  assert.equal(t.commissions, 2); // 4 lados * $0.5
  assert.equal(t.net_pnl, 38);
  assert.equal(t.max_qty, 2);
  assert.ok(t.closed_at);
});

test("short con salidas parciales y promedio", () => {
  const [t] = buildTrades(
    [ex("sell", 1, 20000, "14:00"), ex("sell", 1, 20010, "14:01"), ex("buy", 1, 19990, "14:02"), ex("buy", 1, 19980, "14:03")],
    inst,
  );
  assert.equal(t.direction, "short");
  assert.equal(t.avg_entry, 20005);
  assert.equal(t.avg_exit, 19985);
  assert.equal(t.gross_pnl, 80); // (15 + 25) pts * $2
  assert.equal(t.max_qty, 2);
});

test("vuelta de posición parte el trade en dos", () => {
  const trades = buildTrades([ex("buy", 2, 100, "14:00", "NQZ6"), ex("sell", 3, 110, "14:01", "NQZ6"), ex("buy", 1, 105, "14:02", "NQZ6")], inst);
  assert.equal(trades.length, 2);
  const [second, first] = trades; // ordenados del más nuevo al más viejo
  assert.equal(first.direction, "long");
  assert.equal(first.gross_pnl, 400); // 10 pts * 2 * $20
  assert.equal(second.direction, "short");
  assert.equal(second.gross_pnl, 100); // 5 pts * 1 * $20
  assert.notEqual(first.id, second.id);
});

test("trade abierto queda sin cierre", () => {
  const [t] = buildTrades([ex("buy", 1, 100, "15:00")], inst);
  assert.equal(t.closed_at, null);
});

test("día de trading CME (18:00 ET arranca el día siguiente)", () => {
  assert.equal(tradingDay("2026-09-29T21:30:00Z"), "2026-09-29"); // 17:30 ET
  assert.equal(tradingDay("2026-09-29T22:30:00Z"), "2026-09-30"); // 18:30 ET
});

test("fechas de Tradovate en zona local", () => {
  const d = parseBrokerDate("09/29/2026 10:31:05", "America/Argentina/Buenos_Aires");
  assert.equal(d?.toISOString(), "2026-09-29T13:31:05.000Z");
  const d2 = parseBrokerDate("9/29/26 1:05:00 PM", "America/New_York");
  assert.equal(d2?.toISOString(), "2026-09-29T17:05:00.000Z");
});

test("CSV de Orders de Tradovate", () => {
  const csv = [
    "orderId,Account,Order ID,B/S,Contract,Product,avgPrice,filledQty,Fill Time,Status,Timestamp,Quantity,Type,Filled Qty,Avg Fill Price",
    "1,APEX-1,1001, Buy,MNQZ6,MNQ,20000.25,2,09/29/2026 10:00:00,Filled,09/29/2026 10:00:00,2,Market,2,20000.25",
    "2,APEX-1,1002, Sell,MNQZ6,MNQ,20010.00,2,09/29/2026 10:05:00,Filled,09/29/2026 10:05:00,2,Limit,2,20010.00",
    "3,APEX-1,1003, Sell,MNQZ6,MNQ,,0,,Canceled,09/29/2026 10:05:00,2,Stop,0,",
  ].join("\n");
  const r = parseTradovateCsv(csv, "America/Argentina/Buenos_Aires");
  assert.equal(r.kind, "orders");
  assert.equal(r.executions.length, 2);
  assert.equal(r.skipped, 1);
  assert.equal(r.executions[0].side, "buy");
  assert.equal(r.executions[0].broker_fill_id, "order:1001");
  assert.equal(r.executions[1].price, 20010);
});

test("CSV de Fills de Tradovate", () => {
  const csv = [
    "_id,_orderId,_contractId,_timestamp,_action,_qty,_price,Fill ID,Order ID,Timestamp,Account,B/S,Quantity,Price,Contract,commission",
    "55,1001,9,x,0,1,20000,55,1001,2026-09-29 10:00:00,APEX-1,Buy,1,20000,MNQZ6,0.52",
  ].join("\n");
  const r = parseTradovateCsv(csv, "UTC");
  assert.equal(r.kind, "fills");
  assert.equal(r.executions[0].broker_fill_id, "fill:55");
  assert.equal(r.executions[0].order_id, "1001");
  assert.equal(r.executions[0].commission, 0.52);
});

test("estadísticas y reglas de Apex", () => {
  const mk = (id: string, pnl: number, day: string): TradeRow => ({
    id, account_id: "acc", symbol: "MNQZ6", direction: "long",
    opened_at: `${day}T14:00:00Z`, closed_at: `${day}T14:10:00Z`, max_qty: 1,
    avg_entry: 100, avg_exit: 101, gross_pnl: pnl, commissions: 0, net_pnl: pnl, execution_ids: [],
  });
  const trades = [mk("a", 600, "2026-09-28"), mk("b", -200, "2026-09-29"), mk("c", 400, "2026-09-29"), mk("d", 300, "2026-09-30")];
  const s = computeStats(trades);
  assert.equal(s.trades, 4);
  assert.equal(s.netPnl, 1100);
  assert.equal(s.winRate, 0.75);
  assert.equal(s.profitFactor, 6.5);
  const days = dailyPnl(trades, "America/New_York");
  assert.equal(days.length, 3);
  const a = apexStatus(days, trades, { starting_balance: 50000, drawdown_amount: 2500, drawdown_type: "intraday_trail", consistency_pct: 30, min_trading_days: 8 });
  assert.equal(a.balance, 51100);
  assert.equal(a.peakBalance, 51100);
  assert.equal(a.liquidation, 48600);
  assert.equal(a.bestDay?.pnl, 600);
  assert.equal(a.consistencyOk, false); // 600/1100 = 54.5% > 30%
  assert.equal(a.profitNeededForConsistency, 900); // 600/0.3 - 1100

  // Apex 50K EOD en PA: el umbral sigue el balance de cierre y frena en 50.100
  const e = apexStatus(days, trades, { starting_balance: 50000, drawdown_amount: 2000, drawdown_type: "eod_trail", consistency_pct: 50, min_trading_days: 5, min_day_profit: 250, min_payout: 500 });
  assert.equal(e.balance, 51100);
  assert.equal(e.liquidation, 49100); // pico de cierre 51.100 - 2.000
  assert.equal(e.safetyNet, 52100);
  assert.equal(e.minPayoutBalance, 52600);
  assert.equal(e.qualifyingDays, 2); // 28/9 (+600) y 30/9 (+300); 29/9 cerró +200
  assert.equal(e.consistencyOk, false); // 600/1100 = 54.5% > 50%
  assert.equal(e.payoutEligible, false);
  assert.equal(e.contractLimit, 2);
  const big = apexStatus([{ day: "2026-09-01", pnl: 2500, trades: 1 }], [], { starting_balance: 50000, drawdown_amount: 2000, drawdown_type: "eod_trail", consistency_pct: 50, min_trading_days: 5 });
  assert.equal(big.liquidation, 50100);
  assert.equal(big.trailingLocked, true);
  assert.equal(big.contractLimit, 3);
});

test("resumen de hoy contra el límite diario", () => {
  const mk = (id: string, pnl: number): TradeRow => ({
    id, account_id: "acc", symbol: "MNQZ6", direction: "long",
    opened_at: "2026-09-30T14:00:00Z", closed_at: "2026-09-30T14:10:00Z", max_qty: 1,
    avg_entry: 1, avg_exit: 1, gross_pnl: pnl, commissions: 0, net_pnl: pnl, execution_ids: [],
  });
  const t = todayStatus([mk("a", -300), mk("b", -350)], "America/New_York", 1000, 500, new Date("2026-09-30T16:00:00Z"));
  assert.equal(t.pnl, -650);
  assert.equal(t.dllRemaining, 350);
  assert.equal(t.level, "warn");
});

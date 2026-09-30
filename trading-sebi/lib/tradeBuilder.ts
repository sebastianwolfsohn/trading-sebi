import { findInstrument, type Instrument } from "./instruments";

export type Execution = {
  id: string;
  account_id: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  commission: number | null;
  executed_at: string;
};

export type BuiltTrade = {
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
};

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/**
 * Agrupa ejecuciones en trades. Un trade abre cuando la posición en un símbolo
 * pasa de 0 a distinto de 0 y cierra cuando vuelve a 0. Si una ejecución da vuelta
 * la posición (de +2 a -1), se parte: una parte cierra el trade y el resto abre otro.
 */
export function buildTrades(executions: Execution[], instruments: Map<string, Instrument>): BuiltTrade[] {
  const groups = new Map<string, Execution[]>();
  for (const e of executions) {
    const key = `${e.account_id}|${e.symbol}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  const trades: BuiltTrade[] = [];

  for (const list of groups.values()) {
    list.sort((a, b) => Date.parse(a.executed_at) - Date.parse(b.executed_at) || a.id.localeCompare(b.id));
    const inst = findInstrument(list[0].symbol, instruments);
    const pointValue = inst?.point_value ?? 1;
    const defaultCommission = inst?.commission_per_side ?? 0;

    let pos = 0;
    let cur: {
      trade: BuiltTrade;
      entryQty: number;
      entryCost: number;
      exitQty: number;
      exitValue: number;
      ids: Set<string>;
    } | null = null;

    const commissionFor = (e: Execution, q: number) =>
      (e.commission != null ? e.commission : defaultCommission * e.qty) * (q / e.qty);

    for (const e of list) {
      let remaining = e.qty;
      const sign = e.side === "buy" ? 1 : -1;

      while (remaining > 1e-9) {
        if (pos === 0 || !cur) {
          cur = {
            trade: {
              id: `${e.account_id}:${e.symbol}:${e.id}`,
              account_id: e.account_id,
              symbol: e.symbol,
              direction: sign > 0 ? "long" : "short",
              opened_at: e.executed_at,
              closed_at: null,
              max_qty: 0,
              avg_entry: 0,
              avg_exit: null,
              gross_pnl: 0,
              commissions: 0,
              net_pnl: 0,
              execution_ids: [],
            },
            entryQty: 0,
            entryCost: 0,
            exitQty: 0,
            exitValue: 0,
            ids: new Set(),
          };
          trades.push(cur.trade);
        }

        const t = cur.trade;
        const dirSign = t.direction === "long" ? 1 : -1;
        const adding = sign === dirSign;
        const q = adding ? remaining : Math.min(remaining, Math.abs(pos));

        cur.ids.add(e.id);
        t.commissions += commissionFor(e, q);

        if (adding) {
          cur.entryQty += q;
          cur.entryCost += q * e.price;
          pos += sign * q;
          t.max_qty = Math.max(t.max_qty, Math.abs(pos));
        } else {
          const avgEntry = cur.entryCost / cur.entryQty;
          t.gross_pnl += (e.price - avgEntry) * q * dirSign * pointValue;
          cur.exitQty += q;
          cur.exitValue += q * e.price;
          pos += sign * q;
        }
        remaining -= q;

        t.avg_entry = round(cur.entryCost / cur.entryQty, 6);
        t.avg_exit = cur.exitQty > 0 ? round(cur.exitValue / cur.exitQty, 6) : null;
        t.execution_ids = [...cur.ids];
        t.gross_pnl = round(t.gross_pnl);
        t.commissions = round(t.commissions);
        t.net_pnl = round(t.gross_pnl - t.commissions);

        if (Math.abs(pos) < 1e-9) {
          pos = 0;
          t.closed_at = e.executed_at;
          cur = null;
        }
      }
    }
  }

  return trades.sort((a, b) => Date.parse(b.opened_at) - Date.parse(a.opened_at));
}

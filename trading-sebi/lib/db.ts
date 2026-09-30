import "server-only";
import { db } from "./supabase";
import { buildTrades, type Execution } from "./tradeBuilder";
import type { Instrument } from "./instruments";
import type { TradeRow } from "./stats";

export type Account = {
  id: string;
  name: string;
  label: string | null;
  broker: string;
  size: number;
  starting_balance: number;
  drawdown_type: string;
  drawdown_amount: number;
  consistency_pct: number;
  min_trading_days: number;
};

export type IncomingExecution = {
  broker_fill_id: string;
  order_id?: string | null;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  commission?: number | null;
  executed_at: string;
  raw?: unknown;
};

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function getAccounts(): Promise<Account[]> {
  return check(await db().from("accounts").select("*").order("created_at"));
}

export async function ensureAccount(name: string): Promise<Account> {
  const existing = check(await db().from("accounts").select("*").eq("name", name).maybeSingle()) as Account | null;
  if (existing) return existing;
  return check(await db().from("accounts").insert({ name, label: name }).select("*").single());
}

export async function getInstruments(): Promise<Map<string, Instrument>> {
  const rows = check(await db().from("instruments").select("*")) as Instrument[];
  return new Map(rows.map((r) => [r.root, { ...r, point_value: Number(r.point_value), tick_size: Number(r.tick_size), commission_per_side: Number(r.commission_per_side) }]));
}

/** Trae todos los trades (con su journal), paginando de a 1000. */
export async function getTrades(accountId?: string): Promise<TradeRow[]> {
  const out: TradeRow[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db().from("trades").select("*, journal:trade_journal(*)").order("opened_at", { ascending: false }).range(from, from + 999);
    if (accountId) q = q.eq("account_id", accountId);
    const rows = check(await q) as (TradeRow & { journal: unknown })[];
    for (const r of rows) {
      const j = Array.isArray(r.journal) ? r.journal[0] ?? null : r.journal;
      out.push({ ...r, journal: (j as TradeRow["journal"]) ?? null });
    }
    if (rows.length < 1000) break;
  }
  return out;
}

export async function getTrade(id: string) {
  const trade = check(await db().from("trades").select("*, journal:trade_journal(*)").eq("id", id).maybeSingle()) as
    | (TradeRow & { journal: unknown })
    | null;
  if (!trade) return null;
  const j = Array.isArray(trade.journal) ? trade.journal[0] ?? null : trade.journal;
  const executions = check(
    await db().from("executions").select("*").in("id", trade.execution_ids).order("executed_at"),
  ) as (Execution & { source: string; broker_fill_id: string })[];
  return { trade: { ...trade, journal: (j as TradeRow["journal"]) ?? null } as TradeRow, executions };
}

/** Recalcula los trades de una cuenta+símbolo a partir de todas sus ejecuciones. */
export async function rebuildTrades(accountId: string, symbols: string[]) {
  const instruments = await getInstruments();
  for (const symbol of symbols) {
    const execs = check(
      await db().from("executions").select("id, account_id, symbol, side, qty, price, commission, executed_at").eq("account_id", accountId).eq("symbol", symbol),
    ) as Execution[];
    const built = buildTrades(
      execs.map((e) => ({ ...e, qty: Number(e.qty), price: Number(e.price), commission: e.commission == null ? null : Number(e.commission) })),
      instruments,
    );
    if (built.length) {
      check(await db().from("trades").upsert(built.map((t) => ({ ...t, updated_at: new Date().toISOString() }))).select("id"));
    }
    const existing = check(await db().from("trades").select("id").eq("account_id", accountId).eq("symbol", symbol)) as { id: string }[];
    const keep = new Set(built.map((t) => t.id));
    const stale = existing.map((t) => t.id).filter((id) => !keep.has(id));
    if (stale.length) check(await db().from("trades").delete().in("id", stale).select("id"));
  }
}

/**
 * Guarda ejecuciones nuevas y recalcula los trades afectados.
 * - Ignora las que ya existen (mismo broker_fill_id).
 * - Si una orden ya entró por otra fuente (ej. la extensión y después el CSV), no la duplica.
 */
export async function ingestExecutions(accountName: string, incoming: IncomingExecution[], source: "extension" | "csv" | "manual") {
  const account = await ensureAccount(accountName);
  if (!incoming.length) return { account, inserted: 0, duplicates: 0 };

  const existing = check(
    await db().from("executions").select("broker_fill_id, source, raw->>orderId").eq("account_id", account.id),
  ) as { broker_fill_id: string; source: string; orderId: string | null }[];
  const knownIds = new Set(existing.map((e) => e.broker_fill_id));
  const ordersBySource = new Map<string, Set<string>>();
  for (const e of existing) {
    if (!e.orderId) continue;
    if (!ordersBySource.has(e.orderId)) ordersBySource.set(e.orderId, new Set());
    ordersBySource.get(e.orderId)!.add(e.source);
  }

  const rows = [];
  let duplicates = 0;
  for (const e of incoming) {
    const otherSource = e.order_id ? [...(ordersBySource.get(e.order_id) ?? [])].some((s) => s !== source) : false;
    if (knownIds.has(e.broker_fill_id) || otherSource) {
      duplicates++;
      continue;
    }
    knownIds.add(e.broker_fill_id);
    rows.push({
      account_id: account.id,
      broker_fill_id: e.broker_fill_id,
      symbol: e.symbol,
      side: e.side,
      qty: e.qty,
      price: e.price,
      commission: e.commission ?? null,
      executed_at: e.executed_at,
      source,
      raw: { ...(typeof e.raw === "object" && e.raw ? e.raw : {}), orderId: e.order_id ?? null },
    });
  }

  if (rows.length) {
    check(await db().from("executions").upsert(rows, { onConflict: "account_id,broker_fill_id", ignoreDuplicates: true }).select("id"));
    await rebuildTrades(account.id, [...new Set(rows.map((r) => r.symbol))]);
  }
  return { account, inserted: rows.length, duplicates };
}

export async function deleteExecution(id: string) {
  const exec = check(await db().from("executions").select("account_id, symbol").eq("id", id).maybeSingle()) as { account_id: string; symbol: string } | null;
  if (!exec) return;
  check(await db().from("executions").delete().eq("id", id).select("id"));
  await rebuildTrades(exec.account_id, [exec.symbol]);
}

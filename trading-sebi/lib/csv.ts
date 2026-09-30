import Papa from "papaparse";
import { normalizeSymbol } from "./instruments";
import { parseBrokerDate } from "./time";

export type ParsedExecution = {
  broker_fill_id: string;
  order_id: string | null;
  account_name: string | null;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  commission: number | null;
  executed_at: string;
  raw: Record<string, string>;
};

export type CsvParseResult = {
  kind: "fills" | "orders" | "unknown";
  executions: ParsedExecution[];
  skipped: number;
  warnings: string[];
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function pick(row: Record<string, string>, ...names: string[]): string {
  for (const n of names) {
    const v = row[norm(n)];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}

const num = (v: string) => {
  if (!v) return NaN;
  return Number(v.replace(/[$,\s]/g, "").replace(/^\((.*)\)$/, "-$1"));
};

function side(v: string): "buy" | "sell" | null {
  const s = v.trim().toLowerCase();
  if (s.startsWith("b")) return "buy";
  if (s.startsWith("s")) return "sell";
  return null;
}

/**
 * Lee los CSV de Tradovate (Account Reports). Soporta el export de Fills
 * (una fila por ejecución) y el de Orders (una fila por orden, solo las Filled).
 * Los nombres de columna se comparan sin mayúsculas ni símbolos, así tolera
 * variaciones como "B/S", "Avg Fill Price", "avgPrice", "Fill Time"...
 */
export function parseTradovateCsv(text: string, timeZone: string): CsvParseResult {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data.map((r) => {
    // Columnas "visibles" (Order ID, Timestamp) ganan sobre las internas (_orderId, _timestamp).
    const out: Record<string, string> = {};
    const rank = (k: string) => (k.startsWith("_") ? 2 : /^[a-z]/.test(k) ? 1 : 0);
    const entries = Object.entries(r).sort(([a], [b]) => rank(a) - rank(b));
    for (const [k, v] of entries) {
      const nk = norm(k);
      if (!(nk in out) || !out[nk]) out[nk] = v ?? "";
    }
    return out;
  });
  const headers = new Set(Object.keys(rows[0] ?? {}));
  const warnings: string[] = [];

  const isFills = headers.has("fillid") || (headers.has("id") && headers.has("orderid") && headers.has("price"));
  const isOrders = !isFills && (headers.has("filledqty") || headers.has("avgfillprice") || headers.has("avgprice"));
  const kind: CsvParseResult["kind"] = isFills ? "fills" : isOrders ? "orders" : "unknown";

  if (kind === "unknown") {
    return {
      kind,
      executions: [],
      skipped: rows.length,
      warnings: [
        "No reconozco el formato. Exportá desde Tradovate → Account Reports la pestaña Fills u Orders.",
        `Columnas encontradas: ${[...headers].join(", ")}`,
      ],
    };
  }

  const executions: ParsedExecution[] = [];
  let skipped = 0;

  for (const r of rows) {
    const status = pick(r, "Status");
    if (kind === "orders" && status && !/filled/i.test(status)) {
      skipped++;
      continue;
    }
    const s = side(pick(r, "B/S", "Side", "action", "Buy/Sell"));
    const qty = num(kind === "orders" ? pick(r, "Filled Qty", "filledQty", "Quantity") : pick(r, "Quantity", "qty", "Filled Qty"));
    const price = num(kind === "orders" ? pick(r, "Avg Fill Price", "avgPrice", "Price") : pick(r, "Price", "price", "Avg Fill Price"));
    const contract = pick(r, "Contract", "Symbol", "contractName");
    const when = parseBrokerDate(pick(r, "Fill Time", "Timestamp", "timestamp", "Date"), timeZone);
    const orderId = pick(r, "Order ID", "orderId") || null;
    const fillId = kind === "fills" ? pick(r, "Fill ID", "id") : "";

    if (!s || !(qty > 0) || !isFinite(price) || !contract || !when) {
      skipped++;
      continue;
    }

    const commissionRaw = pick(r, "commission", "Commission", "Fees");
    const commission = commissionRaw ? Math.abs(num(commissionRaw)) : null;

    executions.push({
      broker_fill_id: fillId ? `fill:${fillId}` : `order:${orderId ?? `${contract}:${when.toISOString()}:${s}:${qty}:${price}`}`,
      order_id: orderId,
      account_name: pick(r, "Account", "accountName") || null,
      symbol: normalizeSymbol(contract),
      side: s,
      qty,
      price,
      commission: commission != null && isFinite(commission) ? commission : null,
      executed_at: when.toISOString(),
      raw: r,
    });
  }

  if (skipped) warnings.push(`${skipped} filas salteadas (órdenes no ejecutadas o datos incompletos).`);
  return { kind, executions, skipped, warnings };
}

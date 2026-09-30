import { NextResponse, type NextRequest } from "next/server";
import { ingestExecutions, type IncomingExecution } from "@/lib/db";
import { normalizeSymbol } from "@/lib/instruments";
import { safeEqual } from "@/lib/auth";

export const dynamic = "force-dynamic";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function authorized(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  return expected.length >= 16 && safeEqual(got, expected);
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: cors });
}

/** La extensión usa GET para probar la conexión desde su pantalla de opciones. */
export function GET(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401, headers: cors });
  return NextResponse.json({ ok: true, app: "trading-sebi" }, { headers: cors });
}

type Body = {
  account?: string;
  executions?: Array<{
    fill_id?: string | number;
    order_id?: string | number | null;
    symbol?: string;
    side?: string;
    qty?: number | string;
    price?: number | string;
    commission?: number | string | null;
    executed_at?: string;
    raw?: unknown;
  }>;
};

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ ok: false, error: "Token inválido" }, { status: 401, headers: cors });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400, headers: cors });
  }

  const account = String(body.account ?? "").trim();
  if (!account) return NextResponse.json({ ok: false, error: "Falta 'account'" }, { status: 400, headers: cors });

  const executions: IncomingExecution[] = [];
  const rejected: number[] = [];
  (body.executions ?? []).forEach((e, i) => {
    const side = String(e.side ?? "").toLowerCase();
    const qty = Number(e.qty);
    const price = Number(e.price);
    const when = e.executed_at ? new Date(e.executed_at) : null;
    if (!e.fill_id || !e.symbol || !["buy", "sell"].includes(side) || !(qty > 0) || !isFinite(price) || !when || isNaN(when.getTime())) {
      rejected.push(i);
      return;
    }
    executions.push({
      broker_fill_id: `fill:${e.fill_id}`,
      order_id: e.order_id != null ? String(e.order_id) : null,
      symbol: normalizeSymbol(e.symbol),
      side: side as "buy" | "sell",
      qty,
      price,
      commission: e.commission != null && e.commission !== "" ? Number(e.commission) : null,
      executed_at: when.toISOString(),
      raw: e.raw,
    });
  });

  try {
    const res = await ingestExecutions(account, executions, "extension");
    return NextResponse.json({ ok: true, inserted: res.inserted, duplicates: res.duplicates, rejected }, { headers: cors });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500, headers: cors });
  }
}

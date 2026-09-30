import Link from "next/link";
import { revalidatePath } from "next/cache";
import { getAccounts, getTrades } from "@/lib/db";
import { db, TRADING_TZ } from "@/lib/supabase";
import { apexStatus, dailyPnl } from "@/lib/stats";
import { money, pnlClass } from "@/lib/format";
import { Stat } from "@/components/Calendar";

export const dynamic = "force-dynamic";

async function saveAccount(formData: FormData) {
  "use server";
  const n = (k: string) => Number(String(formData.get(k) ?? "").replace(",", "."));
  const { error } = await db()
    .from("accounts")
    .update({
      label: String(formData.get("label") ?? "").trim() || null,
      size: n("size"),
      starting_balance: n("starting_balance"),
      drawdown_type: String(formData.get("drawdown_type")),
      drawdown_amount: n("drawdown_amount"),
      consistency_pct: n("consistency_pct"),
      min_trading_days: n("min_trading_days"),
    })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/apex");
}

export default async function ApexPage() {
  const accounts = await getAccounts();
  if (!accounts.length) {
    return (
      <div className="card text-sm">
        La cuenta aparece sola cuando llega el primer trade (por la extensión o un <Link href="/import" className="text-accent underline">CSV</Link>).
      </div>
    );
  }

  const blocks = await Promise.all(
    accounts.map(async (a) => {
      const trades = await getTrades(a.id);
      const days = dailyPnl(trades, TRADING_TZ);
      const st = apexStatus(days, trades, {
        starting_balance: Number(a.starting_balance),
        drawdown_amount: Number(a.drawdown_amount),
        drawdown_type: a.drawdown_type,
        consistency_pct: Number(a.consistency_pct),
        min_trading_days: Number(a.min_trading_days),
      });
      return { a, st };
    }),
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Cuenta Apex</h1>
      {blocks.map(({ a, st }) => {
        const ddUsed = Math.max(0, Math.min(1, 1 - st.distanceToLiquidation / Number(a.drawdown_amount)));
        return (
          <section key={a.id} className="space-y-4">
            <h2 className="text-lg font-medium">{a.label || a.name} <span className="text-sm text-muted">{a.name}</span></h2>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Balance" value={money(st.balance, false)} sub={`Profit ${money(st.profit)}`} tone={pnlClass(st.profit)} />
              <Stat
                label="Distancia a liquidación"
                value={money(st.distanceToLiquidation, false)}
                sub={`Umbral ${money(st.liquidation, false)}${st.trailingLocked ? " · trailing frenado" : ""}`}
                tone={st.distanceToLiquidation < Number(a.drawdown_amount) * 0.3 ? "text-loss" : ""}
              />
              <Stat
                label="Consistencia"
                value={st.bestDayPct == null ? "—" : `${st.bestDayPct}%`}
                sub={`Mejor día ${money(st.bestDay?.pnl ?? 0)} · límite ${a.consistency_pct}%`}
                tone={st.consistencyOk ? "text-win" : "text-loss"}
              />
              <Stat label="Días operados" value={`${st.tradingDays} / ${a.min_trading_days}`} sub={`${st.profitableDays} con ganancia`} />
            </div>

            <div className="card space-y-3 text-sm">
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>Drawdown usado</span>
                  <span>{Math.round(ddUsed * 100)}% de {money(Number(a.drawdown_amount), false)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className={`h-full rounded-full ${ddUsed > 0.7 ? "bg-loss" : "bg-accent"}`} style={{ width: `${ddUsed * 100}%` }} />
                </div>
              </div>
              {st.consistencyOk ? (
                <p className="text-win">✓ Cumplís la regla de consistencia con el profit actual.</p>
              ) : (
                <p className="text-loss">
                  ✗ Tu mejor día pesa {st.bestDayPct}% del profit. Para cumplir el {a.consistency_pct}% necesitás sumar al menos{" "}
                  <strong>{money(st.profitNeededForConsistency, false)}</strong> más sin superar ese mejor día.
                </p>
              )}
              <p className="text-xs text-muted">
                Aproximado: con trailing intradía Apex sigue el pico incluyendo ganancias no realizadas, y acá solo vemos P&L realizado.
                Confirmá siempre contra el dashboard de Apex.
              </p>
            </div>

            <details className="card">
              <summary className="cursor-pointer text-sm font-medium">Configurar reglas de la cuenta</summary>
              <form action={saveAccount} className="mt-4 grid gap-3 md:grid-cols-4">
                <input type="hidden" name="id" value={a.id} />
                <L label="Nombre"><input className="input" name="label" defaultValue={a.label ?? ""} /></L>
                <L label="Tamaño"><input className="input" name="size" defaultValue={a.size} /></L>
                <L label="Balance inicial"><input className="input" name="starting_balance" defaultValue={a.starting_balance} /></L>
                <L label="Tipo de drawdown">
                  <select className="input" name="drawdown_type" defaultValue={a.drawdown_type}>
                    <option value="intraday_trail">Intraday trail</option>
                    <option value="eod_trail">EOD trail</option>
                    <option value="static">Estático</option>
                  </select>
                </L>
                <L label="Drawdown (USD)"><input className="input" name="drawdown_amount" defaultValue={a.drawdown_amount} /></L>
                <L label="Consistencia (%)"><input className="input" name="consistency_pct" defaultValue={a.consistency_pct} /></L>
                <L label="Días mínimos"><input className="input" name="min_trading_days" defaultValue={a.min_trading_days} /></L>
                <div className="flex items-end"><button className="btn w-full">Guardar</button></div>
              </form>
            </details>
          </section>
        );
      })}
    </div>
  );
}

function L({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

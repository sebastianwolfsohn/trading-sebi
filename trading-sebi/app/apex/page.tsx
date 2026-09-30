import Link from "next/link";
import { revalidatePath } from "next/cache";
import { accountRules, getAccounts, getTrades } from "@/lib/db";
import { db, TRADING_TZ } from "@/lib/supabase";
import { apexStatus, dailyPnl, todayStatus } from "@/lib/stats";
import { money, pnlClass } from "@/lib/format";
import { Stat } from "@/components/Calendar";

export const dynamic = "force-dynamic";

async function saveAccount(formData: FormData) {
  "use server";
  const n = (k: string) => {
    // Acepta "50000", "50.000" o "50,5".
    let v = String(formData.get(k) ?? "").trim().replace(/\s|\$/g, "");
    if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, "");
    v = v.replace(",", ".");
    const x = Number(v);
    return v === "" || !isFinite(x) ? null : x;
  };
  const { error } = await db()
    .from("accounts")
    .update({
      label: String(formData.get("label") ?? "").trim() || null,
      starting_balance: n("starting_balance") ?? 50000,
      drawdown_type: String(formData.get("drawdown_type")),
      drawdown_amount: n("drawdown_amount") ?? 2000,
      daily_loss_limit: n("daily_loss_limit"),
      daily_profit_target: n("daily_profit_target"),
      consistency_pct: n("consistency_pct") ?? 50,
      min_trading_days: n("min_trading_days") ?? 5,
      min_day_profit: n("min_day_profit") ?? 250,
      min_payout: n("min_payout") ?? 500,
      payouts_taken: n("payouts_taken") ?? 0,
      last_payout_at: String(formData.get("last_payout_at") ?? "") || null,
    })
    .eq("id", String(formData.get("id")));
  if (error) throw new Error(error.message);
  revalidatePath("/", "layout");
}

export default async function ApexPage() {
  const accounts = await getAccounts();
  if (!accounts.length) {
    return (
      <div className="card text-sm">
        La cuenta aparece sola cuando llega el primer trade (por la extensión, un <Link href="/import" className="text-accent underline">CSV</Link> o un{" "}
        <Link href="/trades/new" className="text-accent underline">trade manual</Link>).
      </div>
    );
  }

  const blocks = await Promise.all(
    accounts.map(async (a) => {
      const trades = await getTrades(a.id);
      const days = dailyPnl(trades, TRADING_TZ);
      const rules = accountRules(a);
      return { a, rules, st: apexStatus(days, trades, rules), today: todayStatus(trades, TRADING_TZ, rules.daily_loss_limit, rules.daily_profit_target) };
    }),
  );

  return (
    <div className="space-y-8">
      <h1 className="text-xl font-semibold">Cuenta Apex</h1>
      {blocks.map(({ a, rules, st, today }) => {
        const ddUsed = Math.max(0, Math.min(1, 1 - st.distanceToLiquidation / rules.drawdown_amount));
        const typeLabel = rules.drawdown_type === "eod_trail" ? "EOD" : rules.drawdown_type === "intraday_trail" ? "Intraday" : "Estático";
        return (
          <section key={a.id} className="space-y-4">
            <div>
              <h2 className="text-lg font-medium">{a.label || a.name}</h2>
              <p className="text-sm text-muted">
                {a.name} · Performance Account · {money(rules.starting_balance, false)} {typeLabel} · drawdown {money(rules.drawdown_amount, false)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Balance" value={money(st.balance, false)} sub={`Profit ${money(st.profit)}`} tone={pnlClass(st.profit)} />
              <Stat
                label="Distancia a liquidación"
                value={money(st.distanceToLiquidation, false)}
                sub={st.trailingLocked ? `Umbral frenado en ${money(st.liquidation, false)}` : `Umbral ${money(st.liquidation, false)} (sube con el cierre diario)`}
                tone={st.distanceToLiquidation < rules.drawdown_amount * 0.3 ? "text-loss" : ""}
              />
              <Stat
                label="Hoy vs límite diario"
                value={money(today.pnl)}
                tone={pnlClass(today.pnl)}
                sub={today.dllRemaining == null ? "Sin límite diario" : `Te quedan ${money(today.dllRemaining, false)} de ${money(rules.daily_loss_limit, false)}`}
              />
              <Stat label="Límite de contratos" value={`${st.contractLimit} minis`} sub={`= ${st.contractLimit * 10} micros con tu profit actual`} />
            </div>

            <div className="card space-y-3 text-sm">
              <div>
                <div className="mb-1 flex justify-between text-xs text-muted">
                  <span>Drawdown usado</span>
                  <span>{Math.round(ddUsed * 100)}% de {money(rules.drawdown_amount, false)}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-line">
                  <div className={`h-full rounded-full ${ddUsed > 0.7 ? "bg-loss" : "bg-accent"}`} style={{ width: `${ddUsed * 100}%` }} />
                </div>
              </div>
              {!st.trailingLocked && (
                <p className="text-muted">
                  El umbral deja de subir cuando tu balance de cierre llega a {money(st.safetyNet, false)}. A partir de ahí queda fijo en{" "}
                  {money(rules.starting_balance + 100, false)}.
                </p>
              )}
            </div>

            <div className="card space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">Payout #{rules.payouts_taken + 1}</h3>
                <span className={`text-sm font-medium ${st.payoutEligible ? "text-win" : "text-muted"}`}>
                  {st.payoutEligible ? `✓ Podés pedir hasta ${money(st.maxPayoutNow, false)}` : "Todavía no"}
                </span>
              </div>
              <ul className="space-y-2 text-sm">
                <Check ok={st.qualifyingDays >= rules.min_trading_days}>
                  Días calificados: <b>{st.qualifyingDays} / {rules.min_trading_days}</b> (días que cerraron con +{money(rules.min_day_profit, false)} o más)
                </Check>
                <Check ok={st.consistencyOk}>
                  Consistencia: tu mejor día {st.bestDay ? `(${money(st.bestDay.pnl)}, ${st.bestDay.day.slice(8)}/${st.bestDay.day.slice(5, 7)})` : ""} pesa{" "}
                  <b>{st.bestDayPct == null ? "—" : `${st.bestDayPct}%`}</b> del profit del ciclo (máx. {rules.consistency_pct}%)
                  {!st.consistencyOk && <> · necesitás sumar {money(st.profitNeededForConsistency, false)} más sin superar ese día</>}
                </Check>
                <Check ok={st.balance >= st.minPayoutBalance}>
                  Balance mínimo para pedir: <b>{money(st.minPayoutBalance, false)}</b> (safety net {money(st.safetyNet, false)} + payout mínimo {money(rules.min_payout, false)})
                </Check>
              </ul>
              <p className="text-xs text-muted">
                Tope de este payout: {money(st.payoutCap, false)}. Profit del ciclo {rules.last_payout_at ? `desde el ${rules.last_payout_at}` : "desde el inicio"}: {money(st.cycleProfit)}.
              </p>
            </div>

            <p className="text-xs text-muted">
              Reglas por defecto de Apex 4.0 para la 50K EOD (publicadas en abril 2026). El journal usa P&L realizado; confirmá siempre contra tu dashboard de Apex.
            </p>

            <details className="card">
              <summary className="cursor-pointer text-sm font-medium">Configurar reglas de la cuenta</summary>
              <form action={saveAccount} className="mt-4 grid gap-3 md:grid-cols-4">
                <input type="hidden" name="id" value={a.id} />
                <L label="Nombre"><input className="input" name="label" defaultValue={a.label ?? ""} /></L>
                <L label="Balance inicial"><input className="input" name="starting_balance" defaultValue={a.starting_balance} /></L>
                <L label="Tipo de drawdown">
                  <select className="input" name="drawdown_type" defaultValue={a.drawdown_type}>
                    <option value="eod_trail">EOD trail</option>
                    <option value="intraday_trail">Intraday trail</option>
                    <option value="static">Estático</option>
                  </select>
                </L>
                <L label="Drawdown (USD)"><input className="input" name="drawdown_amount" defaultValue={a.drawdown_amount} /></L>
                <L label="Límite diario de pérdida (USD)"><input className="input" name="daily_loss_limit" defaultValue={a.daily_loss_limit ?? ""} /></L>
                <L label="Objetivo diario (USD, opcional)"><input className="input" name="daily_profit_target" defaultValue={a.daily_profit_target ?? ""} /></L>
                <L label="Consistencia (%)"><input className="input" name="consistency_pct" defaultValue={a.consistency_pct} /></L>
                <L label="Días calificados mínimos"><input className="input" name="min_trading_days" defaultValue={a.min_trading_days} /></L>
                <L label="Ganancia mínima por día (USD)"><input className="input" name="min_day_profit" defaultValue={a.min_day_profit} /></L>
                <L label="Payout mínimo (USD)"><input className="input" name="min_payout" defaultValue={a.min_payout} /></L>
                <L label="Payouts ya cobrados"><input className="input" name="payouts_taken" type="number" min="0" defaultValue={a.payouts_taken} /></L>
                <L label="Fecha del último payout"><input className="input" name="last_payout_at" type="date" defaultValue={a.last_payout_at ?? ""} /></L>
                <div className="flex items-end md:col-span-4"><button className="btn">Guardar</button></div>
              </form>
            </details>
          </section>
        );
      })}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className={ok ? "text-win" : "text-loss"} aria-label={ok ? "cumplido" : "pendiente"}>{ok ? "✓" : "✗"}</span>
      <span>{children}</span>
    </li>
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

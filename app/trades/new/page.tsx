import Link from "next/link";
import { redirect } from "next/navigation";
import { randomUUID } from "crypto";
import { ensureAccount, getAccounts } from "@/lib/db";
import { db } from "@/lib/supabase";
import { normalizeSymbol } from "@/lib/instruments";
import { parseBrokerDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return s === "" ? NaN : Number(s);
};

async function createManualTrade(formData: FormData) {
  "use server";
  const when = parseBrokerDate(String(formData.get("when") ?? "").replace("T", " "), "America/Argentina/Buenos_Aires");
  const direction = String(formData.get("direction")) === "short" ? "short" : "long";
  const result = String(formData.get("result")) === "loss" ? -1 : 1;
  const amount = Math.abs(num(formData.get("amount")));
  const qty = num(formData.get("qty"));
  const symbol = normalizeSymbol(String(formData.get("symbol") ?? "") || "MNQ");
  const accountName = String(formData.get("account") ?? "").trim() || "Apex";

  if (!when || !isFinite(amount)) {
    redirect("/trades/new?error=" + encodeURIComponent("Completá la fecha y el monto."));
  }

  const account = await ensureAccount(accountName);
  const pnl = Math.round(result * amount * 100) / 100;
  const id = `manual:${randomUUID()}`;
  const iso = when!.toISOString();

  const { error } = await db().from("trades").insert({
    id,
    account_id: account.id,
    symbol,
    direction,
    opened_at: iso,
    closed_at: iso,
    max_qty: qty > 0 ? qty : 1,
    avg_entry: 0,
    avg_exit: null,
    gross_pnl: pnl,
    commissions: 0,
    net_pnl: pnl,
    execution_ids: [],
  });
  if (error) redirect("/trades/new?error=" + encodeURIComponent(error.message));

  const setup = String(formData.get("setup") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (setup || notes) {
    await db().from("trade_journal").insert({ trade_id: id, setup: setup || null, notes: notes || null });
  }
  redirect("/trades");
}

export default async function NewManualTrade({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const accounts = await getAccounts();
  const now = new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 16); // hora Argentina

  return (
    <div className="max-w-xl space-y-4">
      <Link href="/trades" className="text-sm text-muted hover:text-slate-100">← Volver a trades</Link>
      <h1 className="text-xl font-semibold">Cargar trade a mano</h1>
      {error && <div className="card border-loss/40 text-sm text-loss">{error}</div>}

      <form action={createManualTrade} className="card space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-line py-3 font-medium has-[:checked]:border-win has-[:checked]:bg-win/10 has-[:checked]:text-win">
            <input type="radio" name="direction" value="long" defaultChecked className="sr-only" /> Long
          </label>
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-line py-3 font-medium has-[:checked]:border-loss has-[:checked]:bg-loss/10 has-[:checked]:text-loss">
            <input type="radio" name="direction" value="short" className="sr-only" /> Short
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-line py-3 font-medium has-[:checked]:border-win has-[:checked]:bg-win/10 has-[:checked]:text-win">
            <input type="radio" name="result" value="win" defaultChecked className="sr-only" /> Ganancia
          </label>
          <label className="flex cursor-pointer items-center justify-center rounded-lg border border-line py-3 font-medium has-[:checked]:border-loss has-[:checked]:bg-loss/10 has-[:checked]:text-loss">
            <input type="radio" name="result" value="loss" className="sr-only" /> Pérdida
          </label>
        </div>

        <label className="block">
          <span className="label mb-1 block">Monto (USD)</span>
          <input className="input text-lg" name="amount" inputMode="decimal" placeholder="ej. 577" required autoFocus />
        </label>

        <label className="block">
          <span className="label mb-1 block">Fecha y hora (Argentina)</span>
          <input className="input" name="when" type="datetime-local" defaultValue={now} required />
        </label>

        <details>
          <summary className="cursor-pointer text-sm text-muted">Más datos (opcional)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="label mb-1 block">Símbolo</span>
              <input className="input" name="symbol" placeholder="MNQ" defaultValue="MNQ" />
            </label>
            <label className="block">
              <span className="label mb-1 block">Contratos</span>
              <input className="input" name="qty" type="number" min="1" step="1" placeholder="1" />
            </label>
            <label className="block">
              <span className="label mb-1 block">Setup</span>
              <input className="input" name="setup" />
            </label>
            <label className="block">
              <span className="label mb-1 block">Cuenta</span>
              <input className="input" name="account" defaultValue={accounts[0]?.name ?? "Apex"} />
            </label>
            <label className="block sm:col-span-2">
              <span className="label mb-1 block">Notas</span>
              <textarea className="input min-h-[80px]" name="notes" />
            </label>
          </div>
        </details>

        <button className="btn w-full">Guardar trade</button>
      </form>
    </div>
  );
}

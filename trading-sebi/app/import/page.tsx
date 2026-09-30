import { redirect } from "next/navigation";
import { getAccounts, ingestExecutions } from "@/lib/db";
import { parseTradovateCsv } from "@/lib/csv";
import { normalizeSymbol } from "@/lib/instruments";
import { parseBrokerDate } from "@/lib/time";

export const dynamic = "force-dynamic";

const TIMEZONES = [
  { value: "America/Argentina/Buenos_Aires", label: "Buenos Aires" },
  { value: "America/New_York", label: "Nueva York (ET)" },
  { value: "America/Chicago", label: "Chicago (CT)" },
  { value: "UTC", label: "UTC" },
];

async function importCsv(formData: FormData) {
  "use server";
  const file = formData.get("file") as File | null;
  const tz = String(formData.get("tz") || "America/Argentina/Buenos_Aires");
  const forcedAccount = String(formData.get("account") ?? "").trim();
  if (!file || file.size === 0) redirect("/import?error=" + encodeURIComponent("Elegí un archivo CSV."));

  const parsed = parseTradovateCsv(await file!.text(), tz);
  if (parsed.kind === "unknown" || parsed.executions.length === 0) {
    redirect("/import?error=" + encodeURIComponent(parsed.warnings.join(" ") || "No encontré ejecuciones en el archivo."));
  }

  const byAccount = new Map<string, typeof parsed.executions>();
  for (const e of parsed.executions) {
    const acc = forcedAccount || e.account_name || "Apex";
    if (!byAccount.has(acc)) byAccount.set(acc, []);
    byAccount.get(acc)!.push(e);
  }

  let inserted = 0;
  let duplicates = 0;
  for (const [acc, list] of byAccount) {
    const res = await ingestExecutions(acc, list, "csv");
    inserted += res.inserted;
    duplicates += res.duplicates;
  }
  const msg = `Archivo de ${parsed.kind === "fills" ? "Fills" : "Orders"}: ${inserted} ejecuciones nuevas, ${duplicates} ya estaban cargadas${parsed.skipped ? `, ${parsed.skipped} filas salteadas` : ""}.`;
  redirect("/import?ok=" + encodeURIComponent(msg));
}

async function addManual(formData: FormData) {
  "use server";
  const tz = String(formData.get("tz") || "America/Argentina/Buenos_Aires");
  const when = parseBrokerDate(String(formData.get("when") ?? "").replace("T", " "), tz);
  const qty = Number(formData.get("qty"));
  const price = Number(String(formData.get("price") ?? "").replace(",", "."));
  const symbol = normalizeSymbol(String(formData.get("symbol") ?? ""));
  const side = String(formData.get("side")) === "sell" ? "sell" : "buy";
  const account = String(formData.get("account") ?? "").trim();
  if (!when || !(qty > 0) || !isFinite(price) || !symbol || !account) {
    redirect("/import?error=" + encodeURIComponent("Completá todos los campos de la ejecución manual."));
  }
  await ingestExecutions(
    account,
    [{ broker_fill_id: `manual:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`, symbol, side, qty, price, executed_at: when!.toISOString() }],
    "manual",
  );
  redirect("/import?ok=" + encodeURIComponent("Ejecución cargada."));
}

export default async function ImportPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  const { ok, error } = await searchParams;
  const accounts = await getAccounts();

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Importar</h1>
      {ok && <div className="card border-win/40 text-sm text-win">{ok}</div>}
      {error && <div className="card border-loss/40 text-sm text-loss">{error}</div>}

      <form action={importCsv} className="card space-y-4">
        <div>
          <h2 className="font-medium">CSV de Tradovate</h2>
          <p className="mt-1 text-sm text-muted">
            En Tradovate: menú de la cuenta → ⚙️ → <b>Account Reports</b> → pestaña <b>Fills</b> (o <b>Orders</b>) → elegí fechas → Download.
            Podés subir el mismo archivo varias veces: los duplicados se ignoran.
          </p>
        </div>
        <input className="input" type="file" name="file" accept=".csv,text/csv" required />
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="label mb-1 block">Zona horaria del archivo</span>
            <select className="input" name="tz" defaultValue="America/Argentina/Buenos_Aires">
              {TIMEZONES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1 block">Cuenta (vacío = la del archivo)</span>
            <input className="input" name="account" list="accounts" placeholder="ej. APEX-12345-01" />
          </label>
        </div>
        <button className="btn">Importar</button>
      </form>

      <form action={addManual} className="card space-y-4">
        <div>
          <h2 className="font-medium">Cargar una ejecución a mano</h2>
          <p className="mt-1 text-sm text-muted">Para algún fill que no entró por ningún lado. Cargá entrada y salida por separado.</p>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <input className="input" name="account" list="accounts" placeholder="Cuenta" required defaultValue={accounts[0]?.name ?? ""} />
          <input className="input" name="symbol" placeholder="Símbolo (ej. MNQZ6)" required />
          <select className="input" name="side">
            <option value="buy">Compra</option>
            <option value="sell">Venta</option>
          </select>
          <input className="input" name="qty" type="number" min="1" step="1" placeholder="Contratos" required />
          <input className="input" name="price" inputMode="decimal" placeholder="Precio" required />
          <input className="input" name="when" type="datetime-local" step="1" required />
        </div>
        <input type="hidden" name="tz" value="America/Argentina/Buenos_Aires" />
        <button className="btn">Agregar</button>
      </form>

      <datalist id="accounts">{accounts.map((a) => <option key={a.id} value={a.name} />)}</datalist>
    </div>
  );
}

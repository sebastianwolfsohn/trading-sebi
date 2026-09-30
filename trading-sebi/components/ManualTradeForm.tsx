import { saveManualTradeAction } from "@/lib/actions";

export type ManualDefaults = {
  trade_id?: string;
  direction?: "long" | "short";
  pnl?: number;
  when?: string; // yyyy-mm-ddThh:mm en hora Argentina
  symbol?: string;
  qty?: number;
  setup?: string | null;
  notes?: string | null;
  account?: string;
};

function Toggle({ name, value, label, checked, tone }: { name: string; value: string; label: string; checked: boolean; tone: "win" | "loss" }) {
  const on = tone === "win" ? "has-[:checked]:border-win has-[:checked]:bg-win/10 has-[:checked]:text-win" : "has-[:checked]:border-loss has-[:checked]:bg-loss/10 has-[:checked]:text-loss";
  return (
    <label className={`flex cursor-pointer items-center justify-center rounded-lg border border-line py-3 font-medium ${on}`}>
      <input type="radio" name={name} value={value} defaultChecked={checked} className="sr-only" /> {label}
    </label>
  );
}

export function ManualTradeForm({ d, submitLabel }: { d: ManualDefaults; submitLabel: string }) {
  const loss = (d.pnl ?? 0) < 0;
  return (
    <form action={saveManualTradeAction} className="card space-y-4">
      {d.trade_id && <input type="hidden" name="trade_id" value={d.trade_id} />}
      <div className="grid grid-cols-2 gap-2">
        <Toggle name="direction" value="long" label="Long" checked={d.direction !== "short"} tone="win" />
        <Toggle name="direction" value="short" label="Short" checked={d.direction === "short"} tone="loss" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Toggle name="result" value="win" label="Ganancia" checked={!loss} tone="win" />
        <Toggle name="result" value="loss" label="Pérdida" checked={loss} tone="loss" />
      </div>
      <label className="block">
        <span className="label mb-1 block">Monto (USD)</span>
        <input className="input text-lg" name="amount" inputMode="decimal" placeholder="ej. 577" required autoFocus defaultValue={d.pnl != null ? Math.abs(d.pnl) : ""} />
      </label>
      <label className="block">
        <span className="label mb-1 block">Fecha y hora (Argentina)</span>
        <input className="input" name="when" type="datetime-local" defaultValue={d.when} required />
      </label>
      <details open={!!d.trade_id}>
        <summary className="cursor-pointer text-sm text-muted">Más datos (opcional)</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="label mb-1 block">Símbolo</span>
            <input className="input" name="symbol" defaultValue={d.symbol ?? "MNQ"} />
          </label>
          <label className="block">
            <span className="label mb-1 block">Contratos</span>
            <input className="input" name="qty" type="number" min="1" step="1" defaultValue={d.qty ?? ""} placeholder="1" />
          </label>
          <label className="block">
            <span className="label mb-1 block">Setup</span>
            <input className="input" name="setup" defaultValue={d.setup ?? ""} />
          </label>
          <label className="block">
            <span className="label mb-1 block">Cuenta</span>
            <input className="input" name="account" defaultValue={d.account ?? "Apex"} />
          </label>
          <label className="block sm:col-span-2">
            <span className="label mb-1 block">Notas</span>
            <textarea className="input min-h-[80px]" name="notes" defaultValue={d.notes ?? ""} />
          </label>
        </div>
      </details>
      <button className="btn w-full">{submitLabel}</button>
    </form>
  );
}

/** ISO -> "yyyy-mm-ddThh:mm" en hora Argentina (UTC-3, sin horario de verano). */
export function toArgLocal(iso: string) {
  return new Date(Date.parse(iso) - 3 * 3600e3).toISOString().slice(0, 16);
}

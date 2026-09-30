import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { deleteExecution, getRules, getTrade, getTrades } from "@/lib/db";
import { db, DISPLAY_TZ } from "@/lib/supabase";
import { pnlOf, rMultiple } from "@/lib/stats";
import { durationLabel, formatDateTime } from "@/lib/time";
import { money, num, pnlClass } from "@/lib/format";
import { deleteTradeAction, removeScreenshotAction } from "@/lib/actions";
import { resolveScreenshots } from "@/lib/screenshots";
import { ScreenshotPaste } from "@/components/ScreenshotPaste";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

const MISTAKES = ["FOMO", "Entrada tardía", "Moví el stop", "Salida temprana", "Sobreoperé", "Sin plan", "Revenge trade", "Tamaño de más"];
const EMOTIONS = ["Tranquilo", "Confiado", "Ansioso", "Con miedo", "Frustrado", "Eufórico", "Aburrido"];

const numOrNull = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(",", ".");
  return s === "" ? null : Number(s);
};

async function saveJournal(formData: FormData) {
  "use server";
  const id = String(formData.get("trade_id"));
  const mistakes = [
    ...formData.getAll("mistake").map(String),
    ...String(formData.get("mistakes_extra") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  ];
  const links = String(formData.get("screenshots") ?? "").split(/\s+/).map((s) => s.trim()).filter((s) => /^https?:\/\//.test(s));
  // Las capturas subidas (storage:...) no están en el textarea: se conservan.
  const prev = await db().from("trade_journal").select("screenshots").eq("trade_id", id).maybeSingle();
  const stored = ((prev.data?.screenshots as string[] | undefined) ?? []).filter((x) => x.startsWith("storage:"));
  const screenshots = [...stored, ...links];
  const rating = numOrNull(formData.get("rating"));
  const { error } = await db().from("trade_journal").upsert({
    trade_id: id,
    setup: String(formData.get("setup") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
    emotion: String(formData.get("emotion") ?? "") || null,
    rating: rating && rating >= 1 && rating <= 5 ? rating : null,
    mistakes: [...new Set(mistakes)],
    planned_stop: numOrNull(formData.get("planned_stop")),
    planned_target: numOrNull(formData.get("planned_target")),
    pnl_override: numOrNull(formData.get("pnl_override")),
    screenshots,
    rules_followed: formData.getAll("rule").map(String),
    rules_checked: true,
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  revalidatePath(`/trades/${encodeURIComponent(id)}`);
  redirect(`/trades/${encodeURIComponent(id)}?saved=1`);
}

async function removeExecution(formData: FormData) {
  "use server";
  await deleteExecution(String(formData.get("execution_id")));
  redirect("/trades");
}

export default async function TradeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const { id: rawId } = await params;
  const { saved } = await searchParams;
  const id = decodeURIComponent(rawId);
  const data = await getTrade(id);
  if (!data) notFound();
  const { trade: t, executions } = data;
  const j = t.journal;
  const r = rMultiple(t);
  const setups = [...new Set((await getTrades()).map((x) => x.journal?.setup).filter(Boolean) as string[])];
  const extraMistakes = (j?.mistakes ?? []).filter((m) => !MISTAKES.includes(m)).join(", ");
  const rules = await getRules();
  const shots = await resolveScreenshots(j?.screenshots ?? []);
  const linkShots = (j?.screenshots ?? []).filter((x) => !x.startsWith("storage:"));
  const manual = t.id.startsWith("manual:");
  const followed = new Set(j?.rules_followed ?? []);

  return (
    <div className="space-y-4">
      <Link href="/trades" className="text-sm text-muted hover:text-slate-100">← Volver a trades</Link>

      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-xl font-semibold">{t.symbol} · {t.direction === "long" ? "Long" : "Short"}</h1>
        <span className={`text-xl font-semibold ${pnlClass(t.closed_at ? pnlOf(t) : null)}`}>{t.closed_at ? money(pnlOf(t)) : "Abierto"}</span>
        {j?.pnl_override != null && <span className="text-xs text-muted">(P&L corregido a mano; automático {money(t.net_pnl)})</span>}
        {saved && <span className="text-sm text-win">Guardado</span>}
        {manual && <Link href={`/trades/${encodeURIComponent(t.id)}/edit`} className="btn-ghost">Editar resultado</Link>}
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
        <Info label="Apertura" value={formatDateTime(t.opened_at, DISPLAY_TZ)} />
        <Info label="Duración" value={manual ? "manual" : durationLabel(t.opened_at, t.closed_at)} />
        <Info label="Contratos máx." value={num(t.max_qty, 0)} />
        <Info label="Entrada / salida" value={manual ? "—" : `${num(t.avg_entry)} → ${num(t.avg_exit)}`} />
        <Info label="Bruto / comisiones" value={`${money(t.gross_pnl)} / ${money(t.commissions, false)}`} />
        <Info label="R múltiple" value={r == null ? "—" : r.toFixed(2)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={saveJournal} className="card space-y-4 lg:col-span-2">
          <input type="hidden" name="trade_id" value={t.id} />
          <div className="grid gap-3 md:grid-cols-3">
            <Field label="Setup">
              <input className="input" name="setup" list="setups" defaultValue={j?.setup ?? ""} placeholder="ej. Pullback a VWAP" />
              <datalist id="setups">{setups.map((s) => <option key={s} value={s} />)}</datalist>
            </Field>
            <Field label="Emoción">
              <select className="input" name="emotion" defaultValue={j?.emotion ?? ""}>
                <option value="">—</option>
                {EMOTIONS.map((e) => <option key={e}>{e}</option>)}
              </select>
            </Field>
            <Field label="Rating (1-5)">
              <select className="input" name="rating" defaultValue={j?.rating ?? ""}>
                <option value="">—</option>
                {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}
              </select>
            </Field>
            <Field label="Stop planeado (precio)">
              <input className="input" name="planned_stop" inputMode="decimal" defaultValue={j?.planned_stop ?? ""} />
            </Field>
            <Field label="Target planeado (precio)">
              <input className="input" name="planned_target" inputMode="decimal" defaultValue={j?.planned_target ?? ""} />
            </Field>
            <Field label="Corregir P&L neto (opcional)">
              <input className="input" name="pnl_override" inputMode="decimal" defaultValue={j?.pnl_override ?? ""} placeholder={String(t.net_pnl)} />
            </Field>
          </div>

          <Field label="Checklist de reglas">
            {rules.length === 0 ? (
              <p className="text-sm text-muted">No tenés reglas cargadas. <Link href="/reglas" className="text-accent underline">Agregalas acá</Link>.</p>
            ) : (
              <div className="space-y-1.5">
                {rules.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2 text-sm">
                    <input type="checkbox" name="rule" value={r.text} defaultChecked={followed.has(r.text)} className="h-4 w-4 accent-green-500" />
                    {r.text}
                  </label>
                ))}
                <p className="text-xs text-muted">
                  {j?.rules_checked ? `Cumpliste ${rules.filter((r) => followed.has(r.text)).length} de ${rules.length}.` : "Marcá las que cumpliste y guardá."}{" "}
                  <Link href="/reglas" className="text-accent hover:underline">Editar reglas</Link>
                </p>
              </div>
            )}
          </Field>

          <Field label="Errores">
            <div className="flex flex-wrap gap-2">
              {MISTAKES.map((m) => (
                <label key={m} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-sm has-[:checked]:border-loss has-[:checked]:bg-loss/10">
                  <input type="checkbox" name="mistake" value={m} defaultChecked={j?.mistakes?.includes(m)} className="accent-red-500" />
                  {m}
                </label>
              ))}
            </div>
            <input className="input mt-2" name="mistakes_extra" defaultValue={extraMistakes} placeholder="Otros, separados por coma" />
          </Field>

          <Field label="Notas">
            <textarea className="input min-h-[120px]" name="notes" defaultValue={j?.notes ?? ""} placeholder="¿Por qué entraste? ¿Qué harías distinto?" />
          </Field>

          <Field label="Links de capturas (opcional, uno por línea)">
            <textarea className="input min-h-[60px]" name="screenshots" defaultValue={linkShots.join("\n")} placeholder="https://www.tradingview.com/x/..." />
          </Field>

          <button className="btn">Guardar</button>
        </form>

        <div className="space-y-4">
          <form action={deleteTradeAction} className="card">
            <input type="hidden" name="trade_id" value={t.id} />
            <ConfirmButton message="¿Borrar este trade? No se puede deshacer." className="w-full rounded-lg border border-loss/40 px-3 py-2 text-sm text-loss hover:bg-loss/10">Borrar este trade</ConfirmButton>
            <p className="mt-2 text-xs text-muted">Borra el trade{executions.length ? " y sus ejecuciones" : ""}. No se puede deshacer.</p>
          </form>
          <div className="card">
            <div className="label mb-2">Ejecuciones</div>
            <ul className="space-y-2 text-sm">
              {executions.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2">
                  <span>
                    <span className={e.side === "buy" ? "text-win" : "text-loss"}>{e.side === "buy" ? "Compra" : "Venta"}</span> {num(Number(e.qty), 0)} @ {num(Number(e.price))}
                    <span className="block text-xs text-muted">{formatDateTime(e.executed_at, DISPLAY_TZ)} · {e.source}</span>
                  </span>
                  <form action={removeExecution}>
                    <input type="hidden" name="execution_id" value={e.id} />
                    <button className="text-xs text-muted hover:text-loss" title="Borrar esta ejecución y recalcular">Borrar</button>
                  </form>
                </li>
              ))}
            </ul>
          </div>
          <div className="card space-y-3">
            <div className="label">Capturas del gráfico</div>
            <ScreenshotPaste tradeId={t.id} />
            {shots.map((sh) => (
              <div key={sh.key} className="space-y-1">
                {sh.url === "" ? (
                  <p className="text-xs text-muted">No se pudo cargar esta captura.</p>
                ) : (
                <a href={sh.url} target="_blank" rel="noreferrer" className="block">
                  {sh.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={sh.url} alt="Captura del trade" className="rounded-lg border border-line" />
                  ) : (
                    <span className="break-all text-sm text-accent underline">{sh.url}</span>
                  )}
                </a>
                )}
                <form action={removeScreenshotAction} className="text-right">
                  <input type="hidden" name="trade_id" value={t.id} />
                  <input type="hidden" name="key" value={sh.key} />
                  <button className="text-xs text-muted hover:text-loss">Quitar captura</button>
                </form>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="card py-3">
      <div className="label">{label}</div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="block">
      <span className="label mb-1 block">{label}</span>
      {children}
    </div>
  );
}

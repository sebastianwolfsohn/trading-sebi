import { getRules } from "@/lib/db";
import { addRuleAction, deleteRuleAction, toggleRuleAction } from "@/lib/actions";
import { ConfirmButton } from "@/components/ConfirmButton";

export const dynamic = "force-dynamic";

export default async function RulesPage() {
  const rules = await getRules(true);
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Mis reglas</h1>
        <p className="text-sm text-muted">
          Aparecen como checklist en cada trade. El dashboard compara tu resultado cuando cumplís todas contra cuando rompés alguna.
        </p>
      </div>

      <div className="card divide-y divide-line p-0">
        {rules.length === 0 && <p className="p-4 text-sm text-muted">Todavía no hay reglas.</p>}
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <span className={`flex-1 text-sm ${r.active ? "" : "text-muted line-through"}`}>{r.text}</span>
            <form action={toggleRuleAction}>
              <input type="hidden" name="id" value={r.id} />
              <input type="hidden" name="active" value={r.active ? "0" : "1"} />
              <button className="text-xs text-muted hover:text-slate-100">{r.active ? "Pausar" : "Activar"}</button>
            </form>
            <form action={deleteRuleAction}>
              <input type="hidden" name="id" value={r.id} />
              <ConfirmButton message="¿Borrar esta regla?" className="text-xs text-muted hover:text-loss">Borrar</ConfirmButton>
            </form>
          </div>
        ))}
      </div>

      <form action={addRuleAction} className="card flex gap-2">
        <input className="input" name="text" placeholder="ej. No opero después de 2 pérdidas seguidas" required />
        <button className="btn shrink-0">Agregar</button>
      </form>
    </div>
  );
}

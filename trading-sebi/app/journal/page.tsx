import Link from "next/link";
import { getRules, getTrades } from "@/lib/db";
import { db, DISPLAY_TZ, TRADING_TZ } from "@/lib/supabase";
import { computeStats, dailyPnl, followedAll, groupBy, pnlOf, type TradeRow } from "@/lib/stats";
import { formatDateTime, tradingDay } from "@/lib/time";
import { money, pct, pnlClass } from "@/lib/format";
import { saveDayNoteAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

const MOODS = ["Enfocado", "Tranquilo", "Cansado", "Ansioso", "Frustrado", "Confiado"];
const DAYS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const label = (day: string) => `${DAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]} ${day.slice(8)}/${day.slice(5, 7)}`;

export default async function JournalPage({ searchParams }: { searchParams: Promise<{ day?: string; saved?: string }> }) {
  const sp = await searchParams;
  const day = /^\d{4}-\d{2}-\d{2}$/.test(sp.day ?? "") ? sp.day! : tradingDay(new Date(), TRADING_TZ);
  const [all, rules, note] = await Promise.all([
    getTrades(),
    getRules(),
    db().from("daily_notes").select("*").eq("day", day).maybeSingle(),
  ]);
  const n = note.data as { premarket_plan: string | null; review: string | null; mood: string | null } | null;
  const dayOf = (t: TradeRow) => tradingDay(t.closed_at ?? t.opened_at, TRADING_TZ);
  const dayTrades = all.filter((t) => dayOf(t) === day).sort((a, b) => a.opened_at.localeCompare(b.opened_at));
  const dayPnl = dayTrades.filter((t) => t.closed_at).reduce((a, t) => a + pnlOf(t), 0);

  // Semana (lunes a domingo) que contiene el día elegido.
  const dow = (new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7;
  const monday = addDays(day, -dow);
  const sunday = addDays(monday, 6);
  const week = all.filter((t) => t.closed_at && dayOf(t) >= monday && dayOf(t) <= sunday);
  const ws = computeStats(week);
  const wDays = dailyPnl(week, TRADING_TZ);
  const bestDay = wDays.reduce<(typeof wDays)[number] | null>((b, d) => (!b || d.pnl > b.pnl ? d : b), null);
  const worstDay = wDays.reduce<(typeof wDays)[number] | null>((b, d) => (!b || d.pnl < b.pnl ? d : b), null);
  const setups = groupBy(week, (t) => t.journal?.setup || "Sin setup");
  const mistakes = new Map<string, number>();
  for (const t of week) for (const m of t.journal?.mistakes ?? []) mistakes.set(m, (mistakes.get(m) ?? 0) + 1);
  const topMistakes = [...mistakes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const checked = week.filter((t) => t.journal?.rules_checked);
  const fullRules = checked.filter((t) => followedAll(t, rules.map((r) => r.text))).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Journal · {label(day)}</h1>
        <div className="flex gap-2">
          <Link className="btn-ghost" href={`/journal?day=${addDays(day, -1)}`}>← Día anterior</Link>
          <Link className="btn-ghost" href="/journal">Hoy</Link>
          <Link className="btn-ghost" href={`/journal?day=${addDays(day, 1)}`}>Día siguiente →</Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <form action={saveDayNoteAction} className="card space-y-4 lg:col-span-2">
          <input type="hidden" name="day" value={day} />
          <label className="block">
            <span className="label mb-1 block">Plan antes de abrir</span>
            <textarea className="input min-h-[110px]" name="premarket_plan" defaultValue={n?.premarket_plan ?? ""} placeholder="Niveles clave, noticias, qué setup busco, cuándo no opero…" />
          </label>
          <label className="block">
            <span className="label mb-1 block">Revisión al cierre</span>
            <textarea className="input min-h-[110px]" name="review" defaultValue={n?.review ?? ""} placeholder="¿Seguí el plan? ¿Qué salió bien? ¿Qué cambio mañana?" />
          </label>
          <label className="block">
            <span className="label mb-1 block">Cómo estuve</span>
            <select className="input" name="mood" defaultValue={n?.mood ?? ""}>
              <option value="">—</option>
              {MOODS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </label>
          <div className="flex items-center gap-3">
            <button className="btn">Guardar</button>
            {sp.saved && <span className="text-sm text-win">Guardado</span>}
          </div>
        </form>

        <div className="card">
          <div className="flex items-baseline justify-between">
            <div className="label">Trades del día</div>
            <span className={`font-semibold ${pnlClass(dayPnl)}`}>{money(dayPnl)}</span>
          </div>
          {dayTrades.length === 0 ? (
            <p className="mt-3 text-sm text-muted">Sin trades este día.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {dayTrades.map((t) => (
                <li key={t.id}>
                  <Link href={`/trades/${encodeURIComponent(t.id)}`} className="flex justify-between gap-2 hover:text-accent">
                    <span>
                      {formatDateTime(t.opened_at, DISPLAY_TZ).split(", ")[1]} · {t.symbol} · {t.direction === "long" ? "Long" : "Short"}
                    </span>
                    <span className={pnlClass(t.closed_at ? pnlOf(t) : null)}>{t.closed_at ? money(pnlOf(t)) : "abierto"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="card space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Revisión semanal · {monday.slice(8)}/{monday.slice(5, 7)} al {sunday.slice(8)}/{sunday.slice(5, 7)}</h2>
          <span className={`text-lg font-semibold ${pnlClass(ws.netPnl)}`}>{money(ws.netPnl)}</span>
        </div>
        {week.length === 0 ? (
          <p className="text-sm text-muted">Sin trades cerrados esta semana.</p>
        ) : (
          <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Block title="Resultado">
              {ws.trades} trades en {wDays.length} días · win rate {pct(ws.winRate, 0)}
              <br />Profit factor {ws.profitFactor == null ? "—" : ws.profitFactor.toFixed(2)}
            </Block>
            <Block title="Mejor y peor día">
              {bestDay && <>Mejor: {label(bestDay.day)} <span className={pnlClass(bestDay.pnl)}>{money(bestDay.pnl)}</span></>}
              <br />
              {worstDay && <>Peor: {label(worstDay.day)} <span className={pnlClass(worstDay.pnl)}>{money(worstDay.pnl)}</span></>}
            </Block>
            <Block title="Setups">
              {setups.slice(0, 3).map((g) => (
                <div key={g.key}>{g.key}: <span className={pnlClass(g.pnl)}>{money(g.pnl)}</span> ({g.trades})</div>
              ))}
            </Block>
            <Block title="Disciplina">
              {checked.length ? `Reglas completas en ${fullRules} de ${checked.length} trades con checklist` : "Sin checklist marcado"}
              <br />
              {topMistakes.length ? `Errores: ${topMistakes.map(([m, c]) => `${m} (${c})`).join(", ")}` : "Sin errores marcados"}
            </Block>
          </div>
        )}
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label mb-1">{title}</div>
      <div className="leading-6">{children}</div>
    </div>
  );
}

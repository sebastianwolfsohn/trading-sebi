/** Offset (ms) de una zona horaria en un instante dado. */
function tzOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Convierte una fecha/hora "local" de una zona (sin offset) a un Date UTC real. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, timeZone: string): Date {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let ts = guess - tzOffsetMs(new Date(guess), timeZone);
  ts = guess - tzOffsetMs(new Date(ts), timeZone);
  return new Date(ts);
}

/**
 * Parsea fechas de los CSV de Tradovate ("09/29/2026 09:31:05", "2026-09-29 09:31:05",
 * ISO con offset...). Si la fecha no trae zona, se interpreta en `timeZone`.
 */
export function parseBrokerDate(value: string, timeZone: string): Date | null {
  const v = value.trim();
  if (!v) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(v)) {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?\s*(AM|PM)?$/i);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    let hour = Number(m[4]);
    if (m[7]) {
      const pm = m[7].toUpperCase() === "PM";
      if (pm && hour < 12) hour += 12;
      if (!pm && hour === 12) hour = 0;
    }
    return zonedToUtc(year, Number(m[1]), Number(m[2]), hour, Number(m[5]), Number(m[6] ?? 0), timeZone);
  }
  m = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  if (m) {
    return zonedToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0), timeZone);
  }
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Día de trading estilo CME/Apex: la sesión arranca a las 18:00 ET,
 * así que todo lo que pasa desde las 18:00 ET cuenta para el día siguiente.
 */
export function tradingDay(iso: string | Date, timeZone = "America/New_York"): string {
  const date = typeof iso === "string" ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  let day = `${get("year")}-${get("month")}-${get("day")}`;
  if (Number(get("hour")) >= 18) {
    const next = new Date(`${day}T12:00:00Z`);
    next.setUTCDate(next.getUTCDate() + 1);
    day = next.toISOString().slice(0, 10);
  }
  return day;
}

/** Hora del día (0-23) en la zona indicada. */
export function hourIn(iso: string, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)),
  );
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

export function durationLabel(fromIso: string, toIso: string | null): string {
  if (!toIso) return "abierto";
  const s = Math.max(0, Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export type Instrument = {
  root: string;
  point_value: number;
  tick_size: number;
  commission_per_side: number;
};

const MONTH_CODES = "FGHJKMNQUVXZ";

/** "MNQZ6" -> "MNQ", "ESZ2026" -> "ES", "NQ" -> "NQ" */
export function symbolRoot(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/^\//, "").split(/[:\s]/).pop() ?? "";
  const m = s.match(new RegExp(`^([A-Z0-9]+?)[${MONTH_CODES}]\\d{1,4}!?$`));
  return m ? m[1] : s.replace(/\d+!?$/, "");
}

export function findInstrument(symbol: string, instruments: Map<string, Instrument>): Instrument | undefined {
  return instruments.get(symbolRoot(symbol));
}

/** Normaliza el símbolo que manda TradingView/Tradovate: "CME_MINI:MNQZ2026" -> "MNQZ6" */
export function normalizeSymbol(symbol: string): string {
  let s = symbol.trim().toUpperCase().split(":").pop() ?? symbol;
  s = s.replace(/^\//, "");
  const m = s.match(new RegExp(`^([A-Z0-9]+?)([${MONTH_CODES}])(\\d{4})$`));
  if (m) s = `${m[1]}${m[2]}${m[3].slice(-1)}`;
  return s;
}

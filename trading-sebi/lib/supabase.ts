import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Cliente de servidor con la service role key. Nunca se usa en el navegador. */
export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en las variables de entorno.");
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

export const TRADING_TZ = process.env.TRADING_TIMEZONE || "America/New_York";
export const DISPLAY_TZ = process.env.DISPLAY_TIMEZONE || "America/Argentina/Buenos_Aires";

export const SESSION_COOKIE = "ts_session";

/** Token de sesión derivado de APP_PASSWORD (funciona en Edge y en Node). */
export async function sessionToken(password = process.env.APP_PASSWORD ?? ""): Promise<string> {
  const data = new TextEncoder().encode(`trading-sebi:${password}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

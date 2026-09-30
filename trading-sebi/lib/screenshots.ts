import "server-only";
import { db } from "./supabase";

export const BUCKET = "screenshots";
export const isStored = (s: string) => s.startsWith("storage:");

/** Convierte las capturas guardadas en Supabase ("storage:<ruta>") en links firmados por 1 hora. */
export async function resolveScreenshots(list: string[]): Promise<{ key: string; url: string; image: boolean }[]> {
  const stored = list.filter(isStored).map((s) => s.slice(8));
  const signed = new Map<string, string>();
  if (stored.length) {
    const { data } = await db().storage.from(BUCKET).createSignedUrls(stored, 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) signed.set(d.path, d.signedUrl);
  }
  return list
    .map((s) => {
      if (isStored(s)) {
        // Si no se pudo firmar (archivo borrado, etc.) igual se devuelve para poder quitarla.
        return { key: s, url: signed.get(s.slice(8)) ?? "", image: true };
      }
      return { key: s, url: s, image: /\.(png|jpe?g|gif|webp)(\?|$)/i.test(s) };
    })

}

"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "./supabase";
import { ensureAccount, getTrade, rebuildTrades } from "./db";
import { normalizeSymbol } from "./instruments";
import { parseBrokerDate } from "./time";

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim().replace(/\s/g, "").replace(",", ".");
  return s === "" ? NaN : Number(s);
};

/** Borra un trade (y sus ejecuciones, si vino del broker). */
export async function deleteTradeAction(formData: FormData) {
  const id = String(formData.get("trade_id"));
  const back = String(formData.get("back") || "/trades");
  const data = await getTrade(id);
  if (data) {
    // Todas las ejecuciones del trade de una vez y un solo recálculo: así no se
    // re-emparejan los fills de otros trades (y no se pierden sus notas).
    const ids = data.executions.map((e) => e.id);
    if (ids.length) await db().from("executions").delete().in("id", ids);
    await db().from("trades").delete().eq("id", id);
    if (ids.length) await rebuildTrades(data.trade.account_id, [data.trade.symbol]);
  }
  revalidatePath("/", "layout");
  redirect(back.startsWith("/") && !back.startsWith("//") ? back : "/trades");
}

/** Crea o actualiza un trade cargado a mano (long/short + resultado en USD). */
export async function saveManualTradeAction(formData: FormData) {
  const existingId = String(formData.get("trade_id") ?? "");
  if (existingId && !existingId.startsWith("manual:")) redirect(`/trades/${encodeURIComponent(existingId)}`);
  const errBase = existingId ? `/trades/${encodeURIComponent(existingId)}/edit` : "/trades/new";
  const when = parseBrokerDate(String(formData.get("when") ?? "").replace("T", " "), "America/Argentina/Buenos_Aires");
  const direction = String(formData.get("direction")) === "short" ? "short" : "long";
  const sign = String(formData.get("result")) === "loss" ? -1 : 1;
  const amount = Math.abs(num(formData.get("amount")));
  const qty = num(formData.get("qty"));
  const symbol = normalizeSymbol(String(formData.get("symbol") ?? "") || "MNQ");
  const accountName = String(formData.get("account") ?? "").trim() || "Apex";

  if (!when || !isFinite(amount)) redirect(errBase + "?error=" + encodeURIComponent("Completá la fecha y el monto."));

  const account = await ensureAccount(accountName);
  const pnl = Math.round(sign * amount * 100) / 100;
  const iso = when!.toISOString();
  const row = {
    account_id: account.id,
    symbol,
    direction,
    opened_at: iso,
    closed_at: iso,
    max_qty: qty > 0 ? qty : 1,
    avg_entry: 0,
    avg_exit: null,
    gross_pnl: pnl,
    commissions: 0,
    net_pnl: pnl,
    execution_ids: [],
    updated_at: new Date().toISOString(),
  };

  const id = existingId || `manual:${randomUUID()}`;
  const res = existingId
    ? await db().from("trades").update(row).eq("id", id)
    : await db().from("trades").insert({ id, ...row });
  if (res.error) redirect(errBase + "?error=" + encodeURIComponent(res.error.message));

  const setup = String(formData.get("setup") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (existingId || setup || notes) {
    await db().from("trade_journal").upsert({ trade_id: id, setup: setup || null, notes: notes || null, updated_at: new Date().toISOString() });
  }
  revalidatePath("/", "layout");
  redirect("/trades");
}

/** Sube una captura (pegada o elegida) al bucket y la suma al trade. */
export async function uploadScreenshotAction(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const tradeId = String(formData.get("trade_id"));
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return { ok: false, error: "No llegó ninguna imagen." };
  if (!file.type.startsWith("image/")) return { ok: false, error: "Solo se pueden subir imágenes." };
  if (file.size > 8 * 1024 * 1024) return { ok: false, error: "La imagen pesa más de 8 MB." };

  const ext = (file.type.split("/")[1] || "png").replace("jpeg", "jpg");
  const path = `${tradeId.replace(/[^a-zA-Z0-9-]/g, "_")}/${Date.now()}.${ext}`;
  const up = await db().storage.from("screenshots").upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type });
  if (up.error) return { ok: false, error: up.error.message };

  const { data } = await db().from("trade_journal").select("screenshots").eq("trade_id", tradeId).maybeSingle();
  const list = [...((data?.screenshots as string[] | undefined) ?? []), `storage:${path}`];
  const res = await db().from("trade_journal").upsert({ trade_id: tradeId, screenshots: list, updated_at: new Date().toISOString() });
  if (res.error) return { ok: false, error: res.error.message };
  revalidatePath(`/trades/${encodeURIComponent(tradeId)}`);
  return { ok: true };
}

export async function removeScreenshotAction(formData: FormData) {
  const tradeId = String(formData.get("trade_id"));
  const key = String(formData.get("key"));
  const { data } = await db().from("trade_journal").select("screenshots").eq("trade_id", tradeId).maybeSingle();
  const list = ((data?.screenshots as string[] | undefined) ?? []).filter((s) => s !== key);
  await db().from("trade_journal").update({ screenshots: list }).eq("trade_id", tradeId);
  if (key.startsWith("storage:")) await db().storage.from("screenshots").remove([key.slice(8)]);
  revalidatePath(`/trades/${encodeURIComponent(tradeId)}`);
}

// ---------- Checklist de reglas ----------

export async function addRuleAction(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (text) {
    const { count } = await db().from("rules").select("id", { count: "exact", head: true });
    await db().from("rules").insert({ text, position: (count ?? 0) + 1 });
  }
  revalidatePath("/", "layout");
}

export async function toggleRuleAction(formData: FormData) {
  await db().from("rules").update({ active: String(formData.get("active")) === "1" }).eq("id", String(formData.get("id")));
  revalidatePath("/", "layout");
}

export async function deleteRuleAction(formData: FormData) {
  await db().from("rules").delete().eq("id", String(formData.get("id")));
  revalidatePath("/", "layout");
}

// ---------- Journal diario ----------

export async function saveDayNoteAction(formData: FormData) {
  const day = String(formData.get("day"));
  const field = (k: string) => String(formData.get(k) ?? "").trim() || null;
  await db().from("daily_notes").upsert({
    day,
    premarket_plan: field("premarket_plan"),
    review: field("review"),
    mood: field("mood"),
    updated_at: new Date().toISOString(),
  });
  revalidatePath("/journal");
  redirect(`/journal?day=${day}&saved=1`);
}

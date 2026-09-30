import Link from "next/link";
import { getAccounts } from "@/lib/db";
import { ManualTradeForm, toArgLocal } from "@/components/ManualTradeForm";

export const dynamic = "force-dynamic";

export default async function NewManualTrade({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const accounts = await getAccounts();
  return (
    <div className="max-w-xl space-y-4">
      <Link href="/trades" className="text-sm text-muted hover:text-slate-100">← Volver a trades</Link>
      <h1 className="text-xl font-semibold">Cargar trade a mano</h1>
      {error && <div className="card border-loss/40 text-sm text-loss">{error}</div>}
      <ManualTradeForm d={{ when: toArgLocal(new Date().toISOString()), account: accounts[0]?.name ?? "Apex" }} submitLabel="Guardar trade" />
    </div>
  );
}

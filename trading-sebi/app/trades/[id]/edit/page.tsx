import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getAccounts, getTrade } from "@/lib/db";
import { ManualTradeForm, toArgLocal } from "@/components/ManualTradeForm";

export const dynamic = "force-dynamic";

export default async function EditManualTrade({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const id = decodeURIComponent((await params).id);
  const { error } = await searchParams;
  // Los trades del broker se editan desde su detalle (notas, P&L corregido, etc.).
  if (!id.startsWith("manual:")) redirect(`/trades/${encodeURIComponent(id)}`);
  const data = await getTrade(id);
  if (!data) notFound();
  const t = data.trade;
  const account = (await getAccounts()).find((a) => a.id === t.account_id);
  return (
    <div className="max-w-xl space-y-4">
      <Link href="/trades" className="text-sm text-muted hover:text-slate-100">← Volver a trades</Link>
      <h1 className="text-xl font-semibold">Editar trade</h1>
      {error && <div className="card border-loss/40 text-sm text-loss">{error}</div>}
      <ManualTradeForm
        submitLabel="Guardar cambios"
        d={{
          trade_id: t.id,
          direction: t.direction,
          pnl: Number(t.net_pnl),
          when: toArgLocal(t.opened_at),
          symbol: t.symbol,
          qty: Number(t.max_qty),
          setup: t.journal?.setup,
          notes: t.journal?.notes,
          account: account?.name,
        }}
      />
    </div>
  );
}

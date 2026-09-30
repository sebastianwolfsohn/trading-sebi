"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function AccountPicker({ accounts, current, range }: { accounts: { id: string; name: string }[]; current?: string; range?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {range !== undefined && (
        <select className="input w-auto" value={range} onChange={(e) => set("range", e.target.value === "all" ? "" : e.target.value)}>
          <option value="all">Todo el historial</option>
          <option value="7">Últimos 7 días</option>
          <option value="30">Últimos 30 días</option>
          <option value="90">Últimos 90 días</option>
        </select>
      )}
      {accounts.length > 1 && (
        <select className="input w-auto" value={current ?? ""} onChange={(e) => set("account", e.target.value)}>
          <option value="">Todas las cuentas</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      )}
    </div>
  );
}

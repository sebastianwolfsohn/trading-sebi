"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Colores validados para superficie oscura. El signo también se codifica por posición
// (arriba/abajo de 0) y con el "+/−" del tooltip, así no depende solo del color.
const WIN = "#16a34a";
const LOSS = "#e5484d";
const LINE = "#6366f1";
const GRID = "#222a38";
const AXIS = "#8b95a7";

const fmt = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const fmtFull = (n: number) => `${n < 0 ? "−" : n > 0 ? "+" : ""}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

const tooltipStyle = {
  contentStyle: { background: "#121722", border: `1px solid ${GRID}`, borderRadius: 8, fontSize: 12 },
  labelStyle: { color: AXIS },
  itemStyle: { color: "#e2e8f0" },
};

export function EquityChart({ data }: { data: { day: string; equity: number }[] }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey="day" tickFormatter={shortDay} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
        <YAxis tickFormatter={fmt} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={64} />
        <ReferenceLine y={0} stroke={AXIS} strokeDasharray="3 3" />
        <Tooltip {...tooltipStyle} formatter={(v: number) => [fmtFull(v), "P&L acumulado"]} labelFormatter={(d: string) => d} cursor={{ stroke: AXIS }} />
        <Line type="monotone" dataKey="equity" stroke={LINE} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PnlBars({ data, xKey, height = 220 }: { data: Record<string, string | number>[]; xKey: string; height?: number }) {
  if (!data.length) return <Empty />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey}
          tickFormatter={(v: string) => (xKey === "day" ? shortDay(v) : v)}
          stroke={AXIS}
          fontSize={11}
          tickLine={false}
          axisLine={false}
          minTickGap={8}
        />
        <YAxis tickFormatter={fmt} stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} width={64} />
        <ReferenceLine y={0} stroke={AXIS} />
        <Tooltip
          {...tooltipStyle}
          cursor={{ fill: "rgba(139,149,167,0.08)" }}
          formatter={(v: number, _n, item) => [`${fmtFull(v)} · ${item.payload.trades} trades`, "P&L"]}
        />
        <Bar dataKey="pnl" radius={[4, 4, 4, 4]} maxBarSize={28}>
          {data.map((d, i) => (
            <Cell key={i} fill={Number(d.pnl) >= 0 ? WIN : LOSS} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return <div className="flex h-40 items-center justify-center text-sm text-muted">Todavía no hay trades cerrados.</div>;
}

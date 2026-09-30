-- Trading Sebi — esquema de base de datos (Supabase / Postgres)
-- App de un solo usuario: todo el acceso pasa por el servidor con la service role key.
-- RLS queda activado y sin políticas, así nadie puede leer o escribir con la anon key.

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,                    -- ej. "APEX-12345-01" (el ID que muestra Tradovate)
  label text,                                   -- ej. "Apex 50k PA"
  broker text not null default 'tradovate',
  size numeric not null default 50000,          -- tamaño nominal de la cuenta
  starting_balance numeric not null default 50000,
  drawdown_type text not null default 'intraday_trail', -- intraday_trail | eod_trail | static
  drawdown_amount numeric not null default 2500,
  consistency_pct numeric not null default 30,  -- regla de consistencia (%), configurable
  min_trading_days int not null default 8,
  created_at timestamptz not null default now()
);

create table if not exists instruments (
  root text primary key,                        -- NQ, MNQ, ES, MES...
  point_value numeric not null,                 -- USD por punto
  tick_size numeric not null,
  commission_per_side numeric not null default 0 -- USD por contrato por lado (ajustalo a tu cuenta)
);

insert into instruments (root, point_value, tick_size, commission_per_side) values
  ('NQ', 20, 0.25, 0), ('MNQ', 2, 0.25, 0),
  ('ES', 50, 0.25, 0), ('MES', 5, 0.25, 0),
  ('YM', 5, 1, 0), ('MYM', 0.5, 1, 0),
  ('RTY', 50, 0.1, 0), ('M2K', 5, 0.1, 0),
  ('CL', 1000, 0.01, 0), ('MCL', 100, 0.01, 0),
  ('GC', 100, 0.1, 0), ('MGC', 10, 0.1, 0)
on conflict (root) do nothing;

create table if not exists executions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  broker_fill_id text not null,                 -- ID único del fill (o de la orden) en Tradovate
  symbol text not null,                         -- ej. MNQZ6
  side text not null check (side in ('buy','sell')),
  qty numeric not null check (qty > 0),
  price numeric not null,
  commission numeric,                           -- null = usar la comisión default del instrumento
  executed_at timestamptz not null,
  source text not null default 'extension',     -- extension | csv | manual
  raw jsonb,
  created_at timestamptz not null default now(),
  unique (account_id, broker_fill_id)
);
create index if not exists executions_account_symbol_time on executions (account_id, symbol, executed_at);

-- Los trades se recalculan a partir de las ejecuciones. El id es determinístico
-- (cuenta:símbolo:primer fill), así tus notas no se pierden al recalcular.
create table if not exists trades (
  id text primary key,
  account_id uuid not null references accounts(id) on delete cascade,
  symbol text not null,
  direction text not null check (direction in ('long','short')),
  opened_at timestamptz not null,
  closed_at timestamptz,                        -- null = posición abierta
  max_qty numeric not null,
  avg_entry numeric not null,
  avg_exit numeric,
  gross_pnl numeric not null default 0,
  commissions numeric not null default 0,
  net_pnl numeric not null default 0,
  execution_ids uuid[] not null default '{}',
  updated_at timestamptz not null default now()
);
create index if not exists trades_account_opened on trades (account_id, opened_at desc);

-- Todo lo que editás a mano vive acá, separado de lo automático.
create table if not exists trade_journal (
  trade_id text primary key references trades(id) on delete cascade,
  setup text,
  notes text,
  mistakes text[] not null default '{}',
  emotion text,
  rating int check (rating between 1 and 5),
  planned_stop numeric,
  planned_target numeric,
  pnl_override numeric,                         -- si querés corregir el P&L neto a mano
  screenshots text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists daily_notes (
  day date primary key,
  premarket_plan text,
  review text,
  mood text,
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;
alter table instruments enable row level security;
alter table executions enable row level security;
alter table trades enable row level security;
alter table trade_journal enable row level security;
alter table daily_notes enable row level security;

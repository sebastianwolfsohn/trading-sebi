# Trading Sebi

Journal de trading propio: cada ejecución que hacés en TradingView sobre tu cuenta Apex (Tradovate) entra sola al journal, se agrupa en trades y la podés anotar y analizar.

## Cómo funciona

```
TradingView (con Tradovate) ──► Extensión de Chrome ──► /api/ingest ──► Supabase ──► App web
CSV de Tradovate (respaldo) ─────────────────────────► /import ─────┘
```

- **Extensión de Chrome** (`extension/`): lee el tráfico entre TradingView y Tradovate, detecta cada fill y lo manda a tu journal. Solo lee, nunca envía órdenes.
- **App web** (Next.js): Dashboard, Trades, detalle editable de cada trade, Cuenta Apex e Importar.
- **Supabase**: base de datos (`supabase/schema.sql`).

## Puesta en marcha

### 1. Supabase
1. Creá un proyecto en [supabase.com](https://supabase.com) (plan free).
2. SQL Editor → pegá el contenido de `supabase/schema.sql` → Run.
3. Project Settings → API: copiá la **Project URL** y la **service_role key**.
4. Opcional: tabla `instruments` → cargá la comisión por lado de tus contratos (`commission_per_side`).

### 2. Deploy en Vercel
1. Subí esta carpeta a un repo de GitHub (sin la carpeta `node_modules`).
2. En Vercel → Add New Project → importá el repo.
3. Environment Variables (ver `.env.example`):
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_PASSWORD` → la contraseña para entrar a la app
   - `INGEST_TOKEN` → un texto largo y aleatorio (mínimo 16 caracteres)
4. Deploy. Entrá a la URL y logueate con `APP_PASSWORD`.

### 3. Extensión de Chrome
1. Chrome → `chrome://extensions` → activá **Modo desarrollador** → **Cargar descomprimida** → elegí la carpeta `extension`.
2. En las opciones de la extensión completá:
   - URL del journal (ej. `https://trading-sebi.vercel.app`)
   - Token (el mismo `INGEST_TOKEN`)
   - Cuenta por defecto: el nombre exacto de tu cuenta en Tradovate (ej. `APEX-12345-01`)
3. Tocá **Probar conexión**. Tiene que decir "Conexión OK".
4. Abrí (o recargá) TradingView con Tradovate conectado. Operá y el trade aparece en el journal.

### Si la extensión no detecta los trades
Activá **Modo diagnóstico** en las opciones, recargá TradingView, abrí la consola (F12 → Console) y filtrá por `Trading Sebi`. Mandame lo que aparece: con eso ajustamos la detección.

## Importar CSV (respaldo)
Tradovate → menú de la cuenta → ⚙️ → **Account Reports** → pestaña **Fills** (o **Orders**) → Download → subilo en **Importar**. Los duplicados se ignoran, así que podés subir el mismo rango varias veces. Elegí la zona horaria del archivo (normalmente la tuya, Buenos Aires).

## Desarrollo local
```bash
npm install
cp .env.example .env.local   # completá los valores
npm run dev                  # http://localhost:3000
npm test                     # tests del armado de trades, CSV y reglas de Apex
```

## Notas
- **Día de trading**: se agrupa como CME/Apex, de 18:00 a 17:00 hora de Nueva York.
- **Cuenta Apex**: el tracker usa P&L realizado. Con trailing intradía Apex también sigue ganancias no realizadas, así que es una aproximación: confirmá siempre con el dashboard de Apex. La regla de consistencia y el drawdown se configuran en la pantalla Cuenta Apex.
- **Editar**: todo lo que cargás a mano (setup, notas, errores, stop, P&L corregido) vive en `trade_journal` y no se pierde cuando entran nuevas ejecuciones.

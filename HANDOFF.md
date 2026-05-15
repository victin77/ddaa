# Handoff — próxima sessão

## Status atual: migração SQLite → Postgres (Railway) em 2026-05-15

### Por que migramos
O sistema usava `node:sqlite` com o arquivo `server/data/data.sqlite` dentro do container do Railway. Como Railway free tier (sem volume) tem **filesystem efêmero**, qualquer `git push` que disparava redeploy zerava o banco. Foi isso que apagou as 88 vendas importadas via Excel.

A solução foi migrar pro Postgres gerenciado do próprio Railway — os dados ficam num serviço separado que persiste entre deploys.

### O que mudou tecnicamente

**Stack do banco:**
- Antes: `node:sqlite` (síncrono, arquivo local)
- Agora: `pg` (Pool, async, conexão remota via `DATABASE_URL`)

**`server/src/db.ts` reescrito:**
- Exporta API async: `db.queryOne / queryAll / queryRun / exec`
- Helper `tx(fn)` pra transações (usado em `wipe-all`, `wipe-sales`, seed `--reset`)
- `initDb()` cria todas as tabelas (idempotente, `CREATE TABLE IF NOT EXISTS`) + seed do admin
- Type parsers configurados pra retornar `BIGINT`→number, `NUMERIC`→number, `DATE`→string YYYY-MM-DD (mantém compatível com frontend que esperava strings)
- SSL automático: se `DATABASE_URL` não for `localhost`, usa SSL `rejectUnauthorized:false` (Railway exige)

**Schema em sintaxe Postgres** (`SCHEMA_SQL` em `db.ts`):
- `SERIAL` no lugar de `INTEGER PRIMARY KEY AUTOINCREMENT`
- `DOUBLE PRECISION` no lugar de `REAL`
- `DATE` no lugar de `TEXT` (com type parser pra continuar string no driver)
- Trigger `BEFORE UPDATE` em `sales` pra `updated_at` (função `trg_set_updated_at`)
- Foreign keys com `ON DELETE CASCADE/SET NULL` inline

**Routes (todos os 6 arquivos) e `seed.ts`:**
- Convertidos pra `async/await`
- Placeholders `?` → `$1, $2, $3...`
- `info.lastInsertRowid` → `INSERT ... RETURNING id` + `r.rows[0].id`
- `COLLATE NOCASE` → `LOWER(coluna)` em ORDER BY
- Funções SQLite-only convertidas: `date('now')` → `CURRENT_DATE`, `datetime('now')` → `NOW()`, `date(x, '+5 days')` → `x + INTERVAL '5 days'`, `abs(random()) % 5` → `floor(random()*5)::int`, `date('now','start of month')` → `date_trunc('month', CURRENT_DATE)`
- `index.ts` agora espera `initDb()` resolver antes de chamar `app.listen()`

### Como rodar local

`server/.env` precisa ter `DATABASE_URL=postgresql://...` apontando pra um Postgres acessível (atualmente o público do Railway).

```bash
cd C:\Users\Vitor\Desktop\racon-comissoes
npm run dev
# backend conecta no Railway Postgres, frontend em localhost:5173
```

Seed:
```bash
npm --prefix server run seed            # popula se vazio
npm --prefix server run seed -- --reset # zera e regenera
```

### O que falta fazer (operacional)

1. **Configurar `DATABASE_URL` no Railway no serviço do app**:
   - No painel, no serviço do app, Variables → adicionar `DATABASE_URL` com `${{Postgres.DATABASE_URL}}` (referência interna ao serviço Postgres).
2. **Deploy** (git push) e re-importar o Excel das 88 vendas no sistema online. Daqui pra frente persiste.
3. **Rotacionar a senha do Postgres** depois que estabilizar (painel do Railway tem "Reset password" no serviço Postgres). A URL atual foi compartilhada no chat de desenvolvimento.

### Sugestão pra futuro: migrar pra Prisma

Hoje usamos `pg` puro — SQL escrito à mão com `$1, $2`. Funciona, mas perde uma camada que o time já usa em outro projeto (CRM Leads). Se o sistema crescer, vale considerar Prisma:

**Vantagens:**
- Types autogerados do schema (sem precisar manter `types.ts` em sincronia manualmente)
- Migrations versionadas (`prisma migrate`) em vez de `CREATE TABLE IF NOT EXISTS` no código
- Consultas com autocomplete e relações tipadas
- Mesmo padrão do CRM Leads — facilita manter os dois projetos

**Custo da migração:**
- Reescrever todas as queries (~42) no DSL do Prisma
- Adicionar `prisma/schema.prisma` espelhando o schema atual
- `npx prisma migrate dev --name init` na primeira vez pra criar o estado inicial
- Refatorar `db.ts` pra exportar `PrismaClient` no lugar do Pool

Estimativa: 1-2 sessões de trabalho. Não é urgente — a stack atual está sólida e o ganho seria de DX e consistência entre projetos.

### Outras pendências / sugestões herdadas

- `xlsx` tem 1 vulnerabilidade `high` reportada pelo `npm audit` sem fix do mantenedor. Pra eliminar, considerar trocar por `exceljs`.
- Code-split do bundle do client (warning do Vite: `> 500kB`). `lazy()` nas páginas Vendas/Ranking/Consultores/Settings.
- Validar visualmente o tema claro em todas as páginas (Dashboard, Vendas, Ranking, Consultores, Configurações, Login, Modais).
- Testar o ripple (toggle de tema) no Safari/Firefox — `startViewTransition` ainda é Chromium-only; já tem fallback graceful.
- A bolinha indicadora da tooltip do Cash Flow (`bg-white` no centro com borda accent) some no tema claro porque card também é branco; considerar trocar para `bg-bg-card` ou `bg-ink` se ficar feio.

### Estado da stack (atualizado)
- Backend: TypeScript + Express + **`pg` (Postgres Pool)** em Node 24
- Frontend: Vite + React + Tailwind 3.4 + Recharts + lucide-react
- Banco: **Postgres gerenciado pelo Railway** (sem mais `data.sqlite` no repo)
- Login default: `admin / admin`

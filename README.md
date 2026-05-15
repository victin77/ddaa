# RACON — Painel de Comissões

> **Software proprietário.** Todos os direitos reservados.
> Copyright © 2026 Victor Cauã Botelho Generoso da Silva. Veja [`LICENSE`](./LICENSE).
> Este código é publicado em repositório público apenas para fins de portfólio.
> **Nenhum uso, cópia, modificação ou redistribuição é autorizado sem permissão expressa, prévia e por escrito do autor.**

Dashboard em TypeScript para cadastrar vendas de consórcio, calcular comissões parceladas, acompanhar inadimplência (boleto atrasado / fase de cancelamento), gamificar o ranking e importar/exportar planilhas Excel.

## Stack

- **Backend** Node 24 + Express + TypeScript + `node:sqlite` (módulo nativo, sem deps nativas) + JWT (cookie HTTP-only) + bcrypt + xlsx
- **Frontend** Vite + React + TypeScript + Tailwind CSS + Recharts + lucide-react
- **DB** SQLite local em `server/data/data.sqlite` (criado automaticamente)

## Setup

```bash
# instala tudo (raiz, server, client)
npm run install:all

# copia o env do server
cp server/.env.example server/.env   # ou copy no Windows

# roda backend (4000) + frontend (5173) em paralelo
npm run dev
```

Abra `http://localhost:5173`. O frontend faz proxy de `/api/*` pra `http://localhost:4000`.

### Login inicial
- Admin: `admin / admin` (configurável via `ADMIN_USERNAME` / `ADMIN_PASSWORD` no `.env`)

### Senhas de consultor
Em ordem de prioridade:
1. Senha manual em `Configurações` (admin) — gravada como bcrypt no banco
2. Mapa em `CONSULTANT_PASSWORDS_JSON` (ex: `{"joao":"senha123"}`)
3. `CONSULTANT_DEFAULT_PASSWORD`
4. Determinística: `Rc` + sha256(`usuario:id:SESSION_SECRET`).slice(0,12) + `!`

## Build de produção

```bash
npm run build       # compila server (dist/) e client (client/dist)
npm start           # roda server servindo o client buildado
```

## API resumida

| Método | Rota | Acesso |
| --- | --- | --- |
| POST | `/api/auth/login` | público |
| POST | `/api/auth/logout` | autenticado |
| GET | `/api/auth/me` | autenticado |
| GET | `/api/public/consultants` | público |
| GET | `/api/consultants` | autenticado |
| POST/PUT | `/api/consultants[/:id]` | admin |
| POST | `/api/consultants/:id/create-login` | admin |
| DELETE | `/api/consultants/:id/login` | admin |
| GET/POST/PUT/DELETE | `/api/sales[/:id]` | autenticado (consultor só vê o próprio) |
| PUT | `/api/sales/:id/quotas` | autenticado |
| PUT | `/api/sales/:id/installments` | autenticado |
| GET | `/api/summary` | autenticado |
| GET | `/api/ranking?start=&end=` | autenticado |
| GET | `/api/recebimentos?month=&consultant_id=` | autenticado |
| POST | `/api/import/xlsx` | admin |
| GET | `/api/export/xlsx?scope=me\|all` | autenticado (all = admin) |

## Regras de negócio

- `total_commission = base_value × (commission_percentage / 100)` (2 casas)
- 6 parcelas mensais por padrão, última recebe o ajuste de centavos
- Status automático `overdue` se passou do vencimento e não está paga
- `bill_overdue + ≥CANCELLATION_PHASE_DAYS dias sem pagamento` → "Fase de cancelamento"
- Cotas individuais são a fonte da `base_value` (recálculo no PUT `/quotas`)

## Estrutura

```
racon-comissoes/
├── server/        Express + SQLite
│   └── src/
│       ├── index.ts
│       ├── db.ts (schema + seed admin)
│       ├── auth.ts, middleware.ts
│       ├── routes/{auth,public,consultants,sales,metrics,excel}.ts
│       └── utils/{commission,tiers}.ts
└── client/        Vite + React
    └── src/
        ├── App.tsx, main.tsx, auth.tsx
        ├── components/{Layout,KpiCard,Charts,Modal,StatusPill,fuzzy}.tsx
        └── pages/{Login,Dashboard,Sales,SaleFormModal,SaleDetailsModal,Ranking,Consultants,Settings}.tsx
```

## Licença

Software proprietário. **Todos os direitos reservados** a Victor Cauã Botelho
Generoso da Silva. Veja [`LICENSE`](./LICENSE) para os termos completos
(versão em português e em inglês).

A visualização pública deste repositório **não autoriza** uso, cópia,
modificação, redistribuição ou exploração comercial do código por terceiros.
Qualquer uso requer autorização expressa, prévia e por escrito do autor.

Amparado pela Lei nº 9.610/1998 (Lei de Direitos Autorais) e Lei nº 9.609/1998
(Lei do Software).

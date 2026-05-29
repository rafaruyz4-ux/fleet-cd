# Frota CD — Dashboard do Gestor (frontend)

Painel web para gestores da operação de frota. Consome a API REST do backend
(`../`, Express na porta 3000).

## Stack

- **React 19 + Vite + TypeScript**
- **Tailwind CSS v4** (config via `@theme` em `src/index.css`) + componentes estilo **shadcn/ui** (`src/components/ui`)
- **React Router** (rotas autenticadas em `src/App.tsx`)
- **TanStack Query** (cache/fetch — hooks em `src/api/hooks.ts`)
- **MapLibre GL** (mapa de trajetória/rota/alertas, tiles OpenStreetMap, sem token) — carregado sob demanda (lazy) só na tela de detalhe

## Como rodar (desenvolvimento)

Pré-requisito: a **API** precisa estar no ar na porta 3000 (ver README do backend:
`npm run db:up` → `npm run migrate` → `npm run seed` → `npm run dev`).

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
```

O Vite faz **proxy** de `/api` e `/health` para `http://localhost:3000`
(ver `vite.config.ts`), então não há configuração de CORS nem variável de
ambiente necessária em dev.

Login inicial (seed do backend): `admin@cd.local` / `trocar-senha-123`.

## Scripts

- `npm run dev` — servidor de desenvolvimento (HMR)
- `npm run build` — typecheck (`tsc -b`) + build de produção (`dist/`)
- `npm run preview` — serve o build de produção localmente

## Estrutura

```
src/
  api/hooks.ts        # hooks TanStack Query por domínio
  components/
    ui/               # primitivos estilo shadcn (button, card, table, …)
    AppLayout.tsx     # shell: sidebar + topbar + <Outlet>
    TripMap.tsx       # mapa MapLibre da viagem (lazy)
    StatusBadge.tsx   # badges de status (viagem, parada, alerta, multa, NF)
    DataState.tsx     # loading / erro / vazio
    Pagination.tsx
  lib/
    api.ts            # client HTTP + refresh automático de token (single-flight)
    auth.tsx          # AuthProvider/useAuth (sessão do gestor)
    token-store.ts    # tokens em localStorage
    format.ts         # formatação pt-BR (datas, BRL, CPF)
    map-style.ts      # estilo raster OSM
  pages/              # uma página por rota
  types.ts            # tipos espelhando os contratos da API
```

## Telas

- **Visão geral** — KPIs (viagens em andamento, alertas novos, multas a revisar, veículos ativos) + alertas recentes
- **Viagens** — lista com filtros (status/veículo/motorista), paginação e **criação de viagem** (seleção de NFs disponíveis para alocar como paradas)
- **Detalhe da viagem** — resumo, mapa (trajetória GPS + rota planejada + alertas), paradas (com ação de entrega) e ciclo de vida (iniciar/encerrar/cancelar)
- **Alertas** — feed do gestor com filtros e "marcar como visto"
- **Multas** — lista com filtros, re-vínculo automático à viagem e **lançamento manual** (vínculo automático por veículo + data)
- **Notas fiscais** — lista + importação de NF-e via XML
- **Cadastros** — abas de veículos, motoristas, unidades e rotas planejadas com **CRUD completo** (criar/editar/excluir em modal)

## Produção

Tiles OSM são adequados para uso interno/desenvolvimento. Para produção de alto
volume, trocar `OSM_STYLE` em `src/lib/map-style.ts` por um provedor de tiles
próprio. O `dist/` é estático; servir atrás do mesmo domínio da API (ou
configurar `CORS_ORIGINS` no backend).

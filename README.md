# Sistema de Gestão de Frota do CD — Backend

Backend/API do sistema de gestão de frota do Centro de Distribuição.
Node.js + Express + TypeScript, PostgreSQL + PostGIS e Redis.

> **Status:** Integração NF-e (Sprint 7) — import de NF-e a partir do XML
> (`POST /nfs/importar`, funcional e testado) e consulta à SEFAZ por chave
> (`POST /nfs/sefaz`) com o certificado A1, **pronta para configurar** (responde
> 501 enquanto o certificado não é informado). Backend completo nos Sprints 1–6:
> 1 (setup, PostGIS, JWT, cadastros), 2 (NFs + itens), 3 (viagens + paradas),
> 4 (login do motorista), 5 (telemetria: GPS, rotas e alertas) e 6 (multas +
> vínculo automático).

## Pré-requisitos

- [Node.js 20+](https://nodejs.org/)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (para Postgres/PostGIS e Redis)

## Passo a passo

```powershell
# 1. Instalar dependências
npm install

# 2. Criar o arquivo de ambiente a partir do exemplo
Copy-Item .env.example .env
#    -> edite .env e troque os segredos JWT e a senha do admin

# 3. Subir banco (PostGIS) e Redis via Docker
npm run db:up

# 4. Aplicar as migrations (cria as tabelas)
npm run migrate

# 5. Criar o usuário administrador inicial
npm run seed

# 6. Rodar a API em modo desenvolvimento (hot reload)
npm run dev
```

A API sobe em `http://localhost:3000`. Healthcheck: `GET /health`.

## Scripts

| Script             | Descrição                                              |
| ------------------ | ------------------------------------------------------ |
| `npm run dev`      | API com hot reload (tsx watch)                         |
| `npm run build`    | Compila TypeScript para `dist/`                        |
| `npm start`        | Roda a versão compilada                                |
| `npm run typecheck`| Checagem de tipos sem emitir                           |
| `npm run migrate`  | Aplica migrations pendentes                            |
| `npm run seed`     | Cria o usuário admin inicial (idempotente)             |
| `npm run db:up`    | Sobe Postgres + Redis (docker compose)                 |
| `npm run db:down`  | Derruba os containers                                  |
| `npm test`         | Roda a suíte de testes (Vitest, requer o banco no ar)  |
| `npm run test:watch`| Testes em modo watch                                  |

## Endpoints (Sprints 1–6)

Todos sob o prefixo `/api`. Exceto os endpoints de login e `/auth/refresh`,
exigem header `Authorization: Bearer <accessToken>`.

**Dois tipos de principal**, distinguidos por um campo `tipo` no token:
`usuario` (gestor/admin do dashboard) e `motorista` (app). Tokens de motorista
**não** acessam os CRUDs do dashboard (403) e vice-versa.

| Método | Rota                    | Descrição                               |
| ------ | ----------------------- | --------------------------------------- |
| POST   | `/auth/login`           | Login do gestor (email + senha)         |
| GET    | `/auth/me`              | Perfil do gestor autenticado            |
| POST   | `/auth/motorista/login` | Login do motorista (CPF + senha)        |
| GET    | `/auth/motorista/me`    | Perfil do motorista autenticado         |
| POST   | `/auth/refresh`         | Novo access token (gestor ou motorista) |
| GET    | `/motoristas`       | Lista motoristas                   |
| POST   | `/motoristas`       | Cria motorista                     |
| GET    | `/motoristas/:id`   | Detalha motorista                  |
| PATCH  | `/motoristas/:id`   | Atualiza motorista                 |
| DELETE | `/motoristas/:id`   | Inativa motorista (soft delete)    |
| GET    | `/veiculos`         | Lista veículos                     |
| POST   | `/veiculos`         | Cria veículo                       |
| ...    | `/veiculos/:id`     | GET / PATCH / DELETE               |
| GET    | `/unidades`         | Lista unidades próprias            |
| POST   | `/unidades`         | Cria unidade                       |
| ...    | `/unidades/:id`     | GET / PATCH / DELETE               |
| GET    | `/nfs`              | Lista NFs (filtros + paginação)    |
| POST   | `/nfs`              | Cria NF (com itens opcionais)      |
| GET    | `/nfs/:id`          | Detalha NF (inclui itens)          |
| PATCH  | `/nfs/:id`          | Atualiza NF / substitui itens      |
| DELETE | `/nfs/:id`          | Remove NF (hard delete + cascata)  |

**Filtros de `GET /nfs`** (query string, todos opcionais): `status`
(`importada`/`alocada`/`em_viagem`/`entregue`), `destinatario_cnpj`,
`unidade_propria_id`, `de`/`ate` (janela de `emitida_em`), `busca` (número ou
nome do destinatário), `limit` (1–200, padrão 50) e `offset`. A resposta é um
envelope `{ data, total, limit, offset }`.

### Viagens e paradas (Sprint 3)

| Método | Rota                                | Descrição                                   |
| ------ | ----------------------------------- | ------------------------------------------- |
| GET    | `/viagens`                          | Lista viagens (filtros + `paradas_count`)   |
| POST   | `/viagens`                          | Cria viagem (com `nf_ids` → paradas)        |
| GET    | `/viagens/:id`                      | Detalha viagem (veículo, motorista, paradas)|
| PATCH  | `/viagens/:id`                      | Atualiza viagem (rota, km, veículo, etc.)   |
| POST   | `/viagens/:id/iniciar`              | Inicia (marca `iniciada_em` + `km_inicial`) |
| POST   | `/viagens/:id/encerrar`             | Encerra (marca `encerrada_em` + `km_final`) |
| POST   | `/viagens/:id/cancelar`             | Cancela a viagem                            |
| POST   | `/viagens/:id/paradas`              | Adiciona NF como parada                     |
| PATCH  | `/viagens/:id/paradas/:paradaId`    | Atualiza parada (status, horários, ordem)   |
| DELETE | `/viagens/:id/paradas/:paradaId`    | Remove parada da viagem                     |

**Ciclo de vida:** uma viagem nasce `em_andamento` (sem `iniciada_em`).
`iniciar` registra a partida; `encerrar` (exige viagem já iniciada e valida
`km_final >= km_inicial`) muda para `encerrada`; `cancelar` muda para
`cancelada`. **Filtros de `GET /viagens`**: `status`, `veiculo_id`,
`motorista_id`, `de`/`ate` (sobre `criado_em`), `limit`, `offset` — também
envelope `{ data, total, limit, offset }`.

**Status da NF acompanha a operação automaticamente:** alocar parada →
`alocada`; iniciar a viagem → NFs viram `em_viagem`; parada marcada `entregue`
→ NF `entregue` (e `chegada_real` preenchida se vazia); cancelar a viagem ou
remover a parada → NF não entregue volta a `importada`.

### Telemetria: GPS, rotas e alertas (Sprint 5)

| Método | Rota                          | Quem    | Descrição                                  |
| ------ | ----------------------------- | ------- | ------------------------------------------ |
| GET    | `/app/viagens`                | app     | Viagens do motorista (em andamento 1º)     |
| POST   | `/app/viagens/:id/posicoes`   | app     | Ingestão de posições GPS (lote)            |
| GET    | `/viagens/:id/posicoes`       | gestor  | Trajeto da viagem (pontos ordenados)       |
| GET    | `/viagens/:id/alertas`        | gestor  | Alertas de uma viagem                      |
| GET    | `/alertas`                    | gestor  | Feed de alertas (filtros + paginação)      |
| PATCH  | `/alertas/:id`                | gestor  | Marca alerta como visualizado              |
| GET    | `/rotas` · POST · GET/PATCH/DELETE `/rotas/:id` | gestor | CRUD de rotas planejadas |

As rotas do **app** (`/api/app/*`) exigem token de **motorista**; as demais,
de **gestor**.

**Detecção de alertas (na ingestão de cada lote):** `velocidade_alta`
(> 110 km/h), `desvio_rota` (distância à `linha` da rota > `raio_tolerancia_m`),
`parada_longa` (parado em ~50 m por > 15 min) e `sem_gps` (intervalo entre
pontos > 10 min). Há um *cooldown* de 5 min por tipo para evitar floods. Os
limiares são constantes em `gps.service.ts`.

**Worker de `sem_gps` (detecção proativa):** a detecção acima é reativa (só
quando chega o próximo ponto). Um worker periódico (`src/workers/sem-gps.ts`,
iniciado no `index.ts`) varre as viagens em andamento e gera o alerta `sem_gps`
quando o veículo **para de transmitir** há mais que `WORKER_SEM_GPS_LIMITE_MIN`
(padrão 10). Faz dedup (não re-alerta enquanto não chega nova posição) e usa o
**Redis como lock distribuído** (`src/infra/redis.ts`) para que só uma instância
rode a varredura por vez — degradando para execução sem lock se o Redis não
estiver disponível. Configurável por `WORKER_SEM_GPS_ENABLED` /
`WORKER_SEM_GPS_INTERVALO_S` / `WORKER_SEM_GPS_LIMITE_MIN`.

### Multas (Sprint 6)

| Método | Rota                    | Descrição                                      |
| ------ | ----------------------- | ---------------------------------------------- |
| GET    | `/multas`               | Lista multas (filtros + paginação)             |
| POST   | `/multas`               | Cria multa (com vínculo automático)            |
| GET    | `/multas/:id`           | Detalha multa                                  |
| PATCH  | `/multas/:id`           | Atualiza (status de pagamento/revisão, etc.)   |
| POST   | `/multas/:id/revincular`| Re-roda o vínculo automático                   |
| DELETE | `/multas/:id`           | Remove multa (hard delete)                     |

Na criação, informe `veiculo_id` **ou** `placa` (resolvida para o veículo). Se
houver veículo + `ocorrida_em`, o sistema busca a viagem que estava em curso
naquele instante (não cancelada, `iniciada_em <= ocorrida_em <= encerrada_em`,
usando o índice `idx_viagens_periodo`) e preenche `viagem_id` + `motorista_id`,
marcando `status_revisao = auto_vinculada`. Sem viagem correspondente, fica
`aguardando_revisao`. `POST /multas/:id/revincular` re-roda essa busca (útil
quando a viagem é cadastrada depois da multa). **Filtros de `GET /multas`**:
`status_pagamento`, `status_revisao`, `fonte`, `veiculo_id`, `motorista_id`,
`de`/`ate` (sobre `ocorrida_em`), `busca` (nº do auto ou tipo), `limit`,
`offset` — envelope `{ data, total, limit, offset }`.

### Integração NF-e (Sprint 7)

| Método | Rota             | Descrição                                            |
| ------ | ---------------- | ---------------------------------------------------- |
| POST   | `/nfs/importar`  | Importa NF-e a partir do XML (`{ "xml": "<...>" }`)  |
| POST   | `/nfs/sefaz`     | Consulta a NF-e na SEFAZ por chave e importa         |

O parser de XML (`src/integrations/nfe/parser.ts`) extrai chave, número, série,
CFOP, emissão, destinatário/endereço, valor, peso e itens, e reaproveita o
`nfs.service` (mesma validação e a deduplicação por chave → 409 se já importada).
Há um XML de exemplo em [`samples/nfe-exemplo.xml`](./samples/nfe-exemplo.xml).

**SEFAZ — pronta para configurar:** `POST /nfs/sefaz` usa o mesmo parser, mas
busca o XML na SEFAZ via mTLS com o certificado A1. O *plumbing* (config,
carregamento do `.pfx`, agente mTLS, endpoint por UF) está pronto em
`src/integrations/sefaz/client.ts`; falta apenas integrar a chamada do web
service (NFeDistribuicaoDFe), que depende do seu CNPJ/UF — por isso o endpoint
responde **501** até que `SEFAZ_CERT_PFX_PATH`/`SEFAZ_CERT_PASSWORD` sejam
definidos e a chamada seja completada (ver comentários no arquivo). O `.pfx`
nunca é versionado (`.gitignore`).

Veja exemplos de requisições em [`requests.http`](./requests.http).

## Deploy (produção)

Stack completa em containers: **Postgres(PostGIS) + Redis + API + Web(Nginx)**,
definida em `docker-compose.prod.yml`. O Nginx serve o front (build do Vite) e
faz proxy de `/api` e `/health` para a API — tudo na **mesma origem** (sem CORS).

**Imagens:**
- `Dockerfile` (raiz) — API multi-stage: compila o TS e roda só com deps de
  produção, como usuário não-root. O `docker-entrypoint.sh` aplica as
  migrations e o seed do admin (idempotente) antes de subir o servidor.
- `frontend/Dockerfile` — build do Vite servido por Nginx (`frontend/nginx.conf`
  faz o SPA fallback e o proxy da API).

**Passo a passo:**

```bash
# 1. Configurar segredos de produção
cp .env.prod.example .env.prod
#    edite .env.prod: troque POSTGRES_PASSWORD, os JWT_*_SECRET
#    (openssl rand -hex 32) e SEED_ADMIN_SENHA

# 2. Buildar e subir (projeto isolado para não colidir com o dev)
docker compose --env-file .env.prod -f docker-compose.prod.yml -p fleet-cd-prod up -d --build

# 3. Acessar o dashboard
#    http://localhost:8080  (ajuste WEB_PORT no .env.prod)
#    login inicial: SEED_ADMIN_EMAIL / SEED_ADMIN_SENHA

# Logs / parada
docker compose -p fleet-cd-prod -f docker-compose.prod.yml logs -f
docker compose -p fleet-cd-prod -f docker-compose.prod.yml down        # mantém os dados
docker compose -p fleet-cd-prod -f docker-compose.prod.yml down -v      # apaga os volumes
```

> **Sempre use `-p fleet-cd-prod`** (ou outro nome) para isolar do ambiente de
> desenvolvimento — sem isso o compose reutiliza o projeto padrão (`fleet-cd`) e
> os volumes do dev. Em prod, só o serviço `web` publica porta; banco/redis/API
> ficam na rede interna. As migrations rodam automaticamente a cada boot da API.

## Estrutura

```
migrations/        SQL versionado (runner idempotente em src/db/migrate.ts)
src/
  config/          carregamento e validação de variáveis de ambiente
  db/              pool de conexão, runner de migrations e seed
  errors/          AppError (erros com status HTTP)
  middleware/      auth (JWT), validação (Zod), tratamento de erros
  modules/         um diretório por recurso (schemas + service + routes)
  utils/           hash de senha (bcrypt) e tokens JWT
  app.ts           montagem do Express
  index.ts         entrypoint do servidor
```

## Testes

Suíte de integração com **Vitest + supertest**, exercitando a API real
(in-process, sem subir servidor) contra um **banco de teste dedicado**
(`fleet_cd_test`), isolado do banco de desenvolvimento.

```powershell
npm run db:up   # Postgres precisa estar no ar
npm test
```

- `test/global-setup.ts` recria o `fleet_cd_test` do zero, aplica as migrations
  e cria o admin — **uma vez** por execução.
- `test/setup.ts` zera as tabelas de domínio **antes de cada teste** (mantém o
  admin), garantindo isolamento. Os arquivos rodam em série (compartilham o banco).
- Config e credenciais de teste em `vitest.config.ts` (`test.env`) e `test/config.ts`.
- Cobertura: auth (gestor/motorista/isolamento), NFs, viagens+paradas (com
  transição de status da NF), telemetria (GPS + os 4 alertas), multas
  (auto-vínculo) e import de NF-e por XML. **32 testes.**

> Os arquivos em `test/` não entram no `tsconfig` de build (não vão para `dist/`).

## Decisões / notas

- **`usuarios`** (gestores do dashboard) foi adicionada ao modelo original para
  autenticar o acesso ao dashboard. O login do **motorista** (CPF + senha, no
  app Android) foi entregue na Sprint 4 e usa a coluna `senha_hash` de
  `motoristas` (definida pelo gestor ao criar/editar o motorista; `tem_senha`
  indica se já tem acesso ao app). O CPF é normalizado (só dígitos) no login,
  então casa independente da pontuação salva.
- **Soft delete**: motoristas/veículos/unidades têm histórico (viagens, multas);
  `DELETE` apenas marca `ativo = FALSE`.
- **NFs usam hard delete** (não têm coluna `ativo`): `DELETE /nfs/:id` remove a NF,
  apaga os `itens_nf` em cascata e zera o `nf_id` das `paradas` (ON DELETE SET NULL).
- **Itens da NF**: enviados no `POST` (opcionais) e, no `PATCH`, o array `itens`
  (quando presente) **substitui por completo** o conjunto atual — tudo em transação.
- **`bcryptjs`** (JS puro) em vez de `bcrypt` para evitar compilação nativa no
  Windows.
- **Certificado A1 (.pfx)** nunca deve ser versionado — já está no `.gitignore`.
```

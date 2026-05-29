# syntax=docker/dockerfile:1

# ---------- Stage 1: build (compila TS → dist/) ----------
FROM node:22-alpine AS build
WORKDIR /app

# Instala todas as deps (inclui devDeps para o tsc).
COPY package.json package-lock.json ./
RUN npm ci

# Compila.
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---------- Stage 2: runtime (só deps de produção) ----------
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Só dependências de produção (bcryptjs/pg/redis são JS puro / prebuilt).
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Artefatos: dist compilado + migrations .sql (lidas em runtime pelo migrate).
COPY --from=build /app/dist ./dist
COPY migrations ./migrations
COPY docker-entrypoint.sh ./

# Roda como usuário não-root (o usuário 'node' já existe na imagem oficial).
RUN chmod +x docker-entrypoint.sh && chown -R node:node /app
USER node

EXPOSE 3000

# Healthcheck simples no endpoint público /health.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]

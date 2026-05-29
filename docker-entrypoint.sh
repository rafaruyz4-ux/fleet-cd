#!/bin/sh
# Entrypoint da API em produção: aplica migrations, garante o admin (seed
# idempotente) e inicia o servidor. Espera-se que o Postgres já esteja
# saudável (docker-compose usa depends_on: condition: service_healthy).
set -e

echo "[entrypoint] aplicando migrations..."
node dist/db/migrate.js

echo "[entrypoint] garantindo usuário admin (seed idempotente)..."
node dist/db/seed.js || echo "[entrypoint] seed pulado/falhou (ok se admin já existe)"

echo "[entrypoint] iniciando API na porta ${PORT:-3000}..."
exec node dist/index.js

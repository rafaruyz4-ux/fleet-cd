-- =====================================================================
-- Migration 015 — Revogação de device tokens (celular perdido/roubado)
-- O device token do motorista vale 365 dias e não tinha revogação
-- individual (só o soft delete do motorista inteiro). token_version
-- entra no payload do token na emissão; a verificação compara com o
-- valor atual do banco. Incrementar a coluna (endpoint do gestor)
-- invalida TODOS os tokens já emitidos daquele motorista.
-- =====================================================================

ALTER TABLE motoristas
  ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;

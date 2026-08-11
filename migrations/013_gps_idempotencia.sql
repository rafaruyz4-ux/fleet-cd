-- =====================================================================
-- Migration 013 — Idempotência da ingestão de GPS
-- O contrato do app do motorista é "sem resposta OK = reenvia o lote".
-- Sem uma chave natural, cada reenvio duplicava os pontos no banco. A
-- chave (viagem_id, registrado_em) identifica o ponto: o mesmo instante
-- da mesma viagem só pode existir uma vez. O INSERT da ingestão passa a
-- usar ON CONFLICT DO NOTHING (gps.service) — reenviar vira no-op.
-- =====================================================================

-- Antes de criar o índice único, remove as duplicatas que já entraram
-- por reenvio (mantém a linha mais antiga = a primeira recebida).
DELETE FROM posicoes_gps a
 USING posicoes_gps b
 WHERE a.viagem_id = b.viagem_id
   AND a.registrado_em = b.registrado_em
   AND a.id > b.id;

CREATE UNIQUE INDEX uq_gps_viagem_registrado_em
  ON posicoes_gps (viagem_id, registrado_em);

-- O índice não-único antigo cobria as mesmas colunas — o único acima o
-- substitui em todas as buscas (viagem_id, registrado_em).
DROP INDEX IF EXISTS idx_gps_viagem;

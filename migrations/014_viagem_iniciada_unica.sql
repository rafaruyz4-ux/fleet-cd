-- =====================================================================
-- Migration 014 — Uma viagem INICIADA por motorista (e por veículo)
-- O check-then-act do app ("já tem viagem ativa?" + "cria") permitia,
-- num toque duplo, duas viagens ativas para o mesmo motorista/veículo.
-- O banco passa a ser a autoridade: índice único parcial garante no
-- máximo UMA viagem em_andamento JÁ INICIADA por motorista e por veículo.
--
-- Decisão: o filtro inclui iniciada_em IS NOT NULL de propósito — as
-- viagens PLANEJADAS pelo gestor (em_andamento sem iniciada_em) podem
-- coexistir; é o mesmo critério que o autosserviço do app já usava.
-- =====================================================================

-- Limpa corridas já materializadas antes de criar os índices: se um mesmo
-- motorista tem 2+ viagens iniciadas, mantém a mais recente e cancela as
-- demais (mesmo efeito do botão Cancelar do dashboard).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY motorista_id
           ORDER BY iniciada_em DESC, criado_em DESC
         ) AS rn
  FROM viagens
  WHERE status = 'em_andamento' AND iniciada_em IS NOT NULL
)
UPDATE viagens SET status = 'cancelada'
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Idem por veículo (depois da limpeza por motorista, para não cancelar demais).
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY veiculo_id
           ORDER BY iniciada_em DESC, criado_em DESC
         ) AS rn
  FROM viagens
  WHERE status = 'em_andamento' AND iniciada_em IS NOT NULL
)
UPDATE viagens SET status = 'cancelada'
 WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX uq_viagens_motorista_iniciada
  ON viagens (motorista_id)
  WHERE status = 'em_andamento' AND iniciada_em IS NOT NULL;

CREATE UNIQUE INDEX uq_viagens_veiculo_iniciada
  ON viagens (veiculo_id)
  WHERE status = 'em_andamento' AND iniciada_em IS NOT NULL;

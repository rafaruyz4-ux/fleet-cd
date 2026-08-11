-- =====================================================================
-- Migration 016 — Novo tipo de alerta: 'sem_sinal' (veículo mudo)
-- Distingue dois silêncios diferentes no worker:
--   sem_gps    → viagem iniciada que NUNCA transmitiu posição;
--   sem_sinal  → viagem que JÁ transmitia e parou de enviar (veículo
--                mudo — app fechado, celular sem bateria, sinal caiu).
-- =====================================================================

ALTER TABLE alertas DROP CONSTRAINT alertas_tipo_check;
ALTER TABLE alertas ADD CONSTRAINT alertas_tipo_check
  CHECK (tipo IN ('desvio_rota','parada_longa','velocidade_alta','sem_gps','sem_sinal'));

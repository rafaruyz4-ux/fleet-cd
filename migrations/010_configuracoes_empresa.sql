-- =====================================================================
-- Migration 010 — Pacote 7B: configurações por empresa
-- Limiares de alerta ajustáveis por tenant (antes eram constantes no
-- código). Os defaults reproduzem exatamente o comportamento anterior:
--   velocidade_alta  > 110 km/h   (gps.service VEL_MAX_KMH)
--   parada_longa     >= 15 min    (gps.service PARADA_TEMPO_MS)
--   sem_gps          > 10 min     (gps.service SEM_GPS_GAP_MS + worker)
-- =====================================================================

ALTER TABLE empresas
  ADD COLUMN alerta_velocidade_kmh INTEGER NOT NULL DEFAULT 110
    CHECK (alerta_velocidade_kmh BETWEEN 10 AND 200),
  ADD COLUMN alerta_parada_min INTEGER NOT NULL DEFAULT 15
    CHECK (alerta_parada_min BETWEEN 1 AND 1440),
  ADD COLUMN alerta_sem_gps_min INTEGER NOT NULL DEFAULT 10
    CHECK (alerta_sem_gps_min BETWEEN 1 AND 1440);

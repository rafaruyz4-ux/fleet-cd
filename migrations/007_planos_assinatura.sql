-- Cobrança por faixa de plano (por tamanho de frota) + vínculo com o Asaas.
ALTER TABLE empresas
  ADD COLUMN plano_faixa VARCHAR(20) NOT NULL DEFAULT 'starter'
    CHECK (plano_faixa IN ('starter','pro','enterprise')),
  ADD COLUMN asaas_customer_id     TEXT,
  ADD COLUMN asaas_subscription_id TEXT;

-- A empresa-base (dados migrados / uso interno) fica sem limite de veículos.
UPDATE empresas SET plano_faixa = 'enterprise'
  WHERE id = '00000000-0000-0000-0000-000000000001';

CREATE INDEX idx_empresas_asaas_sub ON empresas (asaas_subscription_id);

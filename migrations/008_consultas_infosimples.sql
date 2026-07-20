-- Registro de cada consulta de débitos/multas feita na Infosimples.
-- É a fonte do "contador de consultas por cliente" (custo e limite por plano)
-- e também a trilha de auditoria de quando/quem consultou cada veículo.
CREATE TABLE consultas_infosimples (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id          UUID NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
  veiculo_id          UUID REFERENCES veiculos(id) ON DELETE SET NULL,
  placa               TEXT,
  tipo                VARCHAR(30)  NOT NULL DEFAULT 'debitos',
  status              VARCHAR(20)  NOT NULL,            -- sucesso | erro | simulado
  simulado            BOOLEAN      NOT NULL DEFAULT FALSE,
  custo_centavos      INTEGER      NOT NULL DEFAULT 0,  -- custo estimado da consulta
  multas_encontradas  INTEGER      NOT NULL DEFAULT 0,
  multas_novas        INTEGER      NOT NULL DEFAULT 0,
  mensagem            TEXT,
  criado_em           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- O contador soma por empresa dentro do mês corrente — este índice serve a
-- consulta de consumo (empresa + janela de tempo) e o histórico.
CREATE INDEX idx_consultas_infosimples_empresa_mes
  ON consultas_infosimples (empresa_id, criado_em DESC);

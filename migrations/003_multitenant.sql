-- =====================================================================
-- Migration 003 — Multi-tenant (SaaS)
-- Cada CLIENTE é uma `empresa`. Todo dado de domínio passa a pertencer a
-- uma empresa (`empresa_id`), e a API só enxerga os dados da empresa do
-- usuário autenticado. Os dados que já existiam (operação single-tenant)
-- são migrados para uma "Empresa Padrão".
-- =====================================================================

-- ---------------------------------------------------------------------
-- empresas — o cliente que assina o sistema (tenant).
-- ---------------------------------------------------------------------
CREATE TABLE empresas (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(180) NOT NULL,
  cnpj        VARCHAR(18)  UNIQUE,
  slug        VARCHAR(60)  UNIQUE,  -- identificador curto (subdomínio/login futuro)
  plano       VARCHAR(30)  NOT NULL DEFAULT 'trial'
                CHECK (plano IN ('trial','ativo','suspenso','cancelado')),
  ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_empresas_updated BEFORE UPDATE ON empresas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Empresa para a qual todos os dados pré-existentes são migrados.
INSERT INTO empresas (id, nome, slug, plano)
VALUES ('00000000-0000-0000-0000-000000000001', 'Empresa Padrão', 'padrao', 'ativo');

-- ---------------------------------------------------------------------
-- Adiciona empresa_id em cada tabela de domínio:
--   1) coluna anulável  2) backfill p/ a empresa padrão  3) NOT NULL
--   4) índice           5) (quando preciso) unicidade por empresa
-- ON DELETE CASCADE: remover uma empresa remove todos os seus dados
-- (offboarding de cliente).
-- ---------------------------------------------------------------------
DO $$
DECLARE
  padrao CONSTANT UUID := '00000000-0000-0000-0000-000000000001';
  t TEXT;
  tabelas TEXT[] := ARRAY[
    'usuarios', 'motoristas', 'veiculos', 'unidades_proprias',
    'notas_fiscais', 'itens_nf', 'rotas_planejadas', 'viagens',
    'paradas', 'posicoes_gps', 'multas', 'alertas'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    EXECUTE format(
      'ALTER TABLE %I ADD COLUMN empresa_id UUID REFERENCES empresas(id) ON DELETE CASCADE', t);
    EXECUTE format('UPDATE %I SET empresa_id = %L', t, padrao);
    EXECUTE format('ALTER TABLE %I ALTER COLUMN empresa_id SET NOT NULL', t);
    EXECUTE format('CREATE INDEX idx_%s_empresa ON %I (empresa_id)', t, t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Unicidade: o que era único globalmente passa a ser único POR EMPRESA,
-- para que dois clientes possam ter a mesma placa/CNPJ/chave/nº de auto.
-- (cpf de motorista e e-mail de usuário continuam únicos globalmente:
--  são as credenciais de login e precisam identificar a pessoa sozinhos.)
-- ---------------------------------------------------------------------
ALTER TABLE veiculos          DROP CONSTRAINT IF EXISTS veiculos_placa_key;
CREATE UNIQUE INDEX uq_veiculos_empresa_placa ON veiculos (empresa_id, placa);

ALTER TABLE unidades_proprias DROP CONSTRAINT IF EXISTS unidades_proprias_cnpj_key;
CREATE UNIQUE INDEX uq_unidades_empresa_cnpj ON unidades_proprias (empresa_id, cnpj);

ALTER TABLE notas_fiscais     DROP CONSTRAINT IF EXISTS notas_fiscais_chave_acesso_key;
CREATE UNIQUE INDEX uq_nfs_empresa_chave ON notas_fiscais (empresa_id, chave_acesso);

ALTER TABLE multas            DROP CONSTRAINT IF EXISTS multas_numero_auto_key;
CREATE UNIQUE INDEX uq_multas_empresa_numero_auto ON multas (empresa_id, numero_auto);

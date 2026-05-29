-- =====================================================================
-- Migration 001 — Núcleo (Sprint 1)
-- Extensões, usuários do dashboard e cadastros básicos.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- fornece gen_random_uuid()

-- Função utilitária: mantém updated_at atualizado em UPDATE.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- usuarios — gestores que acessam o dashboard web.
-- (Não estava no documento original, mas é necessário para autenticar
--  o acesso ao dashboard e proteger os CRUDs. Login do MOTORISTA, via
--  CPF+senha no app, virá junto com a Sprint 4.)
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        VARCHAR(150) NOT NULL,
  email       VARCHAR(180) NOT NULL UNIQUE,
  senha_hash  VARCHAR(255) NOT NULL,
  papel       VARCHAR(20)  NOT NULL DEFAULT 'gestor'
                CHECK (papel IN ('admin', 'gestor')),
  ativo       BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_usuarios_updated BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- motoristas — cadastro dos motoristas do CD.
-- ---------------------------------------------------------------------
CREATE TABLE motoristas (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome           VARCHAR(150) NOT NULL,
  cpf            VARCHAR(14)  NOT NULL UNIQUE,
  cnh            VARCHAR(20),
  categoria_cnh  VARCHAR(5),
  validade_cnh   DATE,
  telefone       VARCHAR(20),
  senha_hash     VARCHAR(255),  -- definida quando o motorista ganha acesso ao app
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_motoristas_updated BEFORE UPDATE ON motoristas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- veiculos — frota.
-- ---------------------------------------------------------------------
CREATE TABLE veiculos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  placa          VARCHAR(10)  NOT NULL UNIQUE,
  modelo         VARCHAR(100),
  tipo           VARCHAR(30)  NOT NULL DEFAULT 'caminhao'
                   CHECK (tipo IN ('caminhao', 'carro', 'utilitario')),
  capacidade_kg  INTEGER,
  renavam        VARCHAR(20),
  ativo          BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_veiculos_updated BEFORE UPDATE ON veiculos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- unidades_proprias — unidades da empresa que recebem transferências,
-- com coordenadas pré-cadastradas (nunca consultam API de geocoding).
-- ---------------------------------------------------------------------
CREATE TABLE unidades_proprias (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                VARCHAR(150) NOT NULL,
  cnpj                VARCHAR(18)  UNIQUE,
  endereco            VARCHAR(255),
  coordenada          GEOGRAPHY(POINT, 4326),
  janela_recebimento  JSONB,
  ativo               BOOLEAN      NOT NULL DEFAULT TRUE,
  criado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_unidades_updated BEFORE UPDATE ON unidades_proprias
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_unidades_coordenada ON unidades_proprias USING GIST (coordenada);

-- ---------------------------------------------------------------------
-- geocoding_cache — evita consultas repetidas à API de geocodificação.
-- ---------------------------------------------------------------------
CREATE TABLE geocoding_cache (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endereco_hash      VARCHAR(64)  NOT NULL UNIQUE,
  endereco_original  TEXT         NOT NULL,
  coordenada         GEOGRAPHY(POINT, 4326),
  provedor           VARCHAR(50),
  criado_em          TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX idx_geocoding_coordenada ON geocoding_cache USING GIST (coordenada);

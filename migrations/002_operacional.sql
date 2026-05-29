-- =====================================================================
-- Migration 002 — Modelo operacional (preparado para Sprints 2–6)
-- NFs, itens, rotas, viagens, paradas, GPS, multas e alertas.
-- Criado já agora para fixar o modelo de dados; as funcionalidades que
-- consomem estas tabelas chegam nos sprints seguintes.
-- =====================================================================

-- ---------------------------------------------------------------------
-- notas_fiscais — NFs importadas da Zig/SEFAZ.
-- ---------------------------------------------------------------------
CREATE TABLE notas_fiscais (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave_acesso          VARCHAR(44) NOT NULL UNIQUE,
  numero                VARCHAR(20),
  serie                 VARCHAR(5),
  cfop                  VARCHAR(10),
  emitida_em            TIMESTAMPTZ,
  destinatario_cnpj     VARCHAR(18),
  destinatario_nome     VARCHAR(200),
  destinatario_endereco TEXT,
  unidade_propria_id    UUID REFERENCES unidades_proprias(id) ON DELETE SET NULL,
  coordenada            GEOGRAPHY(POINT, 4326),
  valor_total           NUMERIC(12,2),
  peso_kg               NUMERIC(10,2),
  xml_path              VARCHAR(500),
  status                VARCHAR(30) NOT NULL DEFAULT 'importada'
                          CHECK (status IN ('importada','alocada','em_viagem','entregue')),
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_nfs_updated BEFORE UPDATE ON notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_nfs_emitida_em ON notas_fiscais (emitida_em);
CREATE INDEX idx_nfs_status ON notas_fiscais (status);
CREATE INDEX idx_nfs_coordenada ON notas_fiscais USING GIST (coordenada);

-- ---------------------------------------------------------------------
-- itens_nf — itens de cada NF (o que está no caminhão).
-- ---------------------------------------------------------------------
CREATE TABLE itens_nf (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id           UUID NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  codigo          VARCHAR(50),
  descricao       VARCHAR(500),
  quantidade      NUMERIC(12,3),
  unidade         VARCHAR(10),
  valor_unitario  NUMERIC(12,4)
);
CREATE INDEX idx_itens_nf_id ON itens_nf (nf_id);

-- ---------------------------------------------------------------------
-- rotas_planejadas — rotas fixas (cadastradas) ou dinâmicas (de NFs).
-- ---------------------------------------------------------------------
CREATE TABLE rotas_planejadas (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                  VARCHAR(20) NOT NULL CHECK (tipo IN ('fixa','dinamica')),
  nome                  VARCHAR(150),
  linha                 GEOGRAPHY(LINESTRING, 4326),
  raio_tolerancia_m     INTEGER NOT NULL DEFAULT 200,
  duracao_estimada_min  INTEGER,
  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_rotas_updated BEFORE UPDATE ON rotas_planejadas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------
-- viagens — operação efetiva de um veículo+motorista num período.
-- ---------------------------------------------------------------------
CREATE TABLE viagens (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id          UUID NOT NULL REFERENCES veiculos(id) ON DELETE RESTRICT,
  motorista_id        UUID NOT NULL REFERENCES motoristas(id) ON DELETE RESTRICT,
  rota_planejada_id   UUID REFERENCES rotas_planejadas(id) ON DELETE SET NULL,
  iniciada_em         TIMESTAMPTZ,
  encerrada_em        TIMESTAMPTZ,
  km_inicial          INTEGER,
  km_final            INTEGER,
  status              VARCHAR(20) NOT NULL DEFAULT 'em_andamento'
                        CHECK (status IN ('em_andamento','encerrada','cancelada')),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_viagens_updated BEFORE UPDATE ON viagens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_viagens_veiculo ON viagens (veiculo_id);
CREATE INDEX idx_viagens_motorista ON viagens (motorista_id);
-- Suporta a vinculação automática de multas (busca por janela temporal).
CREATE INDEX idx_viagens_periodo ON viagens (veiculo_id, iniciada_em, encerrada_em);

-- ---------------------------------------------------------------------
-- paradas — cada NF vira uma parada na viagem, na ordem otimizada.
-- ---------------------------------------------------------------------
CREATE TABLE paradas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id         UUID NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  nf_id             UUID REFERENCES notas_fiscais(id) ON DELETE SET NULL,
  ordem             INTEGER NOT NULL,
  chegada_prevista  TIMESTAMPTZ,
  chegada_real      TIMESTAMPTZ,
  saida_real        TIMESTAMPTZ,
  status            VARCHAR(20) NOT NULL DEFAULT 'pendente'
                      CHECK (status IN ('pendente','em_rota','entregue','falhou'))
);
CREATE INDEX idx_paradas_viagem ON paradas (viagem_id, ordem);

-- ---------------------------------------------------------------------
-- posicoes_gps — pontos de GPS recebidos do app.
-- BIGSERIAL: alto volume. Particionável por data acima de ~100 veículos.
-- ---------------------------------------------------------------------
CREATE TABLE posicoes_gps (
  id              BIGSERIAL PRIMARY KEY,
  viagem_id       UUID NOT NULL REFERENCES viagens(id) ON DELETE CASCADE,
  coordenada      GEOGRAPHY(POINT, 4326) NOT NULL,
  velocidade_kmh  NUMERIC(5,2),
  precisao_m      NUMERIC(6,2),
  registrado_em   TIMESTAMPTZ NOT NULL,
  recebido_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_gps_viagem ON posicoes_gps (viagem_id, registrado_em);
CREATE INDEX idx_gps_coordenada ON posicoes_gps USING GIST (coordenada);

-- ---------------------------------------------------------------------
-- multas — capturadas via Infosimples (ou inseridas manualmente).
-- ---------------------------------------------------------------------
CREATE TABLE multas (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id         UUID REFERENCES viagens(id) ON DELETE SET NULL,
  veiculo_id        UUID REFERENCES veiculos(id) ON DELETE SET NULL,
  motorista_id      UUID REFERENCES motoristas(id) ON DELETE SET NULL,
  ocorrida_em       TIMESTAMPTZ,
  tipo              VARCHAR(150),
  valor             NUMERIC(10,2),
  pontos_cnh        INTEGER,
  local             VARCHAR(255),
  coordenada        GEOGRAPHY(POINT, 4326),
  numero_auto       VARCHAR(50) UNIQUE,
  fonte             VARCHAR(50) NOT NULL DEFAULT 'infosimples'
                      CHECK (fonte IN ('infosimples','manual')),
  status_pagamento  VARCHAR(20) NOT NULL DEFAULT 'pendente'
                      CHECK (status_pagamento IN ('pendente','pago','recurso')),
  status_revisao    VARCHAR(20) NOT NULL DEFAULT 'aguardando_revisao'
                      CHECK (status_revisao IN ('auto_vinculada','aguardando_revisao','revisada')),
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_multas_updated BEFORE UPDATE ON multas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE INDEX idx_multas_veiculo ON multas (veiculo_id);
CREATE INDEX idx_multas_motorista ON multas (motorista_id);

-- ---------------------------------------------------------------------
-- alertas — eventos suspeitos detectados automaticamente.
-- ---------------------------------------------------------------------
CREATE TABLE alertas (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  viagem_id    UUID REFERENCES viagens(id) ON DELETE CASCADE,
  tipo         VARCHAR(50) NOT NULL
                 CHECK (tipo IN ('desvio_rota','parada_longa','velocidade_alta','sem_gps')),
  descricao    TEXT,
  coordenada   GEOGRAPHY(POINT, 4326),
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT now(),
  visualizado  BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_alertas_viagem ON alertas (viagem_id);
CREATE INDEX idx_alertas_visualizado ON alertas (visualizado) WHERE visualizado = FALSE;

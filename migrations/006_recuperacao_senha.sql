-- "Esqueci minha senha" (gestores do dashboard). Guardamos só o HASH do token
-- (nunca o token cru), com validade curta e marca de uso (one-shot).
CREATE TABLE tokens_recuperacao_senha (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_recup_senha_token ON tokens_recuperacao_senha (token_hash);
CREATE INDEX idx_recup_senha_usuario ON tokens_recuperacao_senha (usuario_id);

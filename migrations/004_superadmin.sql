-- =====================================================================
-- Migration 004 — Super admin (equipe da plataforma)
-- O "dono do sistema" (equipe que VENDE o SaaS) é um usuário com
-- super_admin = true. Só ele pode criar/listar empresas-clientes
-- (cadastro deixou de ser self-service e virou backoffice da equipe).
-- =====================================================================

ALTER TABLE usuarios
  ADD COLUMN super_admin BOOLEAN NOT NULL DEFAULT FALSE;

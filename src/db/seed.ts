import { env, SENHA_SEED_PADRAO } from '../config/env';
import { hashPassword } from '../utils/password';
import { pool, queryOne } from './pool';

// Empresa padrão (mesma UUID fixa da migration 003) — dona dos dados iniciais.
const EMPRESA_PADRAO_ID = '00000000-0000-0000-0000-000000000001';

/** Cria a empresa padrão e o usuário admin inicial (idempotente). */
async function seed(): Promise<void> {
  // Em produção, não permitir criar o admin com a senha-padrão de exemplo
  // (é pública neste repositório). Exija SEED_ADMIN_SENHA própria.
  if (env.isProduction && env.seedAdmin.senha === SENHA_SEED_PADRAO) {
    throw new Error(
      'Defina SEED_ADMIN_SENHA (a senha-padrão de exemplo não é permitida em produção)',
    );
  }

  // Garante a empresa padrão (a migration 003 já a cria; isto cobre bancos
  // antigos e deixa o seed autossuficiente).
  await pool.query(
    `INSERT INTO empresas (id, nome, slug, plano)
     VALUES ($1, 'Empresa Padrão', 'padrao', 'ativo')
     ON CONFLICT (id) DO NOTHING`,
    [EMPRESA_PADRAO_ID],
  );

  const existing = await queryOne<{ id: string }>('SELECT id FROM usuarios WHERE email = $1', [
    env.seedAdmin.email,
  ]);

  if (existing) {
    // Garante que a conta da equipe seja super admin (backoffice), mesmo em
    // bancos criados antes da migration 004.
    await pool.query('UPDATE usuarios SET super_admin = TRUE WHERE email = $1', [
      env.seedAdmin.email,
    ]);
    console.log(`[seed] usuário admin já existe (super admin garantido): ${env.seedAdmin.email}`);
    return;
  }

  const senhaHash = await hashPassword(env.seedAdmin.senha);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id, super_admin)
     VALUES ($1, $2, $3, 'admin', $4, TRUE)`,
    [env.seedAdmin.nome, env.seedAdmin.email, senhaHash, EMPRESA_PADRAO_ID],
  );

  console.log(`[seed] usuário admin (super admin) criado: ${env.seedAdmin.email}`);
  console.log('[seed] >>> troque a senha após o primeiro login.');
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    await pool.end();
    console.error('[seed] falhou:', err);
    process.exit(1);
  });

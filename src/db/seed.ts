import { env } from '../config/env';
import { hashPassword } from '../utils/password';
import { pool, queryOne } from './pool';

/** Cria o usuário admin inicial (idempotente) a partir das variáveis SEED_ADMIN_*. */
async function seed(): Promise<void> {
  const existing = await queryOne<{ id: string }>(
    'SELECT id FROM usuarios WHERE email = $1',
    [env.seedAdmin.email],
  );

  if (existing) {
    console.log(`[seed] usuário admin já existe: ${env.seedAdmin.email}`);
    return;
  }

  const senhaHash = await hashPassword(env.seedAdmin.senha);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel)
     VALUES ($1, $2, $3, 'admin')`,
    [env.seedAdmin.nome, env.seedAdmin.email, senhaHash],
  );

  console.log(`[seed] usuário admin criado: ${env.seedAdmin.email}`);
  console.log('[seed] >>> troque a senha após o primeiro login.');
}

seed()
  .then(() => pool.end())
  .catch(async (err) => {
    await pool.end();
    console.error('[seed] falhou:', err);
    process.exit(1);
  });

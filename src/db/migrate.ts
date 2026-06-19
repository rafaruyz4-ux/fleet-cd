import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pool } from './pool';

const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

/**
 * Runner de migrations simples e idempotente.
 * Aplica, em ordem alfabética, os arquivos .sql ainda não registrados em
 * schema_migrations. Cada arquivo roda dentro de uma transação.
 */
async function migrate(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
      (r) => r.filename,
    ),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`[migrate] aplicada: ${file}`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`[migrate] FALHOU em ${file}:`, err);
      throw err;
    } finally {
      client.release();
    }
  }

  console.log(
    count === 0
      ? '[migrate] nada a aplicar — banco já atualizado.'
      : `[migrate] ${count} migration(s) aplicada(s).`,
  );
}

migrate()
  .then(() => pool.end())
  .catch(async (err) => {
    await pool.end();
    console.error(err);
    process.exit(1);
  });

import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
  // Não deixa uma requisição esperar para sempre por uma conexão livre...
  connectionTimeoutMillis: 5_000,
  // ...nem uma query travada segurar um cliente do pool indefinidamente.
  statement_timeout: 30_000,
});

pool.on('error', (err) => {
  // Erros em clientes ociosos do pool não derrubam o processo, mas precisam ser vistos.
  console.error('[db] erro inesperado em cliente ocioso do pool', err);
});

/** Ping rápido para readiness: true se o banco respondeu dentro do tempo. */
export async function pingBanco(timeoutMs = 2_000): Promise<boolean> {
  try {
    await Promise.race([
      pool.query('SELECT 1'),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeoutMs).unref(),
      ),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Executa uma query parametrizada e devolve as linhas tipadas. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

/** Executa uma query esperando no máximo uma linha. */
export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Roda uma função dentro de uma transação, com COMMIT/ROLLBACK automáticos. */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

import { Pool, type PoolClient, type QueryResultRow } from 'pg';
import { env } from '../config/env';

export const pool = new Pool({
  connectionString: env.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  // Erros em clientes ociosos do pool não derrubam o processo, mas precisam ser vistos.
  console.error('[db] erro inesperado em cliente ocioso do pool', err);
});

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

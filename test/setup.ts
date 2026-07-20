import { afterAll, beforeEach } from 'vitest';
import { pool } from '../src/db/pool';
import { limparCachesDeAcesso } from '../src/middleware/acesso';

// Tabelas de domínio zeradas antes de cada teste (mantém `usuarios`/admin).
const TABELAS = [
  'multas',
  'alertas',
  'posicoes_gps',
  'paradas',
  'viagens',
  'rotas_planejadas',
  'itens_nf',
  'notas_fiscais',
  'motoristas',
  'veiculos',
  'unidades_proprias',
];

beforeEach(async () => {
  await pool.query(`TRUNCATE ${TABELAS.join(', ')} RESTART IDENTITY CASCADE`);
  // Os testes mexem no banco por fora da API; o cache de acesso (status de
  // empresa/motorista, TTL ~60s) não pode vazar de um teste para o outro.
  limparCachesDeAcesso();
});

afterAll(async () => {
  await pool.end();
});

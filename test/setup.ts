import { afterAll, beforeEach } from 'vitest';
import { pool } from '../src/db/pool';

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
});

afterAll(async () => {
  await pool.end();
});

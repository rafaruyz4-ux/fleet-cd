import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import {
  ADMIN_EMAIL,
  ADMIN_SENHA,
  MAINTENANCE_DATABASE_URL,
  TEST_DATABASE_URL,
  TEST_DB,
} from './config';

// Roda UMA vez antes de toda a suíte: (re)cria o banco de teste do zero,
// aplica as migrations e cria o usuário admin.
export default async function setup(): Promise<void> {
  const admin = new Client({ connectionString: MAINTENANCE_DATABASE_URL });
  await admin.connect();
  await admin.query(`DROP DATABASE IF EXISTS ${TEST_DB} WITH (FORCE)`);
  await admin.query(`CREATE DATABASE ${TEST_DB}`);
  await admin.end();

  const db = new Client({ connectionString: TEST_DATABASE_URL });
  await db.connect();

  const migrationsDir = resolve(process.cwd(), 'migrations');
  // Aplica TODAS as migrations .sql em ordem (001, 002, 003, 004, ...).
  const arquivos = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  for (const arquivo of arquivos) {
    const sql = readFileSync(resolve(migrationsDir, arquivo), 'utf8');
    await db.query(sql);
  }

  // Empresa padrão (criada pela migration 003) — o admin de teste pertence a ela.
  const EMPRESA_PADRAO_ID = '00000000-0000-0000-0000-000000000001';
  const hash = await bcrypt.hash(ADMIN_SENHA, 4);
  await db.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id, super_admin)
     VALUES ($1, $2, $3, 'admin', $4, TRUE)
     ON CONFLICT (email) DO NOTHING`,
    ['Admin Teste', ADMIN_EMAIL, hash, EMPRESA_PADRAO_ID],
  );
  await db.end();
}

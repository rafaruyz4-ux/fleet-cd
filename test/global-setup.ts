import { readFileSync } from 'node:fs';
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
  for (const arquivo of ['001_core.sql', '002_operacional.sql']) {
    const sql = readFileSync(resolve(migrationsDir, arquivo), 'utf8');
    await db.query(sql);
  }

  const hash = await bcrypt.hash(ADMIN_SENHA, 4);
  await db.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel)
     VALUES ($1, $2, $3, 'admin')
     ON CONFLICT (email) DO NOTHING`,
    ['Admin Teste', ADMIN_EMAIL, hash],
  );
  await db.end();
}

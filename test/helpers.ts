import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { createApp } from '../src/app';
import { pool } from '../src/db/pool';
import { ADMIN_EMAIL, ADMIN_SENHA } from './config';

export const app = createApp();
export const api = () => request(app);

export function bearer(token: string): string {
  return `Bearer ${token}`;
}

export async function loginGestor(): Promise<string> {
  const res = await api().post('/api/auth/login').send({ email: ADMIN_EMAIL, senha: ADMIN_SENHA });
  if (!res.body.accessToken) throw new Error(`login gestor falhou: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.accessToken;
}

// Cria uma SEGUNDA empresa (tenant) com seu próprio gestor e devolve o token
// dele — usado para testar o isolamento entre clientes. Insere direto no banco
// (ainda não há cadastro self-service). E-mail único para não colidir.
export async function criarEmpresaComGestor(senha = 'outra-senha-123'): Promise<string> {
  const email = `gestor-${Date.now()}-${next()}@empresa.test`;
  const hash = await bcrypt.hash(senha, 4);
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO empresas (nome, plano) VALUES ($1, 'ativo') RETURNING id`,
    [`Empresa ${email}`],
  );
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
     VALUES ('Gestor Outro', $1, $2, 'admin', $3)`,
    [email, hash, emp.rows[0]!.id],
  );
  const res = await api().post('/api/auth/login').send({ email, senha });
  if (!res.body.accessToken) throw new Error(`login 2ª empresa falhou: ${res.status}`);
  return res.body.accessToken;
}

// ----- geradores de valores únicos (dentro de um mesmo teste) -----
let seq = 0;
const next = () => ++seq;

export function placaUnica(): string {
  const n = next();
  const d = n % 10;
  const dd = String(n % 100).padStart(2, '0');
  return `TST${d}A${dd}`; // casa o regex ^[A-Z]{3}\d[A-Z0-9]\d{2}$
}

export function cpfUnico(): string {
  return String(10000000000 + next()); // 11 dígitos
}

export function chaveUnica(): string {
  return '3526051234567800019955001000000045' + String(next()).padStart(10, '0'); // 44 dígitos
}

export function numeroAutoUnico(): string {
  return `AUTO-${Date.now()}-${next()}`;
}

// ----- fábricas (exigem token de gestor) -----
export async function criarVeiculo(token: string, over: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post('/api/veiculos')
    .set('Authorization', bearer(token))
    .send({ placa: placaUnica(), tipo: 'caminhao', ...over });
  return res.body.id;
}

export async function criarMotorista(
  token: string,
  over: Record<string, unknown> = {},
): Promise<{ id: string; cpf: string }> {
  const cpf = (over.cpf as string) ?? cpfUnico();
  const res = await api()
    .post('/api/motoristas')
    .set('Authorization', bearer(token))
    .send({ nome: 'Motorista Teste', categoria_cnh: 'D', ...over, cpf });
  return { id: res.body.id, cpf };
}

export async function criarNf(token: string, over: Record<string, unknown> = {}): Promise<string> {
  const res = await api()
    .post('/api/nfs')
    .set('Authorization', bearer(token))
    .send({ chave_acesso: chaveUnica(), numero: '1', destinatario_nome: 'Cliente', ...over });
  return res.body.id;
}

// Cria um motorista COM senha e devolve o access token de app dele.
export async function loginMotoristaApp(
  token: string,
  senha = 'app-senha-123',
): Promise<{ motoristaId: string; cpf: string; appToken: string }> {
  const { id, cpf } = await criarMotorista(token, { senha });
  const res = await api().post('/api/auth/motorista/login').send({ cpf, senha });
  return { motoristaId: id, cpf, appToken: res.body.accessToken };
}

export function xmlExemplo(): string {
  return readFileSync(resolve(process.cwd(), 'samples', 'nfe-exemplo.xml'), 'utf8');
}

import bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { api } from './helpers';
import { pool } from '../src/db/pool';
import { emailsCapturados } from '../src/infra/mailer';

const EMPRESA_PADRAO = '00000000-0000-0000-0000-000000000001';
let n = 0;
const emailUnico = () => `recup-${Date.now()}-${++n}@empresa.test`;

async function criarUsuario(email: string, senha: string): Promise<void> {
  const hash = await bcrypt.hash(senha, 4);
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
     VALUES ('Teste Recup', $1, $2, 'gestor', $3)`,
    [email, hash, EMPRESA_PADRAO],
  );
}

// Pega o token de redefinição do último e-mail capturado para um destinatário.
function tokenDoEmail(para: string): string | undefined {
  const msg = [...emailsCapturados()].reverse().find((m) => m.para === para);
  return msg?.texto.match(/token=([a-f0-9]+)/)?.[1];
}

describe('auth — esqueci minha senha', () => {
  beforeAll(async () => {
    // garante que o banco respondeu antes dos casos
    await pool.query('SELECT 1');
  });

  it('fluxo completo: pede reset, redefine pelo link e loga com a nova senha', async () => {
    const email = emailUnico();
    await criarUsuario(email, 'senha-antiga-1');

    const pedido = await api().post('/api/auth/esqueci-senha').send({ email });
    expect(pedido.status).toBe(200);

    const token = tokenDoEmail(email);
    expect(token).toBeTruthy();

    const redef = await api()
      .post('/api/auth/redefinir-senha')
      .send({ token, senha: 'senha-nova-2' });
    expect(redef.status).toBe(200);

    // nova senha funciona; antiga não
    expect(
      (await api().post('/api/auth/login').send({ email, senha: 'senha-nova-2' })).status,
    ).toBe(200);
    expect(
      (await api().post('/api/auth/login').send({ email, senha: 'senha-antiga-1' })).status,
    ).toBe(401);
  });

  it('token não pode ser reutilizado', async () => {
    const email = emailUnico();
    await criarUsuario(email, 'senha-antiga-1');
    await api().post('/api/auth/esqueci-senha').send({ email });
    const token = tokenDoEmail(email);

    expect(
      (await api().post('/api/auth/redefinir-senha').send({ token, senha: 'nova-senha-1' })).status,
    ).toBe(200);
    // segunda vez com o mesmo token → 400
    expect(
      (await api().post('/api/auth/redefinir-senha').send({ token, senha: 'outra-senha-1' }))
        .status,
    ).toBe(400);
  });

  it('token inválido → 400', async () => {
    const res = await api()
      .post('/api/auth/redefinir-senha')
      .send({ token: 'token-que-nao-existe', senha: 'senha-valida-1' });
    expect(res.status).toBe(400);
  });

  it('e-mail desconhecido → 200 genérico e nenhum token gerado', async () => {
    const email = emailUnico(); // nunca cadastrado
    const res = await api().post('/api/auth/esqueci-senha').send({ email });
    expect(res.status).toBe(200);
    const tokens = await pool.query(
      `SELECT t.id FROM tokens_recuperacao_senha t
       JOIN usuarios u ON u.id = t.usuario_id WHERE u.email = $1`,
      [email],
    );
    expect(tokens.rowCount).toBe(0);
  });

  it('senha curta (< 8) → 400 de validação', async () => {
    const email = emailUnico();
    await criarUsuario(email, 'senha-antiga-1');
    await api().post('/api/auth/esqueci-senha').send({ email });
    const token = tokenDoEmail(email);
    const res = await api().post('/api/auth/redefinir-senha').send({ token, senha: 'curta' });
    expect(res.status).toBe(400);
  });
});

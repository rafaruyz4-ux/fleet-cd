import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { api, bearer, loginGestor } from './helpers';
import { pool } from '../src/db/pool';

// Pacote 7B — gestão de usuários do PRÓPRIO tenant:
// só admin gerencia (1ª aplicação real do requireRole), travas de auto-lockout
// e de último admin, desativado não loga nem renova, isolamento entre tenants.

let n = 0;

interface EmpresaCenario {
  empresaId: string;
  adminId: string;
  adminEmail: string;
  token: string;
}

// Empresa nova com admin logado (inserida direto no banco, como nos helpers).
async function novaEmpresaComAdmin(): Promise<EmpresaCenario> {
  const adminEmail = `usr-admin-${Date.now()}-${++n}@empresa.test`;
  const hash = await bcrypt.hash('senha-1234', 4);
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO empresas (nome, plano, plano_faixa) VALUES ($1, 'ativo', 'pro') RETURNING id`,
    [`Empresa ${adminEmail}`],
  );
  const empresaId = emp.rows[0]!.id;
  const usr = await pool.query<{ id: string }>(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
     VALUES ('Admin Empresa', $1, $2, 'admin', $3) RETURNING id`,
    [adminEmail, hash, empresaId],
  );
  const login = await api()
    .post('/api/auth/login')
    .send({ email: adminEmail, senha: 'senha-1234' });
  return { empresaId, adminId: usr.rows[0]!.id, adminEmail, token: login.body.accessToken };
}

function emailUnico(prefixo: string): string {
  return `${prefixo}-${Date.now()}-${++n}@empresa.test`;
}

// Cria um usuário via API e devolve o corpo da resposta.
async function criarUsuario(
  token: string,
  papel: 'admin' | 'gestor',
  senha = 'senha-inicial-123',
): Promise<{ id: string; email: string; senha: string }> {
  const email = emailUnico(`usr-${papel}`);
  const res = await api()
    .post('/api/usuarios')
    .set('Authorization', bearer(token))
    .send({ nome: `Usuário ${papel}`, email, papel, senha });
  expect(res.status).toBe(201);
  return { id: res.body.id, email, senha };
}

describe('usuários do tenant — permissões', () => {
  it('admin cria e lista os usuários da própria empresa', async () => {
    const { token, adminEmail } = await novaEmpresaComAdmin();
    const criado = await criarUsuario(token, 'gestor');

    const lista = await api().get('/api/usuarios').set('Authorization', bearer(token));
    expect(lista.status).toBe(200);
    const emails = lista.body.map((u: { email: string }) => u.email);
    expect(emails).toContain(adminEmail);
    expect(emails).toContain(criado.email);
    // Nunca vaza hash de senha.
    expect(JSON.stringify(lista.body)).not.toContain('senha_hash');

    // O criado consegue logar com a senha inicial.
    const login = await api()
      .post('/api/auth/login')
      .send({ email: criado.email, senha: criado.senha });
    expect(login.status).toBe(200);
    expect(login.body.usuario.papel).toBe('gestor');
  });

  it('gestor NÃO gerencia usuários (403), mas troca a própria senha', async () => {
    const { token } = await novaEmpresaComAdmin();
    const gestor = await criarUsuario(token, 'gestor');
    const login = await api()
      .post('/api/auth/login')
      .send({ email: gestor.email, senha: gestor.senha });
    const tokenGestor = login.body.accessToken as string;

    const lista = await api().get('/api/usuarios').set('Authorization', bearer(tokenGestor));
    expect(lista.status).toBe(403);
    const cria = await api()
      .post('/api/usuarios')
      .set('Authorization', bearer(tokenGestor))
      .send({ nome: 'X', email: emailUnico('x'), papel: 'gestor', senha: 'senha-1234' });
    expect(cria.status).toBe(403);
    const edita = await api()
      .patch(`/api/usuarios/${gestor.id}`)
      .set('Authorization', bearer(tokenGestor))
      .send({ papel: 'admin' });
    expect(edita.status).toBe(403);

    // Troca da própria senha: senha atual errada → 400; certa → 200.
    const errada = await api()
      .post('/api/usuarios/me/senha')
      .set('Authorization', bearer(tokenGestor))
      .send({ senhaAtual: 'senha-errada', novaSenha: 'nova-senha-123' });
    expect(errada.status).toBe(400);
    const certa = await api()
      .post('/api/usuarios/me/senha')
      .set('Authorization', bearer(tokenGestor))
      .send({ senhaAtual: gestor.senha, novaSenha: 'nova-senha-123' });
    expect(certa.status).toBe(200);

    const antiga = await api()
      .post('/api/auth/login')
      .send({ email: gestor.email, senha: gestor.senha });
    expect(antiga.status).toBe(401);
    const nova = await api()
      .post('/api/auth/login')
      .send({ email: gestor.email, senha: 'nova-senha-123' });
    expect(nova.status).toBe(200);
  });

  it('e-mail já usado → 409', async () => {
    const { token, adminEmail } = await novaEmpresaComAdmin();
    const res = await api()
      .post('/api/usuarios')
      .set('Authorization', bearer(token))
      .send({ nome: 'Duplicado', email: adminEmail, papel: 'gestor', senha: 'senha-1234' });
    expect(res.status).toBe(409);
  });
});

describe('usuários do tenant — desativação e travas', () => {
  it('desativado não loga nem faz refresh; reativado volta a logar', async () => {
    const { token } = await novaEmpresaComAdmin();
    const gestor = await criarUsuario(token, 'gestor');
    const login = await api()
      .post('/api/auth/login')
      .send({ email: gestor.email, senha: gestor.senha });
    const refreshToken = login.body.refreshToken as string;

    const off = await api()
      .patch(`/api/usuarios/${gestor.id}`)
      .set('Authorization', bearer(token))
      .send({ ativo: false });
    expect(off.status).toBe(200);
    expect(off.body.ativo).toBe(false);

    const loginDepois = await api()
      .post('/api/auth/login')
      .send({ email: gestor.email, senha: gestor.senha });
    expect(loginDepois.status).toBe(401);
    const refresh = await api().post('/api/auth/refresh').send({ refreshToken });
    expect(refresh.status).toBe(401);

    const on = await api()
      .patch(`/api/usuarios/${gestor.id}`)
      .set('Authorization', bearer(token))
      .send({ ativo: true });
    expect(on.status).toBe(200);
    const loginDeNovo = await api()
      .post('/api/auth/login')
      .send({ email: gestor.email, senha: gestor.senha });
    expect(loginDeNovo.status).toBe(200);
  });

  it('admin não desativa nem rebaixa a si mesmo', async () => {
    const { token, adminId } = await novaEmpresaComAdmin();
    const desativa = await api()
      .patch(`/api/usuarios/${adminId}`)
      .set('Authorization', bearer(token))
      .send({ ativo: false });
    expect(desativa.status).toBe(400);
    const rebaixa = await api()
      .patch(`/api/usuarios/${adminId}`)
      .set('Authorization', bearer(token))
      .send({ papel: 'gestor' });
    expect(rebaixa.status).toBe(400);
  });

  it('o último admin ativo da empresa é protegido', async () => {
    const { token: tokenAdmin1, adminId: admin1 } = await novaEmpresaComAdmin();
    const admin2 = await criarUsuario(tokenAdmin1, 'admin');
    const login2 = await api()
      .post('/api/auth/login')
      .send({ email: admin2.email, senha: admin2.senha });
    const tokenAdmin2 = login2.body.accessToken as string;

    // Com dois admins, desativar um é permitido.
    const off1 = await api()
      .patch(`/api/usuarios/${admin1}`)
      .set('Authorization', bearer(tokenAdmin2))
      .send({ ativo: false });
    expect(off1.status).toBe(200);

    // admin1 (token ainda válido) tenta derrubar o ÚLTIMO admin ativo → 400.
    const off2 = await api()
      .patch(`/api/usuarios/${admin2.id}`)
      .set('Authorization', bearer(tokenAdmin1))
      .send({ ativo: false });
    expect(off2.status).toBe(400);
    const rebaixa = await api()
      .patch(`/api/usuarios/${admin2.id}`)
      .set('Authorization', bearer(tokenAdmin1))
      .send({ papel: 'gestor' });
    expect(rebaixa.status).toBe(400);
  });

  it('promover gestor a admin funciona', async () => {
    const { token } = await novaEmpresaComAdmin();
    const gestor = await criarUsuario(token, 'gestor');
    const res = await api()
      .patch(`/api/usuarios/${gestor.id}`)
      .set('Authorization', bearer(token))
      .send({ papel: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.papel).toBe('admin');
  });
});

describe('usuários do tenant — isolamento', () => {
  it('admin de uma empresa não vê nem edita usuários de outra', async () => {
    const a = await novaEmpresaComAdmin();
    const b = await novaEmpresaComAdmin();
    const gestorB = await criarUsuario(b.token, 'gestor');

    const listaA = await api().get('/api/usuarios').set('Authorization', bearer(a.token));
    const emailsA = listaA.body.map((u: { email: string }) => u.email);
    expect(emailsA).not.toContain(gestorB.email);

    const edita = await api()
      .patch(`/api/usuarios/${gestorB.id}`)
      .set('Authorization', bearer(a.token))
      .send({ ativo: false });
    expect(edita.status).toBe(404);
  });

  it('contas de super admin não aparecem na lista do tenant', async () => {
    // O seed de teste é super admin da empresa padrão; a listagem dele não
    // pode expor a própria conta da plataforma ao cliente.
    const token = await loginGestor();
    const lista = await api().get('/api/usuarios').set('Authorization', bearer(token));
    expect(lista.status).toBe(200);
    const emails = lista.body.map((u: { email: string }) => u.email);
    expect(emails).not.toContain('admin@cd.local');
  });
});

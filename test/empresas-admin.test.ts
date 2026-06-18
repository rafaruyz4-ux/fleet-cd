import { describe, expect, it } from 'vitest';
import { api, bearer, criarEmpresaComGestor, loginGestor } from './helpers';

// O admin do seed (loginGestor) é super admin (equipe da plataforma).
// criarEmpresaComGestor() cria um gestor comum em outra empresa (NÃO super).

let n = 0;
const emailUnico = () => `cliente-${Date.now()}-${++n}@empresacliente.test`;

const payload = (over: Record<string, unknown> = {}) => ({
  empresaNome: 'Cliente Novo Transportes',
  adminNome: 'Responsável Cliente',
  adminEmail: emailUnico(),
  adminSenha: 'senha-cliente-123',
  ...over,
});

describe('backoffice — criação de empresa-cliente (super admin)', () => {
  it('super admin cria empresa + admin (201), sem auto-login', async () => {
    const token = await loginGestor();
    const res = await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload());
    expect(res.status).toBe(201);
    expect(res.body.empresa.id).toBeTruthy();
    expect(res.body.empresa.slug).toBeTruthy();
    expect(res.body.admin.email).toContain('@');
    expect(res.body.accessToken).toBeUndefined(); // não loga como o cliente
  });

  it('o admin criado consegue logar e NÃO é super admin', async () => {
    const token = await loginGestor();
    const email = emailUnico();
    await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload({ adminEmail: email, adminSenha: 'abrir-conta-9' }));

    const login = await api().post('/api/auth/login').send({ email, senha: 'abrir-conta-9' });
    expect(login.status).toBe(200);
    expect(login.body.usuario.papel).toBe('admin');
    expect(login.body.usuario.superAdmin).toBe(false);
  });

  it('a empresa criada não enxerga dados de outra (isolamento)', async () => {
    const superToken = await loginGestor();
    const email = emailUnico();
    await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(superToken))
      .send(payload({ adminEmail: email, adminSenha: 'isolado-123' }));
    const login = await api().post('/api/auth/login').send({ email, senha: 'isolado-123' });

    const res = await api()
      .get('/api/veiculos')
      .set('Authorization', bearer(login.body.accessToken));
    const lista = res.body.data ?? res.body;
    expect(lista).toHaveLength(0);
  });

  it('listar empresas inclui a empresa criada', async () => {
    const token = await loginGestor();
    await api().post('/api/admin/empresas').set('Authorization', bearer(token)).send(payload());
    const res = await api().get('/api/admin/empresas').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('gestor comum (não super admin) → 403 ao criar e ao listar', async () => {
    const gestor = await criarEmpresaComGestor();
    expect((await api().get('/api/admin/empresas').set('Authorization', bearer(gestor))).status).toBe(403);
    expect(
      (await api().post('/api/admin/empresas').set('Authorization', bearer(gestor)).send(payload())).status,
    ).toBe(403);
  });

  it('sem token → 401', async () => {
    expect((await api().get('/api/admin/empresas')).status).toBe(401);
  });

  it('e-mail já em uso → 409', async () => {
    const token = await loginGestor();
    const email = emailUnico();
    await api().post('/api/admin/empresas').set('Authorization', bearer(token)).send(payload({ adminEmail: email }));
    const res = await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload({ adminEmail: email }));
    expect(res.status).toBe(409);
  });

  it('CNPJ já cadastrado → 409 (ignora pontuação)', async () => {
    const token = await loginGestor();
    await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload({ cnpj: '44.555.666/0001-22' }));
    const res = await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload({ cnpj: '44555666000122' }));
    expect(res.status).toBe(409);
  });

  it('senha curta → 400 (validação)', async () => {
    const token = await loginGestor();
    const res = await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload({ adminSenha: '123' }));
    expect(res.status).toBe(400);
  });
});

describe('backoffice — abrir e editar empresa (super admin)', () => {
  async function criarEmpresa(token: string, over: Record<string, unknown> = {}) {
    const res = await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload(over));
    return res.body.empresa.id as string;
  }

  it('GET /:id retorna a empresa com seus usuários', async () => {
    const token = await loginGestor();
    const id = await criarEmpresa(token, { adminNome: 'Maria Resp' });
    const res = await api().get(`/api/admin/empresas/${id}`).set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(Array.isArray(res.body.usuarios)).toBe(true);
    expect(res.body.usuarios.some((u: { nome: string }) => u.nome === 'Maria Resp')).toBe(true);
  });

  it('PATCH /:id altera nome, plano e ativo', async () => {
    const token = await loginGestor();
    const id = await criarEmpresa(token);
    const res = await api()
      .patch(`/api/admin/empresas/${id}`)
      .set('Authorization', bearer(token))
      .send({ nome: 'Nome Alterado', plano: 'suspenso', ativo: false });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Nome Alterado');
    expect(res.body.plano).toBe('suspenso');
    expect(res.body.ativo).toBe(false);
  });

  it('PATCH em empresa inexistente → 404', async () => {
    const token = await loginGestor();
    const res = await api()
      .patch('/api/admin/empresas/00000000-0000-0000-0000-0000000000ff')
      .set('Authorization', bearer(token))
      .send({ nome: 'X Ltda' });
    expect(res.status).toBe(404);
  });

  it('PATCH com CNPJ já usado por outra empresa → 409', async () => {
    const token = await loginGestor();
    await criarEmpresa(token, { cnpj: '12.345.678/0001-95' });
    const id2 = await criarEmpresa(token);
    const res = await api()
      .patch(`/api/admin/empresas/${id2}`)
      .set('Authorization', bearer(token))
      .send({ cnpj: '12345678000195' });
    expect(res.status).toBe(409);
  });

  it('gestor comum não edita empresa → 403', async () => {
    const superToken = await loginGestor();
    const id = await criarEmpresa(superToken);
    const gestor = await criarEmpresaComGestor();
    const res = await api()
      .patch(`/api/admin/empresas/${id}`)
      .set('Authorization', bearer(gestor))
      .send({ nome: 'Hack Ltda' });
    expect(res.status).toBe(403);
  });
});

describe('backoffice — redefinir senha de usuário (super admin)', () => {
  // Cria empresa e devolve { id da empresa, id do usuário admin, email }.
  async function criarComUsuario(token: string) {
    const email = emailUnico();
    const criada = await api()
      .post('/api/admin/empresas')
      .set('Authorization', bearer(token))
      .send(payload({ adminEmail: email, adminSenha: 'inicial-12345' }));
    const empresaId = criada.body.empresa.id as string;
    const detalhe = await api().get(`/api/admin/empresas/${empresaId}`).set('Authorization', bearer(token));
    return { empresaId, usuarioId: detalhe.body.usuarios[0].id as string, email };
  }

  it('redefine a senha e o cliente loga com a nova', async () => {
    const token = await loginGestor();
    const { empresaId, usuarioId, email } = await criarComUsuario(token);
    const res = await api()
      .post(`/api/admin/empresas/${empresaId}/usuarios/${usuarioId}/senha`)
      .set('Authorization', bearer(token))
      .send({ senha: 'nova-senha-999' });
    expect(res.status).toBe(200);

    const login = await api().post('/api/auth/login').send({ email, senha: 'nova-senha-999' });
    expect(login.status).toBe(200);
    expect(login.body.accessToken).toBeTruthy();
  });

  it('não redefine usuário de OUTRA empresa (404)', async () => {
    const token = await loginGestor();
    const a = await criarComUsuario(token);
    const b = await criarComUsuario(token);
    // tenta usar o id do usuário de A sob a empresa B → não pertence → 404
    const res = await api()
      .post(`/api/admin/empresas/${b.empresaId}/usuarios/${a.usuarioId}/senha`)
      .set('Authorization', bearer(token))
      .send({ senha: 'qualquer-12345' });
    expect(res.status).toBe(404);
  });

  it('senha curta → 400', async () => {
    const token = await loginGestor();
    const { empresaId, usuarioId } = await criarComUsuario(token);
    const res = await api()
      .post(`/api/admin/empresas/${empresaId}/usuarios/${usuarioId}/senha`)
      .set('Authorization', bearer(token))
      .send({ senha: '123' });
    expect(res.status).toBe(400);
  });

  it('gestor comum não redefine senha → 403', async () => {
    const token = await loginGestor();
    const { empresaId, usuarioId } = await criarComUsuario(token);
    const gestor = await criarEmpresaComGestor();
    const res = await api()
      .post(`/api/admin/empresas/${empresaId}/usuarios/${usuarioId}/senha`)
      .set('Authorization', bearer(gestor))
      .send({ senha: 'nova-senha-999' });
    expect(res.status).toBe(403);
  });
});

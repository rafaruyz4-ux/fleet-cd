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

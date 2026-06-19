import { beforeAll, describe, expect, it } from 'vitest';
import { ADMIN_EMAIL, ADMIN_SENHA } from './config';
import { api, bearer, criarMotorista, loginGestor, loginMotoristaApp } from './helpers';

describe('auth — gestor', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });

  it('login válido retorna tokens e perfil', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, senha: ADMIN_SENHA });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.usuario.papel).toBe('admin');
  });

  it('senha errada → 401', async () => {
    const res = await api().post('/api/auth/login').send({ email: ADMIN_EMAIL, senha: 'errada' });
    expect(res.status).toBe(401);
  });

  it('GET /auth/me retorna o gestor', async () => {
    const res = await api().get('/api/auth/me').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.email).toBe(ADMIN_EMAIL);
  });

  it('refresh emite novo access token', async () => {
    const login = await api()
      .post('/api/auth/login')
      .send({ email: ADMIN_EMAIL, senha: ADMIN_SENHA });
    const res = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: login.body.refreshToken });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
  });
});

describe('auth — motorista (app)', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });

  it('login por CPF (sem pontuação) + senha retorna token', async () => {
    const { cpf } = await criarMotorista(token, { senha: 'app-1234', cpf: '52998224725' });
    const res = await api().post('/api/auth/motorista/login').send({ cpf, senha: 'app-1234' });
    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.motorista.cpf).toBeTruthy();
  });

  it('motorista sem senha → 401', async () => {
    const { cpf } = await criarMotorista(token); // sem senha
    const res = await api().post('/api/auth/motorista/login').send({ cpf, senha: 'qualquer' });
    expect(res.status).toBe(401);
  });

  it('GET /auth/motorista/me retorna o perfil', async () => {
    const { appToken } = await loginMotoristaApp(token);
    const res = await api().get('/api/auth/motorista/me').set('Authorization', bearer(appToken));
    expect(res.status).toBe(200);
    expect(res.body.nome).toBeTruthy();
  });
});

describe('auth — isolamento de principais', () => {
  let gestor: string;
  let motorista: string;
  beforeAll(async () => {
    gestor = await loginGestor();
    motorista = (await loginMotoristaApp(gestor)).appToken;
  });

  it('motorista não acessa o dashboard (403)', async () => {
    expect((await api().get('/api/veiculos').set('Authorization', bearer(motorista))).status).toBe(
      403,
    );
    expect((await api().get('/api/auth/me').set('Authorization', bearer(motorista))).status).toBe(
      403,
    );
  });

  it('gestor não acessa rotas do app (403)', async () => {
    expect((await api().get('/api/app/viagens').set('Authorization', bearer(gestor))).status).toBe(
      403,
    );
    expect(
      (await api().get('/api/auth/motorista/me').set('Authorization', bearer(gestor))).status,
    ).toBe(403);
  });

  it('sem token → 401; token inválido → 401', async () => {
    expect((await api().get('/api/veiculos')).status).toBe(401);
    expect((await api().get('/api/veiculos').set('Authorization', 'Bearer xxx')).status).toBe(401);
  });
});

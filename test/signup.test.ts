import { describe, expect, it } from 'vitest';
import { api, bearer, criarVeiculo, loginGestor } from './helpers';

// E-mail único por chamada para não colidir (empresas/usuarios criados no
// signup NÃO são truncados entre os testes — só as tabelas de domínio são).
let n = 0;
const emailUnico = () => `dono-${Date.now()}-${++n}@empresanova.test`;

const payloadValido = (over: Record<string, unknown> = {}) => ({
  empresaNome: 'Transportadora Nova',
  nome: 'Dona da Empresa',
  email: emailUnico(),
  senha: 'senha-forte-123',
  ...over,
});

describe('signup — cadastro self-service de empresa', () => {
  it('cria empresa + admin e já devolve tokens (201)', async () => {
    const res = await api().post('/api/auth/signup').send(payloadValido());
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.usuario.papel).toBe('admin');
  });

  it('o token retornado já acessa o dashboard da nova empresa', async () => {
    const signup = await api().post('/api/auth/signup').send(payloadValido());
    const res = await api()
      .get('/api/veiculos')
      .set('Authorization', bearer(signup.body.accessToken));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data ?? res.body)).toBe(true);
  });

  it('a nova empresa NÃO enxerga dados de outra empresa (isolamento)', async () => {
    // A empresa padrão (admin do seed) cadastra um veículo...
    const admin = await loginGestor();
    await criarVeiculo(admin, { placa: 'ISO1A23' });

    // ...e a empresa recém-cadastrada não deve ver nada.
    const signup = await api().post('/api/auth/signup').send(payloadValido());
    const res = await api()
      .get('/api/veiculos')
      .set('Authorization', bearer(signup.body.accessToken));
    const lista = res.body.data ?? res.body;
    expect(lista).toHaveLength(0);
  });

  it('e-mail já cadastrado → 409', async () => {
    const email = emailUnico();
    await api().post('/api/auth/signup').send(payloadValido({ email }));
    const res = await api().post('/api/auth/signup').send(payloadValido({ email }));
    expect(res.status).toBe(409);
  });

  it('CNPJ já cadastrado → 409 (ignorando pontuação)', async () => {
    await api().post('/api/auth/signup').send(payloadValido({ cnpj: '11.222.333/0001-81' }));
    const res = await api().post('/api/auth/signup').send(payloadValido({ cnpj: '11222333000181' }));
    expect(res.status).toBe(409);
  });

  it('senha curta → 400 (validação)', async () => {
    const res = await api().post('/api/auth/signup').send(payloadValido({ senha: '123' }));
    expect(res.status).toBe(400);
  });
});

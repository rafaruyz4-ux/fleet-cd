import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, loginGestor, loginMotoristaApp, xmlExemplo } from './helpers';

describe('integração NF-e — import por XML', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  it('importa a NF-e do XML com todos os campos e itens', async () => {
    const res = await api()
      .post('/api/nfs/importar')
      .set('Authorization', h())
      .send({ xml: xmlExemplo() });
    expect(res.status).toBe(201);
    expect(res.body.chave_acesso).toBe('35260512345678000199550010000000451000000453');
    expect(res.body.numero).toBe('45');
    expect(res.body.cfop).toBe('5102');
    expect(res.body.destinatario_nome).toBe('Bar do Ze Ltda');
    expect(res.body.valor_total).toBe(1250.9);
    expect(res.body.peso_kg).toBe(80.5);
    expect(res.body.itens).toHaveLength(2);
    expect(res.body.destinatario_endereco).toContain('Sao Paulo/SP');
  });

  it('reimportar a mesma NF-e → 409', async () => {
    await api().post('/api/nfs/importar').set('Authorization', h()).send({ xml: xmlExemplo() });
    const dup = await api()
      .post('/api/nfs/importar')
      .set('Authorization', h())
      .send({ xml: xmlExemplo() });
    expect(dup.status).toBe(409);
  });

  it('XML que não é NF-e → 400', async () => {
    const res = await api()
      .post('/api/nfs/importar')
      .set('Authorization', h())
      .send({ xml: '<foo>x</foo>' });
    expect(res.status).toBe(400);
  });

  it('SEFAZ sem certificado → 501', async () => {
    const res = await api()
      .post('/api/nfs/sefaz')
      .set('Authorization', h())
      .send({ chave_acesso: '35260512345678000199550010000000451000000453' });
    expect(res.status).toBe(501);
  });

  it('import exige gestor (motorista → 403)', async () => {
    const { appToken } = await loginMotoristaApp(token);
    const res = await api()
      .post('/api/nfs/importar')
      .set('Authorization', bearer(appToken))
      .send({ xml: xmlExemplo() });
    expect(res.status).toBe(403);
  });
});

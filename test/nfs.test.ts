import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, chaveUnica, loginGestor } from './helpers';

describe('NFs', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  it('cria NF com itens (transação) e devolve os itens na resposta', async () => {
    const res = await api()
      .post('/api/nfs')
      .set('Authorization', h())
      .send({
        chave_acesso: chaveUnica(),
        numero: '10',
        destinatario_nome: 'Cliente A',
        valor_total: 1250.9,
        itens: [
          { codigo: 'A', descricao: 'Item A', quantidade: 2, valor_unitario: 10 },
          { codigo: 'B', descricao: 'Item B', quantidade: 1, valor_unitario: 5 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('importada');
    expect(res.body.itens).toHaveLength(2);
    expect(typeof res.body.valor_total).toBe('number');
    expect(res.body.valor_total).toBe(1250.9);
  });

  it('chave de acesso duplicada → 409', async () => {
    const chave = chaveUnica();
    await api().post('/api/nfs').set('Authorization', h()).send({ chave_acesso: chave });
    const dup = await api()
      .post('/api/nfs')
      .set('Authorization', h())
      .send({ chave_acesso: chave });
    expect(dup.status).toBe(409);
  });

  it('chave inválida → 400', async () => {
    const res = await api()
      .post('/api/nfs')
      .set('Authorization', h())
      .send({ chave_acesso: '123' });
    expect(res.status).toBe(400);
  });

  it('lista com envelope e filtro por status', async () => {
    await api().post('/api/nfs').set('Authorization', h()).send({ chave_acesso: chaveUnica() });
    const res = await api().get('/api/nfs?status=importada&limit=10').set('Authorization', h());
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('data');
    expect(res.body.total).toBeGreaterThanOrEqual(1);
  });

  it('PATCH substitui os itens por completo', async () => {
    const create = await api()
      .post('/api/nfs')
      .set('Authorization', h())
      .send({ chave_acesso: chaveUnica(), itens: [{ descricao: 'velho', quantidade: 1 }] });
    const id = create.body.id;
    const patch = await api()
      .patch(`/api/nfs/${id}`)
      .set('Authorization', h())
      .send({ itens: [{ codigo: 'NOVO', descricao: 'novo', quantidade: 3 }] });
    expect(patch.status).toBe(200);
    expect(patch.body.itens).toHaveLength(1);
    expect(patch.body.itens[0].codigo).toBe('NOVO');
  });
});

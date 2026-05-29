import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarMotorista,
  criarNf,
  criarVeiculo,
  loginGestor,
} from './helpers';

describe('viagens + paradas', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  async function nfStatus(id: string): Promise<string> {
    const res = await api().get(`/api/nfs/${id}`).set('Authorization', h());
    return res.body.status;
  }

  it('ciclo completo: cria → aloca NF → inicia → entrega → encerra, com status da NF', async () => {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    const nf = await criarNf(token);

    const criada = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista, km_inicial: 100, nf_ids: [nf] });
    expect(criada.status).toBe(201);
    expect(criada.body.paradas).toHaveLength(1);
    expect(await nfStatus(nf)).toBe('alocada');
    const viagem = criada.body.id;

    await api().post(`/api/viagens/${viagem}/iniciar`).set('Authorization', h()).send({});
    expect(await nfStatus(nf)).toBe('em_viagem');

    const paradaId = criada.body.paradas[0].id;
    const entrega = await api()
      .patch(`/api/viagens/${viagem}/paradas/${paradaId}`)
      .set('Authorization', h())
      .send({ status: 'entregue' });
    expect(entrega.status).toBe(200);
    expect(entrega.body.chegada_real).toBeTruthy();
    expect(await nfStatus(nf)).toBe('entregue');

    const enc = await api()
      .post(`/api/viagens/${viagem}/encerrar`)
      .set('Authorization', h())
      .send({ km_final: 200 });
    expect(enc.status).toBe(200);
    expect(enc.body.status).toBe('encerrada');
  });

  it('encerrar com km_final < km_inicial → 400', async () => {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    const v = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista, km_inicial: 500 });
    await api().post(`/api/viagens/${v.body.id}/iniciar`).set('Authorization', h()).send({});
    const res = await api()
      .post(`/api/viagens/${v.body.id}/encerrar`)
      .set('Authorization', h())
      .send({ km_final: 100 });
    expect(res.status).toBe(400);
  });

  it('cancelar devolve a NF a importada', async () => {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    const nf = await criarNf(token);
    const v = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista, nf_ids: [nf] });
    await api().post(`/api/viagens/${v.body.id}/cancelar`).set('Authorization', h());
    expect(await nfStatus(nf)).toBe('importada');
  });

  it('veículo inexistente → 400', async () => {
    const { id: motorista } = await criarMotorista(token);
    const res = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: '00000000-0000-0000-0000-000000000000', motorista_id: motorista });
    expect(res.status).toBe(400);
  });
});

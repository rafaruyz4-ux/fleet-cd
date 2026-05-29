import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarMotorista,
  criarVeiculo,
  loginGestor,
  numeroAutoUnico,
} from './helpers';

describe('multas + vínculo automático', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  // Cria veículo + motorista + viagem encerrada cobrindo 08:00–12:00.
  async function viagemNaJanela() {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    const v = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista });
    await api()
      .post(`/api/viagens/${v.body.id}/iniciar`)
      .set('Authorization', h())
      .send({ iniciada_em: '2026-05-28T08:00:00Z' });
    await api()
      .post(`/api/viagens/${v.body.id}/encerrar`)
      .set('Authorization', h())
      .send({ encerrada_em: '2026-05-28T12:00:00Z' });
    return { veiculo, motorista, viagem: v.body.id };
  }

  it('multa dentro da janela vincula viagem + motorista (auto_vinculada)', async () => {
    const { veiculo, motorista, viagem } = await viagemNaJanela();
    const res = await api()
      .post('/api/multas')
      .set('Authorization', h())
      .send({
        numero_auto: numeroAutoUnico(),
        veiculo_id: veiculo,
        ocorrida_em: '2026-05-28T10:00:00Z',
        valor: 195.23,
      });
    expect(res.status).toBe(201);
    expect(res.body.status_revisao).toBe('auto_vinculada');
    expect(res.body.viagem_id).toBe(viagem);
    expect(res.body.motorista_id).toBe(motorista);
    expect(typeof res.body.valor).toBe('number');
  });

  it('multa fora da janela fica aguardando_revisao', async () => {
    const { veiculo } = await viagemNaJanela();
    const res = await api()
      .post('/api/multas')
      .set('Authorization', h())
      .send({ numero_auto: numeroAutoUnico(), veiculo_id: veiculo, ocorrida_em: '2026-05-28T20:00:00Z' });
    expect(res.body.status_revisao).toBe('aguardando_revisao');
    expect(res.body.viagem_id).toBeNull();
  });

  it('resolve por placa e numero_auto duplicado → 409', async () => {
    const veiculo = await criarVeiculo(token, { placa: 'XYZ9A88' });
    const num = numeroAutoUnico();
    const r1 = await api().post('/api/multas').set('Authorization', h()).send({ numero_auto: num, placa: 'xyz9a88' });
    expect(r1.status).toBe(201);
    expect(r1.body.veiculo_id).toBe(veiculo);
    const r2 = await api().post('/api/multas').set('Authorization', h()).send({ numero_auto: num, placa: 'XYZ9A88' });
    expect(r2.status).toBe(409);
  });

  it('placa inexistente → 400; sem veículo/placa → 400', async () => {
    expect(
      (await api().post('/api/multas').set('Authorization', h()).send({ numero_auto: numeroAutoUnico(), placa: 'ZZZ9Z99' })).status,
    ).toBe(400);
    expect(
      (await api().post('/api/multas').set('Authorization', h()).send({ numero_auto: numeroAutoUnico() })).status,
    ).toBe(400);
  });

  it('revincular após cadastrar a viagem', async () => {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    // multa antes de existir viagem correspondente
    const multa = await api()
      .post('/api/multas')
      .set('Authorization', h())
      .send({ numero_auto: numeroAutoUnico(), veiculo_id: veiculo, ocorrida_em: '2026-05-29T09:30:00Z' });
    expect(multa.body.status_revisao).toBe('aguardando_revisao');

    const v = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista });
    await api().post(`/api/viagens/${v.body.id}/iniciar`).set('Authorization', h()).send({ iniciada_em: '2026-05-29T09:00:00Z' });
    await api().post(`/api/viagens/${v.body.id}/encerrar`).set('Authorization', h()).send({ encerrada_em: '2026-05-29T11:00:00Z' });

    const re = await api().post(`/api/multas/${multa.body.id}/revincular`).set('Authorization', h());
    expect(re.body.status_revisao).toBe('auto_vinculada');
    expect(re.body.viagem_id).toBe(v.body.id);
  });
});

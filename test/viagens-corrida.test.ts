import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarMotorista,
  criarVeiculo,
  loginGestor,
  loginMotoristaApp,
} from './helpers';

// Auditoria — corrida do toque duplo: o banco (índices únicos parciais da
// migration 014) garante no máximo UMA viagem INICIADA por motorista e por
// veículo; a violação vira 400 amigável.
describe('viagens — trava de viagem dupla (índice único no banco)', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  it('motorista não cria/inicia uma 2ª viagem pelo app → 400', async () => {
    const veiculo1 = await criarVeiculo(token);
    const veiculo2 = await criarVeiculo(token);
    const { appToken } = await loginMotoristaApp(token);

    const r1 = await api()
      .post('/api/app/viagens')
      .set('Authorization', bearer(appToken))
      .send({ veiculo_id: veiculo1 });
    expect(r1.status).toBe(201);
    expect(r1.body.iniciada_em).toBeTruthy();

    const r2 = await api()
      .post('/api/app/viagens')
      .set('Authorization', bearer(appToken))
      .send({ veiculo_id: veiculo2 });
    expect(r2.status).toBe(400);
  });

  it('iniciar 2ª viagem do MESMO motorista (via gestor) esbarra no índice → 400', async () => {
    const veiculo1 = await criarVeiculo(token);
    const veiculo2 = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);

    const v1 = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo1, motorista_id: motorista });
    expect(
      (await api().post(`/api/viagens/${v1.body.id}/iniciar`).set('Authorization', h()).send({}))
        .status,
    ).toBe(200);

    // O iniciar do gestor não tem check-then-act de motorista ativo — é o
    // índice único que segura, e a violação tem que virar 400 (não 409/500).
    const v2 = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo2, motorista_id: motorista });
    const inicia2 = await api()
      .post(`/api/viagens/${v2.body.id}/iniciar`)
      .set('Authorization', h())
      .send({});
    expect(inicia2.status).toBe(400);
    expect(inicia2.body.error).toMatch(/já tem uma viagem iniciada/i);
  });

  it('iniciar 2ª viagem do MESMO veículo esbarra no índice → 400', async () => {
    const veiculo = await criarVeiculo(token);
    const { id: motorista1 } = await criarMotorista(token);
    const { id: motorista2 } = await criarMotorista(token);

    const v1 = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista1 });
    await api().post(`/api/viagens/${v1.body.id}/iniciar`).set('Authorization', h()).send({});

    const v2 = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista2 });
    const inicia2 = await api()
      .post(`/api/viagens/${v2.body.id}/iniciar`)
      .set('Authorization', h())
      .send({});
    expect(inicia2.status).toBe(400);
    expect(inicia2.body.error).toMatch(/veículo já está rodando/i);
  });

  it('viagens PLANEJADAS (sem iniciada_em) continuam podendo coexistir', async () => {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);

    // O gestor pode planejar várias viagens do mesmo motorista/veículo — o
    // índice só trava as INICIADAS.
    const v1 = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista });
    const v2 = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista });
    expect(v1.status).toBe(201);
    expect(v2.status).toBe(201);
  });
});

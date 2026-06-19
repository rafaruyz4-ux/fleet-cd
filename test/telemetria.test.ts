import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarVeiculo, loginGestor, loginMotoristaApp } from './helpers';

describe('telemetria — GPS + alertas', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  async function cenario() {
    const veiculo = await criarVeiculo(token);
    const { motoristaId, appToken } = await loginMotoristaApp(token);
    const rota = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({
        tipo: 'fixa',
        nome: 'R',
        raio_tolerancia_m: 200,
        linha: [
          { lat: -23.56, lng: -46.65 },
          { lat: -23.56, lng: -46.64 },
        ],
      });
    const viagem = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motoristaId, rota_planejada_id: rota.body.id });
    return { appToken, viagemId: viagem.body.id };
  }

  it('ingestão em lote detecta os 4 tipos de alerta', async () => {
    const { appToken, viagemId } = await cenario();
    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          // normal → 130 km/h (velocidade_alta) → desvia da rota e PARA (lat -23.565)
          // por 20 min (parada_longa), com gap de 20 min entre os 2 últimos (sem_gps).
          { lat: -23.56, lng: -46.648, velocidade_kmh: 40, registrado_em: '2026-05-28T12:00:00Z' },
          { lat: -23.56, lng: -46.646, velocidade_kmh: 130, registrado_em: '2026-05-28T12:04:00Z' },
          { lat: -23.565, lng: -46.646, velocidade_kmh: 0, registrado_em: '2026-05-28T12:05:00Z' },
          { lat: -23.565, lng: -46.646, velocidade_kmh: 0, registrado_em: '2026-05-28T12:25:00Z' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.inseridas).toBe(4);
    const tipos = new Set<string>(res.body.alertas.map((a: { tipo: string }) => a.tipo));
    expect(tipos.has('velocidade_alta')).toBe(true);
    expect(tipos.has('desvio_rota')).toBe(true);
    expect(tipos.has('sem_gps')).toBe(true);
    expect(tipos.has('parada_longa')).toBe(true);
  });

  it('trajeto e feed de alertas ficam disponíveis no dashboard', async () => {
    const { appToken, viagemId } = await cenario();
    await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, velocidade_kmh: 130, registrado_em: '2026-05-28T12:00:00Z' },
        ],
      });

    const traj = await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h());
    expect(traj.body.total).toBe(1);

    const feed = await api().get(`/api/alertas?viagem_id=${viagemId}`).set('Authorization', h());
    expect(feed.body.total).toBeGreaterThanOrEqual(1);

    const alertaId = feed.body.data[0].id;
    const marca = await api()
      .patch(`/api/alertas/${alertaId}`)
      .set('Authorization', h())
      .send({ visualizado: true });
    expect(marca.body.visualizado).toBe(true);
  });

  it('gestor não pode ingerir GPS (403)', async () => {
    const { viagemId } = await cenario();
    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', h())
      .send({ posicoes: [{ lat: -23.5, lng: -46.6, registrado_em: '2026-05-28T12:00:00Z' }] });
    expect(res.status).toBe(403);
  });
});

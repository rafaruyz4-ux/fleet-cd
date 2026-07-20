import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarVeiculo, loginGestor, loginMotoristaApp } from './helpers';

// Pacote 6 — qualidade do dado de GPS: filtro de pontos ruins na ingestão
// (precisão ruim / "teletransporte"), paradas detectadas na trajetória e o
// endpoint de flush final via sendBeacon (token na query).
describe('gps — qualidade do dado + beacon', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  async function cenario() {
    const veiculo = await criarVeiculo(token);
    const { motoristaId, appToken } = await loginMotoristaApp(token);
    const viagem = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motoristaId });
    return { appToken, viagemId: viagem.body.id as string };
  }

  it('ponto com precisão pior que 50 m é descartado (mas a resposta segue OK)', async () => {
    const { appToken, viagemId } = await cenario();
    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, precisao_m: 8, registrado_em: '2026-07-01T12:00:00Z' },
          { lat: -23.5601, lng: -46.648, precisao_m: 80, registrado_em: '2026-07-01T12:01:00Z' },
          { lat: -23.5602, lng: -46.648, precisao_m: 10, registrado_em: '2026-07-01T12:02:00Z' },
        ],
      });
    expect(res.status).toBe(201); // OK: o app não deve reenviar o ponto ruim
    expect(res.body.inseridas).toBe(2);
    expect(res.body.descartadas).toBe(1);

    const traj = await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h());
    expect(traj.body.total).toBe(2); // o ponto impreciso não persistiu
  });

  it('"teletransporte" (velocidade implícita > 160 km/h) é descartado', async () => {
    const { appToken, viagemId } = await cenario();
    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, registrado_em: '2026-07-01T12:00:00Z' },
          // ~11 km em 1 min ≈ 660 km/h → impossível, descarta.
          { lat: -23.46, lng: -46.648, registrado_em: '2026-07-01T12:01:00Z' },
          // Perto do último ponto BOM (não do teletransporte) → fica.
          { lat: -23.5601, lng: -46.648, registrado_em: '2026-07-01T12:02:00Z' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.inseridas).toBe(2);
    expect(res.body.descartadas).toBe(1);
  });

  it('velocidade REPORTADA alta não é teletransporte (segue gerando alerta)', async () => {
    const { appToken, viagemId } = await cenario();
    // Deslocamento pequeno com velocidade_kmh 130: o filtro olha a velocidade
    // implícita entre pontos; a reportada continua alimentando velocidade_alta.
    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, velocidade_kmh: 130, registrado_em: '2026-07-01T12:00:00Z' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.inseridas).toBe(1);
    expect(res.body.descartadas).toBe(0);
    const tipos = res.body.alertas.map((a: { tipo: string }) => a.tipo);
    expect(tipos).toContain('velocidade_alta');
  });

  it('GET /posicoes expõe paradas_detectadas (parado 6 min num raio de 60 m)', async () => {
    const { appToken, viagemId } = await cenario();
    await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.58, lng: -46.648, registrado_em: '2026-07-01T12:00:00Z' }, // em movimento
          { lat: -23.56, lng: -46.648, registrado_em: '2026-07-01T12:04:00Z' },
          { lat: -23.5601, lng: -46.648, registrado_em: '2026-07-01T12:07:00Z' }, // ~11 m
          { lat: -23.56, lng: -46.648, registrado_em: '2026-07-01T12:10:00Z' }, // 6 min parado
          { lat: -23.54, lng: -46.648, registrado_em: '2026-07-01T12:14:00Z' }, // foi embora
        ],
      });

    const traj = await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h());
    expect(traj.status).toBe(200);
    expect(traj.body.paradas_detectadas).toHaveLength(1);
    const parada = traj.body.paradas_detectadas[0];
    expect(parada.duracao_min).toBe(6);
    expect(parada.lat).toBeCloseTo(-23.56, 2);
    expect(parada.lng).toBeCloseTo(-46.648, 3);
    expect(new Date(parada.inicio).toISOString()).toBe('2026-07-01T12:04:00.000Z');
    expect(new Date(parada.fim).toISOString()).toBe('2026-07-01T12:10:00.000Z');
  });

  it('POST /api/app/posicoes-beacon grava o lote com token na query', async () => {
    const { appToken, viagemId } = await cenario();
    const res = await api()
      .post(`/api/app/posicoes-beacon?token=${appToken}&viagem=${viagemId}`)
      .send({
        posicoes: [{ lat: -23.56, lng: -46.648, registrado_em: '2026-07-01T12:00:00Z' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('ok');
    expect(res.body.inseridas).toBe(1);

    const traj = await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h());
    expect(traj.body.total).toBe(1);
  });

  it('POST /api/app/posicoes-beacon com token inválido responde 401', async () => {
    const { viagemId } = await cenario();
    const res = await api()
      .post(`/api/app/posicoes-beacon?token=invalido&viagem=${viagemId}`)
      .send({
        posicoes: [{ lat: -23.56, lng: -46.648, registrado_em: '2026-07-01T12:00:00Z' }],
      });
    expect(res.status).toBe(401);
  });
});

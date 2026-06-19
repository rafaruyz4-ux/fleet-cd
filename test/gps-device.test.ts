import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarVeiculo, loginGestor, loginMotoristaApp } from './helpers';

describe('GPS — token de dispositivo + caminho do celular do motorista', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  // Cria veículo + motorista (com senha/app token) + viagem em_andamento.
  async function cenario() {
    const veiculo = await criarVeiculo(token);
    const { motoristaId, appToken } = await loginMotoristaApp(token);
    const viagem = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motoristaId });
    return { motoristaId, appToken, viagemId: viagem.body.id };
  }

  // Emite o token de dispositivo (long-lived) do motorista pelo endpoint de gestor.
  async function gerarDeviceToken(motoristaId: string): Promise<string> {
    const res = await api()
      .post(`/api/motoristas/${motoristaId}/device-token`)
      .set('Authorization', h());
    expect(res.status).toBe(201);
    expect(typeof res.body.deviceToken).toBe('string');
    expect(res.body.deviceToken.length).toBeGreaterThan(0);
    return res.body.deviceToken;
  }

  it('gestor gera device-token para motorista ativo', async () => {
    const { motoristaId } = await cenario();
    const res = await api()
      .post(`/api/motoristas/${motoristaId}/device-token`)
      .set('Authorization', h());
    expect(res.status).toBe(201);
    expect(typeof res.body.deviceToken).toBe('string');
    expect(res.body.deviceToken.length).toBeGreaterThan(0);
    expect(res.body.motorista.id).toBe(motoristaId);
  });

  it('POST /api/app/posicoes (sem id) grava na viagem em_andamento do motorista', async () => {
    const { appToken } = await cenario();
    const res = await api()
      .post('/api/app/posicoes')
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, velocidade_kmh: 40, registrado_em: '2026-05-28T12:00:00Z' },
          { lat: -23.56, lng: -46.646, velocidade_kmh: 42, registrado_em: '2026-05-28T12:01:00Z' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.inseridas).toBe(2);
  });

  it('Overland com token de dispositivo no cabeçalho Authorization grava posições', async () => {
    const { motoristaId } = await cenario();
    const deviceToken = await gerarDeviceToken(motoristaId);
    const res = await api()
      .post('/api/app/overland')
      .set('Authorization', bearer(deviceToken))
      .send({
        locations: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-46.648, -23.56] },
            properties: { timestamp: '2026-05-28T12:00:00Z', speed: 11, horizontal_accuracy: 5 },
          },
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-46.646, -23.56] },
            properties: { timestamp: '2026-05-28T12:01:00Z', speed: 12, horizontal_accuracy: 5 },
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('ok');
    expect(res.body.inseridas).toBe(2);
  });

  it('Overland aceita token de dispositivo na query (?token=) como reserva', async () => {
    const { motoristaId } = await cenario();
    const deviceToken = await gerarDeviceToken(motoristaId);
    const res = await api()
      .post(`/api/app/overland?token=${encodeURIComponent(deviceToken)}`)
      .send({
        locations: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-46.648, -23.56] },
            properties: { timestamp: '2026-05-28T12:02:00Z', speed: 10 },
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.result).toBe('ok');
    expect(res.body.inseridas).toBe(1);
  });

  it('Overland com token inválido na query responde 401 result:error', async () => {
    const res = await api()
      .post('/api/app/overland?token=xxx')
      .send({
        locations: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-46.648, -23.56] },
            properties: { timestamp: '2026-05-28T12:00:00Z', speed: 10 },
          },
        ],
      });
    expect(res.status).toBe(401);
    expect(res.body.result).toBe('error');
  });

  it('POST /api/app/posicoes sem viagem em_andamento responde 400', async () => {
    // Motorista recém-criado, SEM viagem iniciada.
    const { appToken } = await loginMotoristaApp(token);
    const res = await api()
      .post('/api/app/posicoes')
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, velocidade_kmh: 40, registrado_em: '2026-05-28T12:00:00Z' },
        ],
      });
    expect(res.status).toBe(400);
  });
});

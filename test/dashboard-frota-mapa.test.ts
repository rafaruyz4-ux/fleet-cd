import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarEmpresaComGestor,
  criarVeiculo,
  loginGestor,
  loginMotoristaApp,
} from './helpers';

// Auditoria — contrato do endpoint do mapa da frota (consumido pelo frontend;
// o formato dos campos é FIXO).
describe('GET /api/dashboard/frota-mapa', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  async function viagemComPosicoes() {
    const veiculo = await criarVeiculo(token);
    const { motoristaId, appToken } = await loginMotoristaApp(token);
    const viagem = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motoristaId });
    await api()
      .post(`/api/app/viagens/${viagem.body.id}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, velocidade_kmh: 40, registrado_em: '2026-07-01T12:00:00Z' },
          { lat: -23.55, lng: -46.64, velocidade_kmh: 50, registrado_em: '2026-07-01T12:05:00Z' },
        ],
      });
    return { veiculoId: veiculo, viagemId: viagem.body.id as string, appToken };
  }

  it('devolve a ÚLTIMA posição de cada viagem em andamento, no contrato fixo', async () => {
    const { veiculoId, viagemId } = await viagemComPosicoes();

    // Viagem em andamento SEM posição: fica de fora do mapa.
    const veiculoSem = await criarVeiculo(token);
    const { motoristaId: motoristaSem } = await loginMotoristaApp(token);
    await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculoSem, motorista_id: motoristaSem });

    const res = await api().get('/api/dashboard/frota-mapa').set('Authorization', h());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.veiculos)).toBe(true);
    expect(res.body.veiculos).toHaveLength(1);

    const v = res.body.veiculos[0];
    expect(v.veiculo_id).toBe(veiculoId);
    expect(typeof v.placa).toBe('string');
    expect(v.viagem_id).toBe(viagemId);
    expect(typeof v.motorista_nome).toBe('string');
    // Última posição (12:05), não a primeira.
    expect(v.lat).toBeCloseTo(-23.55, 4);
    expect(v.lng).toBeCloseTo(-46.64, 4);
    expect(v.velocidade_kmh).toBe(50);
    expect(v.registrado_em).toBe('2026-07-01T12:05:00.000Z');
  });

  it('viagem encerrada some do mapa', async () => {
    const { viagemId } = await viagemComPosicoes();
    await api().post(`/api/viagens/${viagemId}/cancelar`).set('Authorization', h());
    const res = await api().get('/api/dashboard/frota-mapa').set('Authorization', h());
    expect(res.body.veiculos).toHaveLength(0);
  });

  it('é tenant-scoped: outra empresa não vê a frota', async () => {
    await viagemComPosicoes();
    const tokenOutraEmpresa = await criarEmpresaComGestor();
    const res = await api()
      .get('/api/dashboard/frota-mapa')
      .set('Authorization', bearer(tokenOutraEmpresa));
    expect(res.status).toBe(200);
    expect(res.body.veiculos).toHaveLength(0);
  });

  it('motorista (app) não acessa → 403; sem token → 401', async () => {
    const { appToken } = await viagemComPosicoes();
    expect(
      (await api().get('/api/dashboard/frota-mapa').set('Authorization', bearer(appToken))).status,
    ).toBe(403);
    expect((await api().get('/api/dashboard/frota-mapa')).status).toBe(401);
  });
});

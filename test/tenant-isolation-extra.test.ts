import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarEmpresaComGestor,
  criarMotorista,
  criarVeiculo,
  loginGestor,
  loginMotoristaApp,
  numeroAutoUnico,
} from './helpers';

// Amplia a cobertura de isolamento multi-tenant para os módulos ainda não
// cobertos por tenant-isolation.test.ts: motoristas, rotas, unidades, multas e
// alertas. A empresa B NUNCA pode listar/ler/editar/apagar recurso da empresa A.
describe('isolamento entre empresas (multi-tenant) — módulos extras', () => {
  let tokenA: string; // empresa padrão
  let tokenB: string; // outra empresa

  beforeAll(async () => {
    tokenA = await loginGestor();
    tokenB = await criarEmpresaComGestor();
  });

  const A = () => bearer(tokenA);
  const B = () => bearer(tokenB);

  // Lista de motoristas retorna ARRAY puro.
  it('motoristas: B não lista, não lê, não edita nem apaga motorista de A', async () => {
    const { id: motoristaA } = await criarMotorista(tokenA);

    const lista = await api().get('/api/motoristas').set('Authorization', B());
    expect(lista.status).toBe(200);
    expect(lista.body.find((m: { id: string }) => m.id === motoristaA)).toBeUndefined();

    expect(
      (await api().get(`/api/motoristas/${motoristaA}`).set('Authorization', B())).status,
    ).toBe(404);
    expect(
      (
        await api()
          .patch(`/api/motoristas/${motoristaA}`)
          .set('Authorization', B())
          .send({ nome: 'Hackeado' })
      ).status,
    ).toBe(404);
    expect(
      (await api().delete(`/api/motoristas/${motoristaA}`).set('Authorization', B())).status,
    ).toBe(404);

    // A continua enxergando o próprio motorista.
    expect(
      (await api().get(`/api/motoristas/${motoristaA}`).set('Authorization', A())).status,
    ).toBe(200);
  });

  // Lista de rotas retorna ARRAY puro.
  it('rotas: B não lista, não lê, não edita nem apaga rota de A', async () => {
    const rotaA = (
      await api()
        .post('/api/rotas')
        .set('Authorization', A())
        .send({
          tipo: 'fixa',
          nome: 'Rota A',
          raio_tolerancia_m: 200,
          linha: [
            { lat: -23.56, lng: -46.65 },
            { lat: -23.56, lng: -46.64 },
          ],
        })
    ).body.id;

    const lista = await api().get('/api/rotas').set('Authorization', B());
    expect(lista.status).toBe(200);
    expect(lista.body.find((r: { id: string }) => r.id === rotaA)).toBeUndefined();

    expect((await api().get(`/api/rotas/${rotaA}`).set('Authorization', B())).status).toBe(404);
    expect(
      (
        await api()
          .patch(`/api/rotas/${rotaA}`)
          .set('Authorization', B())
          .send({ nome: 'Hackeada' })
      ).status,
    ).toBe(404);
    expect((await api().delete(`/api/rotas/${rotaA}`).set('Authorization', B())).status).toBe(404);

    // A continua enxergando a própria rota.
    expect((await api().get(`/api/rotas/${rotaA}`).set('Authorization', A())).status).toBe(200);
  });

  // Lista de unidades retorna ARRAY puro.
  it('unidades: B não lista, não lê, não edita nem apaga unidade de A', async () => {
    const unidadeA = (
      await api()
        .post('/api/unidades')
        .set('Authorization', A())
        .send({
          nome: 'Unidade A',
          endereco: 'Rua Teste, 100',
          coordenada: { lat: -23.56, lng: -46.65 },
        })
    ).body.id;

    const lista = await api().get('/api/unidades').set('Authorization', B());
    expect(lista.status).toBe(200);
    expect(lista.body.find((u: { id: string }) => u.id === unidadeA)).toBeUndefined();

    expect((await api().get(`/api/unidades/${unidadeA}`).set('Authorization', B())).status).toBe(
      404,
    );
    expect(
      (
        await api()
          .patch(`/api/unidades/${unidadeA}`)
          .set('Authorization', B())
          .send({ nome: 'Hackeada' })
      ).status,
    ).toBe(404);
    expect((await api().delete(`/api/unidades/${unidadeA}`).set('Authorization', B())).status).toBe(
      404,
    );

    // A continua enxergando a própria unidade.
    expect((await api().get(`/api/unidades/${unidadeA}`).set('Authorization', A())).status).toBe(
      200,
    );
  });

  // Lista de multas retorna { data, total }.
  it('multas: B não lista, não lê, não edita nem apaga multa de A', async () => {
    const veiculoA = await criarVeiculo(tokenA);
    const multaA = (
      await api().post('/api/multas').set('Authorization', A()).send({
        numero_auto: numeroAutoUnico(),
        veiculo_id: veiculoA,
        ocorrida_em: '2026-05-28T12:00:00Z',
        tipo: 'Excesso de velocidade',
        valor: 130.16,
      })
    ).body.id;

    const lista = await api().get('/api/multas').set('Authorization', B());
    expect(lista.status).toBe(200);
    expect(lista.body.data.find((m: { id: string }) => m.id === multaA)).toBeUndefined();

    expect((await api().get(`/api/multas/${multaA}`).set('Authorization', B())).status).toBe(404);
    expect(
      (
        await api()
          .patch(`/api/multas/${multaA}`)
          .set('Authorization', B())
          .send({ tipo: 'Hackeada' })
      ).status,
    ).toBe(404);
    expect((await api().delete(`/api/multas/${multaA}`).set('Authorization', B())).status).toBe(
      404,
    );

    // A continua enxergando a própria multa.
    expect((await api().get(`/api/multas/${multaA}`).set('Authorization', A())).status).toBe(200);
  });

  // Alertas são GERADOS pela ingestão de GPS, não criados via POST. Reproduz o
  // cenário de telemetria.test.ts para gerar alertas na empresa A e confere que
  // a empresa B não enxerga nenhum deles. Lista de alertas retorna { data, total }.
  it('alertas: B não enxerga alertas gerados na viagem de A', async () => {
    const veiculoA = await criarVeiculo(tokenA);
    const { motoristaId, appToken } = await loginMotoristaApp(tokenA);
    const rotaA = await api()
      .post('/api/rotas')
      .set('Authorization', A())
      .send({
        tipo: 'fixa',
        nome: 'Rota Alerta A',
        raio_tolerancia_m: 200,
        linha: [
          { lat: -23.56, lng: -46.65 },
          { lat: -23.56, lng: -46.64 },
        ],
      });
    const viagemA = (
      await api().post('/api/viagens').set('Authorization', A()).send({
        veiculo_id: veiculoA,
        motorista_id: motoristaId,
        rota_planejada_id: rotaA.body.id,
      })
    ).body.id;

    // Posições que disparam alertas (velocidade alta, desvio, parada, sem GPS).
    const ingest = await api()
      .post(`/api/app/viagens/${viagemA}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, velocidade_kmh: 40, registrado_em: '2026-05-28T12:00:00Z' },
          { lat: -23.56, lng: -46.646, velocidade_kmh: 130, registrado_em: '2026-05-28T12:04:00Z' },
          { lat: -23.565, lng: -46.646, velocidade_kmh: 0, registrado_em: '2026-05-28T12:05:00Z' },
          { lat: -23.565, lng: -46.646, velocidade_kmh: 0, registrado_em: '2026-05-28T12:25:00Z' },
        ],
      });
    expect(ingest.status).toBe(201);
    expect(ingest.body.alertas.length).toBeGreaterThanOrEqual(1);

    // A enxerga os alertas da própria viagem.
    const feedA = await api().get(`/api/alertas?viagem_id=${viagemA}`).set('Authorization', A());
    expect(feedA.body.total).toBeGreaterThanOrEqual(1);

    // B, filtrando pela viagem de A, não recebe nada.
    const feedB = await api().get(`/api/alertas?viagem_id=${viagemA}`).set('Authorization', B());
    expect(feedB.status).toBe(200);
    expect(feedB.body.total).toBe(0);
    expect(feedB.body.data).toHaveLength(0);

    // E o feed geral de B não contém nenhum alerta dessa viagem de A.
    const geralB = await api().get('/api/alertas').set('Authorization', B());
    expect(
      geralB.body.data.find((a: { viagem_id: string }) => a.viagem_id === viagemA),
    ).toBeUndefined();
  });
});

import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarEmpresaComGestor,
  criarMotorista,
  criarNf,
  criarVeiculo,
  loginGestor,
} from './helpers';

// Garante que um cliente (empresa) NUNCA enxerga nem altera os dados de outro.
// É o coração do modelo SaaS multi-tenant.
describe('isolamento entre empresas (multi-tenant)', () => {
  let tokenA: string; // empresa padrão
  let tokenB: string; // outra empresa

  beforeAll(async () => {
    tokenA = await loginGestor();
    tokenB = await criarEmpresaComGestor();
  });

  const A = () => bearer(tokenA);
  const B = () => bearer(tokenB);

  it('veículos: B não lista, não lê, não edita nem apaga veículo de A', async () => {
    const veiculoA = await criarVeiculo(tokenA);

    const lista = await api().get('/api/veiculos').set('Authorization', B());
    expect(lista.status).toBe(200);
    expect(lista.body.find((v: { id: string }) => v.id === veiculoA)).toBeUndefined();

    expect((await api().get(`/api/veiculos/${veiculoA}`).set('Authorization', B())).status).toBe(
      404,
    );
    expect(
      (
        await api()
          .patch(`/api/veiculos/${veiculoA}`)
          .set('Authorization', B())
          .send({ modelo: 'X' })
      ).status,
    ).toBe(404);
    expect((await api().delete(`/api/veiculos/${veiculoA}`).set('Authorization', B())).status).toBe(
      404,
    );

    // A continua enxergando o próprio veículo.
    expect((await api().get(`/api/veiculos/${veiculoA}`).set('Authorization', A())).status).toBe(
      200,
    );
  });

  it('NFs: B não enxerga a NF de A', async () => {
    const nfA = await criarNf(tokenA);
    const lista = await api().get('/api/nfs').set('Authorization', B());
    expect(lista.body.data.find((n: { id: string }) => n.id === nfA)).toBeUndefined();
    expect((await api().get(`/api/nfs/${nfA}`).set('Authorization', B())).status).toBe(404);
  });

  it('viagens: B não enxerga a viagem de A', async () => {
    const veiculoA = await criarVeiculo(tokenA);
    const { id: motoristaA } = await criarMotorista(tokenA);
    const viagemA = (
      await api()
        .post('/api/viagens')
        .set('Authorization', A())
        .send({ veiculo_id: veiculoA, motorista_id: motoristaA })
    ).body.id;

    const lista = await api().get('/api/viagens').set('Authorization', B());
    expect(lista.body.data.find((v: { id: string }) => v.id === viagemA)).toBeUndefined();
    expect((await api().get(`/api/viagens/${viagemA}`).set('Authorization', B())).status).toBe(404);
  });

  it('viagens: B não pode usar um veículo de A ao criar sua própria viagem', async () => {
    const veiculoA = await criarVeiculo(tokenA);
    const { id: motoristaA } = await criarMotorista(tokenA);
    const res = await api()
      .post('/api/viagens')
      .set('Authorization', B())
      .send({ veiculo_id: veiculoA, motorista_id: motoristaA });
    expect(res.status).toBe(400); // veículo/motorista "não encontrado" para a empresa B
  });
});

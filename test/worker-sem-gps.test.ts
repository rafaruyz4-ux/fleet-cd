import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarMotorista, criarVeiculo, loginGestor } from './helpers';
import { detectarSemGps } from '../src/workers/sem-gps';
import { pool } from '../src/db/pool';

const minAtras = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe('worker — detecção de sem_gps', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  async function viagemIniciadaEm(iniciada_em: string): Promise<string> {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    const v = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista });
    await api().post(`/api/viagens/${v.body.id}/iniciar`).set('Authorization', h()).send({ iniciada_em });
    return v.body.id;
  }

  it('gera sem_gps para viagem em andamento sem contato há > limite', async () => {
    const viagem = await viagemIniciadaEm(minAtras(30));
    const novos = await detectarSemGps(10);
    const meu = novos.filter((a) => a.viagem_id === viagem);
    expect(meu).toHaveLength(1);
    expect(meu[0]!.descricao).toMatch(/Sem posição há/);
  });

  it('não re-alerta na passada seguinte (dedup enquanto não há novo contato)', async () => {
    const viagem = await viagemIniciadaEm(minAtras(30));
    await detectarSemGps(10);
    const segunda = await detectarSemGps(10);
    expect(segunda.filter((a) => a.viagem_id === viagem)).toHaveLength(0);
  });

  it('não gera para viagem com contato recente (dentro do limite)', async () => {
    const viagem = await viagemIniciadaEm(minAtras(3));
    const novos = await detectarSemGps(10);
    expect(novos.filter((a) => a.viagem_id === viagem)).toHaveLength(0);
  });

  it('usa a última posição recebida como referência (posição recente → sem alerta)', async () => {
    const viagem = await viagemIniciadaEm(minAtras(30));
    // posição recebida há 2 min → contato recente, mesmo com a viagem iniciada há 30
    await pool.query(
      `INSERT INTO posicoes_gps (empresa_id, viagem_id, coordenada, registrado_em, recebido_em)
       VALUES ('00000000-0000-0000-0000-000000000001', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $4)`,
      [viagem, -46.6, -23.5, minAtras(2)],
    );
    const novos = await detectarSemGps(10);
    expect(novos.filter((a) => a.viagem_id === viagem)).toHaveLength(0);
  });
});

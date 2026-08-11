import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarMotorista, criarVeiculo, loginGestor } from './helpers';
import { detectarSemGps, detectarSemSinal } from '../src/workers/sem-gps';
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
    await api()
      .post(`/api/viagens/${v.body.id}/iniciar`)
      .set('Authorization', h())
      .send({ iniciada_em });
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

  // --- 'sem_sinal': viagem que TRANSMITIA e ficou muda (veículo mudo) ---

  async function inserirPosicao(viagem: string, recebidoEm: string): Promise<void> {
    await pool.query(
      `INSERT INTO posicoes_gps (empresa_id, viagem_id, coordenada, registrado_em, recebido_em)
       VALUES ('00000000-0000-0000-0000-000000000001', $1, ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, $4)`,
      [viagem, -46.6, -23.5, recebidoEm],
    );
  }

  it('gera sem_sinal para viagem que transmitia e silenciou > limite', async () => {
    const viagem = await viagemIniciadaEm(minAtras(60));
    await inserirPosicao(viagem, minAtras(30)); // transmitiu… e calou há 30 min

    const novos = await detectarSemSinal(10);
    const meu = novos.filter((a) => a.viagem_id === viagem);
    expect(meu).toHaveLength(1);
    expect(meu[0]!.descricao).toMatch(/Veículo mudo/);

    // E a viagem NÃO entra no sem_gps (que agora é só de quem nunca transmitiu).
    const semGps = await detectarSemGps(10);
    expect(semGps.filter((a) => a.viagem_id === viagem)).toHaveLength(0);
  });

  it('sem_sinal não re-alerta na passada seguinte (1 alerta por silêncio)', async () => {
    const viagem = await viagemIniciadaEm(minAtras(60));
    await inserirPosicao(viagem, minAtras(30));
    await detectarSemSinal(10);
    const segunda = await detectarSemSinal(10);
    expect(segunda.filter((a) => a.viagem_id === viagem)).toHaveLength(0);
  });

  it('sem_sinal volta a alertar se o veículo transmitir e silenciar DE NOVO', async () => {
    const viagem = await viagemIniciadaEm(minAtras(120));
    await inserirPosicao(viagem, minAtras(60));
    await detectarSemSinal(10); // 1º silêncio alertado (agora)

    // Recua o alerta no tempo (na vida real a posição nova chega DEPOIS do
    // alerta; aqui a posição é retro-inserida, então o alerta também recua).
    await pool.query(
      `UPDATE alertas SET criado_em = now() - interval '40 minutes' WHERE viagem_id = $1`,
      [viagem],
    );

    // Voltou a transmitir (há 20 min, depois do alerta)… e calou de novo.
    await inserirPosicao(viagem, minAtras(20));
    const novos = await detectarSemSinal(10);
    expect(novos.filter((a) => a.viagem_id === viagem)).toHaveLength(1);
  });

  it('sem_sinal não gera para veículo transmitindo dentro do limite', async () => {
    const viagem = await viagemIniciadaEm(minAtras(60));
    await inserirPosicao(viagem, minAtras(3));
    const novos = await detectarSemSinal(10);
    expect(novos.filter((a) => a.viagem_id === viagem)).toHaveLength(0);
  });
});

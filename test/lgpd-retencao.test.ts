import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarMotorista, criarVeiculo, loginGestor } from './helpers';
import { limparPosicoesAntigas } from '../src/modules/lgpd/retencao.service';
import { pool } from '../src/db/pool';

const diasAtras = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString();

describe('LGPD — limpeza de posições GPS antigas', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  async function criarViagem(): Promise<string> {
    const veiculo = await criarVeiculo(token);
    const { id: motorista } = await criarMotorista(token);
    const v = await api()
      .post('/api/viagens')
      .set('Authorization', h())
      .send({ veiculo_id: veiculo, motorista_id: motorista });
    return v.body.id;
  }

  async function inserirPosicao(viagemId: string, registradoEm: string): Promise<void> {
    await pool.query(
      `INSERT INTO posicoes_gps (empresa_id, viagem_id, coordenada, registrado_em, recebido_em)
       VALUES ('00000000-0000-0000-0000-000000000001', $1,
               ST_SetSRID(ST_MakePoint($2, $3), 4326)::geography, $4, now())`,
      [viagemId, -46.6, -23.5, registradoEm],
    );
  }

  async function contar(viagemId: string): Promise<number> {
    const r = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM posicoes_gps WHERE viagem_id = $1`,
      [viagemId],
    );
    return r.rows[0]!.n;
  }

  it('apaga as posições mais antigas que a retenção e mantém as recentes', async () => {
    const viagem = await criarViagem();
    await inserirPosicao(viagem, diasAtras(120)); // antiga
    await inserirPosicao(viagem, diasAtras(100)); // antiga
    await inserirPosicao(viagem, diasAtras(10)); // recente

    const apagadas = await limparPosicoesAntigas(90);

    expect(apagadas).toBeGreaterThanOrEqual(2);
    expect(await contar(viagem)).toBe(1); // só a recente sobrou
  });

  it('não apaga nada quando tudo está dentro da janela de retenção', async () => {
    const viagem = await criarViagem();
    await inserirPosicao(viagem, diasAtras(5));
    await inserirPosicao(viagem, diasAtras(30));

    await limparPosicoesAntigas(90);

    expect(await contar(viagem)).toBe(2);
  });
});

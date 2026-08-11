import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, criarVeiculo, loginGestor, loginMotoristaApp } from './helpers';
import { pool } from '../src/db/pool';

// Auditoria — ingestão de GPS set-based + idempotência de reenvio + cooldown
// de alertas persistido (semeado do banco entre requests).
describe('gps — ingestão em lote (set-based), idempotência e cooldown', () => {
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

  const iso = (ms: number) => new Date(ms).toISOString();

  it('lote grande entra de uma vez (INSERT multi-linha via unnest)', async () => {
    const { appToken, viagemId } = await cenario();
    // 200 pontos, 10s entre eles, andando devagar (sem gerar nenhum alerta).
    const base = Date.parse('2026-07-01T12:00:00Z');
    const posicoes = Array.from({ length: 200 }, (_, i) => ({
      lat: -23.56 + i * 0.0001,
      lng: -46.648,
      velocidade_kmh: 40,
      registrado_em: iso(base + i * 10_000),
    }));

    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({ posicoes });

    expect(res.status).toBe(201);
    expect(res.body.inseridas).toBe(200);
    expect(res.body.descartadas).toBe(0);

    const traj = await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h());
    expect(traj.body.total).toBe(200);
  });

  it('reenviar o MESMO lote não duplica pontos nem re-dispara alertas', async () => {
    const { appToken, viagemId } = await cenario();
    const base = Date.parse('2026-07-01T12:00:00Z');
    const lote = {
      posicoes: [
        { lat: -23.56, lng: -46.648, velocidade_kmh: 130, registrado_em: iso(base) },
        { lat: -23.5601, lng: -46.648, velocidade_kmh: 40, registrado_em: iso(base + 60_000) },
        { lat: -23.5602, lng: -46.648, velocidade_kmh: 40, registrado_em: iso(base + 120_000) },
      ],
    };

    const r1 = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send(lote);
    expect(r1.status).toBe(201);
    expect(r1.body.inseridas).toBe(3);
    expect(r1.body.alertas.map((a: { tipo: string }) => a.tipo)).toContain('velocidade_alta');

    // Contrato do app: sem resposta OK, reenvia o lote inteiro.
    const r2 = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send(lote);
    expect(r2.status).toBe(201);
    expect(r2.body.inseridas).toBe(0); // já estavam lá
    expect(r2.body.alertas).toHaveLength(0); // e não geram alerta de novo

    const traj = await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h());
    expect(traj.body.total).toBe(3);

    // Lote parcialmente repetido: só o ponto novo entra.
    const r3 = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          ...lote.posicoes.slice(1),
          { lat: -23.5603, lng: -46.648, velocidade_kmh: 40, registrado_em: iso(base + 180_000) },
        ],
      });
    expect(r3.body.inseridas).toBe(1);
    expect(
      (await api().get(`/api/viagens/${viagemId}/posicoes`).set('Authorization', h())).body.total,
    ).toBe(4);
  });

  it('ponto com o mesmo instante repetido dentro do lote entra uma vez só', async () => {
    const { appToken, viagemId } = await cenario();
    const quando = '2026-07-01T12:00:00Z';
    const res = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          { lat: -23.56, lng: -46.648, registrado_em: quando },
          { lat: -23.56, lng: -46.648, registrado_em: quando },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.inseridas).toBe(1);
  });

  it('cooldown de alertas vale ENTRE requests (semeado do banco)', async () => {
    const { appToken, viagemId } = await cenario();
    // Pontos com horário recente: o cooldown compara o horário do ponto com o
    // criado_em do último alerta gravado.
    const base = Date.now() - 30 * 60_000;

    // 1º lote: velocidade alta → alerta.
    const r1 = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [{ lat: -23.56, lng: -46.648, velocidade_kmh: 130, registrado_em: iso(base) }],
      });
    expect(
      r1.body.alertas.filter((a: { tipo: string }) => a.tipo === 'velocidade_alta'),
    ).toHaveLength(1);

    // 2º lote, OUTRA request, 2 min depois, ainda correndo: o cooldown de
    // 5 min tem que segurar (antes da correção, cada request zerava o
    // cooldown e o mesmo alerta era re-emitido a cada lote).
    const r2 = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          {
            lat: -23.5601,
            lng: -46.648,
            velocidade_kmh: 135,
            registrado_em: iso(base + 2 * 60_000),
          },
        ],
      });
    expect(r2.status).toBe(201);
    expect(r2.body.inseridas).toBe(1);
    expect(
      r2.body.alertas.filter((a: { tipo: string }) => a.tipo === 'velocidade_alta'),
    ).toHaveLength(0);

    // Envelhece o alerta no banco (como se 1h tivesse passado)…
    await pool.query(
      `UPDATE alertas SET criado_em = criado_em - interval '1 hour' WHERE viagem_id = $1`,
      [viagemId],
    );

    // …e o mesmo excesso volta a alertar (cooldown expirado).
    const r3 = await api()
      .post(`/api/app/viagens/${viagemId}/posicoes`)
      .set('Authorization', bearer(appToken))
      .send({
        posicoes: [
          {
            lat: -23.5602,
            lng: -46.648,
            velocidade_kmh: 140,
            registrado_em: iso(base + 4 * 60_000),
          },
        ],
      });
    expect(
      r3.body.alertas.filter((a: { tipo: string }) => a.tipo === 'velocidade_alta'),
    ).toHaveLength(1);
  });
});

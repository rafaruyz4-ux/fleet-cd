import bcrypt from 'bcryptjs';
import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, loginGestor, placaUnica } from './helpers';
import { pool } from '../src/db/pool';

let n = 0;

// Cria uma empresa numa faixa específica + um gestor admin, e devolve token e id.
async function empresaNaFaixa(
  faixa: 'starter' | 'pro' | 'enterprise',
): Promise<{ token: string; empresaId: string }> {
  const email = `assin-${Date.now()}-${++n}@empresa.test`;
  const hash = await bcrypt.hash('senha-1234', 4);
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO empresas (nome, plano, plano_faixa) VALUES ($1, 'ativo', $2) RETURNING id`,
    [`Empresa ${email}`, faixa],
  );
  const empresaId = emp.rows[0]!.id;
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
     VALUES ('Gestor', $1, $2, 'admin', $3)`,
    [email, hash, empresaId],
  );
  const res = await api().post('/api/auth/login').send({ email, senha: 'senha-1234' });
  return { token: res.body.accessToken, empresaId };
}

async function criarVeiculoStatus(token: string): Promise<number> {
  const res = await api()
    .post('/api/veiculos')
    .set('Authorization', bearer(token))
    .send({ placa: placaUnica(), tipo: 'caminhao' });
  return res.status;
}

describe('assinatura — planos por faixa + limite + Asaas (simulado)', () => {
  let enterprise: string;
  beforeAll(async () => {
    enterprise = await loginGestor(); // empresa padrão = enterprise (ilimitado)
  });

  it('GET /assinatura mostra plano, limite e uso', async () => {
    const res = await api().get('/api/assinatura').set('Authorization', bearer(enterprise));
    expect(res.status).toBe(200);
    expect(res.body.faixa).toBe('enterprise');
    expect(res.body.limiteVeiculos).toBeNull(); // ilimitado
    expect(typeof res.body.veiculosUsados).toBe('number');
  });

  it('trava o 6º veículo no plano Starter (limite 5)', async () => {
    const { token } = await empresaNaFaixa('starter');
    for (let i = 0; i < 5; i++) {
      expect(await criarVeiculoStatus(token)).toBe(201);
    }
    expect(await criarVeiculoStatus(token)).toBe(403); // 6º barrado
  });

  it('upgrade para Pro fica pendente e só libera veículos após o pagamento confirmar', async () => {
    const { token, empresaId } = await empresaNaFaixa('starter');
    for (let i = 0; i < 5; i++) await criarVeiculoStatus(token);
    expect(await criarVeiculoStatus(token)).toBe(403);

    const up = await api()
      .post('/api/assinatura/plano')
      .set('Authorization', bearer(token))
      .send({ faixa: 'pro' });
    expect(up.status).toBe(200);
    // O plano ATUAL continua valendo; o novo fica pendente até o webhook.
    expect(up.body.status).toBe('pendente');
    expect(up.body.faixa).toBe('starter');
    expect(up.body.faixaPendente).toBe('pro');
    expect(up.body.limiteVeiculos).toBe(5);
    expect(await criarVeiculoStatus(token)).toBe(403); // ainda não pagou

    // Asaas confirma o pagamento → promove a faixa pendente.
    const sub = await pool.query<{ asaas_subscription_id: string }>(
      'SELECT asaas_subscription_id FROM empresas WHERE id = $1',
      [empresaId],
    );
    await api()
      .post('/api/webhooks/asaas')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { subscription: sub.rows[0]!.asaas_subscription_id } });

    const depois = await api().get('/api/assinatura').set('Authorization', bearer(token));
    expect(depois.body.faixa).toBe('pro');
    expect(depois.body.faixaPendente).toBeNull();
    expect(depois.body.status).toBe('ativo');
    expect(depois.body.limiteVeiculos).toBe(20);

    expect(await criarVeiculoStatus(token)).toBe(201); // agora cabe
  });

  it('downgrade é recusado quando a frota não cabe no novo limite', async () => {
    const { token } = await empresaNaFaixa('pro');
    for (let i = 0; i < 6; i++) expect(await criarVeiculoStatus(token)).toBe(201);

    const down = await api()
      .post('/api/assinatura/plano')
      .set('Authorization', bearer(token))
      .send({ faixa: 'starter' });
    expect(down.status).toBe(400); // 6 veículos > limite 5 do Starter
  });

  it('webhook do Asaas suspende em atraso e reativa em pagamento confirmado', async () => {
    const { empresaId } = await empresaNaFaixa('pro');
    const sub = `sub-teste-${Date.now()}`;
    await pool.query('UPDATE empresas SET asaas_subscription_id = $1 WHERE id = $2', [
      sub,
      empresaId,
    ]);

    const atraso = await api()
      .post('/api/webhooks/asaas')
      .send({ event: 'PAYMENT_OVERDUE', payment: { subscription: sub } });
    expect(atraso.status).toBe(200);
    let st = await pool.query<{ plano: string }>('SELECT plano FROM empresas WHERE id = $1', [
      empresaId,
    ]);
    expect(st.rows[0]!.plano).toBe('suspenso');

    await api()
      .post('/api/webhooks/asaas')
      .send({ event: 'PAYMENT_CONFIRMED', payment: { subscription: sub } });
    st = await pool.query<{ plano: string }>('SELECT plano FROM empresas WHERE id = $1', [
      empresaId,
    ]);
    expect(st.rows[0]!.plano).toBe('ativo');
  });
});

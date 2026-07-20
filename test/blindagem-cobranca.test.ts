import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { api, bearer, cpfUnico, placaUnica } from './helpers';
import { pool } from '../src/db/pool';

// Pacote 5 — blindagem da cobrança: empresa suspensa bloqueada (menos a área
// de assinatura), motorista demitido com device token → 401.

let n = 0;

interface Cenario {
  token: string;
  empresaId: string;
  email: string;
  subscriptionId: string;
}

// Empresa ativa (com assinatura Asaas vinculada) + gestor admin logado.
async function empresaComAssinatura(faixa: 'starter' | 'pro' | 'enterprise'): Promise<Cenario> {
  const email = `blind-${Date.now()}-${++n}@empresa.test`;
  const subscriptionId = `sub-blind-${Date.now()}-${n}`;
  const hash = await bcrypt.hash('senha-1234', 4);
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO empresas (nome, plano, plano_faixa, asaas_subscription_id)
     VALUES ($1, 'ativo', $2, $3) RETURNING id`,
    [`Empresa ${email}`, faixa, subscriptionId],
  );
  const empresaId = emp.rows[0]!.id;
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
     VALUES ('Gestor', $1, $2, 'admin', $3)`,
    [email, hash, empresaId],
  );
  const res = await api().post('/api/auth/login').send({ email, senha: 'senha-1234' });
  return { token: res.body.accessToken, empresaId, email, subscriptionId };
}

// Suspende/reativa pela porta real: o webhook do Asaas (invalida o cache).
async function webhook(evento: string, subscriptionId: string): Promise<void> {
  const res = await api()
    .post('/api/webhooks/asaas')
    .send({ event: evento, payment: { subscription: subscriptionId } });
  expect(res.status).toBe(200);
}

describe('blindagem — empresa suspensa/cancelada', () => {
  it('suspensa perde o acesso (403 assinatura_suspensa), mantém só a área de assinatura', async () => {
    const { token, subscriptionId } = await empresaComAssinatura('pro');

    // Antes: acesso normal.
    let veics = await api().get('/api/veiculos').set('Authorization', bearer(token));
    expect(veics.status).toBe(200);

    await webhook('PAYMENT_OVERDUE', subscriptionId);

    // Depois: rotas de domínio bloqueadas com código claro...
    veics = await api().get('/api/veiculos').set('Authorization', bearer(token));
    expect(veics.status).toBe(403);
    expect(veics.body.details?.codigo).toBe('assinatura_suspensa');
    const post = await api()
      .post('/api/veiculos')
      .set('Authorization', bearer(token))
      .send({ placa: placaUnica(), tipo: 'caminhao' });
    expect(post.status).toBe(403);

    // ...mas a área de assinatura continua acessível (para pagar/reativar).
    const assin = await api().get('/api/assinatura').set('Authorization', bearer(token));
    expect(assin.status).toBe(200);
    expect(assin.body.status).toBe('suspenso');

    // Pagamento confirmado → acesso volta na hora.
    await webhook('PAYMENT_CONFIRMED', subscriptionId);
    veics = await api().get('/api/veiculos').set('Authorization', bearer(token));
    expect(veics.status).toBe(200);
  });

  it('gestor de empresa suspensa ainda loga e vê /auth/me (precisa conseguir pagar)', async () => {
    const { email, subscriptionId, token } = await empresaComAssinatura('starter');
    await webhook('PAYMENT_OVERDUE', subscriptionId);

    const login = await api().post('/api/auth/login').send({ email, senha: 'senha-1234' });
    expect(login.status).toBe(200);
    const me = await api().get('/api/auth/me').set('Authorization', bearer(token));
    expect(me.status).toBe(200);
  });

  it('pedir troca de plano com assinatura suspensa NÃO destrava o acesso (segue suspenso até pagar)', async () => {
    const { token, subscriptionId } = await empresaComAssinatura('starter');
    await webhook('PAYMENT_OVERDUE', subscriptionId);

    const up = await api()
      .post('/api/assinatura/plano')
      .set('Authorization', bearer(token))
      .send({ faixa: 'pro' });
    expect(up.status).toBe(200);
    expect(up.body.status).toBe('suspenso'); // não vira 'ativo' de graça
    expect(up.body.faixaPendente).toBe('pro');

    const veics = await api().get('/api/veiculos').set('Authorization', bearer(token));
    expect(veics.status).toBe(403);

    // Pagou → ativa E promove a faixa pendente.
    await webhook('PAYMENT_CONFIRMED', subscriptionId);
    const assin = await api().get('/api/assinatura').set('Authorization', bearer(token));
    expect(assin.body.status).toBe('ativo');
    expect(assin.body.faixa).toBe('pro');
    const veics2 = await api().get('/api/veiculos').set('Authorization', bearer(token));
    expect(veics2.status).toBe(200);
  });

  it('motorista de empresa suspensa não loga nem renova token (403)', async () => {
    const { token, subscriptionId } = await empresaComAssinatura('pro');
    const cpf = cpfUnico();
    const cria = await api()
      .post('/api/motoristas')
      .set('Authorization', bearer(token))
      .send({ nome: 'Motorista Blindagem', cpf, senha: 'app-senha-123' });
    expect(cria.status).toBe(201);
    const login1 = await api()
      .post('/api/auth/motorista/login')
      .send({ cpf, senha: 'app-senha-123' });
    expect(login1.status).toBe(200);

    await webhook('PAYMENT_OVERDUE', subscriptionId);

    const login2 = await api()
      .post('/api/auth/motorista/login')
      .send({ cpf, senha: 'app-senha-123' });
    expect(login2.status).toBe(403);
    expect(login2.body.details?.codigo).toBe('assinatura_suspensa');

    const refresh = await api()
      .post('/api/auth/refresh')
      .send({ refreshToken: login1.body.refreshToken });
    expect(refresh.status).toBe(403);
  });
});

describe('blindagem — device token de motorista demitido', () => {
  // Cria motorista com viagem em andamento e devolve o device token (365d).
  async function cenarioDevice(token: string) {
    const veic = await api()
      .post('/api/veiculos')
      .set('Authorization', bearer(token))
      .send({ placa: placaUnica(), tipo: 'caminhao' });
    const cpf = cpfUnico();
    const mot = await api()
      .post('/api/motoristas')
      .set('Authorization', bearer(token))
      .send({ nome: 'Motorista Demitido', cpf, senha: 'app-senha-123' });
    await api()
      .post('/api/viagens')
      .set('Authorization', bearer(token))
      .send({ veiculo_id: veic.body.id, motorista_id: mot.body.id });
    const dev = await api()
      .post(`/api/motoristas/${mot.body.id}/device-token`)
      .set('Authorization', bearer(token));
    expect(dev.status).toBe(201);
    return { motoristaId: mot.body.id as string, deviceToken: dev.body.deviceToken as string };
  }

  const lote = {
    posicoes: [
      { lat: -23.56, lng: -46.648, velocidade_kmh: 40, registrado_em: '2026-07-01T12:00:00Z' },
    ],
  };

  it('motorista desativado → device token válido passa a responder 401 (posições e Overland)', async () => {
    const { token } = await empresaComAssinatura('enterprise');
    const { motoristaId, deviceToken } = await cenarioDevice(token);

    // Com o motorista ativo, o token funciona.
    const antes = await api()
      .post('/api/app/posicoes')
      .set('Authorization', bearer(deviceToken))
      .send(lote);
    expect(antes.status).toBe(201);

    // Demissão (soft delete) → o mesmo token, ainda válido no JWT, é recusado.
    const del = await api()
      .delete(`/api/motoristas/${motoristaId}`)
      .set('Authorization', bearer(token));
    expect(del.status).toBe(204);

    const depois = await api()
      .post('/api/app/posicoes')
      .set('Authorization', bearer(deviceToken))
      .send(lote);
    expect(depois.status).toBe(401);

    const overland = await api()
      .post('/api/app/overland')
      .set('Authorization', bearer(deviceToken))
      .send({
        locations: [
          {
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [-46.648, -23.56] },
            properties: { timestamp: '2026-07-01T12:00:00Z', speed: 10 },
          },
        ],
      });
    expect(overland.status).toBe(401);
  });
});

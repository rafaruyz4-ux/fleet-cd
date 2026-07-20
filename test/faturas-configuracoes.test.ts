import bcrypt from 'bcryptjs';
import { describe, expect, it } from 'vitest';
import { api, bearer, criarMotorista, criarVeiculo, loginGestor } from './helpers';
import { pool } from '../src/db/pool';

// Pacote 7B — faturas da assinatura (modo simulado, sem ASAAS_API_KEY) e
// configurações da empresa (dados cadastrais + limiares de alerta).

let n = 0;

async function novaEmpresa(papel: 'admin' | 'gestor' = 'admin'): Promise<string> {
  const email = `fat-${Date.now()}-${++n}@empresa.test`;
  const hash = await bcrypt.hash('senha-1234', 4);
  const emp = await pool.query<{ id: string }>(
    `INSERT INTO empresas (nome, plano, plano_faixa) VALUES ($1, 'trial', 'starter') RETURNING id`,
    [`Empresa ${email}`],
  );
  await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel, empresa_id)
     VALUES ('Usuário', $1, $2, $3, $4)`,
    [email, hash, papel, emp.rows[0]!.id],
  );
  const res = await api().post('/api/auth/login').send({ email, senha: 'senha-1234' });
  return res.body.accessToken;
}

describe('faturas da assinatura (modo simulado)', () => {
  it('empresa sem assinatura Asaas → lista vazia', async () => {
    const token = await novaEmpresa();
    const res = await api().get('/api/assinatura/faturas').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('após pedir um plano, devolve faturas coerentes com o preço', async () => {
    const token = await novaEmpresa();
    const plano = await api()
      .post('/api/assinatura/plano')
      .set('Authorization', bearer(token))
      .send({ faixa: 'pro' });
    expect(plano.status).toBe(200);
    expect(plano.body.faixaPendente).toBe('pro');

    const res = await api().get('/api/assinatura/faturas').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(3);
    for (const f of res.body) {
      expect(f).toHaveProperty('vencimento');
      expect(f).toHaveProperty('status');
      expect(f).toHaveProperty('linkFatura');
      expect(f).toHaveProperty('linkBoleto');
      // Valor do plano pendente (Pro: R$ 249,00).
      expect(f.valorCentavos).toBe(24900);
      expect(['pago', 'pendente', 'atrasado']).toContain(f.status);
    }
    // A mais recente vem primeiro e está em aberto; as anteriores, pagas.
    expect(res.body[0].status).toBe('pendente');
    expect(res.body[1].status).toBe('pago');
  });
});

describe('configurações da empresa', () => {
  it('GET devolve dados + limiares padrão; PATCH (admin) atualiza', async () => {
    const token = await novaEmpresa('admin');
    const antes = await api().get('/api/configuracoes').set('Authorization', bearer(token));
    expect(antes.status).toBe(200);
    expect(antes.body.alertaVelocidadeKmh).toBe(110);
    expect(antes.body.alertaParadaMin).toBe(15);
    expect(antes.body.alertaSemGpsMin).toBe(10);

    const patch = await api().patch('/api/configuracoes').set('Authorization', bearer(token)).send({
      nome: 'Transportadora Nova Ltda',
      cnpj: '12.345.678/0001-90',
      alertaVelocidadeKmh: 80,
      alertaParadaMin: 20,
      alertaSemGpsMin: 5,
    });
    expect(patch.status).toBe(200);
    expect(patch.body.nome).toBe('Transportadora Nova Ltda');
    expect(patch.body.cnpj).toBe('12345678000190'); // só dígitos
    expect(patch.body.alertaVelocidadeKmh).toBe(80);
    expect(patch.body.alertaParadaMin).toBe(20);
    expect(patch.body.alertaSemGpsMin).toBe(5);
  });

  it('gestor lê mas não edita (403); limite fora da faixa → 400', async () => {
    const tokenGestor = await novaEmpresa('gestor');
    const leitura = await api().get('/api/configuracoes').set('Authorization', bearer(tokenGestor));
    expect(leitura.status).toBe(200);
    const patch = await api()
      .patch('/api/configuracoes')
      .set('Authorization', bearer(tokenGestor))
      .send({ nome: 'Tentativa' });
    expect(patch.status).toBe(403);

    const tokenAdmin = await novaEmpresa('admin');
    const invalido = await api()
      .patch('/api/configuracoes')
      .set('Authorization', bearer(tokenAdmin))
      .send({ alertaVelocidadeKmh: 500 });
    expect(invalido.status).toBe(400);
  });

  it('o limiar de velocidade configurado vale na geração de alertas', async () => {
    // Usa a empresa padrão (o fluxo completo de app/motorista já está pronto nela).
    const token = await loginGestor();
    const baixa = await api()
      .patch('/api/configuracoes')
      .set('Authorization', bearer(token))
      .send({ alertaVelocidadeKmh: 50 });
    expect(baixa.status).toBe(200);

    try {
      const veiculoId = await criarVeiculo(token);
      const { cpf } = await criarMotorista(token, { senha: 'app-senha-123' });
      const loginApp = await api()
        .post('/api/auth/motorista/login')
        .send({ cpf, senha: 'app-senha-123' });
      const motoristaId = loginApp.body.motorista.id as string;
      const appToken = loginApp.body.accessToken as string;

      const viagem = await api()
        .post('/api/viagens')
        .set('Authorization', bearer(token))
        .send({ veiculo_id: veiculoId, motorista_id: motoristaId });
      await api()
        .post(`/api/viagens/${viagem.body.id}/iniciar`)
        .set('Authorization', bearer(token))
        .send({});

      // 60 km/h: abaixo do default (110), mas ACIMA do limite configurado (50).
      const ingest = await api()
        .post(`/api/app/viagens/${viagem.body.id}/posicoes`)
        .set('Authorization', bearer(appToken))
        .send({
          posicoes: [
            {
              lat: -23.56,
              lng: -46.648,
              velocidade_kmh: 60,
              registrado_em: new Date().toISOString(),
            },
          ],
        });
      expect(ingest.status).toBe(201);
      const tipos = ingest.body.alertas.map((a: { tipo: string }) => a.tipo);
      expect(tipos).toContain('velocidade_alta');
    } finally {
      // Restaura o default para não interferir nos demais testes da suíte.
      await api()
        .patch('/api/configuracoes')
        .set('Authorization', bearer(token))
        .send({ alertaVelocidadeKmh: 110 });
    }
  });
});

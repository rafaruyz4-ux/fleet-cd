import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { api, bearer, criarEmpresaComGestor, criarVeiculo, loginGestor } from './helpers';
import { pool } from '../src/db/pool';

describe('consultas Infosimples (modo simulado) + contador de consumo', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });
  const h = () => bearer(token);

  it('1ª consulta cria as multas novas; 2ª reconhece as duplicadas (não duplica)', async () => {
    const veiculo = await criarVeiculo(token, { renavam: '99887766554' });

    const r1 = await api().post(`/api/consultas/veiculo/${veiculo}`).set('Authorization', h());
    expect(r1.status).toBe(200);
    expect(r1.body.simulado).toBe(true);
    expect(r1.body.multasEncontradas).toBe(2);
    expect(r1.body.multasNovas).toBe(2);
    expect(r1.body.multasDuplicadas).toBe(0);

    const r2 = await api().post(`/api/consultas/veiculo/${veiculo}`).set('Authorization', h());
    expect(r2.status).toBe(200);
    expect(r2.body.multasNovas).toBe(0);
    expect(r2.body.multasDuplicadas).toBe(2);

    // As multas entraram como fonte 'infosimples'.
    const multas = await api()
      .get('/api/multas?fonte=infosimples&limit=200')
      .set('Authorization', h());
    const desteVeiculo = multas.body.data.filter((m: { veiculo_placa: string }) =>
      m.numero_auto?.includes(r1.body.placa),
    );
    expect(desteVeiculo.length).toBe(2);
  });

  it('o contador de consumo reflete as consultas do mês (sem custo no simulado)', async () => {
    const antes = await api().get('/api/consultas/consumo').set('Authorization', h());
    const usadosAntes = antes.body.usados as number;

    const veiculo = await criarVeiculo(token);
    await api().post(`/api/consultas/veiculo/${veiculo}`).set('Authorization', h());

    const depois = await api().get('/api/consultas/consumo').set('Authorization', h());
    expect(depois.body.usados).toBe(usadosAntes + 1);
    expect(depois.body.custoCentavosMes).toBe(0); // simulado não custa
    expect(depois.body.configurado).toBe(false); // sem chave nos testes
  });

  it('o histórico lista as consultas feitas', async () => {
    const veiculo = await criarVeiculo(token);
    await api().post(`/api/consultas/veiculo/${veiculo}`).set('Authorization', h());

    const hist = await api()
      .get(`/api/consultas?veiculo_id=${veiculo}`)
      .set('Authorization', h());
    expect(hist.status).toBe(200);
    expect(hist.body.total).toBe(1);
    expect(hist.body.data[0].status).toBe('simulado');
    expect(hist.body.data[0].multas_encontradas).toBe(2);
  });

  it('consulta com status erro NÃO consome a cota do mês', async () => {
    const antes = await api().get('/api/consultas/consumo').set('Authorization', h());
    const usadosAntes = antes.body.usados as number;

    // Simula uma consulta que falhou (registrada como trilha, custo 0) —
    // é o que o serviço grava quando a Infosimples dá erro.
    const EMPRESA_PADRAO_ID = '00000000-0000-0000-0000-000000000001';
    await pool.query(
      `INSERT INTO consultas_infosimples
         (empresa_id, veiculo_id, placa, tipo, status, simulado, custo_centavos, mensagem)
       VALUES ($1, NULL, 'ERR0A00', 'debitos', 'erro', TRUE, 0, 'falha simulada')`,
      [EMPRESA_PADRAO_ID],
    );

    const depois = await api().get('/api/consultas/consumo').set('Authorization', h());
    expect(depois.body.usados).toBe(usadosAntes); // erro não conta

    // Mas a linha de erro segue visível no histórico (auditoria/diagnóstico).
    const hist = await api().get('/api/consultas?limit=200').set('Authorization', h());
    const erros = hist.body.data.filter((c: { status: string }) => c.status === 'erro');
    expect(erros.length).toBeGreaterThan(0);
  });

  it('veículo inexistente → 404', async () => {
    const res = await api()
      .post(`/api/consultas/veiculo/${randomUUID()}`)
      .set('Authorization', h());
    expect(res.status).toBe(404);
  });

  it('isolamento: empresa B não consulta veículo da empresa A (404)', async () => {
    const veiculoA = await criarVeiculo(token);
    const tokenB = await criarEmpresaComGestor();
    const res = await api()
      .post(`/api/consultas/veiculo/${veiculoA}`)
      .set('Authorization', bearer(tokenB));
    expect(res.status).toBe(404);
  });

  it('exige autenticação de gestor', async () => {
    const res = await api().get('/api/consultas/consumo');
    expect(res.status).toBe(401);
  });
});

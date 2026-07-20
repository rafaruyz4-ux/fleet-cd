import { beforeAll, describe, expect, it } from 'vitest';
import {
  api,
  bearer,
  criarEmpresaComGestor,
  criarMotorista,
  criarVeiculo,
  loginGestor,
  numeroAutoUnico,
} from './helpers';

// Pacote 7B — exportação CSV de viagens e multas: formato Excel BR (BOM +
// ponto-e-vírgula), filtros da listagem e isolamento entre tenants.

const BOM = '﻿';

describe('exportação CSV — viagens', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });

  async function criarViagem(): Promise<{ placa: string; viagemId: string }> {
    const veiculoId = await criarVeiculo(token);
    const veic = await api().get('/api/veiculos').set('Authorization', bearer(token));
    const placa = veic.body.find((v: { id: string }) => v.id === veiculoId)!.placa as string;
    const { id: motoristaId } = await criarMotorista(token);
    const v = await api()
      .post('/api/viagens')
      .set('Authorization', bearer(token))
      .send({ veiculo_id: veiculoId, motorista_id: motoristaId, km_inicial: 100 });
    return { placa, viagemId: v.body.id };
  }

  it('gera CSV com BOM, separador ; e as colunas combinadas', async () => {
    const { placa } = await criarViagem();
    const res = await api().get('/api/viagens/export.csv').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('viagens.csv');
    expect(res.text.startsWith(BOM)).toBe(true);
    const [cabecalho] = res.text.slice(BOM.length).split('\r\n');
    expect(cabecalho).toBe(
      'Placa;Motorista;Início;Fim;KM inicial;KM final;KM rodado (odômetro);KM real (GPS);Status;Paradas',
    );
    expect(res.text).toContain(placa);
    expect(res.text).toContain('Em andamento');
  });

  it('respeita o filtro de status', async () => {
    const { placa } = await criarViagem();
    const res = await api()
      .get('/api/viagens/export.csv?status=encerrada')
      .set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(placa);
  });

  it('não vaza viagens de outro tenant', async () => {
    const { placa } = await criarViagem();
    const tokenOutra = await criarEmpresaComGestor();
    const res = await api().get('/api/viagens/export.csv').set('Authorization', bearer(tokenOutra));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(placa);
  });
});

describe('exportação CSV — multas', () => {
  let token: string;
  beforeAll(async () => {
    token = await loginGestor();
  });

  async function criarMulta(): Promise<string> {
    const veiculoId = await criarVeiculo(token);
    const numeroAuto = numeroAutoUnico();
    const res = await api().post('/api/multas').set('Authorization', bearer(token)).send({
      numero_auto: numeroAuto,
      veiculo_id: veiculoId,
      tipo: 'Excesso de velocidade',
      valor: 195.23,
      ocorrida_em: '2026-07-01T12:00:00Z',
    });
    expect(res.status).toBe(201);
    return numeroAuto;
  }

  it('gera CSV com valores pt-BR e o número do auto', async () => {
    const numeroAuto = await criarMulta();
    const res = await api().get('/api/multas/export.csv').set('Authorization', bearer(token));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.startsWith(BOM)).toBe(true);
    expect(res.text).toContain('Nº do auto;Placa;Motorista;Ocorrida em');
    expect(res.text).toContain(numeroAuto);
    expect(res.text).toContain('195,23'); // decimal com vírgula (Excel BR)
  });

  it('não vaza multas de outro tenant', async () => {
    const numeroAuto = await criarMulta();
    const tokenOutra = await criarEmpresaComGestor();
    const res = await api().get('/api/multas/export.csv').set('Authorization', bearer(tokenOutra));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(numeroAuto);
  });
});

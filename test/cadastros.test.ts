import { beforeAll, describe, expect, it } from 'vitest';
import { api, bearer, cpfUnico, loginGestor, placaUnica } from './helpers';

// CRUD + validação das telas de cadastro: veículos, motoristas, unidades, rotas.
// Tudo autenticado como gestor. Geradores únicos evitam colisão entre casos.
// Observações de delete confirmadas no service de cada módulo:
//   veículos/motoristas/unidades = SOFT delete (ativo=false), 204, continuam na listagem.
//   rotas = HARD delete (DELETE FROM), 204, somem da listagem e getById vira 404.
// As listas de todos os módulos devolvem ARRAY puro (sem envelope {data,total}).

let token: string;
beforeAll(async () => {
  token = await loginGestor();
});
const h = () => bearer(token);

describe('cadastro de veículos (CRUD + validação)', () => {
  it('cria com payload válido → 201 e devolve id', async () => {
    const res = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa: placaUnica(), tipo: 'carro', modelo: 'Fiorino' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.tipo).toBe('carro');
    expect(res.body.modelo).toBe('Fiorino');
    expect(res.body.ativo).toBe(true);
  });

  it('lê por id → 200 com os campos', async () => {
    const placa = placaUnica();
    const created = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa, tipo: 'caminhao' });
    const res = await api().get(`/api/veiculos/${created.body.id}`).set('Authorization', h());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.placa).toBe(placa);
    expect(res.body.tipo).toBe('caminhao');
  });

  it('lista (array puro) → contém o criado', async () => {
    const created = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa: placaUnica(), tipo: 'utilitario' });
    const res = await api().get('/api/veiculos').set('Authorization', h());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((v: { id: string }) => v.id === created.body.id)).toBe(true);
  });

  it('edita (PATCH) um campo → 200 e campo atualizado', async () => {
    const created = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa: placaUnica(), tipo: 'caminhao' });
    const res = await api()
      .patch(`/api/veiculos/${created.body.id}`)
      .set('Authorization', h())
      .send({ modelo: 'Volvo FH' });
    expect(res.status).toBe(200);
    expect(res.body.modelo).toBe('Volvo FH');
  });

  it('remove (DELETE) → 204; soft-delete deixa o item ativo=false (segue na listagem)', async () => {
    const created = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa: placaUnica(), tipo: 'caminhao' });
    const id = created.body.id;
    const del = await api().delete(`/api/veiculos/${id}`).set('Authorization', h());
    expect(del.status).toBe(204);
    // soft delete: ainda existe e ainda aparece na listagem, agora inativo.
    const get = await api().get(`/api/veiculos/${id}`).set('Authorization', h());
    expect(get.status).toBe(200);
    expect(get.body.ativo).toBe(false);
    const list = await api().get('/api/veiculos').set('Authorization', h());
    const found = list.body.find((v: { id: string }) => v.id === id);
    expect(found).toBeTruthy();
    expect(found.ativo).toBe(false);
  });

  it('validação: placa fora do regex → 400', async () => {
    const res = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa: 'INVALIDA!!', tipo: 'caminhao' });
    expect(res.status).toBe(400);
  });

  it('validação: tipo fora do enum → 400', async () => {
    const res = await api()
      .post('/api/veiculos')
      .set('Authorization', h())
      .send({ placa: placaUnica(), tipo: 'aviao' });
    expect(res.status).toBe(400);
  });
});

describe('cadastro de motoristas (CRUD + validação)', () => {
  it('cria com payload válido → 201 e devolve id', async () => {
    const res = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'João Silva', cpf: cpfUnico(), categoria_cnh: 'D' });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.nome).toBe('João Silva');
    expect(res.body.categoria_cnh).toBe('D');
    expect(res.body.ativo).toBe(true);
  });

  it('cria com senha (8+ caracteres) → tem_senha true, sem vazar hash', async () => {
    const res = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'Maria Souza', cpf: cpfUnico(), senha: 'segredo12' });
    expect(res.status).toBe(201);
    expect(res.body.tem_senha).toBe(true);
    expect(res.body.senha_hash).toBeUndefined();
  });

  it('lê por id → 200 com os campos', async () => {
    const cpf = cpfUnico();
    const created = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'Carlos Lima', cpf });
    const res = await api().get(`/api/motoristas/${created.body.id}`).set('Authorization', h());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.cpf).toBe(cpf);
    expect(res.body.nome).toBe('Carlos Lima');
  });

  it('lista (array puro) → contém o criado', async () => {
    const created = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'Ana Costa', cpf: cpfUnico() });
    const res = await api().get('/api/motoristas').set('Authorization', h());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((m: { id: string }) => m.id === created.body.id)).toBe(true);
  });

  it('edita (PATCH) um campo → 200 e campo atualizado', async () => {
    const created = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'Pedro Antes', cpf: cpfUnico() });
    const res = await api()
      .patch(`/api/motoristas/${created.body.id}`)
      .set('Authorization', h())
      .send({ nome: 'Pedro Depois' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Pedro Depois');
  });

  it('remove (DELETE) → 204; soft-delete deixa o item ativo=false (segue na listagem)', async () => {
    const created = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'Some Aqui', cpf: cpfUnico() });
    const id = created.body.id;
    const del = await api().delete(`/api/motoristas/${id}`).set('Authorization', h());
    expect(del.status).toBe(204);
    const get = await api().get(`/api/motoristas/${id}`).set('Authorization', h());
    expect(get.status).toBe(200);
    expect(get.body.ativo).toBe(false);
    const list = await api().get('/api/motoristas').set('Authorization', h());
    const found = list.body.find((m: { id: string }) => m.id === id);
    expect(found).toBeTruthy();
    expect(found.ativo).toBe(false);
  });

  it('validação: cpf inválido → 400', async () => {
    const res = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'CPF Ruim', cpf: '123' });
    expect(res.status).toBe(400);
  });

  it('validação: senha curta (< 8) → 400', async () => {
    const res = await api()
      .post('/api/motoristas')
      .set('Authorization', h())
      .send({ nome: 'Senha Curta', cpf: cpfUnico(), senha: '1234' });
    expect(res.status).toBe(400);
  });
});

describe('cadastro de unidades (CRUD + validação)', () => {
  it('cria com payload válido → 201 e devolve id', async () => {
    const res = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({
        nome: 'Centro de Distribuição',
        endereco: 'Rua A, 100',
        coordenada: { lat: -23.55, lng: -46.63 },
      });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.nome).toBe('Centro de Distribuição');
    expect(res.body.coordenada).toEqual({ lat: -23.55, lng: -46.63 });
    expect(res.body.ativo).toBe(true);
  });

  it('lê por id → 200 com os campos', async () => {
    const created = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({ nome: 'Unidade Leitura' });
    const res = await api().get(`/api/unidades/${created.body.id}`).set('Authorization', h());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.nome).toBe('Unidade Leitura');
  });

  it('lista (array puro) → contém o criado', async () => {
    const created = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({ nome: 'Unidade Lista' });
    const res = await api().get('/api/unidades').set('Authorization', h());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((u: { id: string }) => u.id === created.body.id)).toBe(true);
  });

  it('edita (PATCH) um campo → 200 e campo atualizado', async () => {
    const created = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({ nome: 'Antes Edição' });
    const res = await api()
      .patch(`/api/unidades/${created.body.id}`)
      .set('Authorization', h())
      .send({ endereco: 'Avenida Nova, 999' });
    expect(res.status).toBe(200);
    expect(res.body.endereco).toBe('Avenida Nova, 999');
  });

  it('remove (DELETE) → 204; soft-delete deixa o item ativo=false (segue na listagem)', async () => {
    const created = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({ nome: 'Unidade Removida' });
    const id = created.body.id;
    const del = await api().delete(`/api/unidades/${id}`).set('Authorization', h());
    expect(del.status).toBe(204);
    const get = await api().get(`/api/unidades/${id}`).set('Authorization', h());
    expect(get.status).toBe(200);
    expect(get.body.ativo).toBe(false);
    const list = await api().get('/api/unidades').set('Authorization', h());
    const found = list.body.find((u: { id: string }) => u.id === id);
    expect(found).toBeTruthy();
    expect(found.ativo).toBe(false);
  });

  it('validação: cnpj inválido → 400', async () => {
    const res = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({ nome: 'CNPJ Ruim', cnpj: 'abc' });
    expect(res.status).toBe(400);
  });

  it('validação: coordenada fora de faixa → 400', async () => {
    const res = await api()
      .post('/api/unidades')
      .set('Authorization', h())
      .send({ nome: 'Coord Ruim', coordenada: { lat: 200, lng: 0 } });
    expect(res.status).toBe(400);
  });
});

describe('cadastro de rotas (CRUD + validação)', () => {
  it('cria com payload válido → 201 e devolve id', async () => {
    const res = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({
        tipo: 'fixa',
        nome: 'Rota Centro',
        linha: [
          { lat: -23.55, lng: -46.63 },
          { lat: -23.56, lng: -46.64 },
        ],
      });
    expect(res.status).toBe(201);
    expect(typeof res.body.id).toBe('string');
    expect(res.body.tipo).toBe('fixa');
    expect(res.body.nome).toBe('Rota Centro');
    expect(res.body.linha).toHaveLength(2);
  });

  it('lê por id → 200 com os campos', async () => {
    const created = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({ tipo: 'dinamica', nome: 'Rota Leitura' });
    const res = await api().get(`/api/rotas/${created.body.id}`).set('Authorization', h());
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body.tipo).toBe('dinamica');
    expect(res.body.nome).toBe('Rota Leitura');
  });

  it('lista (array puro) → contém a criada', async () => {
    const created = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({ tipo: 'fixa', nome: 'Rota Lista' });
    const res = await api().get('/api/rotas').set('Authorization', h());
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: { id: string }) => r.id === created.body.id)).toBe(true);
  });

  it('edita (PATCH) um campo → 200 e campo atualizado', async () => {
    const created = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({ tipo: 'fixa', nome: 'Rota Antes' });
    const res = await api()
      .patch(`/api/rotas/${created.body.id}`)
      .set('Authorization', h())
      .send({ nome: 'Rota Depois' });
    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Rota Depois');
  });

  it('remove (DELETE) → 204; hard-delete some da listagem e getById vira 404', async () => {
    const created = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({ tipo: 'fixa', nome: 'Rota Removida' });
    const id = created.body.id;
    const del = await api().delete(`/api/rotas/${id}`).set('Authorization', h());
    expect(del.status).toBe(204);
    // hard delete: registro deixa de existir.
    const get = await api().get(`/api/rotas/${id}`).set('Authorization', h());
    expect(get.status).toBe(404);
    const list = await api().get('/api/rotas').set('Authorization', h());
    expect(list.body.some((r: { id: string }) => r.id === id)).toBe(false);
  });

  it('validação: tipo inválido → 400', async () => {
    const res = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({ tipo: 'circular', nome: 'Tipo Ruim' });
    expect(res.status).toBe(400);
  });

  it('validação: linha com 1 ponto só → 400', async () => {
    const res = await api()
      .post('/api/rotas')
      .set('Authorization', h())
      .send({ tipo: 'fixa', linha: [{ lat: -23.55, lng: -46.63 }] });
    expect(res.status).toBe(400);
  });
});

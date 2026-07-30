import fs from 'node:fs/promises';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { AppError } from '../../errors/AppError';
import { query, queryOne, withTransaction } from '../../db/pool';
import { MontadorWhere } from '../../db/sql';
import { PLANOS, type PlanoFaixa } from '../../domain/planos';
import { env } from '../../config/env';
import {
  baixarComprovante,
  consultarDebitosVeiculo,
  infosimplesConfigurado,
  type ResultadoConsulta,
} from '../../integrations/infosimples/client';
import { gerarPdfComprovante, nomeDaFonte } from './comprovante-pdf';
import * as multasService from '../multas/multas.service';
import type { ListConsultasQuery } from './consultas.schemas';

// ----- contador de consumo (por empresa, no mês corrente) -----

export interface ConsumoMes {
  faixa: PlanoFaixa;
  plano: string;
  usados: number;
  limite: number | null; // null = ilimitado
  restantes: number | null;
  custoCentavosMes: number;
  configurado: boolean; // true se há chave real (senão é modo simulado)
}

async function faixaDaEmpresa(empresaId: string): Promise<PlanoFaixa> {
  const e = await queryOne<{ plano_faixa: PlanoFaixa }>(
    'SELECT plano_faixa FROM empresas WHERE id = $1',
    [empresaId],
  );
  if (!e) throw AppError.notFound('Empresa não encontrada');
  return e.plano_faixa;
}

/**
 * Consumo do mês corrente: quantas consultas e quanto custou, vs. limite do
 * plano. Aceita um client de transação para enxergar linhas ainda não
 * commitadas (usado dentro de consultarVeiculo).
 */
export async function consumoDoMes(empresaId: string, client?: PoolClient): Promise<ConsumoMes> {
  const faixa = await faixaDaEmpresa(empresaId);
  const p = PLANOS[faixa];

  // Consulta que deu erro NÃO consome cota (não custou nada na Infosimples);
  // fica registrada só como trilha/diagnóstico, fora do contador.
  const sql = `SELECT COUNT(*)::int AS usados, COALESCE(SUM(custo_centavos), 0)::int AS custo
       FROM consultas_infosimples
      WHERE empresa_id = $1
        AND status <> 'erro'
        AND criado_em >= date_trunc('month', now())`;
  const row = client
    ? (await client.query<{ usados: number; custo: number }>(sql, [empresaId])).rows[0]
    : await queryOne<{ usados: number; custo: number }>(sql, [empresaId]);
  const usados = row?.usados ?? 0;

  return {
    faixa,
    plano: p.nome,
    usados,
    limite: p.limiteConsultasMes,
    restantes: p.limiteConsultasMes === null ? null : Math.max(0, p.limiteConsultasMes - usados),
    custoCentavosMes: row?.custo ?? 0,
    configurado: infosimplesConfigurado(),
  };
}

/** Barra a consulta quando o teto mensal do plano já foi atingido. */
async function assertPodeConsultar(empresaId: string): Promise<void> {
  const consumo = await consumoDoMes(empresaId);
  if (consumo.limite !== null && consumo.usados >= consumo.limite) {
    throw AppError.forbidden(
      `Limite de ${consumo.limite} consultas/mês do plano ${consumo.plano} atingido. ` +
        'Faça upgrade para consultar mais este mês.',
    );
  }
}

// ----- consulta de um veículo -----

export interface ResultadoConsultaVeiculo {
  simulado: boolean;
  mensagem: string;
  placa: string;
  multasEncontradas: number;
  multasNovas: number;
  multasDuplicadas: number;
  consumo: ConsumoMes;
}

function isConflito(err: unknown): boolean {
  return err instanceof AppError && err.statusCode === 409;
}

/**
 * Consulta os débitos/multas de UM veículo e traz para dentro do sistema:
 *  1) checa o limite do plano;
 *  2) garante que o veículo é da empresa (isolamento entre clientes);
 *  3) consulta a Infosimples (real ou simulada);
 *  4) registra a consulta (contador/custo/auditoria);
 *  5) cria as multas novas (fonte 'infosimples'), pulando as já existentes.
 */
export async function consultarVeiculo(
  empresaId: string,
  veiculoId: string,
): Promise<ResultadoConsultaVeiculo> {
  // Trava por empresa (lock consultivo de transação): serializa o par
  // "checar limite" + "registrar consulta". Sem ela, N requests paralelas
  // passam todas no COUNT antes de qualquer INSERT e estouram o teto do plano
  // (cada consulta real custa dinheiro na conta da Nexus). O lock é liberado
  // sozinho no COMMIT/ROLLBACK.
  return withTransaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1::text))', [empresaId]);
    await assertPodeConsultar(empresaId);

    const veiculo = await queryOne<{ placa: string; renavam: string | null }>(
      'SELECT placa, renavam FROM veiculos WHERE id = $1 AND empresa_id = $2',
      [veiculoId, empresaId],
    );
    if (!veiculo) throw AppError.notFound('Veículo não encontrado');

    let resultado;
    try {
      resultado = await consultarDebitosVeiculo({ placa: veiculo.placa, renavam: veiculo.renavam });
    } catch (err) {
      // Registra a consulta com erro FORA da transação (pool): o ROLLBACK que o
      // rethrow provoca não pode apagar a trilha. Erro não consome cota — o
      // contador de consumo exclui status 'erro' (só conta o que custou).
      await query(
        `INSERT INTO consultas_infosimples
           (empresa_id, veiculo_id, placa, tipo, status, simulado, custo_centavos, mensagem)
         VALUES ($1, $2, $3, 'debitos', 'erro', $4, 0, $5)`,
        [
          empresaId,
          veiculoId,
          veiculo.placa,
          !infosimplesConfigurado(),
          err instanceof Error ? err.message : 'erro desconhecido',
        ],
      );
      throw err;
    }

    // Cria as multas novas; conflito (numero_auto repetido) = já existia → pula.
    let novas = 0;
    let duplicadas = 0;
    for (const m of resultado.multas) {
      try {
        await multasService.create(empresaId, {
          numero_auto: m.numero_auto,
          placa: veiculo.placa,
          ocorrida_em: m.ocorrida_em ? new Date(m.ocorrida_em) : undefined,
          tipo: m.tipo,
          valor: m.valor,
          pontos_cnh: m.pontos_cnh,
          local: m.local,
          fonte: 'infosimples',
        });
        novas++;
      } catch (err) {
        if (isConflito(err)) {
          duplicadas++;
        } else {
          throw err;
        }
      }
    }

    // Custo só quando foi consulta real (o modo simulado não custa nada).
    // O INSERT roda no client da transação: quem estiver esperando o lock só
    // recontará o consumo depois que esta linha estiver commitada.
    const custo = resultado.simulado ? 0 : env.infosimples.custoCentavos;
    const ins = await client.query<{ id: string }>(
      `INSERT INTO consultas_infosimples
         (empresa_id, veiculo_id, placa, tipo, status, simulado, custo_centavos,
          multas_encontradas, multas_novas, mensagem, resposta)
       VALUES ($1, $2, $3, 'debitos', $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        empresaId,
        veiculoId,
        veiculo.placa,
        resultado.simulado ? 'simulado' : 'sucesso',
        resultado.simulado,
        custo,
        resultado.multas.length,
        novas,
        resultado.mensagem,
        JSON.stringify(resultado.dadosBrutos),
      ],
    );

    return {
      consultaId: ins.rows[0]!.id,
      veiculo,
      resultado,
      resposta: {
        simulado: resultado.simulado,
        mensagem: resultado.mensagem,
        placa: veiculo.placa,
        multasEncontradas: resultado.multas.length,
        multasNovas: novas,
        multasDuplicadas: duplicadas,
        consumo: await consumoDoMes(empresaId, client),
      } satisfies ResultadoConsultaVeiculo,
    };
  }).then(async ({ consultaId, veiculo, resultado, resposta }) => {
    // Depois do commit (as multas já existem no banco): gera o comprovante em
    // PDF e liga as multas à consulta. Best-effort — falha não desfaz a consulta.
    await salvarComprovanteDaConsulta(empresaId, consultaId, veiculo, resultado);
    return resposta;
  });
}

/**
 * Gera o comprovante em PDF (documento limpo do Nexus Frota com a resposta oficial
 * do órgão), guarda em disco e aponta as multas da consulta para ele. O "site
 * receipt" da Infosimples (HTML técnico, link expira em dias) fica salvo ao
 * lado apenas como via de auditoria.
 */
async function salvarComprovanteDaConsulta(
  empresaId: string,
  consultaId: string,
  veiculo: { placa: string; renavam: string | null },
  resultado: ResultadoConsulta,
): Promise<void> {
  try {
    const pdf = await gerarPdfComprovante({
      consultaId,
      fonte: nomeDaFonte(env.infosimples.endpoint),
      simulado: resultado.simulado,
      mensagem: resultado.mensagem,
      consultadoEm: new Date(),
      placa: veiculo.placa,
      renavam: veiculo.renavam,
      dadosVeiculo: resultado.dadosBrutos[0] ?? {},
      multas: resultado.multas,
    });
    const relativo = `comprovantes/${empresaId}/${consultaId}.pdf`;
    const absoluto = path.resolve(env.arquivosDir, relativo);
    await fs.mkdir(path.dirname(absoluto), { recursive: true });
    await fs.writeFile(absoluto, pdf);
    await query('UPDATE consultas_infosimples SET comprovante_path = $1 WHERE id = $2', [
      relativo,
      consultaId,
    ]);

    const numeroAutos = resultado.multas.map((m) => m.numero_auto);
    if (numeroAutos.length > 0) {
      // Cobre novas E duplicadas: a multa sempre aponta para o comprovante
      // mais recente que a confirmou no órgão.
      await query(
        `UPDATE multas SET consulta_id = $1
          WHERE empresa_id = $2 AND fonte = 'infosimples' AND numero_auto = ANY($3)`,
        [consultaId, empresaId, numeroAutos],
      );
    }

    // Receipt original da Infosimples (auditoria) — melhor esforço.
    const url = resultado.comprovantes[0];
    if (url) {
      try {
        const { bytes, ext } = await baixarComprovante(url);
        await fs.writeFile(
          path.resolve(env.arquivosDir, `comprovantes/${empresaId}/${consultaId}-original.${ext}`),
          bytes,
        );
      } catch {
        // sem receipt original não tem problema: o PDF gerado é o principal.
      }
    }
  } catch (err) {
    console.warn(
      `[consultas] comprovante da consulta ${consultaId} não pôde ser salvo:`,
      (err as Error).message,
    );
  }
}

// ----- histórico de consultas (o contador, detalhado) -----

export interface ConsultaRegistro {
  id: string;
  veiculo_id: string | null;
  placa: string | null;
  tipo: string;
  status: string;
  simulado: boolean;
  custo_centavos: number;
  multas_encontradas: number;
  multas_novas: number;
  mensagem: string | null;
  criado_em: string;
}

export interface ListConsultasResult {
  data: ConsultaRegistro[];
  total: number;
  limit: number;
  offset: number;
}

export async function historico(
  empresaId: string,
  q: ListConsultasQuery,
): Promise<ListConsultasResult> {
  const w = new MontadorWhere();
  w.add(`empresa_id = ${w.ph(empresaId)}`);
  if (q.veiculo_id) w.add(`veiculo_id = ${w.ph(q.veiculo_id)}`);

  const totalRow = await queryOne<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM consultas_infosimples ${w.whereSql}`,
    w.valores,
  );

  const rows = await query<ConsultaRegistro>(
    `SELECT id, veiculo_id, placa, tipo, status, simulado, custo_centavos,
            multas_encontradas, multas_novas, mensagem, criado_em
       FROM consultas_infosimples ${w.whereSql}
      ORDER BY criado_em DESC
      LIMIT ${w.ph(q.limit)} OFFSET ${w.ph(q.offset)}`,
    w.valores,
  );

  return {
    data: rows,
    total: Number(totalRow?.total ?? 0),
    limit: q.limit,
    offset: q.offset,
  };
}

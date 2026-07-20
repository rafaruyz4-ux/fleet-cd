import { AppError } from '../../errors/AppError';
import { query, queryOne } from '../../db/pool';
import { MontadorWhere } from '../../db/sql';
import { PLANOS, type PlanoFaixa } from '../../domain/planos';
import { env } from '../../config/env';
import {
  consultarDebitosVeiculo,
  infosimplesConfigurado,
} from '../../integrations/infosimples/client';
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

/** Consumo do mês corrente: quantas consultas e quanto custou, vs. limite do plano. */
export async function consumoDoMes(empresaId: string): Promise<ConsumoMes> {
  const faixa = await faixaDaEmpresa(empresaId);
  const p = PLANOS[faixa];

  const row = await queryOne<{ usados: number; custo: number }>(
    `SELECT COUNT(*)::int AS usados, COALESCE(SUM(custo_centavos), 0)::int AS custo
       FROM consultas_infosimples
      WHERE empresa_id = $1
        AND criado_em >= date_trunc('month', now())`,
    [empresaId],
  );
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
    // Registra a consulta com erro (entra no contador? não: só conta o que custou).
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
  const custo = resultado.simulado ? 0 : env.infosimples.custoCentavos;
  await query(
    `INSERT INTO consultas_infosimples
       (empresa_id, veiculo_id, placa, tipo, status, simulado, custo_centavos,
        multas_encontradas, multas_novas, mensagem)
     VALUES ($1, $2, $3, 'debitos', $4, $5, $6, $7, $8, $9)`,
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
    ],
  );

  return {
    simulado: resultado.simulado,
    mensagem: resultado.mensagem,
    placa: veiculo.placa,
    multasEncontradas: resultado.multas.length,
    multasNovas: novas,
    multasDuplicadas: duplicadas,
    consumo: await consumoDoMes(empresaId),
  };
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

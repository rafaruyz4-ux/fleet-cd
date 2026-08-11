import { pool } from '../../db/pool';
import { env } from '../../config/env';

// Tamanho de cada leva de DELETE. Um DELETE único de milhões de linhas
// esbarra no statement_timeout de 30s do pool (e segura lock/WAL demais);
// em lotes, cada statement é curto e o vacuum acompanha.
const LOTE_DELETE = 10_000;

/**
 * LGPD — minimização e retenção: não guardar dados de localização além do
 * necessário. Remove as posições de GPS mais antigas que a janela de retenção,
 * apagando em LOTES até esvaziar.
 *
 * É uma limpeza de SISTEMA (varre todas as empresas, não é por tenant), feita
 * por data. Devolve quantas linhas foram apagadas.
 */
export async function limparPosicoesAntigas(
  retencaoDias = env.lgpd.gpsRetencaoDias,
): Promise<number> {
  let total = 0;
  for (;;) {
    const res = await pool.query(
      `DELETE FROM posicoes_gps
        WHERE id IN (
          SELECT id FROM posicoes_gps
           WHERE registrado_em < now() - make_interval(days => $1)
           LIMIT $2
        )`,
      [retencaoDias, LOTE_DELETE],
    );
    const apagadas = res.rowCount ?? 0;
    total += apagadas;
    if (apagadas < LOTE_DELETE) break; // último lote (ou nada a apagar)
  }
  return total;
}

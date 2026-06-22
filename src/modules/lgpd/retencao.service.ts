import { pool } from '../../db/pool';
import { env } from '../../config/env';

/**
 * LGPD — minimização e retenção: não guardar dados de localização além do
 * necessário. Remove as posições de GPS mais antigas que a janela de retenção.
 *
 * É uma limpeza de SISTEMA (varre todas as empresas, não é por tenant), feita
 * por data. Devolve quantas linhas foram apagadas.
 */
export async function limparPosicoesAntigas(
  retencaoDias = env.lgpd.gpsRetencaoDias,
): Promise<number> {
  const res = await pool.query(
    `DELETE FROM posicoes_gps WHERE registrado_em < now() - make_interval(days => $1)`,
    [retencaoDias],
  );
  return res.rowCount ?? 0;
}

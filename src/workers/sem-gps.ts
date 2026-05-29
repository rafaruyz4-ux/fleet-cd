import { query } from '../db/pool';
import { env } from '../config/env';
import { withRedisLock } from '../infra/redis';

const LOCK_KEY = 'worker:sem-gps';

export interface SemGpsAlerta {
  id: string;
  viagem_id: string;
  descricao: string | null;
  criado_em: string;
}

/**
 * Varre as viagens em andamento e gera o alerta `sem_gps` para as que estão
 * sem contato (sem posição recebida nem início) há mais que o limite. Faz dedup:
 * não re-alerta enquanto não chegar uma nova posição (o alerta anterior já
 * cobre o silêncio atual). Devolve os alertas criados nesta passada.
 */
export async function detectarSemGps(limiteMin = env.workerSemGps.limiteMin): Promise<SemGpsAlerta[]> {
  return query<SemGpsAlerta>(
    `
    WITH candidatas AS (
      SELECT v.id AS viagem_id,
             GREATEST(v.iniciada_em, COALESCE(p.ultimo, v.iniciada_em)) AS ref,
             p.lat, p.lng
      FROM viagens v
      LEFT JOIN LATERAL (
        SELECT recebido_em AS ultimo,
               ST_Y(coordenada::geometry) AS lat,
               ST_X(coordenada::geometry) AS lng
        FROM posicoes_gps
        WHERE viagem_id = v.id
        ORDER BY recebido_em DESC
        LIMIT 1
      ) p ON TRUE
      WHERE v.status = 'em_andamento'
        AND v.iniciada_em IS NOT NULL
        AND now() - GREATEST(v.iniciada_em, COALESCE(p.ultimo, v.iniciada_em)) > make_interval(mins => $1)
        AND NOT EXISTS (
          SELECT 1 FROM alertas a
          WHERE a.viagem_id = v.id
            AND a.tipo = 'sem_gps'
            AND a.criado_em >= GREATEST(v.iniciada_em, COALESCE(p.ultimo, v.iniciada_em))
        )
    )
    INSERT INTO alertas (viagem_id, tipo, descricao, coordenada)
    SELECT viagem_id, 'sem_gps',
           'Sem posição há ' || round(extract(epoch FROM (now() - ref)) / 60)::int || ' min',
           CASE WHEN lat IS NOT NULL
                THEN ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
                ELSE NULL END
    FROM candidatas
    RETURNING id, viagem_id, descricao, criado_em
    `,
    [limiteMin],
  );
}

/**
 * Agenda a varredura periódica (só no servidor, via index.ts). Cada passada é
 * protegida por um lock no Redis para que só uma instância rode por vez.
 * Devolve uma função para parar o agendamento.
 */
export function agendarWorkerSemGps(): () => void {
  const tick = async () => {
    try {
      const novos = await withRedisLock(LOCK_KEY, env.workerSemGps.intervaloMs, () =>
        detectarSemGps(),
      );
      if (novos && novos.length > 0) {
        console.log(`[worker:sem-gps] ${novos.length} alerta(s) de sem_gps gerado(s)`);
      }
    } catch (err) {
      console.error('[worker:sem-gps] erro na varredura', err);
    }
  };

  const timer = setInterval(tick, env.workerSemGps.intervaloMs);
  timer.unref?.(); // não segura o processo vivo sozinho
  console.log(
    `[worker:sem-gps] ativo (intervalo ${env.workerSemGps.intervaloMs / 1000}s, limite ${env.workerSemGps.limiteMin} min)`,
  );
  return () => clearInterval(timer);
}

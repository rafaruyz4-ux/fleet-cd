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
 * Varre as viagens em andamento e gera o alerta `sem_gps` para as que foram
 * iniciadas mas NUNCA transmitiram posição (o caso "app nem chegou a mandar
 * nada"). O limite é o configurado POR EMPRESA (empresas.alerta_sem_gps_min,
 * tela Configurações); `limiteMin` (env) fica como plano B se a coluna vier
 * nula. Faz dedup: não re-alerta enquanto não chegar uma nova posição (o
 * alerta anterior já cobre o silêncio atual). Devolve os alertas criados.
 *
 * O caso "transmitia e SILENCIOU" virou um tipo próprio ('sem_sinal', abaixo)
 * para o gestor distinguir "nunca conectou" de "veículo ficou mudo na rua".
 */
export async function detectarSemGps(
  limiteMin = env.workerSemGps.limiteMin,
): Promise<SemGpsAlerta[]> {
  return query<SemGpsAlerta>(
    `
    WITH candidatas AS (
      SELECT v.id AS viagem_id, v.empresa_id, v.iniciada_em AS ref
      FROM viagens v
      JOIN empresas e ON e.id = v.empresa_id
      WHERE v.status = 'em_andamento'
        AND v.iniciada_em IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM posicoes_gps p WHERE p.viagem_id = v.id)
        AND now() - v.iniciada_em
              > make_interval(mins => COALESCE(e.alerta_sem_gps_min, $1))
        AND NOT EXISTS (
          SELECT 1 FROM alertas a
          WHERE a.viagem_id = v.id
            AND a.tipo = 'sem_gps'
            AND a.criado_em >= v.iniciada_em
        )
    )
    INSERT INTO alertas (empresa_id, viagem_id, tipo, descricao, coordenada)
    SELECT empresa_id, viagem_id, 'sem_gps',
           'Sem posição há ' || round(extract(epoch FROM (now() - ref)) / 60)::int || ' min',
           NULL
    FROM candidatas
    RETURNING id, viagem_id, descricao, criado_em
    `,
    [limiteMin],
  );
}

/**
 * "Veículo mudo": viagem em andamento que JÁ TRANSMITIA posição e parou de
 * enviar há mais que o limite (app fechado, celular sem bateria, sem sinal).
 * Limite padrão de 10 min, configurável por env (WORKER_SEM_SINAL_LIMITE_MIN).
 * Dedup: 1 alerta por silêncio — só re-alerta se chegar posição nova e o
 * veículo silenciar DE NOVO (alerta existente com criado_em >= última posição
 * cobre o silêncio atual). A coordenada do alerta é a última posição conhecida,
 * que é exatamente onde o gestor deve procurar o veículo.
 */
export async function detectarSemSinal(
  limiteMin = env.workerSemGps.semSinalLimiteMin,
): Promise<SemGpsAlerta[]> {
  return query<SemGpsAlerta>(
    `
    WITH candidatas AS (
      SELECT v.id AS viagem_id, v.empresa_id, p.ultimo, p.lat, p.lng
      FROM viagens v
      JOIN LATERAL (
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
        AND now() - p.ultimo > make_interval(mins => $1)
        AND NOT EXISTS (
          SELECT 1 FROM alertas a
          WHERE a.viagem_id = v.id
            AND a.tipo = 'sem_sinal'
            AND a.criado_em >= p.ultimo
        )
    )
    INSERT INTO alertas (empresa_id, viagem_id, tipo, descricao, coordenada)
    SELECT empresa_id, viagem_id, 'sem_sinal',
           'Veículo mudo: transmitia e está sem enviar posição há '
             || round(extract(epoch FROM (now() - ultimo)) / 60)::int || ' min',
           ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography
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
      const novos = await withRedisLock(LOCK_KEY, env.workerSemGps.intervaloMs, async () => {
        // As duas varreduras na mesma passada: "nunca transmitiu" (sem_gps)
        // e "transmitia e silenciou" (sem_sinal).
        const semGps = await detectarSemGps();
        const semSinal = await detectarSemSinal();
        return [...semGps, ...semSinal];
      });
      if (novos && novos.length > 0) {
        console.log(`[worker:sem-gps] ${novos.length} alerta(s) de silêncio gerado(s)`);
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

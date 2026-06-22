import { env } from '../config/env';
import { withRedisLock } from '../infra/redis';
import { limparPosicoesAntigas } from '../modules/lgpd/retencao.service';

const LOCK_KEY = 'worker:limpeza-gps';

/**
 * Agenda a limpeza periódica das posições de GPS antigas (LGPD). Cada passada é
 * protegida por um lock no Redis para que só uma instância rode por vez.
 * Devolve uma função para parar o agendamento.
 */
export function agendarWorkerLimpezaGps(): () => void {
  const tick = async () => {
    try {
      const apagadas = await withRedisLock(LOCK_KEY, env.lgpd.limpezaIntervaloMs, () =>
        limparPosicoesAntigas(),
      );
      if (apagadas && apagadas > 0) {
        console.log(
          `[worker:limpeza-gps] ${apagadas} posição(ões) antiga(s) removida(s) (retenção ${env.lgpd.gpsRetencaoDias} dias)`,
        );
      }
    } catch (err) {
      console.error('[worker:limpeza-gps] erro na limpeza', err);
    }
  };

  const timer = setInterval(tick, env.lgpd.limpezaIntervaloMs);
  timer.unref?.(); // não segura o processo vivo sozinho
  console.log(
    `[worker:limpeza-gps] ativo (intervalo ${env.lgpd.limpezaIntervaloMs / 3_600_000}h, retenção ${env.lgpd.gpsRetencaoDias} dias)`,
  );
  return () => clearInterval(timer);
}

import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { fecharRedis } from './infra/redis';
import { agendarWorkerSemGps } from './workers/sem-gps';
import { agendarWorkerLimpezaGps } from './workers/limpeza-gps';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[server] API ouvindo em http://localhost:${env.port} (${env.nodeEnv})`);
});

// Worker de detecção de "sem GPS" (pode ser desligado por env).
const pararWorkerSemGps = env.workerSemGps.enabled ? agendarWorkerSemGps() : () => {};

// Worker de limpeza do histórico de GPS antigo (LGPD; desligável por env).
const pararWorkerLimpezaGps = env.lgpd.limpezaEnabled ? agendarWorkerLimpezaGps() : () => {};

// Encerramento gracioso: para o worker, fecha o servidor HTTP, o Redis e o pool.
let encerrando = false;
async function shutdown(signal: string): Promise<void> {
  if (encerrando) return;
  encerrando = true;
  console.log(`[server] recebido ${signal}, encerrando...`);

  // Rede de segurança: se o close pendurar (conexões keep-alive), força a saída
  // em vez de deixar o orquestrador dar SIGKILL.
  const prazo = setTimeout(() => {
    console.error('[server] encerramento demorou demais, forçando saída');
    process.exit(1);
  }, 10_000);
  prazo.unref();

  pararWorkerSemGps();
  pararWorkerLimpezaGps();
  server.close(async () => {
    try {
      await fecharRedis();
      await pool.end();
    } catch (err) {
      console.error('[server] erro ao fechar recursos:', err);
    }
    clearTimeout(prazo);
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

// Sem estes handlers, uma promise rejeitada fora do ciclo de request (ex.: no
// worker) derruba o processo sem log. Logamos sempre; numa exceção realmente
// não tratada, encerramos de forma graciosa.
process.on('unhandledRejection', (motivo) => {
  console.error('[server] unhandledRejection:', motivo);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
  void shutdown('uncaughtException');
});

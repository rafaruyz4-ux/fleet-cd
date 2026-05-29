import { createApp } from './app';
import { env } from './config/env';
import { pool } from './db/pool';
import { fecharRedis } from './infra/redis';
import { agendarWorkerSemGps } from './workers/sem-gps';

const app = createApp();

const server = app.listen(env.port, () => {
  console.log(`[server] API ouvindo em http://localhost:${env.port} (${env.nodeEnv})`);
});

// Worker de detecção de "sem GPS" (pode ser desligado por env).
const pararWorkerSemGps = env.workerSemGps.enabled ? agendarWorkerSemGps() : () => {};

// Encerramento gracioso: para o worker, fecha o servidor HTTP, o Redis e o pool.
async function shutdown(signal: string): Promise<void> {
  console.log(`[server] recebido ${signal}, encerrando...`);
  pararWorkerSemGps();
  server.close(async () => {
    await fecharRedis();
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

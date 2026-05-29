import { createClient, type RedisClientType } from 'redis';
import { env } from '../config/env';

let client: RedisClientType | null = null;
let conectando: Promise<RedisClientType | null> | null = null;
let avisado = false;

/**
 * Cliente Redis lazy. Retorna null (com aviso único) se o Redis não estiver
 * acessível — o sistema continua funcionando sem o lock distribuído.
 */
async function getRedis(): Promise<RedisClientType | null> {
  if (client?.isReady) return client;
  if (conectando) return conectando;

  conectando = (async () => {
    try {
      const c: RedisClientType = createClient({ url: env.redisUrl });
      c.on('error', () => {
        /* erros de conexão tratados abaixo / em reconexões */
      });
      await c.connect();
      client = c;
      return client;
    } catch {
      if (!avisado) {
        console.warn('[redis] indisponível — worker rodará sem lock distribuído');
        avisado = true;
      }
      client = null;
      return null;
    } finally {
      conectando = null;
    }
  })();

  return conectando;
}

let contador = 0;

/**
 * Executa `fn` segurando um lock no Redis (SET NX PX). Se outra instância já
 * tem o lock, devolve `undefined` sem executar. Se o Redis estiver indisponível,
 * executa mesmo assim (cenário de instância única).
 */
export async function withRedisLock<T>(
  chave: string,
  ttlMs: number,
  fn: () => Promise<T>,
): Promise<T | undefined> {
  const redis = await getRedis();
  if (!redis) return fn();

  const token = `${process.pid}-${Date.now()}-${contador++}`;
  const ok = await redis.set(chave, token, { NX: true, PX: ttlMs });
  if (ok !== 'OK') return undefined; // outra instância está executando

  try {
    return await fn();
  } finally {
    // Libera só se o lock ainda for nosso (evita soltar lock de outra instância).
    try {
      if ((await redis.get(chave)) === token) {
        await redis.del(chave);
      }
    } catch {
      /* deixa expirar pelo TTL */
    }
  }
}

export async function fecharRedis(): Promise<void> {
  if (client?.isReady) {
    await client.quit();
  }
  client = null;
}

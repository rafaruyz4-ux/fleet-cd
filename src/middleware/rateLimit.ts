import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

// Limites desligados em teste (a suíte dispara muitas requisições em sequência).
const desligado = env.nodeEnv === 'test';

const handler429 = {
  error: 'Muitas requisições. Tente novamente em alguns instantes.',
};

/**
 * Limite global de requisições por IP — barreira ampla contra abuso/scraping.
 * Não substitui o limite específico de login (abaixo), que é mais apertado.
 */
export const globalLimiter = rateLimit({
  windowMs: 60_000, // 1 minuto
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: handler429,
  skip: () => desligado, // pula o limite inteiro em ambiente de teste
});

/**
 * Limite apertado para autenticação (login de gestor, login de motorista,
 * refresh): trava força-bruta de senha/CPF e credential stuffing.
 * Conta por IP + identificador enviado (email/CPF) para não punir IP partilhado.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000, // 15 minutos
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true, // só conta tentativa que falhou
  message: handler429,
  skip: () => desligado, // pula o limite inteiro em ambiente de teste
  keyGenerator: (req) => {
    const id = (req.body?.email ?? req.body?.cpf ?? '').toString().toLowerCase().trim();
    return `${req.ip}|${id}`;
  },
});

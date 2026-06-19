import path from 'path';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { pingBanco } from './db/pool';
import { errorHandler, notFoundHandler } from './middleware/error';
import { globalLimiter } from './middleware/rateLimit';
import { apiRouter } from './routes';

// No log de acesso, mascara o token de dispositivo que vem na query
// (?token=...) para ele não ficar gravado em texto puro nos logs.
morgan.token('url', (req: express.Request) =>
  req.originalUrl.replace(/([?&]token=)[^&]+/gi, '$1[REDACTED]'),
);

export function createApp() {
  const app = express();

  // Atrás do Nginx: confia no primeiro proxy para o IP real (rate limit/logs).
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(globalLimiter);
  // Sem log de acesso durante os testes (saída limpa).
  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // Healthcheck simples (sem autenticação) — o processo está de pé.
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Readiness: só responde 200 se o banco estiver acessível. É o que o
  // orquestrador (Docker/Nginx) deve checar para não mandar tráfego a uma
  // instância com o banco caído.
  app.get('/ready', (_req, res) => {
    void (async () => {
      const ok = await pingBanco();
      if (ok) {
        res.json({ status: 'ready' });
      } else {
        res.status(503).json({ status: 'unavailable', motivo: 'banco indisponível' });
      }
    })();
  });

  // Página de teste do "app do motorista" (rastreio GPS pelo celular).
  // Arquivos estáticos em /public servidos na mesma origem que /api (sem CORS);
  // separados em .html/.css/.js para respeitar a CSP do helmet (default-src 'self').
  const publicDir = path.join(__dirname, '..', 'public');
  app.use(express.static(publicDir));
  app.get('/motorista', (_req, res) => {
    res.sendFile(path.join(publicDir, 'motorista.html'));
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

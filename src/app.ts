import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error';
import { apiRouter } from './routes';

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  // Sem log de acesso durante os testes (saída limpa).
  if (env.nodeEnv !== 'test') {
    app.use(morgan(env.isProduction ? 'combined' : 'dev'));
  }

  // Healthcheck (sem autenticação).
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

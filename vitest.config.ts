import { defineConfig } from 'vitest/config';
import { TEST_DATABASE_URL } from './test/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/global-setup.ts'],
    setupFiles: ['./test/setup.ts'],
    // Os testes compartilham um único banco e limpam as tabelas a cada teste;
    // rodar arquivos em série evita corrida entre eles.
    fileParallelism: false,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: TEST_DATABASE_URL,
      JWT_ACCESS_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      BCRYPT_ROUNDS: '4', // hashing rápido nos testes
      CORS_ORIGINS: '*',
    },
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});

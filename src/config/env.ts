import dotenv from 'dotenv';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(optional('PORT', '3000')),
  corsOrigins: optional('CORS_ORIGINS', '*')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),

  databaseUrl: required('DATABASE_URL'),
  redisUrl: optional('REDIS_URL', 'redis://localhost:6379'),

  // Integração SEFAZ (NF-e). Opcional: sem certificado, os endpoints de
  // consulta respondem 501. Preencha para habilitar no futuro.
  sefaz: {
    certPfxPath: process.env.SEFAZ_CERT_PFX_PATH,
    certPassword: process.env.SEFAZ_CERT_PASSWORD,
    uf: optional('SEFAZ_UF', 'SP'),
    ambiente: optional('SEFAZ_AMBIENTE', '2'), // 1=produção, 2=homologação
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: optional('JWT_ACCESS_TTL', '15m'),
    refreshTtl: optional('JWT_REFRESH_TTL', '7d'),
    // Token de dispositivo (long-lived) usado por apps de rastreio em 2º plano
    // que não fazem refresh (ex.: GPSLogger). Mesmo segredo do access token.
    deviceTtl: optional('JWT_DEVICE_TTL', '365d'),
  },

  bcryptRounds: Number(optional('BCRYPT_ROUNDS', '12')),

  // Worker de detecção de "sem GPS" (veículo que parou de transmitir).
  workerSemGps: {
    enabled: optional('WORKER_SEM_GPS_ENABLED', 'true') !== 'false',
    intervaloMs: Number(optional('WORKER_SEM_GPS_INTERVALO_S', '60')) * 1000,
    limiteMin: Number(optional('WORKER_SEM_GPS_LIMITE_MIN', '10')),
  },

  seedAdmin: {
    nome: optional('SEED_ADMIN_NOME', 'Administrador'),
    email: optional('SEED_ADMIN_EMAIL', 'admin@cd.local'),
    senha: optional('SEED_ADMIN_SENHA', 'trocar-senha-123'),
  },
} as const;

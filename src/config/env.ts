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

/** Lê uma variável numérica e aborta o boot se vier algo que não é número. */
function numberEnv(name: string, fallback: string): number {
  const raw = optional(name, fallback);
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Variável de ambiente ${name} deve ser um número (recebido: "${raw}")`);
  }
  return n;
}

const nodeEnv = optional('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';
const corsOrigins = optional('CORS_ORIGINS', '*')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

// Em produção não pode ficar com CORS liberado para qualquer origem ('*'):
// num SaaS multi-cliente isso enfraquece a proteção entre origens. Exija a lista.
if (isProduction && (corsOrigins.length === 0 || corsOrigins.includes('*'))) {
  throw new Error(
    'CORS_ORIGINS deve listar as origens permitidas (sem "*") quando NODE_ENV=production',
  );
}

export const env = {
  nodeEnv,
  isProduction,
  port: numberEnv('PORT', '3000'),
  corsOrigins,

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

  bcryptRounds: numberEnv('BCRYPT_ROUNDS', '12'),

  // URL pública do dashboard (front), usada para montar o link de redefinição
  // de senha enviado por e-mail.
  appBaseUrl: optional('APP_BASE_URL', 'http://localhost:5173'),

  // SMTP para envio de e-mail (ex.: "esqueci minha senha"). Sem SMTP_HOST, o
  // sistema apenas registra o e-mail (modo dev/teste) em vez de enviar.
  smtp: {
    host: process.env.SMTP_HOST,
    port: numberEnv('SMTP_PORT', '587'),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    remetente: optional('SMTP_REMETENTE', 'Fleet CD <nao-responda@fleetcd.local>'),
  },

  // Worker de detecção de "sem GPS" (veículo que parou de transmitir).
  workerSemGps: {
    enabled: optional('WORKER_SEM_GPS_ENABLED', 'true') !== 'false',
    intervaloMs: numberEnv('WORKER_SEM_GPS_INTERVALO_S', '60') * 1000,
    limiteMin: numberEnv('WORKER_SEM_GPS_LIMITE_MIN', '10'),
  },

  // LGPD: por quanto tempo guardar o histórico de posições GPS antes de apagar
  // automaticamente (minimização de dados de localização).
  lgpd: {
    gpsRetencaoDias: numberEnv('LGPD_GPS_RETENCAO_DIAS', '90'),
    limpezaEnabled: optional('LGPD_LIMPEZA_ENABLED', 'true') !== 'false',
    limpezaIntervaloMs: numberEnv('LGPD_LIMPEZA_INTERVALO_H', '24') * 3_600_000,
  },

  seedAdmin: {
    nome: optional('SEED_ADMIN_NOME', 'Administrador'),
    email: optional('SEED_ADMIN_EMAIL', 'admin@cd.local'),
    senha: optional('SEED_ADMIN_SENHA', 'trocar-senha-123'),
  },
} as const;

// O seed não pode subir uma conta de admin com a senha-padrão de exemplo em
// produção (credencial conhecida publicamente). Trava no boot do seed.
export const SENHA_SEED_PADRAO = 'trocar-senha-123';

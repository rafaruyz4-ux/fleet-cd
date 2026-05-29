// Configuração compartilhada da suíte de testes (banco dedicado, isolado do dev).
export const TEST_DB = 'fleet_cd_test';
export const TEST_DATABASE_URL = `postgresql://fleet:fleet@localhost:5432/${TEST_DB}`;
// Banco de manutenção (existe por padrão) usado só para criar/derrubar o de teste.
export const MAINTENANCE_DATABASE_URL = 'postgresql://fleet:fleet@localhost:5432/postgres';

export const ADMIN_EMAIL = 'admin@cd.local';
export const ADMIN_SENHA = 'trocar-senha-123';

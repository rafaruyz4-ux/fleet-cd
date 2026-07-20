import { afterEach, describe, expect, it, vi } from 'vitest';

// Travas de boot em produção (config/env.ts): sem ASAAS_WEBHOOK_TOKEN o
// webhook do Asaas aceitaria POST anônimo ("pagamento confirmado" de graça).
// Cada caso reimporta o módulo com o process.env desejado.
describe('env — travas de produção', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
    vi.resetModules();
  });

  function prepararProducao(): void {
    vi.resetModules();
    process.env.NODE_ENV = 'production';
    process.env.CORS_ORIGINS = 'https://app.exemplo.com.br';
  }

  it('aborta o boot em produção sem ASAAS_WEBHOOK_TOKEN', async () => {
    prepararProducao();
    delete process.env.ASAAS_WEBHOOK_TOKEN;
    await expect(import('../src/config/env')).rejects.toThrow(/ASAAS_WEBHOOK_TOKEN/);
  });

  it('sobe em produção com ASAAS_WEBHOOK_TOKEN configurado', async () => {
    prepararProducao();
    process.env.ASAAS_WEBHOOK_TOKEN = 'token-de-teste';
    await expect(import('../src/config/env')).resolves.toBeDefined();
  });
});

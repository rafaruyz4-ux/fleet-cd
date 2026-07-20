import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { env } from '../../config/env';
import { mudarPlanoSchema } from './assinatura.schemas';
import * as service from './assinatura.service';

// --- Assinatura da própria empresa (gestor autenticado) ---
export const assinaturaRouter = Router();

assinaturaRouter.use(requireAuth, requireUsuario);

// Plano atual + uso (veículos usados x limite).
assinaturaRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.obterAssinatura(tenantId(req)));
  }),
);

// Faturas da assinatura (histórico de cobranças no Asaas; simulado sem chave).
assinaturaRouter.get(
  '/faturas',
  asyncHandler(async (req, res) => {
    res.json(await service.listarFaturas(tenantId(req)));
  }),
);

// Troca de plano (upgrade/downgrade).
assinaturaRouter.post(
  '/plano',
  validate({ body: mudarPlanoSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.mudarPlano(tenantId(req), req.body.faixa));
  }),
);

// --- Webhook do Asaas (sem login; o Asaas chama esta URL) ---
export const asaasWebhookRouter = Router();

asaasWebhookRouter.post(
  '/asaas',
  asyncHandler(async (req, res) => {
    // Se um token de webhook está configurado, exige que bata (o Asaas manda
    // no cabeçalho asaas-access-token). Sem token configurado, aceita (dev).
    if (env.asaas.webhookToken) {
      const recebido = req.headers['asaas-access-token'];
      if (recebido !== env.asaas.webhookToken) {
        res.status(401).json({ error: 'token de webhook inválido' });
        return;
      }
    }

    const evento = req.body?.event as string | undefined;
    const subscriptionId =
      req.body?.payment?.subscription ?? req.body?.subscription?.id ?? req.body?.subscription;

    if (evento) {
      await service.processarWebhook(evento, subscriptionId);
    }
    // Sempre 200: o Asaas reenvia em erro; processamos de forma idempotente.
    res.json({ recebido: true });
  }),
);

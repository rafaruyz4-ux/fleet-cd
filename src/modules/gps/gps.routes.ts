import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireMotorista } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { verifyAccessToken } from '../../utils/jwt';
import { idParamSchema, ingestPosicoesSchema } from './gps.schemas';
import * as service from './gps.service';

// Rotas do APP (motorista autenticado). Montadas em /api/app.
export const appRouter = Router();

appRouter.use(requireAuth, requireMotorista);

// Viagens do próprio motorista (em andamento primeiro).
appRouter.get(
  '/viagens',
  asyncHandler(async (req, res) => {
    res.json(await service.getMinhasViagens(req.user!.empresaId, req.user!.sub));
  }),
);

// Ingestão de posições GPS (lote) de uma viagem do motorista.
appRouter.post(
  '/viagens/:id/posicoes',
  validate({ params: idParamSchema, body: ingestPosicoesSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.ingestPosicoes(req.user!.empresaId, req.params.id!, req.user!.sub, req.body);
    res.status(201).json(result);
  }),
);

// Ingestão "sem ID": grava na viagem em_andamento do motorista (URL fixa para
// apps de rastreio em 2º plano que não sabem o id da viagem).
appRouter.post(
  '/posicoes',
  validate({ body: ingestPosicoesSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.ingestPosicoesViagemAtual(req.user!.empresaId, req.user!.sub, req.body);
    res.status(201).json(result);
  }),
);

// --- Adaptadores de apps de rastreio (iOS) ---
// Router sem requireAuth: estes apps não enviam header Authorization, então o
// token de dispositivo vem na query (?token=...). Montado em /api/app.
export const deviceRouter = Router();

// Overland (iOS). Posta GeoJSON e exige resposta {"result":"ok"} para confirmar
// o lote; qualquer outra coisa faz o app reenviar depois (sem perder dados).
deviceRouter.post(
  '/overland',
  asyncHandler(async (req, res) => {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    let motoristaId: string | null = null;
    let empresaId: string | null = null;
    try {
      const payload = verifyAccessToken(token);
      if (payload.tipo === 'motorista') {
        motoristaId = payload.sub;
        empresaId = payload.empresaId;
      }
    } catch {
      /* token inválido tratado abaixo */
    }
    if (!motoristaId || !empresaId) {
      res.status(401).json({ result: 'error', error: 'Token de dispositivo inválido' });
      return;
    }
    const result = await service.ingestOverland(empresaId, motoristaId, req.body);
    res.status(200).json({ result: 'ok', inseridas: result.inseridas, alertas: result.alertas.length });
  }),
);

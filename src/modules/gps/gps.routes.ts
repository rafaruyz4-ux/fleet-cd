import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireMotorista } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { idParamSchema, ingestPosicoesSchema } from './gps.schemas';
import * as service from './gps.service';

// Rotas do APP (motorista autenticado). Montadas em /api/app.
export const appRouter = Router();

appRouter.use(requireAuth, requireMotorista);

// Viagens do próprio motorista (em andamento primeiro).
appRouter.get(
  '/viagens',
  asyncHandler(async (req, res) => {
    res.json(await service.getMinhasViagens(req.user!.sub));
  }),
);

// Ingestão de posições GPS (lote) de uma viagem do motorista.
appRouter.post(
  '/viagens/:id/posicoes',
  validate({ params: idParamSchema, body: ingestPosicoesSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.ingestPosicoes(req.params.id!, req.user!.sub, req.body);
    res.status(201).json(result);
  }),
);

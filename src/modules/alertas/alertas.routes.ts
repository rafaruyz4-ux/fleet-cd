import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  idParamSchema,
  type ListAlertasQuery,
  listAlertasQuerySchema,
  marcarAlertaSchema,
} from './alertas.schemas';
import * as service from './alertas.service';

export const alertasRouter = Router();

alertasRouter.use(requireAuth, requireUsuario);

alertasRouter.get(
  '/',
  validate({ query: listAlertasQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req), req.query as unknown as ListAlertasQuery));
  }),
);

alertasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: marcarAlertaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.marcarVisualizado(tenantId(req), req.params.id!, req.body.visualizado));
  }),
);

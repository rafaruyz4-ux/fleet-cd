import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createMultaSchema,
  idParamSchema,
  type ListMultasQuery,
  listMultasQuerySchema,
  updateMultaSchema,
} from './multas.schemas';
import * as service from './multas.service';

export const multasRouter = Router();

multasRouter.use(requireAuth, requireUsuario);

multasRouter.get(
  '/',
  validate({ query: listMultasQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req), req.query as unknown as ListMultasQuery));
  }),
);

multasRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(tenantId(req), req.params.id!));
  }),
);

multasRouter.post(
  '/',
  validate({ body: createMultaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(tenantId(req), req.body));
  }),
);

multasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateMultaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(tenantId(req), req.params.id!, req.body));
  }),
);

// Re-roda o vínculo automático (viagem/motorista) para a multa.
multasRouter.post(
  '/:id/revincular',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.revincular(tenantId(req), req.params.id!));
  }),
);

multasRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(tenantId(req), req.params.id!);
    res.status(204).send();
  }),
);

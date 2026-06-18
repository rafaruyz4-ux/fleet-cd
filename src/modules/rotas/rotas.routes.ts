import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createRotaSchema, idParamSchema, updateRotaSchema } from './rotas.schemas';
import * as service from './rotas.service';

export const rotasRouter = Router();

rotasRouter.use(requireAuth, requireUsuario);

rotasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req)));
  }),
);

rotasRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(tenantId(req), req.params.id!));
  }),
);

rotasRouter.post(
  '/',
  validate({ body: createRotaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(tenantId(req), req.body));
  }),
);

rotasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateRotaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(tenantId(req), req.params.id!, req.body));
  }),
);

rotasRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(tenantId(req), req.params.id!);
    res.status(204).send();
  }),
);

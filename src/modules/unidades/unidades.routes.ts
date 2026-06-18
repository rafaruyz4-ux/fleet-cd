import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createUnidadeSchema, idParamSchema, updateUnidadeSchema } from './unidades.schemas';
import * as service from './unidades.service';

export const unidadesRouter = Router();

unidadesRouter.use(requireAuth, requireUsuario);

unidadesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req)));
  }),
);

unidadesRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(tenantId(req), req.params.id!));
  }),
);

unidadesRouter.post(
  '/',
  validate({ body: createUnidadeSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(tenantId(req), req.body));
  }),
);

unidadesRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateUnidadeSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(tenantId(req), req.params.id!, req.body));
  }),
);

unidadesRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(tenantId(req), req.params.id!);
    res.status(204).send();
  }),
);

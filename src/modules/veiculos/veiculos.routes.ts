import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createVeiculoSchema, idParamSchema, updateVeiculoSchema } from './veiculos.schemas';
import * as service from './veiculos.service';

export const veiculosRouter = Router();

veiculosRouter.use(requireAuth, requireUsuario);

veiculosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req)));
  }),
);

veiculosRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(tenantId(req), req.params.id!));
  }),
);

veiculosRouter.post(
  '/',
  validate({ body: createVeiculoSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(tenantId(req), req.body));
  }),
);

veiculosRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateVeiculoSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(tenantId(req), req.params.id!, req.body));
  }),
);

veiculosRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(tenantId(req), req.params.id!);
    res.status(204).send();
  }),
);

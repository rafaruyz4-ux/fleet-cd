import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createRotaSchema, idParamSchema, updateRotaSchema } from './rotas.schemas';
import * as service from './rotas.service';

export const rotasRouter = Router();

rotasRouter.use(requireAuth, requireUsuario);

rotasRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await service.list());
  }),
);

rotasRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(req.params.id!));
  }),
);

rotasRouter.post(
  '/',
  validate({ body: createRotaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.body));
  }),
);

rotasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateRotaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.params.id!, req.body));
  }),
);

rotasRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(req.params.id!);
    res.status(204).send();
  }),
);

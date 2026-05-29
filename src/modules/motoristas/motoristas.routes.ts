import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  createMotoristaSchema,
  idParamSchema,
  updateMotoristaSchema,
} from './motoristas.schemas';
import * as service from './motoristas.service';

export const motoristasRouter = Router();

// Todo o módulo exige usuário autenticado (gestor/admin).
motoristasRouter.use(requireAuth, requireUsuario);

motoristasRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await service.list());
  }),
);

motoristasRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(req.params.id!));
  }),
);

motoristasRouter.post(
  '/',
  validate({ body: createMotoristaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.body));
  }),
);

motoristasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateMotoristaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.params.id!, req.body));
  }),
);

motoristasRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(req.params.id!);
    res.status(204).send();
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { createMotoristaSchema, idParamSchema, updateMotoristaSchema } from './motoristas.schemas';
import * as service from './motoristas.service';

export const motoristasRouter = Router();

// Todo o módulo exige usuário autenticado (gestor/admin).
motoristasRouter.use(requireAuth, requireUsuario);

motoristasRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req)));
  }),
);

motoristasRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(tenantId(req), req.params.id!));
  }),
);

motoristasRouter.post(
  '/',
  validate({ body: createMotoristaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(tenantId(req), req.body));
  }),
);

// Emite um token de dispositivo (validade longa) para rastreio GPS em 2º plano.
motoristasRouter.post(
  '/:id/device-token',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.gerarDeviceToken(tenantId(req), req.params.id!));
  }),
);

motoristasRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateMotoristaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(tenantId(req), req.params.id!, req.body));
  }),
);

motoristasRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(tenantId(req), req.params.id!);
    res.status(204).send();
  }),
);

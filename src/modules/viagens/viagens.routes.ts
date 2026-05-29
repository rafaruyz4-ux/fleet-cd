import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  addParadaSchema,
  createViagemSchema,
  encerrarViagemSchema,
  idParamSchema,
  iniciarViagemSchema,
  type ListViagensQuery,
  listViagensQuerySchema,
  paradaParamsSchema,
  updateParadaSchema,
  updateViagemSchema,
} from './viagens.schemas';
import * as service from './viagens.service';
import * as gpsService from '../gps/gps.service';
import * as alertasService from '../alertas/alertas.service';

export const viagensRouter = Router();

viagensRouter.use(requireAuth, requireUsuario);

viagensRouter.get(
  '/',
  validate({ query: listViagensQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.query as unknown as ListViagensQuery));
  }),
);

viagensRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(req.params.id!));
  }),
);

viagensRouter.post(
  '/',
  validate({ body: createViagemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.body));
  }),
);

viagensRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateViagemSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.params.id!, req.body));
  }),
);

// --- Telemetria (Sprint 5) ---
viagensRouter.get(
  '/:id/posicoes',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await gpsService.getTrajetoria(req.params.id!));
  }),
);

viagensRouter.get(
  '/:id/alertas',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await alertasService.listByViagem(req.params.id!));
  }),
);

// --- Ciclo de vida ---
viagensRouter.post(
  '/:id/iniciar',
  validate({ params: idParamSchema, body: iniciarViagemSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.iniciar(req.params.id!, req.body));
  }),
);

viagensRouter.post(
  '/:id/encerrar',
  validate({ params: idParamSchema, body: encerrarViagemSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.encerrar(req.params.id!, req.body));
  }),
);

viagensRouter.post(
  '/:id/cancelar',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.cancelar(req.params.id!));
  }),
);

// --- Paradas ---
viagensRouter.post(
  '/:id/paradas',
  validate({ params: idParamSchema, body: addParadaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.addParada(req.params.id!, req.body));
  }),
);

viagensRouter.patch(
  '/:id/paradas/:paradaId',
  validate({ params: paradaParamsSchema, body: updateParadaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.updateParada(req.params.id!, req.params.paradaId!, req.body));
  }),
);

viagensRouter.delete(
  '/:id/paradas/:paradaId',
  validate({ params: paradaParamsSchema }),
  asyncHandler(async (req, res) => {
    await service.removeParada(req.params.id!, req.params.paradaId!);
    res.status(204).send();
  }),
);

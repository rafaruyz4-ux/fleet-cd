import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  addParadaSchema,
  createViagemSchema,
  encerrarViagemSchema,
  type ExportViagensQuery,
  exportViagensQuerySchema,
  idParamSchema,
  iniciarViagemSchema,
  type ListViagensQuery,
  listViagensQuerySchema,
  paradaParamsSchema,
  updateParadaSchema,
  updateViagemSchema,
} from './viagens.schemas';
import { enviarCsv } from '../../utils/csv';
import * as service from './viagens.service';
import * as gpsService from '../gps/gps.service';
import * as alertasService from '../alertas/alertas.service';

export const viagensRouter = Router();

viagensRouter.use(requireAuth, requireUsuario);

viagensRouter.get(
  '/',
  validate({ query: listViagensQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.list(tenantId(req), req.query as unknown as ListViagensQuery));
  }),
);

// Exportação CSV (registrada ANTES de /:id para não cair na validação de UUID).
viagensRouter.get(
  '/export.csv',
  validate({ query: exportViagensQuerySchema }),
  asyncHandler(async (req, res) => {
    const csv = await service.exportCsv(tenantId(req), req.query as unknown as ExportViagensQuery);
    enviarCsv(res, 'viagens.csv', csv);
  }),
);

viagensRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(tenantId(req), req.params.id!));
  }),
);

viagensRouter.post(
  '/',
  validate({ body: createViagemSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(tenantId(req), req.body));
  }),
);

viagensRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateViagemSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(tenantId(req), req.params.id!, req.body));
  }),
);

// --- Telemetria (Sprint 5) ---
viagensRouter.get(
  '/:id/posicoes',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await gpsService.getTrajetoria(tenantId(req), req.params.id!));
  }),
);

// Trajeto encaixado nas ruas (map matching). Pode demorar um pouco (chama um
// serviço externo) e cai para a linha bruta se não der.
viagensRouter.get(
  '/:id/trajeto-ruas',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await gpsService.getTrajetoRuas(tenantId(req), req.params.id!));
  }),
);

viagensRouter.get(
  '/:id/alertas',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await alertasService.listByViagem(tenantId(req), req.params.id!));
  }),
);

// --- Ciclo de vida ---
viagensRouter.post(
  '/:id/iniciar',
  validate({ params: idParamSchema, body: iniciarViagemSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.iniciar(tenantId(req), req.params.id!, req.body));
  }),
);

viagensRouter.post(
  '/:id/encerrar',
  validate({ params: idParamSchema, body: encerrarViagemSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.encerrar(tenantId(req), req.params.id!, req.body));
  }),
);

viagensRouter.post(
  '/:id/cancelar',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.cancelar(tenantId(req), req.params.id!));
  }),
);

// --- Paradas ---
viagensRouter.post(
  '/:id/paradas',
  validate({ params: idParamSchema, body: addParadaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.addParada(tenantId(req), req.params.id!, req.body));
  }),
);

viagensRouter.patch(
  '/:id/paradas/:paradaId',
  validate({ params: paradaParamsSchema, body: updateParadaSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await service.updateParada(tenantId(req), req.params.id!, req.params.paradaId!, req.body),
    );
  }),
);

viagensRouter.delete(
  '/:id/paradas/:paradaId',
  validate({ params: paradaParamsSchema }),
  asyncHandler(async (req, res) => {
    await service.removeParada(tenantId(req), req.params.id!, req.params.paradaId!);
    res.status(204).send();
  }),
);

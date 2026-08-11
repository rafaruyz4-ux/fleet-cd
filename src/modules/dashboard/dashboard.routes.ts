import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import * as service from './dashboard.service';

// Endpoints agregados do dashboard do gestor. Montado em /api/dashboard.
export const dashboardRouter = Router();

// Gestor/admin autenticado (tenant-scoped via tenantId).
dashboardRouter.use(requireAuth, requireUsuario);

// Mapa da frota: última posição de cada viagem em andamento da empresa.
dashboardRouter.get(
  '/frota-mapa',
  asyncHandler(async (req, res) => {
    res.json(await service.frotaMapa(tenantId(req)));
  }),
);

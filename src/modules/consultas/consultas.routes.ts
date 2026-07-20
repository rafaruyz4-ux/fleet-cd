import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  listConsultasQuerySchema,
  type ListConsultasQuery,
  veiculoParamSchema,
} from './consultas.schemas';
import * as service from './consultas.service';

export const consultasRouter = Router();

consultasRouter.use(requireAuth, requireUsuario);

// Contador de consumo do mês (consultas usadas vs. limite do plano + custo).
consultasRouter.get(
  '/consumo',
  asyncHandler(async (req, res) => {
    res.json(await service.consumoDoMes(tenantId(req)));
  }),
);

// Histórico de consultas (a trilha do contador, detalhada).
consultasRouter.get(
  '/',
  validate({ query: listConsultasQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.historico(tenantId(req), req.query as unknown as ListConsultasQuery));
  }),
);

// Dispara a consulta de débitos/multas de um veículo (botão "Atualizar débitos").
consultasRouter.post(
  '/veiculo/:veiculoId',
  validate({ params: veiculoParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.consultarVeiculo(tenantId(req), req.params.veiculoId!));
  }),
);

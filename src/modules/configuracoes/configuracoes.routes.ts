import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { atualizarConfiguracoesSchema } from './configuracoes.schemas';
import * as service from './configuracoes.service';

// Configurações da PRÓPRIA empresa. Leitura para qualquer gestor; edição
// (dados cadastrais + limiares de alerta) só para o admin da empresa.
export const configuracoesRouter = Router();

configuracoesRouter.use(requireAuth, requireUsuario);

configuracoesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.obter(tenantId(req)));
  }),
);

configuracoesRouter.patch(
  '/',
  requireRole('admin'),
  validate({ body: atualizarConfiguracoesSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.atualizar(tenantId(req), req.body));
  }),
);

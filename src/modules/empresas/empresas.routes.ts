import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireSuperAdmin, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { criarEmpresaSchema } from './empresas.schemas';
import * as empresasService from './empresas.service';

// Backoffice da plataforma: TUDO aqui exige um super admin (equipe que vende).
export const empresasAdminRouter = Router();

empresasAdminRouter.use(requireAuth, requireUsuario, requireSuperAdmin);

// Lista as empresas-clientes.
empresasAdminRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await empresasService.listar());
  }),
);

// Cadastra uma empresa-cliente + o 1º usuário admin dela.
empresasAdminRouter.post(
  '/',
  validate({ body: criarEmpresaSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await empresasService.criar(req.body));
  }),
);

import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireSuperAdmin, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { atualizarEmpresaSchema, criarEmpresaSchema } from './empresas.schemas';
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

// Detalhe de uma empresa (dados + usuários dela).
empresasAdminRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json(await empresasService.obter(req.params.id!));
  }),
);

// Edita os dados de uma empresa.
empresasAdminRouter.patch(
  '/:id',
  validate({ body: atualizarEmpresaSchema }),
  asyncHandler(async (req, res) => {
    res.json(await empresasService.atualizar(req.params.id!, req.body));
  }),
);

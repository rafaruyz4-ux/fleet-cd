import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireRole, requireUsuario, tenantId } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  atualizarUsuarioSchema,
  criarUsuarioSchema,
  idParamSchema,
  trocarMinhaSenhaSchema,
} from './usuarios.schemas';
import * as service from './usuarios.service';

// Usuários do PRÓPRIO tenant: o admin da empresa gerencia a equipe dele.
export const usuariosRouter = Router();

usuariosRouter.use(requireAuth, requireUsuario);

// Troca da própria senha — aberta a qualquer papel (admin OU gestor).
// Registrada antes das rotas de gestão para não cair no requireRole abaixo.
usuariosRouter.post(
  '/me/senha',
  validate({ body: trocarMinhaSenhaSchema }),
  asyncHandler(async (req, res) => {
    await service.trocarMinhaSenha(req.user!.sub, req.body.senhaAtual, req.body.novaSenha);
    res.json({ ok: true });
  }),
);

// Daqui para baixo, só o admin da empresa (1ª aplicação real do requireRole).
usuariosRouter.use(requireRole('admin'));

usuariosRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json(await service.listar(tenantId(req)));
  }),
);

usuariosRouter.post(
  '/',
  validate({ body: criarUsuarioSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.criar(tenantId(req), req.body));
  }),
);

// Edita papel e/ou ativo (desativar/reativar).
usuariosRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: atualizarUsuarioSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.atualizar(tenantId(req), req.params.id!, req.user!.sub, req.body));
  }),
);

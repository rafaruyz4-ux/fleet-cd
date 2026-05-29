import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireMotorista, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { loginSchema, motoristaLoginSchema, refreshSchema } from './auth.schemas';
import * as authService from './auth.service';

export const authRouter = Router();

// --- Gestores do dashboard ---
authRouter.post(
  '/login',
  validate({ body: loginSchema }),
  asyncHandler(async (req, res) => {
    const { email, senha } = req.body;
    res.json(await authService.login(email, senha));
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  requireUsuario,
  asyncHandler(async (req, res) => {
    res.json(await authService.getById(req.user!.sub));
  }),
);

// --- Motoristas (app) ---
authRouter.post(
  '/motorista/login',
  validate({ body: motoristaLoginSchema }),
  asyncHandler(async (req, res) => {
    const { cpf, senha } = req.body;
    res.json(await authService.loginMotorista(cpf, senha));
  }),
);

authRouter.get(
  '/motorista/me',
  requireAuth,
  requireMotorista,
  asyncHandler(async (req, res) => {
    res.json(await authService.getMotoristaById(req.user!.sub));
  }),
);

// --- Refresh (gestor ou motorista, conforme o tipo do token) ---
authRouter.post(
  '/refresh',
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authService.refresh(req.body.refreshToken));
  }),
);

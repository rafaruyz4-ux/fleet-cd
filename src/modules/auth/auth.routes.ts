import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireMotorista, requireUsuario } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimit';
import { validate } from '../../middleware/validate';
import {
  esqueciSenhaSchema,
  loginSchema,
  motoristaLoginSchema,
  redefinirSenhaSchema,
  refreshSchema,
} from './auth.schemas';
import * as authService from './auth.service';
import * as recuperacaoService from './recuperacao.service';

export const authRouter = Router();

// --- Gestores do dashboard ---
authRouter.post(
  '/login',
  authLimiter,
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
  authLimiter,
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

// --- Esqueci minha senha (gestores) ---
// Resposta sempre genérica (não revela se o e-mail existe).
authRouter.post(
  '/esqueci-senha',
  authLimiter,
  validate({ body: esqueciSenhaSchema }),
  asyncHandler(async (req, res) => {
    await recuperacaoService.solicitarRecuperacao(req.body.email);
    res.json({ mensagem: 'Se o e-mail existir, enviaremos as instruções de redefinição.' });
  }),
);

authRouter.post(
  '/redefinir-senha',
  authLimiter,
  validate({ body: redefinirSenhaSchema }),
  asyncHandler(async (req, res) => {
    await recuperacaoService.redefinirComToken(req.body.token, req.body.senha);
    res.json({ mensagem: 'Senha redefinida com sucesso.' });
  }),
);

// --- Refresh (gestor ou motorista, conforme o tipo do token) ---
authRouter.post(
  '/refresh',
  authLimiter,
  validate({ body: refreshSchema }),
  asyncHandler(async (req, res) => {
    res.json(await authService.refresh(req.body.refreshToken));
  }),
);

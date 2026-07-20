import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { empresaBloqueada, motoristaEstaAtivo, statusDaEmpresa } from '../../middleware/acesso';
import { requireAuth, requireMotorista } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { verifyAccessToken } from '../../utils/jwt';
import { idParamSchema, ingestPosicoesSchema } from './gps.schemas';
import * as service from './gps.service';

// Rotas do APP (motorista autenticado). Montadas em /api/app.
export const appRouter = Router();

appRouter.use(requireAuth, requireMotorista);

// Viagens do próprio motorista (em andamento primeiro).
appRouter.get(
  '/viagens',
  asyncHandler(async (req, res) => {
    res.json(await service.getMinhasViagens(req.user!.empresaId, req.user!.sub));
  }),
);

// Ingestão de posições GPS (lote) de uma viagem do motorista.
appRouter.post(
  '/viagens/:id/posicoes',
  validate({ params: idParamSchema, body: ingestPosicoesSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.ingestPosicoes(
      req.user!.empresaId,
      req.params.id!,
      req.user!.sub,
      req.body,
    );
    res.status(201).json(result);
  }),
);

// Ingestão "sem ID": grava na viagem em_andamento do motorista (URL fixa para
// apps de rastreio em 2º plano que não sabem o id da viagem).
appRouter.post(
  '/posicoes',
  validate({ body: ingestPosicoesSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.ingestPosicoesViagemAtual(
      req.user!.empresaId,
      req.user!.sub,
      req.body,
    );
    res.status(201).json(result);
  }),
);

// --- Adaptadores de apps de rastreio (iOS) + beacon do app web ---
// Router sem requireAuth: estes clientes não enviam header Authorization, então
// o token de dispositivo vem na query (?token=...). Montado em /api/app.
export const deviceRouter = Router();

// Resolve o motorista pelo token vindo do cabeçalho ou da query. Este router
// NÃO passa pelo requireAuth, então repete as mesmas travas: motorista demitido
// (device token de 365d não é revogável por si só) e empresa com assinatura
// suspensa param de ingerir GPS. Responde o erro e retorna null se não passar.
async function motoristaDoDispositivo(
  req: Request,
  res: Response,
): Promise<{ motoristaId: string; empresaId: string } | null> {
  // Preferimos o token por cabeçalho (não fica gravado em logs de acesso);
  // a query (?token=) segue como reserva para clientes que só sabem mandar URL.
  const header = req.headers.authorization;
  const tokenHeader = header?.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  const tokenCustom =
    typeof req.headers['x-device-token'] === 'string' ? req.headers['x-device-token'] : '';
  const tokenQuery = typeof req.query.token === 'string' ? req.query.token : '';
  const token = tokenHeader || tokenCustom || tokenQuery;
  let motoristaId: string | null = null;
  let empresaId: string | null = null;
  try {
    const payload = verifyAccessToken(token);
    if (payload.tipo === 'motorista') {
      motoristaId = payload.sub;
      empresaId = payload.empresaId;
    }
  } catch {
    /* token inválido tratado abaixo */
  }
  if (!motoristaId || !empresaId) {
    res.status(401).json({ result: 'error', error: 'Token de dispositivo inválido' });
    return null;
  }
  if (!(await motoristaEstaAtivo(motoristaId))) {
    res.status(401).json({ result: 'error', error: 'Motorista inativo ou sem acesso' });
    return null;
  }
  if (empresaBloqueada(await statusDaEmpresa(empresaId))) {
    res.status(403).json({ result: 'error', error: 'Assinatura suspensa' });
    return null;
  }
  return { motoristaId, empresaId };
}

// Overland (iOS). Posta GeoJSON e exige resposta {"result":"ok"} para confirmar
// o lote; qualquer outra coisa faz o app reenviar depois (sem perder dados).
deviceRouter.post(
  '/overland',
  asyncHandler(async (req, res) => {
    const quem = await motoristaDoDispositivo(req, res);
    if (!quem) return;
    const result = await service.ingestOverland(quem.empresaId, quem.motoristaId, req.body);
    res
      .status(200)
      .json({ result: 'ok', inseridas: result.inseridas, alertas: result.alertas.length });
  }),
);

// Flush final do app web do motorista via navigator.sendBeacon (aba fechando).
// sendBeacon não permite header Authorization → token na query, como no
// Overland. O corpo é o mesmo lote do POST normal de posições.
deviceRouter.post(
  '/posicoes-beacon',
  validate({ body: ingestPosicoesSchema }),
  asyncHandler(async (req, res) => {
    const quem = await motoristaDoDispositivo(req, res);
    if (!quem) return;
    // Viagem alvo opcional (?viagem=<uuid>); sem ela, cai na viagem em andamento.
    const viagemRaw = typeof req.query.viagem === 'string' ? req.query.viagem : '';
    const viagemId = idParamSchema.shape.id.safeParse(viagemRaw).success ? viagemRaw : '';
    const result = viagemId
      ? await service.ingestPosicoes(quem.empresaId, viagemId, quem.motoristaId, req.body)
      : await service.ingestPosicoesViagemAtual(quem.empresaId, quem.motoristaId, req.body);
    res.status(200).json({ result: 'ok', inseridas: result.inseridas });
  }),
);

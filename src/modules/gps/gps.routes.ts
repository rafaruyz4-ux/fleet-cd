import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { acessoDoMotorista, empresaBloqueada, statusDaEmpresa } from '../../middleware/acesso';
import { requireAuth, requireMotorista } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { verifyAccessToken } from '../../utils/jwt';
import { idParamSchema, ingestPosicoesSchema } from './gps.schemas';
import * as service from './gps.service';
import * as viagensService from '../viagens/viagens.service';
import * as veiculosService from '../veiculos/veiculos.service';
import { criarViagemMotoristaSchema } from '../viagens/viagens.schemas';

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

// Veículos ativos — pro motorista escolher ao criar a própria viagem.
appRouter.get(
  '/veiculos',
  asyncHandler(async (req, res) => {
    const todos = await veiculosService.list(req.user!.empresaId);
    res.json(
      todos.filter((v) => v.ativo).map((v) => ({ id: v.id, placa: v.placa, modelo: v.modelo })),
    );
  }),
);

// Motorista cria a própria viagem e já sai dirigindo (sem depender do gestor).
appRouter.post(
  '/viagens',
  validate({ body: criarViagemMotoristaSchema }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json(
        await viagensService.criarEIniciarPeloMotorista(
          req.user!.empresaId,
          req.user!.sub,
          req.body,
        ),
      );
  }),
);

// Motorista carimba a saída da própria viagem (botão "Iniciar viagem" do app).
appRouter.post(
  '/viagens/:id/iniciar',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await viagensService.iniciarPeloMotorista(req.user!.empresaId, req.params.id!, req.user!.sub),
    );
  }),
);

// Motorista encerra a própria viagem (fim do expediente, sem gestor).
appRouter.post(
  '/viagens/:id/encerrar',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(
      await viagensService.encerrarPeloMotorista(
        req.user!.empresaId,
        req.params.id!,
        req.user!.sub,
      ),
    );
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
// NÃO passa pelo requireAuth, então repete as mesmas travas: motorista demitido,
// device token de versão antiga (revogado via token_version) e empresa com
// assinatura suspensa param de ingerir GPS. Responde o erro e retorna null.
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
  let tokenVersion = 0;
  try {
    const payload = verifyAccessToken(token);
    if (payload.tipo === 'motorista') {
      motoristaId = payload.sub;
      empresaId = payload.empresaId;
      tokenVersion = payload.tokenVersion ?? 0;
    }
  } catch {
    /* token inválido tratado abaixo */
  }
  if (!motoristaId || !empresaId) {
    res.status(401).json({ result: 'error', error: 'Token de dispositivo inválido' });
    return null;
  }
  const acesso = await acessoDoMotorista(motoristaId);
  if (!acesso.ativo) {
    res.status(401).json({ result: 'error', error: 'Motorista inativo ou sem acesso' });
    return null;
  }
  // Token de versão antiga = revogado pelo gestor (celular perdido/roubado).
  if (tokenVersion !== acesso.tokenVersion) {
    res.status(401).json({ result: 'error', error: 'Token revogado — gere um novo no dashboard' });
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

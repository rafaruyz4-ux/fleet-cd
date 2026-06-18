import { Router } from 'express';
import { authRouter } from './modules/auth/auth.routes';
import { motoristasRouter } from './modules/motoristas/motoristas.routes';
import { veiculosRouter } from './modules/veiculos/veiculos.routes';
import { unidadesRouter } from './modules/unidades/unidades.routes';
import { nfsRouter } from './modules/nfs/nfs.routes';
import { viagensRouter } from './modules/viagens/viagens.routes';
import { rotasRouter } from './modules/rotas/rotas.routes';
import { alertasRouter } from './modules/alertas/alertas.routes';
import { appRouter, deviceRouter } from './modules/gps/gps.routes';
import { multasRouter } from './modules/multas/multas.routes';

export const apiRouter = Router();

apiRouter.use('/auth', authRouter);
apiRouter.use('/motoristas', motoristasRouter);
apiRouter.use('/veiculos', veiculosRouter);
apiRouter.use('/unidades', unidadesRouter);
apiRouter.use('/nfs', nfsRouter);
apiRouter.use('/viagens', viagensRouter);
apiRouter.use('/rotas', rotasRouter);
apiRouter.use('/alertas', alertasRouter);
apiRouter.use('/app', deviceRouter); // adaptadores (token na query) antes do appRouter
apiRouter.use('/app', appRouter);
apiRouter.use('/multas', multasRouter);

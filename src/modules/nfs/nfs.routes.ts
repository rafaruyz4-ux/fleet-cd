import { Router } from 'express';
import { asyncHandler } from '../../middleware/asyncHandler';
import { requireAuth, requireUsuario } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import {
  consultarSefazSchema,
  createNfSchema,
  idParamSchema,
  importarXmlSchema,
  type ListNfsQuery,
  listNfsQuerySchema,
  updateNfSchema,
} from './nfs.schemas';
import * as service from './nfs.service';
import { importarNfeXml } from '../../integrations/nfe/import.service';
import { consultarNfeXml } from '../../integrations/sefaz/client';

export const nfsRouter = Router();

nfsRouter.use(requireAuth, requireUsuario);

// --- Integração NF-e (Sprint 7) ---
// Import manual: recebe o XML da NF-e e cria a NF + itens.
nfsRouter.post(
  '/importar',
  validate({ body: importarXmlSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await importarNfeXml(req.body.xml));
  }),
);

// Consulta à SEFAZ por chave (pronta para configurar; 501 sem certificado).
nfsRouter.post(
  '/sefaz',
  validate({ body: consultarSefazSchema }),
  asyncHandler(async (req, res) => {
    const xml = await consultarNfeXml(req.body.chave_acesso);
    res.status(201).json(await importarNfeXml(xml));
  }),
);

nfsRouter.get(
  '/',
  validate({ query: listNfsQuerySchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.query as unknown as ListNfsQuery));
  }),
);

nfsRouter.get(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.getById(req.params.id!));
  }),
);

nfsRouter.post(
  '/',
  validate({ body: createNfSchema }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.create(req.body));
  }),
);

nfsRouter.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateNfSchema }),
  asyncHandler(async (req, res) => {
    res.json(await service.update(req.params.id!, req.body));
  }),
);

nfsRouter.delete(
  '/:id',
  validate({ params: idParamSchema }),
  asyncHandler(async (req, res) => {
    await service.remove(req.params.id!);
    res.status(204).send();
  }),
);

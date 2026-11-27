// Express app: JSON API under /api, the React client for everything else.

import express, { type NextFunction, type Request, type Response } from 'express';
import { DailyService, UserError } from './service.js';

export function createApp(service: DailyService): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());

  const api = express.Router();
  // Never cache API responses (the show view polls).
  api.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  const h =
    (fn: (req: Request) => Promise<unknown>) =>
    (req: Request, res: Response, next: NextFunction) => {
      fn(req).then((data) => res.json(data ?? { ok: true }), next);
    };
  const id = (req: Request) => Number(req.params.id);

  api.get('/state', h(() => service.moderatorState()));
  api.get('/show', h(() => service.showState()));

  api.post('/members', h((req) => service.addMember(String(req.body?.name ?? ''), req.body?.group ?? null)));
  api.patch('/members/:id', h((req) => service.updateMember(id(req), req.body ?? {})));
  api.delete('/members/:id', h((req) => service.deleteMember(id(req))));

  api.post('/session/attendance/:id', h((req) => service.setPresent(id(req), Boolean(req.body?.present))));
  api.post('/session/slots/:id/load', h((req) => service.loadSlot(id(req))));
  api.post('/session/slots/clear', h(() => service.clearSlots()));
  api.post('/session/select', h((req) => service.select(String(req.body?.candidateId ?? ''))));
  api.post('/session/draw', h(() => service.draw()));
  api.post('/session/speaker', h((req) => service.setSpeaker(Number(req.body?.index))));
  api.post('/session/next', h(() => service.step(1)));
  api.post('/session/prev', h(() => service.step(-1)));
  api.post('/session/reveal', h(() => service.reveal()));
  api.post('/session/new', h(() => service.newDaily()));

  api.delete('/runs/:id', h((req) => service.deleteRun(id(req))));

  api.use((_req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  api.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof UserError) return res.status(400).json({ error: err.message });
    console.error(err);
    res.status(500).json({ error: 'Internal error' });
  });

  app.use('/api', api);
  app.get('/healthz', (_req, res) => res.send('ok'));
  return app;
}

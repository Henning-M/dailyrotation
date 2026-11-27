// Entry point. In development the Vite dev server runs as middleware (one process, one port);
// in production the built client is served from dist/client.

import path from 'node:path';
import express from 'express';
import { createApp } from './app.js';
import { config } from './config.js';
import { createDb, migrate } from './db/index.js';
import { Repo } from './repo.js';
import { DailyService } from './service.js';
import { SOURCES } from './sources/registry.js';

const db = await createDb();
await migrate(db);
const service = new DailyService(new Repo(db), SOURCES);
const app = createApp(service);

// The compiled server (dist/) always serves the built client; `npm run dev` (tsx) uses Vite.
const fromBuild = import.meta.url.includes('/dist/server/');
if (config.production || fromBuild) {
  const clientDir = path.join(process.cwd(), 'dist', 'client');
  app.use(express.static(clientDir, { index: false }));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(clientDir, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.listen(config.port, () => {
  console.log(`Daily Ranking Roulette on http://localhost:${config.port}/moderator  (db: ${db.kind})`);
});

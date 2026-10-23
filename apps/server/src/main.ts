import { serve } from '@hono/node-server';
import { WebSocketServer } from 'ws';
import { createApp } from './api/app.ts';
import { loadConfig, loadDotEnv } from './config.ts';
import { createShack } from './shack.ts';

loadDotEnv();
const config = loadConfig();
const shack = createShack(config);
const stopWatching = shack.registry.watch();
const { app } = createApp(shack);

const server = serve(
  { fetch: app.fetch, hostname: config.host, port: config.port, websocket: { server: new WebSocketServer({ noServer: true }) } },
  (info) => {
    const base = `http://${config.host}:${info.port}/api/v1`;
    const agents = shack.registry.list().map((a) => (a.manifest ? a.id : `${a.id} (desativado: ${a.error})`));
    console.log(`The Shack no ar em ${base}`);
    console.log(`Agentes: ${agents.join(', ') || 'nenhum'}`);
    console.log(`Documentação: ${base}/openapi.json`);
  },
);

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  console.log('Desligando a Shack…');
  stopWatching();
  shack.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

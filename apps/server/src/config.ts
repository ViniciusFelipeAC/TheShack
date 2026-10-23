import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/** Raiz do monorepo (apps/server/src -> ../../..). */
export const ROOT = resolve(import.meta.dirname, '../../..');

const Env = z.object({
  SHACK_HOST: z.string().default('127.0.0.1'),
  SHACK_PORT: z.coerce.number().int().min(0).max(65535).default(4321),
  SHACK_TZ: z.string().default('America/Sao_Paulo'),
  SHACK_DB_PATH: z.string().default('./data/shack.db'),
  SHACK_AGENTS_DIR: z.string().default('./agents'),
  SHACK_FALLBACK_MODEL: z.string().default('sonnet'),
  SHACK_RUNNER: z.enum(['sdk', 'simulated']).default('sdk'),
  SHACK_EVENT_RETENTION_DAYS: z.coerce.number().int().min(1).default(30),
  SHACK_WEB_DIR: z.string().default('./apps/web/dist'),
});

export type Config = {
  host: string;
  port: number;
  timezone: string;
  dbPath: string;
  agentsDir: string;
  fallbackModel: string;
  /** sdk: etnaD de verdade (Claude Code). simulated: finge trabalhar, sem gastar cota. */
  runner: 'sdk' | 'simulated';
  eventRetentionDays: number;
  /** Build do app web (npm run build). O servidor entrega o app no mesmo endereço da API, como o celular precisa. */
  webDir: string;
};

/** Carrega o .env da raiz, se existir. Variáveis já definidas no ambiente têm prioridade. */
export function loadDotEnv(): void {
  const file = resolve(ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const e = Env.parse(env);
  return {
    host: e.SHACK_HOST,
    port: e.SHACK_PORT,
    timezone: e.SHACK_TZ,
    dbPath: e.SHACK_DB_PATH === ':memory:' ? ':memory:' : resolve(ROOT, e.SHACK_DB_PATH),
    agentsDir: resolve(ROOT, e.SHACK_AGENTS_DIR),
    fallbackModel: e.SHACK_FALLBACK_MODEL,
    runner: e.SHACK_RUNNER,
    eventRetentionDays: e.SHACK_EVENT_RETENTION_DAYS,
    webDir: resolve(ROOT, e.SHACK_WEB_DIR),
  };
}

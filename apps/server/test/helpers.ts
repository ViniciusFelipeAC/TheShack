import { cpSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulatedRunner } from '../src/agents/simulated.ts';
import { createApp } from '../src/api/app.ts';
import { type Config, ROOT } from '../src/config.ts';
import { createShack } from '../src/shack.ts';
import { FakeEngine } from './fake-engine.ts';

/** Shack isolada: banco em memória (ou arquivo temporário), cópia da pasta agents/ e Renfield falso. */
export function setup(opts: { stepMs?: number; dbFile?: boolean; productionRunners?: boolean } = {}) {
  const engine = new FakeEngine();
  const dir = mkdtempSync(join(tmpdir(), 'shack-test-'));
  const agentsDir = join(dir, 'agents');
  cpSync(join(ROOT, 'agents'), agentsDir, { recursive: true });
  const config: Config = {
    host: '127.0.0.1', port: 0, timezone: 'America/Sao_Paulo',
    dbPath: opts.dbFile ? join(dir, 'shack.db') : ':memory:', agentsDir,
    fallbackModel: 'sonnet', runner: opts.productionRunners ? 'sdk' : 'simulated', eventRetentionDays: 30,
    webDir: join(dir, 'web'), uploadsDir: join(dir, 'uploads'),
  };
  // Relógio controlado pelo teste (lembretes, alarmes e timers) e push falso.
  let current: Date | null = null;
  const clock = () => current ?? new Date();
  const setNow = (iso: string | Date) => { current = new Date(iso); };
  const advance = (ms: number) => { current = new Date(clock().getTime() + ms); return current; };
  const pushes: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
  let pushFails: number | null = null;
  const pushSender = async (sub: { endpoint: string }, payload: string) => {
    if (pushFails) throw Object.assign(new Error('push recusado'), { statusCode: pushFails });
    pushes.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
  };
  const make = (stepMs = opts.stepMs ?? 5) => createShack(config, {
    runner: opts.productionRunners ? undefined : simulatedRunner({ stepMs }), engine, progressThrottleMs: 0,
    clock, startScheduler: false, pushSender,
  });
  const shack = make();
  const { app } = createApp(shack);
  const { token, device } = shack.auth.createDevice('Teste', 'cli');
  const projectDir = join(dir, 'projeto');
  mkdirSync(projectDir);
  const ws = shack.workspaces.create({ name: 'projeto', path: projectDir, autoApprove: [], gitBranching: true });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const call = async (method: string, path: string, body?: unknown, tok: string | null = token): Promise<{ status: number; body: any }> => {
    const headers: Record<string, string> = {};
    if (tok) headers.authorization = `Bearer ${tok}`;
    if (body !== undefined) headers['content-type'] = 'application/json';
    const res = await app.request(`/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try { shack.close(); } catch { /* já fechada */ }
    rmSync(dir, { recursive: true, force: true });
  };
  return {
    shack, app, token, device, call, cleanup, agentsDir, config, make, engine, ws, dir,
    clock, setNow, advance, pushes, failPush: (status: number | null) => { pushFails = status; },
  };
}

export async function waitFor<T>(fn: () => T | Promise<T>, what: string, timeoutMs = 3000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error(`Tempo esgotado esperando: ${what}`);
    await new Promise((r) => setTimeout(r, 10));
  }
}

import { existsSync, type FSWatcher, readdirSync, readFileSync, watch, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { AgentManifest } from '@shack/shared';
import { parse as parseYaml } from 'yaml';
import { conflict, notFound } from '../errors.ts';
import type { EventBus } from './events.ts';

export type AgentDef = {
  id: string;
  dir: string;
  /** Nulo quando o manifesto é inválido; o agente fica desativado. */
  manifest: AgentManifest | null;
  persona: string;
  error: string | null;
};

/** Lê `agents/<id>/agent.yaml` e a persona. Uma pasta nova vira um agente novo. */
export class Registry {
  #dir: string;
  #bus: EventBus | null;
  #agents = new Map<string, AgentDef>();
  #stamps = new Map<string, string>();
  #watcher: FSWatcher | null = null;
  #timer: NodeJS.Timeout | undefined;

  constructor(dir: string, bus: EventBus | null) {
    this.#dir = dir;
    this.#bus = bus;
  }

  /** Relê todas as pastas. Publica `agent.updated` para o que mudou, a não ser no carregamento silencioso. */
  load(opts: { silent?: boolean } = {}): void {
    const folders = existsSync(this.#dir)
      ? readdirSync(this.#dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
      : [];
    const next = new Map<string, AgentDef>();
    for (const folder of folders) next.set(folder, this.#read(folder));

    const changes: Array<{ id: string; change: 'added' | 'changed' | 'removed' }> = [];
    for (const [id, def] of next) {
      const stamp = JSON.stringify(def);
      const before = this.#stamps.get(id);
      if (before !== stamp) changes.push({ id, change: before === undefined ? 'added' : 'changed' });
      this.#stamps.set(id, stamp);
    }
    for (const id of this.#agents.keys()) {
      if (!next.has(id)) { changes.push({ id, change: 'removed' }); this.#stamps.delete(id); }
    }
    this.#agents = next;

    if (opts.silent || !this.#bus) return;
    for (const c of changes) {
      const def = next.get(c.id);
      this.#bus.publish('agent.updated', { change: c.change, error: def?.error ?? null }, { agentId: c.id });
    }
  }

  /** Observa a pasta de agentes e recarrega após 250 ms sem mudanças. */
  watch(): () => void {
    if (!existsSync(this.#dir)) return () => {};
    this.#watcher = watch(this.#dir, { recursive: true }, () => {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => {
        try { this.load(); } catch (err) { console.error('[agentes] falha ao recarregar:', err); }
      }, 250);
    });
    return () => { this.#watcher?.close(); clearTimeout(this.#timer); };
  }

  list(): AgentDef[] {
    return [...this.#agents.values()];
  }

  get(id: string): AgentDef | null {
    return this.#agents.get(id) ?? null;
  }

  require(id: string): AgentDef {
    const def = this.get(id);
    if (!def) throw notFound(`Agente "${id}"`);
    return def;
  }

  writePersona(id: string, content: string): AgentDef {
    const def = this.require(id);
    if (!def.manifest) throw conflict(`O agente "${id}" está desativado: ${def.error}`);
    const path = this.#personaPath(def.dir, def.manifest.persona);
    if (!path) throw conflict('O caminho da persona precisa ficar dentro da pasta do agente.');
    writeFileSync(path, content, 'utf8');
    this.load();
    return this.require(id);
  }

  #read(folder: string): AgentDef {
    const dir = join(this.#dir, folder);
    const fail = (error: string): AgentDef => ({ id: folder, dir, manifest: null, persona: '', error });
    const file = join(dir, 'agent.yaml');
    if (!existsSync(file)) return fail('Arquivo agent.yaml não encontrado.');

    let raw: unknown;
    try { raw = parseYaml(readFileSync(file, 'utf8')); } catch (err) { return fail(`YAML inválido: ${(err as Error).message}`); }

    const parsed = AgentManifest.safeParse(raw);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
      return fail(`Manifesto inválido. ${issues}`);
    }
    if (parsed.data.id !== folder) return fail(`O id "${parsed.data.id}" precisa ser igual ao nome da pasta "${folder}".`);

    const personaPath = this.#personaPath(dir, parsed.data.persona);
    if (!personaPath) return fail('O caminho da persona precisa ficar dentro da pasta do agente.');
    const persona = existsSync(personaPath) ? readFileSync(personaPath, 'utf8') : '';
    return { id: folder, dir, manifest: parsed.data, persona, error: null };
  }

  #personaPath(dir: string, relative: string): string | null {
    const base = resolve(dir);
    const path = resolve(base, relative);
    return path.startsWith(base + sep) ? path : null;
  }
}

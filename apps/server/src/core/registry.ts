import { existsSync, type FSWatcher, readdirSync, readFileSync, statSync, watch, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
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
  /** Documentos de `knowledge`, na ordem do manifesto. Entram no prompt a cada tarefa. */
  knowledge: KnowledgeDoc[];
  error: string | null;
};

export type KnowledgeDoc = { name: string; content: string };

/** Teto da base de conhecimento: uns 10 mil tokens por tarefa. Acima disso, o agente fica desativado. */
export const KNOWLEDGE_MAX_CHARS = 40_000;

/** Lê `agents/<id>/agent.yaml` e a persona. Uma pasta nova vira um agente novo. */
export class Registry {
  #dir: string;
  #bus: EventBus | null;
  #agents = new Map<string, AgentDef>();
  #stamps = new Map<string, string>();
  #watcher: FSWatcher | null = null;
  #timer: NodeJS.Timeout | undefined;
  #validate: (m: AgentManifest) => string | null;

  /** `validate` confere o que o manifesto sozinho não sabe, como o navegador e as skills do runner design. */
  constructor(dir: string, bus: EventBus | null, validate: (m: AgentManifest) => string | null = () => null) {
    this.#dir = dir;
    this.#bus = bus;
    this.#validate = validate;
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
    const fail = (error: string): AgentDef => ({ id: folder, dir, manifest: null, persona: '', knowledge: [], error });
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
    const invalid = this.#validate(parsed.data);
    if (invalid) return fail(invalid);

    const personaPath = this.#personaPath(dir, parsed.data.persona);
    if (!personaPath) return fail('O caminho da persona precisa ficar dentro da pasta do agente.');
    const persona = existsSync(personaPath) ? readFileSync(personaPath, 'utf8') : '';
    const knowledge = this.#knowledge(dir, parsed.data.knowledge);
    if (typeof knowledge === 'string') return fail(knowledge);
    return { id: folder, dir, manifest: parsed.data, persona, knowledge, error: null };
  }

  #personaPath(dir: string, relative: string): string | null {
    const base = resolve(dir);
    const path = resolve(base, relative);
    return path.startsWith(base + sep) ? path : null;
  }

  /**
   * Lê os documentos de `knowledge`. O curinga "*" só vale no nome do arquivo ("knowledge/*.md").
   * Devolve a mensagem de erro quando um caminho sai da pasta do agente ou o total passa do teto.
   */
  #knowledge(dir: string, patterns: string[]): KnowledgeDoc[] | string {
    const docs: KnowledgeDoc[] = [];
    const seen = new Set<string>();
    for (const pattern of patterns) {
      const target = this.#personaPath(dir, pattern);
      if (!target) return `O caminho "${pattern}" de knowledge precisa ficar dentro da pasta do agente.`;
      const folder = dirname(target), name = basename(target);
      let files: string[];
      if (name.includes('*')) {
        const re = new RegExp(`^${name.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`, 'i');
        files = existsSync(folder) ? readdirSync(folder).filter((f) => re.test(f)).sort().map((f) => join(folder, f)) : [];
      } else {
        if (!existsSync(target)) return `O arquivo "${pattern}" de knowledge não existe.`;
        files = [target];
      }
      for (const file of files) {
        if (seen.has(file) || !statSync(file).isFile()) continue;
        seen.add(file);
        docs.push({ name: file.slice(resolve(dir).length + 1).replace(/\\/g, '/'), content: readFileSync(file, 'utf8') });
      }
    }
    const total = docs.reduce((n, d) => n + d.content.length, 0);
    if (total > KNOWLEDGE_MAX_CHARS) {
      return `A base de conhecimento tem ${total.toLocaleString('pt-BR')} caracteres e o teto é ${KNOWLEDGE_MAX_CHARS.toLocaleString('pt-BR')}. Tire ou resuma algum arquivo.`;
    }
    return docs;
  }
}

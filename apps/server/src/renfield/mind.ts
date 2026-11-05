import type { Memory, Mode, Rule } from '@shack/shared';
import type { MindRepo } from '../db/renfield-repos.ts';
import { notFound } from '../errors.ts';

type Source = Memory['source'];

const STOP = new Set(['que', 'para', 'com', 'uma', 'umas', 'uns', 'dos', 'das', 'por', 'como', 'mais', 'sobre', 'ele', 'ela', 'seu', 'sua', 'meu', 'minha', 'qual', 'quando', 'onde', 'tem', 'ter', 'foi', 'sao', 'nao', 'sim']);
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const words = (s: string) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !STOP.has(w));

/** Memórias, regras aprendidas e modos do Renfield. Tudo editável por você e por ele. */
export class Mind {
  #repo: MindRepo;
  #modeListeners = new Set<(prev: Mode | null, next: Mode | null) => void>();

  constructor(repo: MindRepo) {
    this.#repo = repo;
  }

  memories(): Memory[] { return this.#repo.memories(); }

  addMemory(content: string, kind: Memory['kind'], source: Source): Memory {
    return this.#repo.addMemory({ content, kind, source, isNew: source !== 'user' });
  }

  updateMemory(id: string, patch: Partial<Pick<Memory, 'content' | 'kind' | 'isNew'>>): Memory {
    const m = this.#repo.updateMemory(id, patch);
    if (!m) throw notFound('Memória');
    return m;
  }

  deleteMemory(id: string): void {
    if (!this.#repo.deleteMemory(id)) throw notFound('Memória');
  }

  /**
   * Busca por palavra, sem banco vetorial: conta quantas palavras da busca aparecem na memória.
   * Ignora acentos e maiúsculas, e palavras longas casam pelo radical ("reunião" acha "reuniões").
   */
  search(query: string, limit = 10): Memory[] {
    const terms = [...new Set(words(query))].map((w) => (w.length >= 6 ? w.slice(0, w.length - 2) : w));
    if (!terms.length) return [];
    return this.memories()
      .map((m) => { const text = fold(m.content); return { m, score: terms.filter((t) => text.includes(t)).length }; })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.m.updatedAt.localeCompare(a.m.updatedAt))
      .slice(0, limit)
      .map((x) => x.m);
  }

  rules(): Rule[] { return this.#repo.rules(); }

  addRule(instruction: string, trigger: string | null, source: Source): Rule {
    return this.#repo.addRule({ instruction, trigger, source, isNew: source !== 'user' });
  }

  updateRule(id: string, patch: Partial<Pick<Rule, 'trigger' | 'instruction' | 'enabled' | 'isNew'>>): Rule {
    const r = this.#repo.updateRule(id, patch);
    if (!r) throw notFound('Regra');
    return r;
  }

  deleteRule(id: string): void {
    if (!this.#repo.deleteRule(id)) throw notFound('Regra');
  }

  modes(): Mode[] { return this.#repo.modes(); }

  activeMode(): Mode | null { return this.modes().find((m) => m.active) ?? null; }

  defineMode(name: string, minPriority: Mode['minPriority'], description: string): Mode {
    this.#repo.upsertMode({ name, minPriority, description });
    return this.modes().find((m) => m.name === name)!;
  }

  setActiveMode(name: string | null): Mode | null {
    if (name !== null && !this.modes().some((m) => m.name === name)) throw notFound(`Modo "${name}"`);
    const prev = this.activeMode();
    this.#repo.setSetting('active_mode', name);
    const next = this.activeMode();
    for (const fn of this.#modeListeners) fn(prev, next);
    return next;
  }

  /** Avisa quando o modo ativo muda (por exemplo, para mandar o resumo do que ficou segurado). */
  onModeChange(fn: (prev: Mode | null, next: Mode | null) => void): void {
    this.#modeListeners.add(fn);
  }
}

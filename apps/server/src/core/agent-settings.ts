import { AgentSettings, type AgentSettingsInput } from '@shack/shared';
import { type Db, str } from '../db/database.ts';
import type { EventBus } from './events.ts';
import type { AgentDef } from './registry.ts';

const NONE: AgentSettings = { model: null, effort: null };
const key = (agentId: string) => `agent.${agentId}.settings`;

/**
 * Modelo e esforço escolhidos no app, como o /model e o /effort do Claude Code.
 * Ficam no banco, por cima do agent.yaml: o arquivo continua sendo o padrão e não muda no git,
 * e a troca vale em todos os aparelhos.
 */
export class AgentSettingsStore {
  #db: Db;
  #bus: EventBus;

  constructor(db: Db, bus: EventBus) {
    this.#db = db;
    this.#bus = bus;
  }

  get(agentId: string): AgentSettings {
    const raw = str(this.#db.prepare('SELECT value FROM settings WHERE key = ?').get(key(agentId))?.value);
    if (!raw) return NONE;
    try {
      const parsed = AgentSettings.safeParse(JSON.parse(raw));
      return parsed.success ? parsed.data : NONE;
    } catch { return NONE; }
  }

  /** Grava a troca e avisa os aparelhos. Sem troca nenhuma, a linha sai do banco. */
  set(agentId: string, patch: AgentSettingsInput): AgentSettings {
    const cur = this.get(agentId);
    const next: AgentSettings = {
      model: patch.model === undefined ? cur.model : patch.model,
      effort: patch.effort === undefined ? cur.effort : patch.effort,
    };
    if (!next.model && !next.effort) this.#db.prepare('DELETE FROM settings WHERE key = ?').run(key(agentId));
    else {
      this.#db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        .run(key(agentId), JSON.stringify(next));
    }
    this.#bus.publish('agent.updated', { change: 'settings', error: null }, { agentId });
    return next;
  }

  /**
   * O agente com a troca aplicada. O modelo escolhido vai na frente da lista do manifesto:
   * se ele sair do seu plano, os outros continuam como reserva.
   */
  apply(def: AgentDef): AgentDef {
    const m = def.manifest;
    if (!m) return def;
    const s = this.get(def.id);
    if (!s.model && !s.effort) return def;
    const models = [m.model].flat();
    return {
      ...def,
      manifest: {
        ...m,
        model: s.model ? [s.model, ...models.filter((x) => x !== s.model)] : m.model,
        effort: s.effort ?? m.effort,
      },
    };
  }
}

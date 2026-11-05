import { randomUUID } from 'node:crypto';
import type { Attachment, ChatMessage, ChatStyle, Conversation, Memory, MessageKind, Mode, Rule } from '@shack/shared';
import { type Db, now, str, tx } from './database.ts';

type Row = Record<string, unknown>;
const s = (v: unknown): string => String(v);
const b = (v: unknown): boolean => Number(v) === 1;

/* ---------- conversas e mensagens ---------- */
const toConversation = (r: Row): Conversation => ({ id: s(r.id), agentId: s(r.agent_id), title: s(r.title), createdAt: s(r.created_at), updatedAt: s(r.updated_at) });
const toMessage = (r: Row): ChatMessage => ({
  id: s(r.id), conversationId: s(r.conversation_id), role: r.role as ChatMessage['role'], kind: r.kind as MessageKind,
  text: s(r.text), style: str(r.style) as ChatStyle | null, taskId: str(r.task_id), deviceId: str(r.device_id), attachments: [], createdAt: s(r.created_at),
});
export const toAttachment = (r: Row): Attachment => ({
  id: s(r.id), name: s(r.name), mime: s(r.mime), kind: r.kind as Attachment['kind'], size: Number(r.size), createdAt: s(r.created_at),
});

/** Preenche os anexos de cada mensagem com uma consulta só. */
function withAttachments(db: Db, msgs: ChatMessage[]): ChatMessage[] {
  if (!msgs.length) return msgs;
  const rows = db.prepare(`SELECT * FROM attachments WHERE message_id IN (${msgs.map(() => '?').join(', ')}) ORDER BY rowid`).all(...msgs.map((m) => m.id));
  const byMessage = new Map<string, Attachment[]>();
  for (const r of rows) byMessage.set(s(r.message_id), [...(byMessage.get(s(r.message_id)) ?? []), toAttachment(r)]);
  return msgs.map((m) => ({ ...m, attachments: byMessage.get(m.id) ?? [] }));
}

export function chatRepo(db: Db) {
  const get = (id: string): Conversation | null => {
    const r = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id);
    return r ? toConversation(r) : null;
  };
  return {
    get,
    list(): Conversation[] {
      return db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all().map(toConversation);
    },
    create(agentId: string, title: string): Conversation {
      const id = randomUUID(), at = now();
      db.prepare('INSERT INTO conversations (id, agent_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, agentId, title, at, at);
      return get(id)!;
    },
    sessionId(id: string): string | null {
      return str(db.prepare('SELECT session_id FROM conversations WHERE id = ?').get(id)?.session_id);
    },
    setSessionId(id: string, sessionId: string | null): void {
      db.prepare('UPDATE conversations SET session_id = ? WHERE id = ?').run(sessionId, id);
    },
    /** Grava a mensagem e prende a ela os anexos ainda soltos, na mesma transação. */
    addMessage(m: Omit<ChatMessage, 'id' | 'createdAt' | 'attachments'>, attachmentIds: string[] = []): ChatMessage {
      const msg: ChatMessage = { ...m, id: randomUUID(), attachments: [], createdAt: now() };
      tx(db, () => {
        db.prepare(`INSERT INTO messages (id, conversation_id, role, kind, text, style, task_id, device_id, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(msg.id, msg.conversationId, msg.role, msg.kind, msg.text, msg.style, msg.taskId, msg.deviceId, msg.createdAt);
        for (const id of attachmentIds) db.prepare('UPDATE attachments SET message_id = ? WHERE id = ? AND message_id IS NULL').run(msg.id, id);
        db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(msg.createdAt, msg.conversationId);
      });
      return attachmentIds.length ? withAttachments(db, [msg])[0]! : msg;
    },
    /** As `limit` mensagens mais recentes antes de `before`, em ordem cronológica. */
    messages(conversationId: string, limit: number, before?: string): ChatMessage[] {
      const rows = before
        ? db.prepare('SELECT * FROM messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(conversationId, before, limit)
        : db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?').all(conversationId, limit);
      return withAttachments(db, rows.map(toMessage).reverse());
    },
  };
}
export type ChatRepo = ReturnType<typeof chatRepo>;

/* ---------- memórias, regras, modos, ajustes ---------- */
const toMemory = (r: Row): Memory => ({
  id: s(r.id), content: s(r.content), kind: r.kind as Memory['kind'], source: r.source as Memory['source'],
  isNew: b(r.is_new), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
});
const toRule = (r: Row): Rule => ({
  id: s(r.id), trigger: str(r.trigger), instruction: s(r.instruction), enabled: b(r.enabled), source: r.source as Rule['source'],
  isNew: b(r.is_new), createdAt: s(r.created_at), updatedAt: s(r.updated_at),
});

export function mindRepo(db: Db) {
  const memory = (id: string) => { const r = db.prepare('SELECT * FROM memories WHERE id = ?').get(id); return r ? toMemory(r) : null; };
  const rule = (id: string) => { const r = db.prepare('SELECT * FROM rules WHERE id = ?').get(id); return r ? toRule(r) : null; };
  const setting = (key: string): string | null => str(db.prepare('SELECT value FROM settings WHERE key = ?').get(key)?.value);
  return {
    memory,
    memories(): Memory[] { return db.prepare('SELECT * FROM memories ORDER BY created_at').all().map(toMemory); },
    addMemory(m: Pick<Memory, 'content' | 'kind' | 'source' | 'isNew'>): Memory {
      const id = randomUUID(), at = now();
      db.prepare('INSERT INTO memories (id, content, kind, source, is_new, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(id, m.content, m.kind, m.source, m.isNew ? 1 : 0, at, at);
      return memory(id)!;
    },
    updateMemory(id: string, p: Partial<Pick<Memory, 'content' | 'kind' | 'isNew'>>): Memory | null {
      const cur = memory(id); if (!cur) return null;
      const next = { ...cur, ...p };
      db.prepare('UPDATE memories SET content = ?, kind = ?, is_new = ?, updated_at = ? WHERE id = ?').run(next.content, next.kind, next.isNew ? 1 : 0, now(), id);
      return memory(id);
    },
    deleteMemory(id: string): boolean { return Number(db.prepare('DELETE FROM memories WHERE id = ?').run(id).changes) === 1; },

    rule,
    rules(): Rule[] { return db.prepare('SELECT * FROM rules ORDER BY created_at').all().map(toRule); },
    addRule(r: Pick<Rule, 'trigger' | 'instruction' | 'source' | 'isNew'>): Rule {
      const id = randomUUID(), at = now();
      db.prepare('INSERT INTO rules (id, trigger, instruction, enabled, source, is_new, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?, ?, ?)')
        .run(id, r.trigger, r.instruction, r.source, r.isNew ? 1 : 0, at, at);
      return rule(id)!;
    },
    updateRule(id: string, p: Partial<Pick<Rule, 'trigger' | 'instruction' | 'enabled' | 'isNew'>>): Rule | null {
      const cur = rule(id); if (!cur) return null;
      const next = { ...cur, ...p };
      db.prepare('UPDATE rules SET trigger = ?, instruction = ?, enabled = ?, is_new = ?, updated_at = ? WHERE id = ?')
        .run(next.trigger, next.instruction, next.enabled ? 1 : 0, next.isNew ? 1 : 0, now(), id);
      return rule(id);
    },
    deleteRule(id: string): boolean { return Number(db.prepare('DELETE FROM rules WHERE id = ?').run(id).changes) === 1; },

    modes(): Mode[] {
      const active = setting('active_mode');
      return db.prepare('SELECT * FROM modes ORDER BY name').all().map((r) => ({
        name: s(r.name), minPriority: r.min_priority as Mode['minPriority'], description: s(r.description), active: s(r.name) === active,
      }));
    },
    upsertMode(m: Pick<Mode, 'name' | 'minPriority' | 'description'>): void {
      db.prepare(`INSERT INTO modes (name, min_priority, description, created_at) VALUES (?, ?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET min_priority = excluded.min_priority, description = excluded.description`).run(m.name, m.minPriority, m.description, now());
    },
    setting,
    setSetting(key: string, value: string | null): void {
      if (value === null) db.prepare('DELETE FROM settings WHERE key = ?').run(key);
      else db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
    },
  };
}
export type MindRepo = ReturnType<typeof mindRepo>;

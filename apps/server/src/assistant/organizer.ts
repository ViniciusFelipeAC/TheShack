import { randomUUID } from 'node:crypto';
import type { ListItem, Note, TodoList } from '@shack/shared';
import type { EventBus } from '../core/events.ts';
import { type Db, now } from '../db/database.ts';
import { conflict, notFound } from '../errors.ts';

type Row = Record<string, unknown>;

/** Listas com itens marcáveis (compras, afazeres ou qualquer outra). */
export class Lists {
  #db: Db;
  #bus: EventBus;

  constructor(db: Db, bus: EventBus) {
    this.#db = db;
    this.#bus = bus;
  }

  all(): TodoList[] {
    return this.#db.prepare('SELECT * FROM lists ORDER BY name').all().map((r) => this.#withItems(r));
  }

  get(id: string): TodoList {
    const r = this.#db.prepare('SELECT * FROM lists WHERE id = ?').get(id);
    if (!r) throw notFound('Lista');
    return this.#withItems(r);
  }

  /** Aceita id ou nome, sem diferenciar maiúsculas. */
  find(ref: string): TodoList | null {
    const r = this.#db.prepare('SELECT * FROM lists WHERE id = ? OR name = ? COLLATE NOCASE').get(ref, ref);
    return r ? this.#withItems(r) : null;
  }

  create(name: string): TodoList {
    if (this.find(name)) throw conflict(`Já existe uma lista chamada "${name}".`);
    const id = randomUUID(), at = now();
    this.#db.prepare('INSERT INTO lists (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)').run(id, name, at, at);
    this.#changed();
    return this.get(id);
  }

  rename(id: string, name: string): TodoList {
    const cur = this.get(id);
    const other = this.find(name);
    if (other && other.id !== cur.id) throw conflict(`Já existe uma lista chamada "${name}".`);
    this.#db.prepare('UPDATE lists SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id);
    this.#changed();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.#db.prepare('DELETE FROM lists WHERE id = ?').run(id);
    this.#changed();
  }

  addItems(id: string, texts: string[]): TodoList {
    this.get(id);
    const at = now();
    for (const text of texts.map((t) => t.trim()).filter(Boolean)) {
      this.#db.prepare('INSERT INTO list_items (id, list_id, text, done, created_at) VALUES (?, ?, ?, 0, ?)').run(randomUUID(), id, text, at);
    }
    this.#touch(id);
    return this.get(id);
  }

  updateItem(id: string, itemId: string, patch: { text?: string; done?: boolean }): TodoList {
    const item = this.#item(id, itemId);
    this.#db.prepare('UPDATE list_items SET text = ?, done = ? WHERE id = ?').run(patch.text ?? item.text, (patch.done ?? item.done) ? 1 : 0, itemId);
    this.#touch(id);
    return this.get(id);
  }

  removeItem(id: string, itemId: string): TodoList {
    this.#item(id, itemId);
    this.#db.prepare('DELETE FROM list_items WHERE id = ?').run(itemId);
    this.#touch(id);
    return this.get(id);
  }

  /** Apaga os itens já marcados. */
  clearDone(id: string): TodoList {
    this.get(id);
    this.#db.prepare('DELETE FROM list_items WHERE list_id = ? AND done = 1').run(id);
    this.#touch(id);
    return this.get(id);
  }

  /** Item por id ou pelo texto (parcial, sem diferenciar maiúsculas). Usado pelo Renfield. */
  findItem(list: TodoList, ref: string): ListItem | null {
    const lower = ref.toLowerCase();
    return list.items.find((i) => i.id === ref) ?? list.items.find((i) => i.text.toLowerCase() === lower)
      ?? list.items.find((i) => i.text.toLowerCase().includes(lower)) ?? null;
  }

  #item(listId: string, itemId: string): ListItem {
    const item = this.get(listId).items.find((i) => i.id === itemId);
    if (!item) throw notFound('Item');
    return item;
  }

  #touch(id: string): void {
    this.#db.prepare('UPDATE lists SET updated_at = ? WHERE id = ?').run(now(), id);
    this.#changed();
  }

  #changed(): void {
    this.#bus.publish('data.changed', { entity: 'lists' });
  }

  #withItems(r: Row): TodoList {
    const items = this.#db.prepare('SELECT * FROM list_items WHERE list_id = ? ORDER BY done, created_at, rowid').all(String(r.id))
      .map((i) => ({ id: String(i.id), text: String(i.text), done: Number(i.done) === 1, createdAt: String(i.created_at) }));
    return { id: String(r.id), name: String(r.name), items, createdAt: String(r.created_at), updatedAt: String(r.updated_at) };
  }
}

/** Notas rápidas, com busca por texto. */
export class Notes {
  #db: Db;
  #bus: EventBus;

  constructor(db: Db, bus: EventBus) {
    this.#db = db;
    this.#bus = bus;
  }

  list(query?: string): Note[] {
    const rows = query?.trim()
      ? this.#db.prepare(`SELECT * FROM notes WHERE title LIKE ? OR content LIKE ? ORDER BY updated_at DESC LIMIT 100`).all(`%${query.trim()}%`, `%${query.trim()}%`)
      : this.#db.prepare('SELECT * FROM notes ORDER BY updated_at DESC LIMIT 100').all();
    return rows.map((r) => this.#map(r));
  }

  get(id: string): Note {
    const r = this.#db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    if (!r) throw notFound('Nota');
    return this.#map(r);
  }

  create(title: string, content: string): Note {
    const id = randomUUID(), at = now();
    const finalTitle = title.trim() || content.trim().split('\n')[0]!.slice(0, 60) || 'Sem título';
    this.#db.prepare('INSERT INTO notes (id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(id, finalTitle, content, at, at);
    this.#changed();
    return this.get(id);
  }

  update(id: string, patch: { title?: string; content?: string }): Note {
    const cur = this.get(id);
    this.#db.prepare('UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE id = ?').run(patch.title ?? cur.title, patch.content ?? cur.content, now(), id);
    this.#changed();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.#db.prepare('DELETE FROM notes WHERE id = ?').run(id);
    this.#changed();
  }

  #changed(): void {
    this.#bus.publish('data.changed', { entity: 'notes' });
  }

  #map(r: Row): Note {
    return { id: String(r.id), title: String(r.title), content: String(r.content), createdAt: String(r.created_at), updatedAt: String(r.updated_at) };
  }
}

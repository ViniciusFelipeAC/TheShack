import { randomUUID } from 'node:crypto';
import { type Habit, HabitColor } from '@shack/shared';
import type { EventBus } from '../core/events.ts';
import { type Db, now } from '../db/database.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

type Row = Record<string, unknown>;
const DAY_MS = 86_400_000;
/** Janela padrão dos dias devolvidos: um ano e uma semana cobre as 53 semanas da grade do Quadro. */
export const WINDOW_DAYS = 371;

// Dias viram números inteiros para contar sequências sem tropeçar em fuso ou horário de verão.
const toN = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y!, m! - 1, d!) / DAY_MS; };
const fromN = (n: number) => new Date(n * DAY_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => fromN(toN(day) + n);
/** Data de verdade no formato AAAA-MM-DD: "2026-02-30" não passa. */
export const isDay = (s: string): boolean => /^\d{4}-\d{2}-\d{2}$/.test(s) && fromN(toN(s)) === s;

const dayFormatters = new Map<string, Intl.DateTimeFormat>();
/** A data de `at` no fuso `tz`, como "2026-11-25". */
export function dayIn(tz: string, at: Date): string {
  let f = dayFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
    dayFormatters.set(tz, f);
  }
  const parts = f.formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Sequência atual e recorde. Hoje sem marca não quebra a sequência: o dia ainda não acabou. */
export function streaks(days: string[], today: string): { streak: number; best: number } {
  const set = new Set(days.map(toN));
  let best = 0, run = 0, prev = Number.NaN;
  for (const n of [...set].sort((a, b) => a - b)) {
    run = n === prev + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = n;
  }
  let cur = toN(today);
  if (!set.has(cur)) cur -= 1;
  let streak = 0;
  while (set.has(cur)) { streak++; cur--; }
  return { streak, best };
}

const WORDS: Record<string, number> = { hoje: 0, today: 0, ontem: -1, yesterday: -1, anteontem: -2 };
// O NOCASE do SQLite só iguala letras sem acento: "Água" e "água" passariam como nomes diferentes.
const fold = (s: string) => s.trim().toLocaleLowerCase('pt-BR');

/** Hábitos com a grade de dias feitos, como os quadradinhos de commits do GitHub. */
export class Habits {
  #db: Db;
  #bus: EventBus;
  #tz: string;
  #clock: () => Date;

  constructor(o: { db: Db; bus: EventBus; timezone: string; clock?: () => Date }) {
    this.#db = o.db;
    this.#bus = o.bus;
    this.#tz = o.timezone;
    this.#clock = o.clock ?? (() => new Date());
  }

  /** Hoje no fuso da casa. */
  today(): string {
    return dayIn(this.#tz, this.#clock());
  }

  /** "hoje", "ontem", "anteontem" ou AAAA-MM-DD. Sem nada, vale hoje. */
  resolveDay(ref?: string): string {
    const t = ref?.trim().toLowerCase();
    if (!t) return this.today();
    if (Object.hasOwn(WORDS, t)) return addDays(this.today(), WORDS[t]!);
    if (!isDay(t)) throw badRequest(`Dia inválido: "${ref}". Use AAAA-MM-DD.`);
    return t;
  }

  /** Na ordem em que foram criados. `from` (AAAA-MM-DD) limita os dias devolvidos; o padrão é o último ano. */
  all(from?: string): Habit[] {
    const start = this.#from(from);
    return this.#rows().map((r) => this.#map(r, start));
  }

  get(id: string, from?: string): Habit {
    const r = this.#db.prepare('SELECT * FROM habits WHERE id = ?').get(id);
    if (!r) throw notFound('Hábito');
    return this.#map(r, this.#from(from));
  }

  /** Por id, pelo nome inteiro ou por parte dele, sem diferenciar maiúsculas. Usado pelo Renfield. */
  find(ref: string): Habit | null {
    const t = ref.trim(), lower = fold(t);
    const rows = this.#rows();
    const r = rows.find((x) => x.id === t) ?? rows.find((x) => fold(String(x.name)) === lower) ?? rows.find((x) => fold(String(x.name)).includes(lower));
    return r ? this.#map(r, this.#from()) : null;
  }

  create(name: string, color?: HabitColor): Habit {
    this.#unique(name);
    // Sem cor escolhida, cada hábito novo pega o próximo tom, para as grades não ficarem iguais.
    const count = Number(this.#db.prepare('SELECT COUNT(*) AS n FROM habits').get()!.n);
    const id = randomUUID(), at = now();
    this.#db.prepare('INSERT INTO habits (id, name, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, name, color ?? HabitColor.options[count % HabitColor.options.length]!, at, at);
    this.#changed();
    return this.get(id);
  }

  update(id: string, patch: { name?: string; color?: HabitColor }): Habit {
    const cur = this.get(id);
    if (patch.name !== undefined) this.#unique(patch.name, id);
    this.#db.prepare('UPDATE habits SET name = ?, color = ?, updated_at = ? WHERE id = ?').run(patch.name ?? cur.name, patch.color ?? cur.color, now(), id);
    this.#changed();
    return this.get(id);
  }

  delete(id: string): void {
    this.get(id);
    this.#db.prepare('DELETE FROM habits WHERE id = ?').run(id);
    this.#changed();
  }

  /** Marca (ou desmarca) um dia. Dia futuro é recusado: a grade é do que já aconteceu. */
  mark(id: string, day: string, done: boolean): Habit {
    this.get(id);
    if (!isDay(day)) throw badRequest(`Dia inválido: "${day}". Use AAAA-MM-DD.`);
    if (day > this.today()) throw badRequest('Esse dia ainda não chegou.');
    if (done) this.#db.prepare('INSERT OR IGNORE INTO habit_days (habit_id, day, created_at) VALUES (?, ?, ?)').run(id, day, now());
    else this.#db.prepare('DELETE FROM habit_days WHERE habit_id = ? AND day = ?').run(id, day);
    this.#db.prepare('UPDATE habits SET updated_at = ? WHERE id = ?').run(now(), id);
    this.#changed();
    return this.get(id);
  }

  #unique(name: string, self?: string): void {
    const other = this.#rows().find((r) => fold(String(r.name)) === fold(name));
    if (other && other.id !== self) throw conflict(`Já existe um hábito chamado "${name}".`);
  }

  #rows(): Row[] {
    return this.#db.prepare('SELECT * FROM habits ORDER BY created_at, rowid').all();
  }

  #from(from?: string): string {
    if (from === undefined) return addDays(this.today(), -WINDOW_DAYS);
    if (!isDay(from)) throw badRequest(`Dia inválido: "${from}". Use AAAA-MM-DD.`);
    return from;
  }

  #changed(): void {
    this.#bus.publish('data.changed', { entity: 'habits' });
  }

  #map(r: Row, from: string): Habit {
    const all = this.#db.prepare('SELECT day FROM habit_days WHERE habit_id = ? ORDER BY day').all(String(r.id)).map((d) => String(d.day));
    const { streak, best } = streaks(all, this.today());
    const color = HabitColor.safeParse(r.color);
    return {
      id: String(r.id), name: String(r.name), color: color.success ? color.data : 'moss',
      days: all.filter((d) => d >= from), streak, best, total: all.length,
      createdAt: String(r.created_at), updatedAt: String(r.updated_at),
    };
  }
}

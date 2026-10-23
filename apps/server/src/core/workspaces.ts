import { randomUUID } from 'node:crypto';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute, join, parse, resolve, sep } from 'node:path';
import type { Workspace, WorkspaceInput, WorkspacePatch } from '@shack/shared';
import { type Db, now, parseJson } from '../db/database.ts';
import { badRequest, conflict, notFound } from '../errors.ts';

type Row = Record<string, unknown>;

/** Pastas onde o etnaD pode trabalhar. Ele nunca mexe fora delas. */
export class Workspaces {
  #db: Db;
  #protected: string[];

  /** `protectedPaths`: pastas que não podem virar workspace (por exemplo, a própria Shack). */
  constructor(db: Db, protectedPaths: string[] = []) {
    this.#db = db;
    this.#protected = protectedPaths.map((p) => resolve(p).toLowerCase());
  }

  list(): Workspace[] {
    return this.#db.prepare('SELECT * FROM workspaces ORDER BY name').all().map((r) => this.#map(r));
  }

  get(id: string): Workspace | null {
    const r = this.#db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
    return r ? this.#map(r) : null;
  }

  require(id: string): Workspace {
    const w = this.get(id);
    if (!w) throw notFound('Workspace');
    return w;
  }

  /** Aceita id ou nome (sem diferenciar maiúsculas). */
  find(ref: string): Workspace | null {
    const r = this.#db.prepare('SELECT * FROM workspaces WHERE id = ? OR name = ? COLLATE NOCASE').get(ref, ref);
    return r ? this.#map(r) : null;
  }

  create(input: WorkspaceInput): Workspace {
    const path = this.#validPath(input.path);
    if (this.find(input.name)) throw conflict(`Já existe um workspace chamado "${input.name}".`);
    if (this.list().some((w) => w.path.toLowerCase() === path.toLowerCase())) throw conflict('Essa pasta já é um workspace.');
    const id = randomUUID();
    this.#db.prepare('INSERT INTO workspaces (id, name, path, auto_approve, git_branching, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(id, input.name, path, JSON.stringify(input.autoApprove), input.gitBranching ? 1 : 0, now());
    return this.get(id)!;
  }

  update(id: string, patch: WorkspacePatch): Workspace {
    const cur = this.require(id);
    if (patch.name && patch.name.toLowerCase() !== cur.name.toLowerCase() && this.find(patch.name)) {
      throw conflict(`Já existe um workspace chamado "${patch.name}".`);
    }
    const next = { ...cur, ...patch };
    this.#db.prepare('UPDATE workspaces SET name = ?, auto_approve = ?, git_branching = ? WHERE id = ?')
      .run(next.name, JSON.stringify(next.autoApprove), next.gitBranching ? 1 : 0, id);
    return this.get(id)!;
  }

  delete(id: string): void {
    this.require(id);
    this.#db.prepare('DELETE FROM workspaces WHERE id = ?').run(id);
  }

  #validPath(raw: string): string {
    if (!isAbsolute(raw)) throw badRequest('Use o caminho completo da pasta, por exemplo C:\\Users\\voce\\projetos\\meu-app.');
    const path = resolve(raw);
    if (!existsSync(path) || !statSync(path).isDirectory()) throw badRequest(`A pasta "${path}" não existe.`);
    if (parse(path).root.toLowerCase() === path.toLowerCase()) throw badRequest('Escolha uma pasta de projeto, não a raiz do disco.');
    const lower = path.toLowerCase();
    const within = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(sep) ? parent : parent + sep);
    if (this.#protected.some((p) => within(lower, p) || within(p, lower))) {
      throw badRequest('Essa pasta contém a própria Shack. Escolha outra.');
    }
    return path;
  }

  #map(r: Row): Workspace {
    const path = String(r.path);
    return {
      id: String(r.id), name: String(r.name), path,
      autoApprove: parseJson<string[]>(r.auto_approve) ?? [],
      gitBranching: Number(r.git_branching) === 1,
      isGitRepo: existsSync(join(path, '.git')),
      createdAt: String(r.created_at),
    };
  }
}

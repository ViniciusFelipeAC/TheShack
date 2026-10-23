import type {
  Approval, ApprovalKind, ApprovalStatus, Device, DeviceKind, EventType, Priority, ShackEvent,
  Task, TaskHistoryEntry, TaskOrigin, TaskResult, TaskStatus, TaskUsage,
} from '@shack/shared';
import { type Db, json, now, parseJson, str } from './database.ts';

type Row = Record<string, unknown>;
const s = (v: unknown): string => String(v);

/* ---------- dispositivos ---------- */
const toDevice = (r: Row): Device => ({
  id: s(r.id), name: s(r.name), kind: r.kind as DeviceKind,
  createdAt: s(r.created_at), lastSeenAt: str(r.last_seen_at), revokedAt: str(r.revoked_at),
});

export function devicesRepo(db: Db) {
  const get = (id: string): Device | null => {
    const r = db.prepare('SELECT * FROM devices WHERE id = ?').get(id);
    return r ? toDevice(r) : null;
  };
  return {
    get,
    insert(d: { id: string; name: string; kind: DeviceKind; tokenHash: string }): Device {
      db.prepare('INSERT INTO devices (id, name, kind, token_hash, created_at) VALUES (?, ?, ?, ?, ?)').run(d.id, d.name, d.kind, d.tokenHash, now());
      return get(d.id)!;
    },
    byTokenHash(hash: string): Device | null {
      const r = db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(hash);
      return r ? toDevice(r) : null;
    },
    list(): Device[] {
      return db.prepare('SELECT * FROM devices ORDER BY created_at').all().map(toDevice);
    },
    touch(id: string, at: string): void {
      db.prepare('UPDATE devices SET last_seen_at = ? WHERE id = ?').run(at, id);
    },
    revoke(id: string, at: string): void {
      db.prepare('UPDATE devices SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(at, id);
    },
    insertPairing(codeHash: string, createdBy: string, expiresAt: string): void {
      db.prepare('INSERT INTO pairing_codes (code_hash, created_by, expires_at) VALUES (?, ?, ?)').run(codeHash, createdBy, expiresAt);
    },
    /** Marca o código como usado. Falso se não existir, já foi usado ou expirou. */
    usePairing(codeHash: string, at: string): boolean {
      const r = db.prepare('UPDATE pairing_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ?').run(at, codeHash, at);
      return Number(r.changes) === 1;
    },
  };
}
export type DevicesRepo = ReturnType<typeof devicesRepo>;

/* ---------- tarefas ---------- */
const toTask = (r: Row): Task => ({
  id: s(r.id), title: s(r.title), prompt: s(r.prompt), assignee: s(r.assignee),
  origin: parseJson<TaskOrigin>(r.origin)!, status: r.status as TaskStatus, priority: r.priority as Priority,
  workspaceId: str(r.workspace_id), parentId: str(r.parent_id), sessionId: str(r.session_id), model: str(r.model),
  result: parseJson<TaskResult>(r.result), error: str(r.error), usage: parseJson<TaskUsage>(r.usage), handoff: str(r.handoff),
  createdAt: s(r.created_at), startedAt: str(r.started_at), finishedAt: str(r.finished_at),
});

export type TaskPatch = Partial<Pick<Task, 'status' | 'result' | 'error' | 'startedAt' | 'finishedAt' | 'sessionId' | 'model' | 'usage' | 'handoff'>>;
const PATCH_COLUMNS: Record<keyof TaskPatch, [string, (v: unknown) => string | null]> = {
  status: ['status', (v) => str(v)], result: ['result', json], error: ['error', (v) => str(v)],
  startedAt: ['started_at', (v) => str(v)], finishedAt: ['finished_at', (v) => str(v)],
  sessionId: ['session_id', (v) => str(v)], model: ['model', (v) => str(v)], usage: ['usage', json],
  handoff: ['handoff', (v) => str(v)],
};
const encodeCursor = (t: Task) => Buffer.from(`${t.createdAt}|${t.id}`).toString('base64url');
const decodeCursor = (c: string): [string, string] => {
  const [at, id] = Buffer.from(c, 'base64url').toString().split('|');
  return [at ?? '', id ?? ''];
};

export function tasksRepo(db: Db) {
  const get = (id: string): Task | null => {
    const r = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return r ? toTask(r) : null;
  };
  return {
    get,
    insert(t: Task): void {
      db.prepare(`INSERT INTO tasks (id, title, prompt, assignee, origin, status, priority, workspace_id, parent_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(t.id, t.title, t.prompt, t.assignee, json(t.origin), t.status, t.priority, t.workspaceId, t.parentId, t.createdAt);
    },
    update(id: string, patch: TaskPatch): Task {
      const keys = Object.keys(patch) as Array<keyof TaskPatch>;
      if (keys.length) {
        const sets = keys.map((k) => `${PATCH_COLUMNS[k][0]} = ?`).join(', ');
        const values = keys.map((k) => PATCH_COLUMNS[k][1](patch[k]));
        db.prepare(`UPDATE tasks SET ${sets} WHERE id = ?`).run(...values, id);
      }
      return get(id)!;
    },
    list(f: { status?: TaskStatus; assignee?: string; limit: number; cursor?: string }): { items: Task[]; nextCursor: string | null } {
      const where: string[] = [];
      const args: string[] = [];
      if (f.status) { where.push('status = ?'); args.push(f.status); }
      if (f.assignee) { where.push('assignee = ?'); args.push(f.assignee); }
      if (f.cursor) { const [at, id] = decodeCursor(f.cursor); where.push('(created_at < ? OR (created_at = ? AND id < ?))'); args.push(at, at, id); }
      const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC, id DESC LIMIT ?`;
      const rows = db.prepare(sql).all(...args, f.limit + 1).map(toTask);
      const items = rows.slice(0, f.limit);
      return { items, nextCursor: rows.length > f.limit ? encodeCursor(items[items.length - 1]!) : null };
    },
    nextQueued(assignee: string): Task | null {
      const r = db.prepare(`SELECT * FROM tasks WHERE assignee = ? AND status = 'queued'
        ORDER BY CASE priority WHEN 'high' THEN 0 WHEN 'normal' THEN 1 ELSE 2 END, created_at, rowid LIMIT 1`).get(assignee);
      return r ? toTask(r) : null;
    },
    active(assignee: string): Task[] {
      return db.prepare(`SELECT * FROM tasks WHERE assignee = ? AND status IN ('running', 'waiting_input') ORDER BY started_at`).all(assignee).map(toTask);
    },
    withStatus(statuses: TaskStatus[]): Task[] {
      return db.prepare(`SELECT * FROM tasks WHERE status IN (${statuses.map(() => '?').join(', ')})`).all(...statuses).map(toTask);
    },
    /**
     * Nota de passagem que vale para uma tarefa nova no workspace: a da tentativa anterior da própria tarefa,
     * ou a da tarefa mais recente que terminou mal, desde que nada tenha sido concluído depois dela.
     */
    previousHandoff(workspaceId: string, taskId: string): { taskId: string; title: string; note: string } | null {
      const own = get(taskId);
      if (own?.handoff) return { taskId: own.id, title: own.title, note: own.handoff };
      const rows = db.prepare(`SELECT * FROM tasks WHERE workspace_id = ? AND id != ? AND status IN ('done', 'failed', 'cancelled')
        ORDER BY finished_at DESC, rowid DESC LIMIT 20`).all(workspaceId, taskId).map(toTask);
      for (const t of rows) {
        if (t.status === 'done') return null;
        if (t.handoff) return { taskId: t.id, title: t.title, note: t.handoff };
      }
      return null;
    },
    lastFinished(assignee: string): Task | null {
      const r = db.prepare(`SELECT * FROM tasks WHERE assignee = ? AND status IN ('done', 'failed', 'cancelled') ORDER BY finished_at DESC LIMIT 1`).get(assignee);
      return r ? toTask(r) : null;
    },
    addHistory(taskId: string, status: TaskStatus, note: string | null, at: string): void {
      db.prepare('INSERT INTO task_history (task_id, status, note, at) VALUES (?, ?, ?, ?)').run(taskId, status, note, at);
    },
    history(taskId: string): TaskHistoryEntry[] {
      return db.prepare('SELECT status, note, at FROM task_history WHERE task_id = ? ORDER BY id').all(taskId)
        .map((r) => ({ status: r.status as TaskStatus, note: str(r.note), at: s(r.at) }));
    },
    errorClearedAt(agentId: string): string | null {
      return str(db.prepare('SELECT error_cleared_at FROM agent_flags WHERE agent_id = ?').get(agentId)?.error_cleared_at);
    },
    clearError(agentId: string, at: string): void {
      db.prepare(`INSERT INTO agent_flags (agent_id, error_cleared_at) VALUES (?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET error_cleared_at = excluded.error_cleared_at`).run(agentId, at);
    },
  };
}
export type TasksRepo = ReturnType<typeof tasksRepo>;

/* ---------- eventos ---------- */
const toEvent = (r: Row): ShackEvent => ({
  seq: Number(r.seq), id: s(r.id), ts: s(r.ts), type: r.type as EventType,
  agentId: str(r.agent_id), taskId: str(r.task_id), data: parseJson(r.data),
});

export function eventsRepo(db: Db) {
  return {
    insert(e: Omit<ShackEvent, 'seq'>): number {
      const r = db.prepare('INSERT INTO events (id, ts, type, agent_id, task_id, data) VALUES (?, ?, ?, ?, ?, ?)')
        .run(e.id, e.ts, e.type, e.agentId, e.taskId, json(e.data) ?? 'null');
      return Number(r.lastInsertRowid);
    },
    list(f: { since: number; limit: number; type?: EventType; agentId?: string; taskId?: string }): ShackEvent[] {
      const where = ['seq > ?'];
      const args: Array<string | number> = [f.since];
      if (f.type) { where.push('type = ?'); args.push(f.type); }
      if (f.agentId) { where.push('agent_id = ?'); args.push(f.agentId); }
      if (f.taskId) { where.push('task_id = ?'); args.push(f.taskId); }
      return db.prepare(`SELECT * FROM events WHERE ${where.join(' AND ')} ORDER BY seq LIMIT ?`).all(...args, f.limit).map(toEvent);
    },
    lastSeq(): number {
      return Number(db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM events').get()?.seq ?? 0);
    },
    pruneBefore(ts: string): number {
      return Number(db.prepare('DELETE FROM events WHERE ts < ?').run(ts).changes);
    },
  };
}
export type EventsRepo = ReturnType<typeof eventsRepo>;

/* ---------- aprovações ---------- */
const toApproval = (r: Row): Approval => ({
  id: s(r.id), agentId: s(r.agent_id), taskId: str(r.task_id), kind: r.kind as ApprovalKind,
  summary: s(r.summary), detail: parseJson(r.detail), options: parseJson<string[]>(r.options),
  status: r.status as ApprovalStatus, answer: str(r.answer), createdAt: s(r.created_at), resolvedAt: str(r.resolved_at),
});

export function approvalsRepo(db: Db) {
  const get = (id: string): Approval | null => {
    const r = db.prepare('SELECT * FROM approvals WHERE id = ?').get(id);
    return r ? toApproval(r) : null;
  };
  return {
    get,
    insert(a: Approval): void {
      db.prepare(`INSERT INTO approvals (id, agent_id, task_id, kind, summary, detail, options, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(a.id, a.agentId, a.taskId, a.kind, a.summary, json(a.detail), json(a.options), a.status, a.createdAt);
    },
    list(status?: ApprovalStatus): Approval[] {
      const rows = status
        ? db.prepare('SELECT * FROM approvals WHERE status = ? ORDER BY created_at DESC LIMIT 200').all(status)
        : db.prepare('SELECT * FROM approvals ORDER BY created_at DESC LIMIT 200').all();
      return rows.map(toApproval);
    },
    /** Resolve só se ainda estiver pendente. Retorna falso se outra resposta chegou antes. */
    resolve(id: string, status: ApprovalStatus, answer: string | null, by: string | null, at: string): boolean {
      const r = db.prepare(`UPDATE approvals SET status = ?, answer = ?, resolved_by = ?, resolved_at = ? WHERE id = ? AND status = 'pending'`)
        .run(status, answer, by, at, id);
      return Number(r.changes) === 1;
    },
    pending(taskId?: string): Approval[] {
      const rows = taskId
        ? db.prepare(`SELECT * FROM approvals WHERE status = 'pending' AND task_id = ?`).all(taskId)
        : db.prepare(`SELECT * FROM approvals WHERE status = 'pending'`).all();
      return rows.map(toApproval);
    },
  };
}
export type ApprovalsRepo = ReturnType<typeof approvalsRepo>;

import { type Habit, HabitColor } from '@shack/shared';
import { type FormEvent, type KeyboardEvent, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { dayKey, fromKey } from '../board.ts';
import { cellLabel, COLOR_NAMES, habitStats, habitWeeks, monthLabels, stepDay } from '../habits.ts';
import { api } from '../live.ts';
import { useFresh } from '../useFresh.ts';
import './habits.css';

const failure = (err: unknown) => (err instanceof Error ? err.message : 'Não deu certo.');

/** Hábitos no Quadro: uma grade por hábito, um quadradinho por dia, como os commits do GitHub. */
export function HabitsCard({ version }: { version: number }) {
  const [habits, setHabits] = useState<Habit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [today, setToday] = useState(() => dayKey(new Date()));
  // A grade vira o dia à meia-noite, mesmo com o Quadro aberto.
  useEffect(() => { const t = setInterval(() => setToday(dayKey(new Date())), 60_000); return () => clearInterval(t); }, []);
  const weeks = useMemo(() => habitWeeks(fromKey(today)), [today]);

  const load = () => api<Habit[]>('/habits').then((h) => { setHabits(h); setFailed(false); }).catch(() => setFailed(true));
  useEffect(() => { void load(); }, [version]);

  const ids = useMemo(() => habits?.flatMap((h) => h.days.map((d) => `${h.id}@${d}`)) ?? null, [habits]);
  const fresh = useFresh(ids, 'habits');
  const replace = (h: Habit) => setHabits((all) => all?.map((x) => (x.id === h.id ? h : x)) ?? null);
  const toggle = (h: Habit, day: string) => {
    const done = !h.days.includes(day);
    setError(null);
    // Muda na hora e confirma com o servidor; se ele recusar, volta como estava.
    replace({ ...h, days: done ? [...h.days, day].sort() : h.days.filter((d) => d !== day) });
    api<Habit>(`/habits/${h.id}/days/${day}`, { method: done ? 'PUT' : 'DELETE' }).then(replace)
      .catch((err) => { replace(h); setError(`Não consegui ${done ? 'marcar' : 'desmarcar'} "${h.name}": ${failure(err)}`); });
  };

  return (
    <section className="habits" aria-labelledby="habits-h">
      <div className="row between">
        <h3 id="habits-h">Hábitos</h3>
        <button className="btn small" type="button" aria-expanded={adding} onClick={() => setAdding(!adding)}>{adding ? 'Fechar' : 'Novo hábito'}</button>
      </div>
      {adding && (
        <NewHabit count={habits?.length ?? 0} onCreated={(h) => { setHabits((all) => [...(all ?? []), h]); setAdding(false); }} />
      )}
      {failed && !habits && <p className="error small">Hábitos indisponíveis agora. Confira se o servidor está no ar.</p>}
      {!failed && habits === null && <p className="muted small">Carregando…</p>}
      {habits?.length === 0 && !adding && (
        <p className="muted small">Nenhum hábito ainda. Crie um em "Novo hábito" ou conte ao Renfield o que quer acompanhar.</p>
      )}
      {error && <p className="error small">{error}</p>}
      {!!habits?.length && (
        <ul className="habit-list">
          {habits.map((h) => (
            <HabitRow key={h.id} habit={h} weeks={weeks} today={today} fresh={fresh} onToggle={toggle} onReplace={replace}
              onDeleted={() => setHabits((all) => all?.filter((x) => x.id !== h.id) ?? null)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function NewHabit({ count, onCreated }: { count: number; onCreated(h: Habit): void }) {
  const [name, setName] = useState('');
  // Já vem com o próximo tom, como o servidor faria, mas dá para trocar antes de criar.
  const [color, setColor] = useState<HabitColor>(HabitColor.options[count % HabitColor.options.length]!);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    api<Habit>('/habits', { method: 'POST', body: { name: name.trim(), color } }).then(onCreated).catch((err) => setError(failure(err)));
  };
  return (
    <form className="habit-form" onSubmit={submit}>
      <div className="row">
        <label htmlFor="habit-new" className="sr-only">Nome do hábito</label>
        <input id="habit-new" autoFocus value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="Ex.: ler 20 páginas, academia" autoComplete="off" />
        <button className="btn primary" type="submit" disabled={!name.trim()}>Criar</button>
      </div>
      <Swatches value={color} onPick={setColor} />
      {error && <p className="error small">{error}</p>}
    </form>
  );
}

type RowProps = {
  habit: Habit; weeks: string[][]; today: string; fresh: Set<string>;
  onToggle(h: Habit, day: string): void; onReplace(h: Habit): void; onDeleted(): void;
};

function HabitRow({ habit, weeks, today, fresh, onToggle, onReplace, onDeleted }: RowProps) {
  const [editing, setEditing] = useState(false);
  const doneToday = habit.days.includes(today);
  return (
    <li className="habit" data-hc={habit.color}>
      <div className="habit-head">
        <b className="habit-name">{habit.name}</b>
        <button className="btn small habit-today" type="button" aria-pressed={doneToday} onClick={() => onToggle(habit, today)}>
          {doneToday ? 'Feito hoje' : 'Marcar hoje'}
        </button>
        <button className="btn ghost small" type="button" aria-expanded={editing} aria-label={`Editar ${habit.name}`} onClick={() => setEditing(!editing)}>
          Editar
        </button>
        <span className="muted small habit-stats">{habitStats(habit, weeks[0]![0]!)}</span>
      </div>
      {editing && <HabitEdit habit={habit} onReplace={onReplace} onDeleted={onDeleted} onClose={() => setEditing(false)} />}
      <HabitGrid habit={habit} weeks={weeks} today={today} fresh={fresh} onToggle={onToggle} />
    </li>
  );
}

function HabitGrid({ habit, weeks, today, fresh, onToggle }: Pick<RowProps, 'habit' | 'weeks' | 'today' | 'fresh' | 'onToggle'>) {
  const scroller = useRef<HTMLDivElement>(null);
  // Só um quadradinho entra no Tab; as setas andam pela grade.
  const [focus, setFocus] = useState(today);
  const done = useMemo(() => new Set(habit.days), [habit.days]);
  const first = weeks[0]![0]!;
  // Abre no fim, em hoje, como o GitHub no celular: o passado fica rolando para a esquerda.
  useLayoutEffect(() => { const el = scroller.current; if (el) el.scrollLeft = el.scrollWidth; }, [weeks]);

  const keyDown = (e: KeyboardEvent) => {
    const next = stepDay(focus, e.key, first, today);
    if (!next) return;
    e.preventDefault();
    setFocus(next);
    scroller.current?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)?.focus();
  };

  return (
    <div className="hgrid-wrap">
      <div className="hgrid-wd" aria-hidden="true"><span /><span>seg</span><span /><span>qua</span><span /><span>sex</span><span /></div>
      <div className="hgrid-scroll" ref={scroller}>
        <div className="hgrid-months" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${weeks.length}, var(--cell))` }}>
          {monthLabels(weeks).map((m) => <span key={m.col} style={{ gridColumn: `${m.col + 1} / span 3` }}>{m.label}</span>)}
        </div>
        <div className="hgrid" role="group" aria-label={`${habit.name}: último ano, um quadradinho por dia`} onKeyDown={keyDown}>
          {weeks.flat().map((key) => {
            const on = done.has(key);
            return (
              <button
                key={key} type="button" className="hcell" data-day={key} tabIndex={key === focus ? 0 : -1}
                data-on={on || undefined} data-today={key === today || undefined} data-fresh={fresh.has(`${habit.id}@${key}`) || undefined}
                aria-pressed={on} aria-label={cellLabel(key, on)} title={cellLabel(key, on)}
                onClick={() => { setFocus(key); onToggle(habit, key); }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function HabitEdit({ habit, onReplace, onDeleted, onClose }: { habit: Habit; onReplace(h: Habit): void; onDeleted(): void; onClose(): void }) {
  const [name, setName] = useState(habit.name);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `habit-name-${habit.id}`;
  const patch = (body: { name?: string; color?: HabitColor }) => {
    setError(null);
    return api<Habit>(`/habits/${habit.id}`, { method: 'PATCH', body }).then((h) => { onReplace(h); return true; }).catch((err) => { setError(failure(err)); return false; });
  };
  const rename = (e: FormEvent) => { e.preventDefault(); if (name.trim()) void patch({ name: name.trim() }).then((ok) => ok && onClose()); };
  const remove = () => api(`/habits/${habit.id}`, { method: 'DELETE' }).then(onDeleted).catch((err) => setError(failure(err)));
  return (
    <div className="habit-form">
      <form className="row" onSubmit={rename}>
        <label htmlFor={id} className="sr-only">Nome do hábito</label>
        <input id={id} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        <button className="btn small" type="submit" disabled={!name.trim() || name.trim() === habit.name}>Renomear</button>
      </form>
      <Swatches value={habit.color} onPick={(c) => void patch({ color: c })} />
      <div className="row wrap">
        {confirm
          ? <button className="btn small danger" type="button" onClick={() => void remove()}>Apagar com todo o histórico</button>
          : <button className="btn small" type="button" onClick={() => setConfirm(true)}>Apagar hábito</button>}
        <button className="btn ghost small" type="button" onClick={onClose}>Fechar</button>
      </div>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

function Swatches({ value, onPick }: { value: HabitColor; onPick(c: HabitColor): void }) {
  return (
    <div className="swatches" role="radiogroup" aria-label="Cor dos quadradinhos">
      {HabitColor.options.map((c) => (
        <button key={c} type="button" role="radio" className="swatch" data-hc={c} aria-checked={c === value} aria-label={COLOR_NAMES[c]} title={COLOR_NAMES[c]} onClick={() => onPick(c)} />
      ))}
    </div>
  );
}

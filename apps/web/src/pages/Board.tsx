import type { AgentInfo, CalendarOccurrence, ChatMessage, TodoList } from '@shack/shared';
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { boardLists, dayKey, dayTitle, eventsByDay, fromKey, localIso, monthGrid, monthTitle, WEEKDAYS, whenText } from '../board.ts';
import type { Section } from '../Hud.tsx';
import { api } from '../live.ts';
import { Portrait } from '../Portrait.tsx';

type Props = {
  calendarVersion: number;
  listsVersion: number;
  /** O agente de chat (o Renfield). */
  agent: AgentInfo | null;
  /** A última resposta dele, para quem está no celular, onde o chat fica atrás do Quadro. */
  lastReply: ChatMessage | null;
  onSend(text: string): void;
  onOpen(section: Section): void;
};

/**
 * Itens que apareceram desde a última leitura, para piscarem quando o Renfield mexe pelo chat.
 * Trocar de `scope` (de mês, por exemplo) não conta como novidade.
 */
function useFresh(ids: string[] | null, scope: string): Set<string> {
  const seen = useRef<{ scope: string; ids: Set<string> } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const sig = ids?.join('|') ?? null;
  useEffect(() => {
    if (!ids) return;
    const prev = seen.current;
    seen.current = { scope, ids: new Set(ids) };
    if (!prev || prev.scope !== scope) return;
    const added = ids.filter((id) => !prev.ids.has(id));
    if (!added.length) return;
    setFresh(new Set(added));
    const t = setTimeout(() => setFresh(new Set()), 2600);
    return () => clearTimeout(t);
  }, [sig, scope]);
  return fresh;
}

/** Calendário com a agenda do dia, lista de compras e afazeres. É o mesmo dado que o Renfield usa. */
export function BoardPage({ calendarVersion, listsVersion, agent, lastReply, onSend, onOpen }: Props) {
  const today = dayKey(new Date());
  const [cursor, setCursor] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<CalendarOccurrence[] | null>(null);
  const [lists, setLists] = useState<TodoList[] | null>(null);
  const [failed, setFailed] = useState({ calendar: false, lists: false });

  const weeks = useMemo(() => monthGrid(cursor.y, cursor.m), [cursor]);
  const monthKey = `${cursor.y}-${cursor.m}`;
  const loadEvents = () => {
    const from = weeks[0]![0]!, last = weeks[weeks.length - 1]![6]!;
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
    return api<CalendarOccurrence[]>(`/calendar/events?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`)
      .then((e) => { setEvents(e); setFailed((f) => ({ ...f, calendar: false })); })
      .catch(() => setFailed((f) => ({ ...f, calendar: true })));
  };
  const loadLists = () => api<TodoList[]>('/lists')
    .then((l) => { setLists(l); setFailed((f) => ({ ...f, lists: false })); })
    .catch(() => setFailed((f) => ({ ...f, lists: true })));
  useEffect(() => { setEvents(null); void loadEvents(); }, [monthKey]);
  useEffect(() => { if (calendarVersion) void loadEvents(); }, [calendarVersion]);
  useEffect(() => { void loadLists(); }, [listsVersion]);

  const byDay = useMemo(() => eventsByDay(events ?? []), [events]);
  const freshEvents = useFresh(events?.map((e) => `${e.id}@${e.occurrenceStart}`) ?? null, monthKey);
  const { shopping, todo } = boardLists(lists ?? []);
  const freshItems = useFresh(lists ? [...(shopping?.items ?? []), ...(todo?.items ?? [])].map((i) => i.id) : null, 'lists');

  const move = (delta: number) => setCursor(({ y, m }) => { const d = new Date(y, m + delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => { const d = new Date(); setCursor({ y: d.getFullYear(), m: d.getMonth() }); setSelected(today); };
  const pick = (d: Date) => {
    setSelected(dayKey(d));
    if (d.getMonth() !== cursor.m) setCursor({ y: d.getFullYear(), m: d.getMonth() });
  };
  const replace = (l: TodoList) => setLists((all) => all?.map((x) => (x.id === l.id ? l : x)) ?? null);
  const createList = (name: string) => api<TodoList>('/lists', { method: 'POST', body: { name } }).then(() => loadLists());

  return (
    <main className="page panel board">
      <header className="page-head">
        <h2>Quadro</h2>
        <p className="muted small">Calendário, compras e afazeres. É o mesmo quadro do Renfield: o que ele muda pelo chat aparece aqui na hora.</p>
      </header>
      <div className="page-body board-body">
        <RenfieldBar agent={agent} lastReply={lastReply} onSend={onSend} />
        <div className="board-grid">
          <section className="board-cal" aria-label="Calendário">
            <div className="row between cal-head">
              <h3>{monthTitle(cursor.y, cursor.m)}</h3>
              <div className="row">
                <button className="btn small" type="button" onClick={goToday}>Hoje</button>
                <button className="btn small" type="button" aria-label="Mês anterior" onClick={() => move(-1)}>‹</button>
                <button className="btn small" type="button" aria-label="Próximo mês" onClick={() => move(1)}>›</button>
              </div>
            </div>
            {failed.calendar && <p className="error small">Agenda indisponível agora. Confira se o servidor está no ar.</p>}
            <div className="cal" role="grid" aria-label={monthTitle(cursor.y, cursor.m)}>
              {WEEKDAYS.map((w) => <span key={w} className="cal-wd" role="columnheader">{w}</span>)}
              {weeks.flat().map((d) => {
                const key = dayKey(d), items = byDay.get(key) ?? [];
                return (
                  <button
                    key={key} type="button" role="gridcell" className="cal-day" aria-selected={key === selected}
                    data-out={d.getMonth() !== cursor.m || undefined} data-today={key === today || undefined}
                    data-fresh={items.some((e) => freshEvents.has(`${e.id}@${e.occurrenceStart}`)) || undefined}
                    aria-label={`${dayTitle(key)}${items.length ? `, ${items.length === 1 ? '1 compromisso' : `${items.length} compromissos`}` : ''}`}
                    onClick={() => pick(d)}
                  >
                    <span className="cal-n">{d.getDate()}</span>
                    <span className="cal-dots" aria-hidden="true">{items.slice(0, 3).map((e) => <i key={`${e.id}${e.occurrenceStart}`} />)}</span>
                    <span className="cal-evs" aria-hidden="true">
                      {items.slice(0, 2).map((e) => <span key={`${e.id}${e.occurrenceStart}`} className="ellipsis">{e.title}</span>)}
                      {items.length > 2 && <span className="muted">+{items.length - 2}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
            <DayAgenda
              day={selected} today={today} items={events === null ? null : byDay.get(selected) ?? []} fresh={freshEvents}
              onChanged={() => void loadEvents()} onOpenAgenda={() => onOpen('agenda')}
            />
          </section>
          <div className="board-lists">
            <ListCard title="Lista de compras" createName="Mercado" list={shopping} failed={failed.lists} loading={lists === null}
              fresh={freshItems} placeholder="Ex.: leite, café" onReplace={replace} onCreate={createList} />
            <ListCard title="Afazeres" createName="Afazeres" list={todo} failed={failed.lists} loading={lists === null}
              fresh={freshItems} placeholder="Ex.: pagar a conta de luz" onReplace={replace} onCreate={createList} />
            <button className="btn ghost small" type="button" onClick={() => onOpen('listas')}>Ver todas as listas</button>
          </div>
        </div>
      </div>
    </main>
  );
}

/** O Renfield no topo do Quadro: o que ele está fazendo e uma caixa para pedir sem sair daqui. */
function RenfieldBar({ agent, lastReply, onSend }: Pick<Props, 'agent' | 'lastReply' | 'onSend'>) {
  const [text, setText] = useState('');
  // Id da última resposta quando você pediu: a próxima que chegar é a dele para este pedido.
  const [before, setBefore] = useState<string | null | undefined>(undefined);
  const name = agent?.name ?? 'Renfield';
  const working = agent?.status === 'working';
  const reply = before !== undefined && lastReply && lastReply.id !== before ? lastReply : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text.trim());
    setBefore(lastReply?.id ?? null);
    setText('');
  };
  return (
    <section className="rbar" aria-label={`Pedir ao ${name}`}>
      <div className="rbar-who">
        {agent && <Portrait id={agent.id} appearance={agent.appearance} />}
        <div className="grow">
          <b>{name}</b>
          <span className="muted small rbar-status" aria-live="polite">
            {working ? `${agent?.activity ?? 'Trabalhando'}…` : before !== undefined && !reply ? 'Pedido entregue.' : 'Cuida da agenda e das listas por você.'}
          </span>
        </div>
      </div>
      {reply && <p className="rbar-reply">{reply.text}</p>}
      <form className="row" onSubmit={submit}>
        <label htmlFor="rbar-in" className="sr-only">Pedido para o {name}</label>
        <input id="rbar-in" value={text} onChange={(e) => setText(e.target.value)} placeholder={'"Põe pão na lista" ou "marca dentista sexta às 15h"'} autoComplete="off" />
        <button className="btn primary" type="submit" disabled={!text.trim()}>Pedir</button>
      </form>
    </section>
  );
}

function DayAgenda({ day, today, items, fresh, onChanged, onOpenAgenda }: {
  day: string; today: string; items: CalendarOccurrence[] | null; fresh: Set<string>; onChanged(): void; onOpenAgenda(): void;
}) {
  const [title, setTitle] = useState('');
  const [time, setTime] = useState('09:00');
  const [allDay, setAllDay] = useState(false);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const start = allDay ? `${day}T00:00` : `${day}T${time}`;
    const [h, m] = time.split(':').map(Number);
    const finish = fromKey(day);
    finish.setHours(h!, m! + 60);
    const end = allDay ? `${day}T23:59` : localIso(finish);
    try {
      await api('/calendar/events', { method: 'POST', body: { title: title.trim(), start, end, allDay } });
      setTitle('');
      onChanged();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não deu certo.'); }
  };

  return (
    <div className="day-agenda">
      <div className="row between">
        <h3 className="day">{dayTitle(day)}{day === today && <span className="tag new">hoje</span>}</h3>
        <button className="btn ghost small" type="button" onClick={onOpenAgenda}>Agenda completa</button>
      </div>
      {items === null && <p className="muted small">Carregando…</p>}
      {items?.length === 0 && <p className="muted small">Nada marcado neste dia.</p>}
      <ul className="list">
        {items?.map((ev) => {
          const k = `${ev.id}@${ev.occurrenceStart}`;
          return (
            <li key={k} className={`row-item${fresh.has(k) ? ' fresh' : ''}`}>
              <span className="when">{whenText(ev, day)}</span>
              <div className="grow">
                <b>{ev.title}</b>{ev.rrule && <span className="tags"><span className="tag">repete</span></span>}
                {ev.location && <div className="muted small">{ev.location}</div>}
              </div>
              {confirm === ev.id
                ? <button className="btn small danger" type="button" onClick={() => void api(`/calendar/events/${ev.id}`, { method: 'DELETE' }).then(() => { setConfirm(null); onChanged(); })}>{ev.rrule ? 'Cancelar todas' : 'Confirmar'}</button>
                : <button className="btn small" type="button" onClick={() => setConfirm(ev.id)}>Cancelar</button>}
            </li>
          );
        })}
      </ul>
      <form className="row wrap quick-add" onSubmit={add}>
        <label htmlFor="qa-title" className="sr-only">Compromisso</label>
        <input id="qa-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Marcar neste dia" />
        <label htmlFor="qa-time" className="sr-only">Hora</label>
        <input id="qa-time" type="time" value={time} disabled={allDay} onChange={(e) => setTime(e.target.value)} />
        <label className="row small check"><input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />Dia todo</label>
        <button className="btn" type="submit" disabled={!title.trim() || (!allDay && !time)}>Marcar</button>
      </form>
      {error && <p className="error small">{error}</p>}
    </div>
  );
}

function ListCard({ title, createName, list, failed, loading, fresh, placeholder, onReplace, onCreate }: {
  title: string; createName: string; list: TodoList | null; failed: boolean; loading: boolean; fresh: Set<string>; placeholder: string;
  onReplace(l: TodoList): void; onCreate(name: string): Promise<void>;
}) {
  const [item, setItem] = useState('');
  const id = `lc-${createName.toLowerCase()}`;
  const call = (path: string, init: { method: string; body?: unknown }) => list && api<TodoList>(`/lists/${list.id}${path}`, init).then(onReplace).catch(() => {});
  const open = list?.items.filter((i) => !i.done).length ?? 0;
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (!item.trim()) return;
    void call('/items', { method: 'POST', body: { text: item.trim() } });
    setItem('');
  };

  return (
    <section className="lcard" aria-labelledby={`${id}-h`}>
      <div className="row between">
        <h3 id={`${id}-h`}>{title}</h3>
        {list && <span className="muted small">{open === 0 ? 'tudo feito' : open === 1 ? '1 pendente' : `${open} pendentes`}</span>}
      </div>
      {failed && !list && <p className="error small">Lista indisponível agora.</p>}
      {!failed && !loading && !list && (
        <p className="small">Não achei a lista {createName}. <button className="btn small" type="button" onClick={() => void onCreate(createName)}>Criar</button></p>
      )}
      {list && (
        <>
          {list.items.length === 0 && <p className="muted small">Vazia. Escreva abaixo ou peça ao Renfield.</p>}
          <ul className="litems">
            {list.items.map((i) => (
              <li key={i.id} className={`${i.done ? 'off' : ''}${fresh.has(i.id) ? ' fresh' : ''}`}>
                <input type="checkbox" id={`${id}-${i.id}`} checked={i.done} onChange={(e) => void call(`/items/${i.id}`, { method: 'PATCH', body: { done: e.target.checked } })} />
                <label htmlFor={`${id}-${i.id}`} className={`grow ${i.done ? 'strike' : ''}`}>{i.text}</label>
                <button className="tray-x" type="button" aria-label={`Tirar ${i.text}`} onClick={() => void call(`/items/${i.id}`, { method: 'DELETE' })}>×</button>
              </li>
            ))}
          </ul>
          <form className="row" onSubmit={add}>
            <label htmlFor={`${id}-new`} className="sr-only">Novo item em {title}</label>
            <input id={`${id}-new`} value={item} onChange={(e) => setItem(e.target.value)} placeholder={placeholder} />
            <button className="btn" type="submit" disabled={!item.trim()}>Pôr</button>
          </form>
          {list.items.some((i) => i.done) && (
            <button className="btn ghost small" type="button" onClick={() => void call('/clear-done', { method: 'POST' })}>Tirar os marcados</button>
          )}
        </>
      )}
    </section>
  );
}

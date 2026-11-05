import type { CalendarOccurrence } from '@shack/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../live.ts';

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
const hm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
const DURATIONS: Array<[string, number]> = [['30 min', 30], ['1 hora', 60], ['1h30', 90], ['2 horas', 120], ['Dia inteiro', 0]];

export function AgendaPage({ version }: { version: number }) {
  const [events, setEvents] = useState<CalendarOccurrence[] | null>(null);
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [duration, setDuration] = useState(60);
  const [repeat, setRepeat] = useState('');
  const [location, setLocation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);

  const load = () => api<CalendarOccurrence[]>('/calendar/events').then(setEvents);
  useEffect(() => { void load(); }, [version]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const allDay = duration === 0;
    const startAt = allDay ? `${start.slice(0, 10)}T00:00` : start;
    const end = allDay ? `${start.slice(0, 10)}T23:59` : new Date(new Date(start).getTime() + duration * 60_000).toISOString();
    try {
      await api('/calendar/events', { method: 'POST', body: { title, start: startAt, end, allDay, ...(location ? { location } : {}), ...(repeat ? { rrule: repeat } : {}) } });
      setTitle(''); setStart(''); setLocation(''); setRepeat('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não deu certo.'); }
  };

  const groups = new Map<string, CalendarOccurrence[]>();
  for (const ev of events ?? []) groups.set(dayKey(ev.occurrenceStart), [...(groups.get(dayKey(ev.occurrenceStart)) ?? []), ev]);

  return (
    <main className="page panel">
      <header className="page-head"><h2>Agenda</h2><p className="muted small">Próximos 14 dias. Você também pode pedir ao Renfield: "marca dentista sexta às 15h".</p></header>
      <div className="page-body">
        {events === null && <p className="muted">Carregando…</p>}
        {events?.length === 0 && <p className="muted">Nada marcado nos próximos 14 dias.</p>}
        {[...groups].map(([day, items]) => (
          <section key={day} className="stack">
            <h3 className="day">{day}</h3>
            <ul className="list">
              {items.map((ev) => (
                <li key={`${ev.id}-${ev.occurrenceStart}`} className="row-item">
                  <span className="when">{ev.allDay ? 'Dia todo' : `${hm(ev.occurrenceStart)}${ev.occurrenceEnd ? `–${hm(ev.occurrenceEnd)}` : ''}`}</span>
                  <div className="grow">
                    <b>{ev.title}</b>
                    <span className="tags">{ev.rrule && <span className="tag">repete</span>}</span>
                    {ev.location && <div className="muted small">{ev.location}</div>}
                  </div>
                  {confirm === ev.id
                    ? <button className="btn small danger" type="button" onClick={() => void api(`/calendar/events/${ev.id}`, { method: 'DELETE' }).then(() => { setConfirm(null); return load(); })}>{ev.rrule ? 'Cancelar todas' : 'Confirmar'}</button>
                    : <button className="btn small" type="button" onClick={() => setConfirm(ev.id)}>Cancelar</button>}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <form className="stack add-form" onSubmit={add}>
          <h3 className="day">Novo compromisso</h3>
          <label htmlFor="ev-title" className="sr-only">Título</label>
          <input id="ev-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Dentista" />
          <div className="row wrap">
            <label htmlFor="ev-start" className="sr-only">Início</label>
            <input id="ev-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            <label htmlFor="ev-dur" className="sr-only">Duração</label>
            <select id="ev-dur" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
              {DURATIONS.map(([label, min]) => <option key={label} value={min}>{label}</option>)}
            </select>
            <label htmlFor="ev-rep" className="sr-only">Repetir</label>
            <select id="ev-rep" value={repeat} onChange={(e) => setRepeat(e.target.value)}>
              <option value="">Não repete</option>
              <option value="FREQ=DAILY">Todo dia</option>
              <option value="FREQ=WEEKLY">Toda semana</option>
              <option value="FREQ=MONTHLY">Todo mês</option>
            </select>
          </div>
          <label htmlFor="ev-loc" className="sr-only">Local</label>
          <input id="ev-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Local (opcional)" />
          {error && <p className="error">{error}</p>}
          <div><button className="btn primary" type="submit" disabled={!title.trim() || !start}>Marcar</button></div>
        </form>
      </div>
    </main>
  );
}

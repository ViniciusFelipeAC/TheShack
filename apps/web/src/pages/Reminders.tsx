import type { Reminder, Timer } from '@shack/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../live.ts';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/** "0 8 * * 1-5" vira "dias úteis às 08:00". Padrões incomuns aparecem como cron. */
function describeCron(cron: string): string {
  const m = cron.match(/^(\d+) (\d+) \* \* (\*|1-5|[0-6])$/);
  if (!m) return `repete (${cron})`;
  const time = `${m[2]!.padStart(2, '0')}:${m[1]!.padStart(2, '0')}`;
  if (m[3] === '*') return `todo dia às ${time}`;
  if (m[3] === '1-5') return `dias úteis às ${time}`;
  return `toda ${WEEKDAYS[Number(m[3])]} às ${time}`;
}

function remaining(endsAt: string, now: number): string {
  const s = Math.max(0, Math.round((Date.parse(endsAt) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function RemindersPage({ remindersVersion, timersVersion }: { remindersVersion: number; timersVersion: number }) {
  const [items, setItems] = useState<Reminder[] | null>(null);
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'reminder' | 'alarm'>('reminder');
  const [repeat, setRepeat] = useState<'once' | 'daily' | 'weekdays' | 'weekly' | 'cron'>('once');
  const [at, setAt] = useState('');
  const [time, setTime] = useState('08:00');
  const [weekday, setWeekday] = useState(1);
  const [cron, setCron] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(5);
  const [label, setLabel] = useState('');

  const load = () => api<Reminder[]>('/reminders?status=active').then(setItems);
  const loadTimers = () => api<Timer[]>('/timers').then(setTimers);
  useEffect(() => { void load(); }, [remindersVersion]);
  useEffect(() => { void loadTimers(); }, [timersVersion]);
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const [h, m] = time.split(':').map(Number);
    const schedule = repeat === 'once' ? { at }
      : repeat === 'daily' ? { cron: `${m} ${h} * * *` }
        : repeat === 'weekdays' ? { cron: `${m} ${h} * * 1-5` }
          : repeat === 'weekly' ? { cron: `${m} ${h} * * ${weekday}` } : { cron };
    try {
      await api('/reminders', { method: 'POST', body: { text, kind, ...schedule } });
      setText(''); setAt('');
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : 'Não deu certo.'); }
  };
  const startTimer = async (secs: number, name = label) => {
    await api('/timers', { method: 'POST', body: { seconds: secs, label: name.trim() || 'Timer' } });
    setLabel('');
    await loadTimers();
  };

  return (
    <main className="page panel">
      <header className="page-head"><h2>Lembretes, alarmes e timers</h2><p className="muted small">Quem dispara é o servidor, então funciona com o navegador fechado. Pelo chat: "me lembra de tomar o remédio todo dia útil às 8h".</p></header>
      <div className="page-body">
        <section className="stack">
          <h3 className="day">Timers</h3>
          <div className="row wrap">
            {[1, 5, 10, 25].map((m) => <button key={m} className="btn small" type="button" onClick={() => void startTimer(m * 60, `${m} min`)}>{m} min</button>)}
            <label htmlFor="tm-min" className="sr-only">Minutos</label>
            <input id="tm-min" type="number" min={1} max={1440} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} style={{ maxWidth: 90 }} />
            <label htmlFor="tm-label" className="sr-only">Nome</label>
            <input id="tm-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nome (opcional)" />
            <button className="btn" type="button" onClick={() => void startTimer(minutes * 60)} disabled={minutes < 1}>Começar</button>
          </div>
          <ul className="list">
            {timers.map((t) => (
              <li key={t.id} className={`row-item ${t.status !== 'running' ? 'off' : ''}`}>
                <span className="when mono">{t.status === 'running' ? remaining(t.endsAt, now) : t.status === 'finished' ? 'terminou' : 'cancelado'}</span>
                <b className="grow">{t.label}</b>
                {t.status === 'running' && <button className="btn small" type="button" onClick={() => void api(`/timers/${t.id}`, { method: 'DELETE' }).then(loadTimers)}>Cancelar</button>}
              </li>
            ))}
          </ul>
        </section>

        <section className="stack">
          <h3 className="day">Lembretes e alarmes ativos</h3>
          {items === null && <p className="muted">Carregando…</p>}
          {items?.length === 0 && <p className="muted">Nenhum lembrete ativo.</p>}
          <ul className="list">
            {items?.map((r) => (
              <li key={r.id} className="row-item">
                <span className="when">{when(r.snoozedUntil ?? r.nextFireAt)}</span>
                <div className="grow">
                  <b>{r.text}</b>
                  <span className="tags">
                    <span className="tag">{r.kind === 'alarm' ? 'alarme' : 'lembrete'}</span>
                    {r.cron && <span className="tag">{describeCron(r.cron)}</span>}
                    {r.ringing && <span className="tag new">tocando</span>}
                  </span>
                </div>
                <div className="row">
                  {r.ringing && <button className="btn small primary" type="button" onClick={() => void api(`/reminders/${r.id}/dismiss`, { method: 'POST' }).then(load)}>Dispensar</button>}
                  <button className="btn small" type="button" onClick={() => void api(`/reminders/${r.id}`, { method: 'DELETE' }).then(load)}>Apagar</button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <form className="stack add-form" onSubmit={add}>
          <h3 className="day">Novo lembrete</h3>
          <label htmlFor="rm-text" className="sr-only">Texto</label>
          <input id="rm-text" value={text} onChange={(e) => setText(e.target.value)} placeholder="Ex.: Tomar o remédio" />
          <div className="row wrap">
            <label htmlFor="rm-kind" className="sr-only">Tipo</label>
            <select id="rm-kind" value={kind} onChange={(e) => setKind(e.target.value as 'reminder' | 'alarm')}>
              <option value="reminder">Lembrete (avisa uma vez)</option>
              <option value="alarm">Alarme (toca até dispensar)</option>
            </select>
            <label htmlFor="rm-repeat" className="sr-only">Quando</label>
            <select id="rm-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as typeof repeat)}>
              <option value="once">Uma vez</option>
              <option value="daily">Todo dia</option>
              <option value="weekdays">Dias úteis</option>
              <option value="weekly">Toda semana</option>
              <option value="cron">Avançado (cron)</option>
            </select>
            {repeat === 'once' && (<><label htmlFor="rm-at" className="sr-only">Data e hora</label><input id="rm-at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></>)}
            {repeat === 'weekly' && (
              <><label htmlFor="rm-dow" className="sr-only">Dia da semana</label>
                <select id="rm-dow" value={weekday} onChange={(e) => setWeekday(Number(e.target.value))}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></>
            )}
            {(repeat === 'daily' || repeat === 'weekdays' || repeat === 'weekly') && (<><label htmlFor="rm-time" className="sr-only">Hora</label><input id="rm-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></>)}
            {repeat === 'cron' && (<><label htmlFor="rm-cron" className="sr-only">Cron</label><input id="rm-cron" value={cron} onChange={(e) => setCron(e.target.value)} placeholder="minuto hora dia mês dia-da-semana, ex.: 30 7 * * 1,3,5" /></>)}
          </div>
          {error && <p className="error">{error}</p>}
          <div><button className="btn primary" type="submit" disabled={!text.trim() || (repeat === 'once' && !at) || (repeat === 'cron' && !cron.trim())}>Criar</button></div>
        </form>
      </div>
    </main>
  );
}

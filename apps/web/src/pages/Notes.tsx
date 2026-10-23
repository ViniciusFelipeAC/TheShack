import type { Note } from '@shack/shared';
import { useEffect, useState } from 'react';
import { api } from '../live.ts';

export function NotesPage({ version }: { version: number }) {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ id: string | null; title: string; content: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const load = (q = query) => api<Note[]>(`/notes${q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`).then(setNotes);
  useEffect(() => { void load(); }, [version]);
  useEffect(() => { const t = setTimeout(() => void load(query), 250); return () => clearTimeout(t); }, [query]);

  const save = async () => {
    if (!editing || !editing.content.trim()) return;
    const body = { title: editing.title, content: editing.content };
    const note = editing.id
      ? await api<Note>(`/notes/${editing.id}`, { method: 'PATCH', body })
      : await api<Note>('/notes', { method: 'POST', body });
    setEditing({ id: note.id, title: note.title, content: note.content });
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
    await load();
  };

  return (
    <main className="page panel">
      <header className="page-head"><h2>Notas</h2><p className="muted small">Pelo chat: "anota a senha do Wi-Fi da praia: mar123".</p></header>
      <div className="page-body two-col">
        <nav className="stack list-nav" aria-label="Notas">
          <label htmlFor="note-q" className="sr-only">Buscar</label>
          <input id="note-q" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar nas notas" />
          <button className="btn" type="button" onClick={() => { setEditing({ id: null, title: '', content: '' }); setConfirm(false); }}>Nova nota</button>
          {notes?.length === 0 && <p className="muted small">{query ? 'Nada encontrado.' : 'Nenhuma nota ainda.'}</p>}
          {notes?.map((n) => (
            <button key={n.id} type="button" className="btn list-btn note-btn" aria-pressed={editing?.id === n.id}
              onClick={() => { setEditing({ id: n.id, title: n.title, content: n.content }); setConfirm(false); }}>
              <b className="ellipsis">{n.title}</b>
              <span className="muted small ellipsis">{n.content.split('\n').slice(0, 2).join(' ')}</span>
            </button>
          ))}
        </nav>
        {editing ? (
          <section className="stack">
            <label htmlFor="note-title" className="sr-only">Título</label>
            <input id="note-title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} placeholder="Título (opcional)" />
            <label htmlFor="note-body" className="sr-only">Conteúdo</label>
            <textarea id="note-body" className="prose" rows={14} value={editing.content} onChange={(e) => setEditing({ ...editing, content: e.target.value })} placeholder="Escreva aqui…" />
            <div className="row">
              <button className="btn primary" type="button" onClick={() => void save()} disabled={!editing.content.trim()}>Salvar</button>
              {saved && <span className="muted small">Salvo.</span>}
              {editing.id && (confirm
                ? <button className="btn danger" type="button" onClick={() => void api(`/notes/${editing.id}`, { method: 'DELETE' }).then(() => { setEditing(null); setConfirm(false); return load(); })}>Confirmar</button>
                : <button className="btn" type="button" onClick={() => setConfirm(true)}>Apagar</button>)}
            </div>
          </section>
        ) : <p className="muted">Escolha uma nota ou crie uma nova.</p>}
      </div>
    </main>
  );
}

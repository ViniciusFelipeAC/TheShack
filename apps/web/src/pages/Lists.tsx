import type { TodoList } from '@shack/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { api } from '../live.ts';

export function ListsPage({ version }: { version: number }) {
  const [lists, setLists] = useState<TodoList[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [item, setItem] = useState('');
  const [newList, setNewList] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = () => api<TodoList[]>('/lists').then((all) => {
    setLists(all);
    setSelected((cur) => (cur && all.some((l) => l.id === cur) ? cur : all[0]?.id ?? null));
  });
  useEffect(() => { void load(); }, [version]);

  const list = lists?.find((l) => l.id === selected) ?? null;
  const replace = (updated: TodoList) => setLists((all) => all?.map((l) => (l.id === updated.id ? updated : l)) ?? null);

  const addItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!list || !item.trim()) return;
    replace(await api<TodoList>(`/lists/${list.id}/items`, { method: 'POST', body: { text: item } }));
    setItem('');
  };
  const createList = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await api<TodoList>('/lists', { method: 'POST', body: { name: newList } });
      setNewList('');
      await load();
      setSelected(created.id);
    } catch (err) { setError(err instanceof Error ? err.message : 'Não deu certo.'); }
  };

  return (
    <main className="page panel">
      <header className="page-head"><h2>Listas</h2><p className="muted small">Pelo chat: "coloca leite e café na lista do mercado".</p></header>
      <div className="page-body two-col">
        <nav className="stack list-nav" aria-label="Listas">
          {lists?.map((l) => (
            <button key={l.id} type="button" className="btn list-btn" aria-pressed={l.id === selected} onClick={() => { setSelected(l.id); setConfirmDelete(false); }}>
              <span className="grow">{l.name}</span>
              <span className="muted small">{l.items.filter((i) => !i.done).length}</span>
            </button>
          ))}
          <form className="row" onSubmit={createList}>
            <label htmlFor="new-list" className="sr-only">Nova lista</label>
            <input id="new-list" value={newList} onChange={(e) => setNewList(e.target.value)} placeholder="Nova lista" />
            <button className="btn small" type="submit" disabled={!newList.trim()}>Criar</button>
          </form>
          {error && <p className="error small">{error}</p>}
        </nav>

        {list ? (
          <section className="stack">
            <div className="row between">
              <h3 className="day">{list.name}</h3>
              <div className="row">
                {list.items.some((i) => i.done) && <button className="btn small" type="button" onClick={() => void api<TodoList>(`/lists/${list.id}/clear-done`, { method: 'POST' }).then(replace)}>Tirar os marcados</button>}
                {confirmDelete
                  ? <button className="btn small danger" type="button" onClick={() => void api(`/lists/${list.id}`, { method: 'DELETE' }).then(() => { setConfirmDelete(false); return load(); })}>Confirmar</button>
                  : <button className="btn small" type="button" onClick={() => setConfirmDelete(true)}>Apagar lista</button>}
              </div>
            </div>
            {list.items.length === 0 && <p className="muted">Lista vazia.</p>}
            <ul className="list">
              {list.items.map((i) => (
                <li key={i.id} className={`row-item ${i.done ? 'off' : ''}`}>
                  <input type="checkbox" id={`it-${i.id}`} checked={i.done} onChange={(e) => void api<TodoList>(`/lists/${list.id}/items/${i.id}`, { method: 'PATCH', body: { done: e.target.checked } }).then(replace)} />
                  <label htmlFor={`it-${i.id}`} className={`grow ${i.done ? 'strike' : ''}`}>{i.text}</label>
                  <button className="btn small ghost" type="button" aria-label={`Tirar ${i.text}`} onClick={() => void api<TodoList>(`/lists/${list.id}/items/${i.id}`, { method: 'DELETE' }).then(replace)}>Tirar</button>
                </li>
              ))}
            </ul>
            <form className="row" onSubmit={addItem}>
              <label htmlFor="new-item" className="sr-only">Novo item</label>
              <input id="new-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Adicionar item" />
              <button className="btn" type="submit" disabled={!item.trim()}>Adicionar</button>
            </form>
          </section>
        ) : <p className="muted">{lists === null ? 'Carregando…' : 'Crie uma lista para começar.'}</p>}
      </div>
    </main>
  );
}

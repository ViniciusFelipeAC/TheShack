import { type AgentInfo, type DesignImage, named, type Task } from '@shack/shared';
import { useEffect, useState } from 'react';
import { CopyButton } from './CopyButton.tsx';
import { adjustPrompt, adjustTitle, downloadName, FORMAT_TEXT, imagesText } from './design.ts';
import { api, tokenStore } from './live.ts';
import './design.css';

const VERIFY_TEXT = { ok: 'conferida', suspect: 'suspeita', unverified: 'não conferida' } as const;

type Loaded = { url: string; file: File };
/** Imagens já baixadas, por tarefa, nome e fim da tarefa: repetir a tarefa regrava com o mesmo nome. */
const cache = new Map<string, Promise<Loaded>>();

/** A tag <img> não manda o token: o app baixa com ele e mostra por blob:, como os anexos. */
function loadImage(task: Task, img: DesignImage): Promise<Loaded> {
  const key = `${task.id}/${img.name}/${task.finishedAt ?? ''}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/v1/tasks/${encodeURIComponent(task.id)}/images/${encodeURIComponent(img.name)}`, { headers: { authorization: `Bearer ${tokenStore.get() ?? ''}` } })
      .then((r) => { if (!r.ok) throw new Error(r.status === 404 ? 'Imagem não encontrada.' : 'Indisponível.'); return r.blob(); })
      .then((blob) => {
        const file = new File([blob], downloadName(task.title, img.name), { type: 'image/png' });
        return { url: URL.createObjectURL(file), file };
      });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** A entrega do Harker no histórico do painel. A galeria só baixa as imagens quando você abre. */
export function DesignDetails({ task: t, agents }: { task: Task; agents: AgentInfo[] }) {
  const [open, setOpen] = useState(false);
  const r = t.result!;
  const n = r.images?.length ?? 0;
  return (
    <details onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary>{n ? imagesText(n) : 'Relatório'}</summary>
      <p>{r.summary}</p>
      {open && n > 0 && <Gallery task={t} />}
      {r.notes && <p className="meta pre">{r.notes}</p>}
      {r.verification && <p className="meta">Conferência do servidor ({VERIFY_TEXT[r.verification.status]}): {r.verification.reason}</p>}
      {t.status === 'done' && <Adjust task={t} agent={agents.find((a) => a.id === t.assignee)} />}
    </details>
  );
}

function Gallery({ task: t }: { task: Task }) {
  const r = t.result!;
  const images = r.images ?? [];
  const [loaded, setLoaded] = useState<Loaded[] | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoaded(null);
    Promise.all(images.map((img) => loadImage(t, img))).then(
      (list) => { if (alive) setLoaded(list); },
      (err: Error) => { if (alive) setNote(`Não consegui baixar as imagens: ${err.message}`); },
    );
    return () => { alive = false; };
  }, [t.id, t.finishedAt]);

  const files = loaded?.map((l) => l.file) ?? [];
  // A folha de compartilhar do iPhone tem "Salvar imagens", que manda para as Fotos. Ela só existe sob HTTPS.
  // No computador, o Edge também tem a folha, mas ali o esperado é baixar o arquivo: o compartilhar fica para telas de toque.
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const canShare = touch && files.length > 0 && typeof navigator.canShare === 'function' && navigator.canShare({ files });
  const save = async () => {
    setNote(null);
    if (canShare) {
      // As imagens já estão baixadas: o pedido sai direto do toque, como o Safari exige.
      try { await navigator.share({ files }); } catch (err) {
        if ((err as Error).name !== 'AbortError') setNote('Não deu para abrir o compartilhar. Toque e segure cada imagem para salvar.');
      }
      return;
    }
    for (const l of loaded ?? []) {
      const a = document.createElement('a');
      a.href = l.url;
      a.download = l.file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  };

  return (
    <div className="stack tight design">
      <ol className="gallery" aria-label="Imagens, na ordem do post">
        {images.map((img, i) => (
          <li key={img.name} className="shot">
            {loaded
              ? <img src={loaded[i]!.url} alt={img.alt} width={img.width} height={img.height} />
              : <div className="ph" style={{ aspectRatio: `${img.width} / ${img.height}` }} aria-hidden="true" />}
            <div className="row between wrap">
              <span className="meta">{i + 1} de {images.length} · {FORMAT_TEXT[img.format]}</span>
              <CopyButton text={img.alt} label="Copiar texto alternativo" />
            </div>
          </li>
        ))}
      </ol>
      <div className="row wrap">
        <button className="btn small primary" type="button" disabled={!loaded} onClick={save}>
          {!loaded ? 'Baixando…' : canShare ? (images.length === 1 ? 'Salvar imagem' : 'Salvar imagens') : (images.length === 1 ? 'Baixar imagem' : 'Baixar imagens')}
        </button>
        {r.output && <CopyButton text={r.output} label="Copiar legenda" />}
      </div>
      {note && <p className="meta">{note}</p>}
      {r.output && <pre className="prompt">{r.output}</pre>}
    </div>
  );
}

/** Ajustar: uma tarefa filha que parte do trabalho desta. Cada volta pede o seu toque; não há laço automático. */
function Adjust({ task: t, agent }: { task: Task; agent: AgentInfo | undefined }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  if (!agent) return null;

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    setNote(null);
    try {
      await api('/tasks', {
        method: 'POST',
        body: { assignee: t.assignee, title: adjustTitle(t.title), prompt: adjustPrompt(t.prompt, text), parentId: t.id, ...(t.workspaceId ? { workspaceId: t.workspaceId } : {}) },
      });
      setNote(`Mandado. ${named(agent.name, agent.article, 'o', true)} vai ajustar e avisa no chat.`);
      setText('');
      setOpen(false);
    } catch (err) { setNote((err as Error).message); }
    setBusy(false);
  };

  return (
    <div className="stack tight adjust">
      {!open && <div className="row"><button className="btn small" type="button" onClick={() => setOpen(true)}>Ajustar</button></div>}
      {open && (
        <>
          <label className="meta" htmlFor={`adjust-${t.id}`}>O que mudar?</label>
          <textarea
            id={`adjust-${t.id}`} className="prose" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Ex.: na segunda imagem, troque o título e use um fundo mais escuro."
          />
          <div className="row wrap">
            <button className="btn small primary" type="button" disabled={busy || !text.trim()} onClick={send}>Mandar ajuste</button>
            <button className="btn small ghost" type="button" onClick={() => setOpen(false)}>Cancelar</button>
          </div>
        </>
      )}
      {note && <p className="meta">{note}</p>}
    </div>
  );
}

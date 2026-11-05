import type { Attachment } from '@shack/shared';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { attachmentUrl, formatSize, type PendingFile } from '../attach.ts';

const KIND_LABEL: Record<string, string> = { pdf: 'PDF', text: 'TXT', image: 'IMG' };

function useAttachmentUrl(id: string): { url: string | null; failed: boolean } {
  const [state, setState] = useState<{ url: string | null; failed: boolean }>({ url: null, failed: false });
  useEffect(() => {
    let alive = true;
    attachmentUrl(id).then((url) => { if (alive) setState({ url, failed: false }); }).catch(() => { if (alive) setState({ url: null, failed: true }); });
    return () => { alive = false; };
  }, [id]);
  return state;
}

/** O que vai junto com a próxima mensagem. Cada item mostra se ainda está subindo ou se deu erro. */
export function PendingTray({ items, onRemove }: { items: PendingFile[]; onRemove(key: string): void }) {
  if (!items.length) return null;
  return (
    <ul className="tray" aria-label="Anexos da próxima mensagem">
      {items.map((p) => (
        <li key={p.key} className={`tray-item ${p.status}`} title={p.error ?? p.name}>
          {p.preview ? <img src={p.preview} alt="" /> : <span className="ficon">{KIND_LABEL[p.kind ?? ''] ?? 'ARQ'}</span>}
          <span className="tray-text">
            <span className="ellipsis">{p.name}</span>
            <span className="small muted">{p.status === 'uploading' ? 'Enviando…' : p.status === 'error' ? 'Não foi' : formatSize(p.size)}</span>
          </span>
          <button className="tray-x" type="button" aria-label={`Tirar ${p.name}`} onClick={() => onRemove(p.key)}>×</button>
        </li>
      ))}
    </ul>
  );
}

function Thumb({ a, onOpen }: { a: Attachment; onOpen(url: string, a: Attachment): void }) {
  const { url, failed } = useAttachmentUrl(a.id);
  if (failed) return <span className="att-file off">{a.name}: indisponível</span>;
  return (
    <button className="att-thumb" type="button" aria-label={`Ver ${a.name}`} onClick={() => url && onOpen(url, a)}>
      {url ? <img src={url} alt={a.name} loading="lazy" /> : <span className="muted small">…</span>}
    </button>
  );
}

function FileChip({ a }: { a: Attachment }) {
  const { url, failed } = useAttachmentUrl(a.id);
  const body = <><span className="ficon">{KIND_LABEL[a.kind]}</span><span className="ellipsis">{a.name}</span><span className="small muted">{failed ? 'indisponível' : formatSize(a.size)}</span></>;
  return url ? <a className="att-file" href={url} target="_blank" rel="noopener" download={a.kind === 'text' ? a.name : undefined}>{body}</a>
    : <span className={`att-file${failed ? ' off' : ''}`}>{body}</span>;
}

/** Anexos dentro do balão: fotos em miniatura, PDFs e textos como fichas. */
export function MessageAttachments({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<{ url: string; name: string } | null>(null);
  const images = items.filter((a) => a.kind === 'image');
  const files = items.filter((a) => a.kind !== 'image');
  return (
    <div className="atts">
      {images.length > 0 && <div className="att-grid">{images.map((a) => <Thumb key={a.id} a={a} onOpen={(url) => setOpen({ url, name: a.name })} />)}</div>}
      {files.map((a) => <FileChip key={a.id} a={a} />)}
      {open && <Lightbox url={open.url} name={open.name} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Lightbox({ url, name, onClose }: { url: string; name: string; onClose(): void }) {
  const close = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    close.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  // No corpo da página: dentro da gaveta do chat, a foto ficaria presa abaixo de outras camadas.
  return createPortal(
    <div className="lightbox" role="dialog" aria-modal="true" aria-label={name} onClick={onClose}>
      <img src={url} alt={name} />
      <button ref={close} className="tbtn lightbox-x" type="button" onClick={onClose}>Fechar</button>
    </div>,
    document.body,
  );
}

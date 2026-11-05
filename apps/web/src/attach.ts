import { type Attachment, ATTACHMENT_LIMITS, type AttachmentKind, attachmentKind } from '@shack/shared';
import { ApiError, tokenStore } from './live.ts';

/** O modelo não aproveita mais que isso no lado maior da foto; acima, só gasta cota e banda do celular. */
export const MAX_SIDE = 1568;
const KEEP_FORMAT = ['image/png', 'image/webp'];

/** Anexo escolhido no compositor, antes de a mensagem sair. */
export type PendingFile = {
  key: string;
  name: string;
  kind: AttachmentKind | null;
  size: number;
  /** Miniatura local (blob:) das fotos. */
  preview: string | null;
  status: 'uploading' | 'ready' | 'error';
  error: string | null;
  attachment: Attachment | null;
};

/** Tamanho final da foto: cabe em MAX_SIDE sem distorcer e nunca aumenta. */
export function fitSize(w: number, h: number, max = MAX_SIDE): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

/** Recusa no aparelho o que o servidor recusaria, para o aviso vir na hora. */
export function checkFile(name: string, type: string, size: number): string | null {
  const kind = attachmentKind(name, type);
  if (!kind && !type.startsWith('image/')) return `O Renfield não lê esse tipo de arquivo (${name}). Mande foto, PDF ou texto.`;
  if (kind === 'pdf' && size > ATTACHMENT_LIMITS.pdfBytes) return `"${name}" passa de 10 MB.`;
  if (kind === 'text' && size > ATTACHMENT_LIMITS.textBytes) return `"${name}" passa de 512 KB.`;
  return null;
}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  return img.decode().then(() => img).finally(() => URL.revokeObjectURL(url));
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Fotos grandes saem reduzidas, e formatos que o modelo não lê (o HEIC do iPhone) viram JPEG. O navegador já
 * desenha na orientação certa da câmera. GIF fica como está, para não perder a animação.
 */
export async function prepareImage(file: File): Promise<File> {
  if (file.type === 'image/gif' || !(file.type.startsWith('image/') || attachmentKind(file.name, file.type) === 'image')) return file;
  let img: HTMLImageElement;
  try { img = await loadImage(file); } catch { return file; } // o navegador não abre: o servidor explica o motivo
  const { w, h } = fitSize(img.naturalWidth, img.naturalHeight);
  const known = attachmentKind(file.name, file.type) === 'image';
  if (known && w === img.naturalWidth && file.size <= 1.5 * 1024 * 1024) return file;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d');
  if (!g) return file;
  const keep = KEEP_FORMAT.includes(file.type);
  // JPEG não tem transparência: fundo branco em vez de preto.
  if (!keep) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, w, h);
  let blob = keep ? await toBlob(canvas, file.type) : null;
  let type = file.type;
  if (!blob || blob.size > ATTACHMENT_LIMITS.imageBytes) { blob = await toBlob(canvas, 'image/jpeg', 0.85); type = 'image/jpeg'; }
  if (!blob) return file;
  const name = type === 'image/jpeg' ? file.name.replace(/\.[^.]+$/, '') + '.jpg' : file.name;
  return new File([blob], name || 'foto.jpg', { type });
}

/** Sobe o arquivo cru, com o tipo no cabeçalho e o nome na URL. */
export async function uploadAttachment(file: File): Promise<Attachment> {
  const headers: Record<string, string> = { authorization: `Bearer ${tokenStore.get() ?? ''}` };
  if (file.type) headers['content-type'] = file.type;
  const res = await fetch(`/api/v1/attachments?name=${encodeURIComponent(file.name || 'arquivo')}`, { method: 'POST', headers, body: file });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code ?? 'error', data?.error?.message ?? (res.status === 413 ? 'Arquivo grande demais.' : 'Não consegui enviar o arquivo.'));
  return data as Attachment;
}

const urls = new Map<string, Promise<string>>();

/** Endereço local (blob:) de um anexo. A tag <img> não manda o token, então o app baixa e guarda. */
export function attachmentUrl(id: string): Promise<string> {
  let p = urls.get(id);
  if (!p) {
    p = fetch(`/api/v1/attachments/${encodeURIComponent(id)}`, { headers: { authorization: `Bearer ${tokenStore.get() ?? ''}` } })
      .then((r) => { if (!r.ok) throw new Error(r.status === 404 ? 'Anexo não encontrado.' : 'Indisponível.'); return r.blob(); })
      .then((b) => URL.createObjectURL(b));
    urls.set(id, p);
    p.catch(() => urls.delete(id));
  }
  return p;
}

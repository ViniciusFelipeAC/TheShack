import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DESIGN_SIZES, type DesignFormat, type DesignImage, type Verification } from '@shack/shared';
import { imageNameOf } from '../renfield/lenient.ts';
import { RENDER_LIMITS, type RenderRecord, sha256 } from './render.ts';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
/** Limites do próprio Instagram: acima deles, a legenda não posta. */
export const CAPTION_LIMITS = { chars: 2200, hashtags: 30 } as const;

/** Largura e altura do cabeçalho IHDR, sem biblioteca. Nulo se não for PNG. */
export function pngSize(b: Buffer): { width: number; height: number } | null {
  if (b.length < 24 || !b.subarray(0, 8).equals(PNG_SIGNATURE) || b.toString('latin1', 12, 16) !== 'IHDR') return null;
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
}

export function formatOf(width: number, height: number): DesignFormat | null {
  return (Object.keys(DESIGN_SIZES) as DesignFormat[]).find((f) => DESIGN_SIZES[f].width === width && DESIGN_SIZES[f].height === height) ?? null;
}

/** O que a legenda tem que o Instagram recusaria. */
export function captionProblems(caption: string | undefined): string[] {
  if (!caption) return [];
  const problems: string[] = [];
  const chars = [...caption].length;
  if (chars > CAPTION_LIMITS.chars) problems.push(`a legenda tem ${chars} caracteres, e o Instagram aceita até ${CAPTION_LIMITS.chars}`);
  const tags = caption.match(/#[\p{L}\p{N}_]+/gu)?.length ?? 0;
  if (tags > CAPTION_LIMITS.hashtags) problems.push(`a legenda tem ${tags} hashtags, e o Instagram aceita até ${CAPTION_LIMITS.hashtags}`);
  return problems;
}

/**
 * Confere em out/ as imagens que o relatório lista. O relatório nunca é a prova; o arquivo é.
 * Cada imagem precisa existir, ter o tamanho exato de um formato e o mesmo hash que a ferramenta de render gravou.
 * Num carrossel, todas têm o mesmo formato, porque o Instagram corta as outras pela primeira.
 */
export function checkImages(
  outDir: string, reported: Array<{ name: string; alt?: string }>, records: Map<string, RenderRecord>, caption?: string,
): { images: DesignImage[]; verification: Verification } {
  const problems: string[] = [];
  const seen = new Set<string>();
  const list = reported.map((r) => ({ name: imageNameOf(r.name), alt: (r.alt ?? '').trim() })).filter((r) => !seen.has(r.name) && seen.add(r.name));
  if (!list.length) problems.push('o relatório não lista nenhuma imagem');
  if (list.length > RENDER_LIMITS.images) problems.push(`o relatório lista ${list.length} imagens, e o teto é ${RENDER_LIMITS.images}`);

  const images: DesignImage[] = [];
  for (const r of list) {
    const file = `${r.name}.png`;
    let data: Buffer;
    try { data = readFileSync(join(outDir, file)); } catch { problems.push(`${file} não existe em out/`); continue; }
    const size = pngSize(data);
    if (!size) { problems.push(`${file} não é um PNG`); continue; }
    const format = formatOf(size.width, size.height);
    if (!format) { problems.push(`${file} tem ${size.width}×${size.height}, que não é feed, square nem story`); continue; }
    const record = records.get(r.name);
    if (!record) problems.push(`${file} não saiu da ferramenta de render nesta tarefa`);
    else if (record.sha256 !== sha256(data)) problems.push(`${file} mudou depois do render`);
    images.push({ name: r.name, format, ...size, bytes: data.length, alt: r.alt });
  }
  const formats = [...new Set(images.map((i) => i.format))];
  if (formats.length > 1) problems.push(`o carrossel mistura formatos (${formats.join(' e ')}), e o Instagram corta as outras imagens pela primeira`);
  problems.push(...captionProblems(caption));

  const files = images.map((i) => `out/${i.name}.png`);
  const verification: Verification = problems.length
    ? { status: 'suspect', reason: `${problems.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()), diffstat: null, files }
    : {
      status: 'ok', diffstat: null, files,
      reason: `${images.length === 1 ? '1 imagem conferida' : `${images.length} imagens conferidas`} em disco: ${formats[0]}, ${images[0]!.width}×${images[0]!.height}, ${images.length === 1 ? 'saída' : 'todas saídas'} do render.`,
    };
  return { images, verification };
}

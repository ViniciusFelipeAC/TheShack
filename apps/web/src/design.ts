import type { DesignFormat } from '@shack/shared';

export const FORMAT_TEXT: Record<DesignFormat, string> = { feed: 'feed 4:5', square: 'quadrado', story: 'story 9:16' };

export const imagesText = (n: number) => (n === 1 ? '1 imagem' : `${n} imagens`);

const ORIGINAL = '\n\nPedido original:\n';

/**
 * O prompt de um ajuste: o que mudar primeiro e o pedido original depois. Ajuste de ajuste reaproveita o
 * pedido original, em vez de empilhar os prompts anteriores.
 */
export function adjustPrompt(previous: string, change: string): string {
  const at = previous.indexOf(ORIGINAL);
  const original = at >= 0 ? previous.slice(at + ORIGINAL.length) : previous;
  return `O que mudar:\n${change.trim()}${ORIGINAL}${original}`.slice(0, 20_000);
}

/** Título de um ajuste, sem empilhar "Ajuste: Ajuste: …". */
export const adjustTitle = (title: string) => `Ajuste: ${title.replace(/^(ajuste:\s*)+/i, '')}`.slice(0, 200);

/** Nome do arquivo baixado: o título da tarefa sem acento nem símbolo, e o nome da imagem. */
export function downloadName(title: string, name: string): string {
  const slug = title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  return `${slug || 'imagem'}-${name}.png`;
}

import type { Conversation } from '@shack/shared';

/* ---------- largura do chat no computador ---------- */
/** A casa precisa de pelo menos `stage` px ao lado do chat; abaixo de 900 px o chat vira gaveta. */
export const CHAT_WIDTH = { min: 300, default: 380, max: 900, stage: 420, chrome: 44 } as const;

/** Largura possível para o chat numa janela de `viewport` px: entre o mínimo e o que sobra para a casa. */
export function clampChatWidth(width: number, viewport: number): number {
  const room = viewport - CHAT_WIDTH.chrome - CHAT_WIDTH.stage;
  const max = Math.max(CHAT_WIDTH.min, Math.min(CHAT_WIDTH.max, room));
  return Math.round(Math.min(max, Math.max(CHAT_WIDTH.min, Number.isFinite(width) ? width : CHAT_WIDTH.default)));
}

/* ---------- caixa de texto ---------- */
/** Enter manda; Shift+Enter quebra a linha. Durante a composição de acentos (IME), Enter só confirma a letra. */
export function isSendKey(e: { key: string; shiftKey: boolean; isComposing?: boolean }): boolean {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing;
}

/* ---------- histórico de conversas ---------- */
export function conversationLabel(c: Pick<Conversation, 'preview' | 'title'>): string {
  return c.preview ?? c.title;
}

/** Conversas vazias não entram no histórico, a não ser a que está aberta. */
export function visibleConversations(list: Conversation[], currentId: string | null): Conversation[] {
  return list.filter((c) => c.messageCount > 0 || c.id === currentId);
}

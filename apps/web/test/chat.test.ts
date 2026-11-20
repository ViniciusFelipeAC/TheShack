import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Conversation } from '@shack/shared';
import { clampChatWidth, conversationLabel, isSendKey, visibleConversations } from '../src/chat-ui.ts';

const conv = (id: string, messageCount: number, preview: string | null = null): Conversation => ({
  id, agentId: 'renfield', title: 'Nova conversa', preview, messageCount, createdAt: '', updatedAt: '',
});

test('largura do chat: fica entre o mínimo e o espaço que sobra para a casa', () => {
  assert.equal(clampChatWidth(380, 1600), 380);
  assert.equal(clampChatWidth(100, 1600), 300);
  assert.equal(clampChatWidth(2000, 1600), 900);
  assert.equal(clampChatWidth(700, 1000), 536, 'a casa fica com 420 px e as bordas com 44');
  assert.equal(clampChatWidth(700, 700), 300, 'janela estreita: nunca abaixo do mínimo');
  assert.equal(clampChatWidth(Number.NaN, 1600), 380);
});

test('Enter manda, Shift+Enter quebra a linha, e acentos em composição não mandam', () => {
  assert.equal(isSendKey({ key: 'Enter', shiftKey: false }), true);
  assert.equal(isSendKey({ key: 'Enter', shiftKey: true }), false);
  assert.equal(isSendKey({ key: 'Enter', shiftKey: false, isComposing: true }), false);
  assert.equal(isSendKey({ key: 'a', shiftKey: false }), false);
});

test('histórico: esconde as conversas vazias, menos a aberta, e usa a prévia como nome', () => {
  const list = [conv('nova', 0), conv('vazia', 0), conv('main', 12, 'Boa tarde')];
  assert.deepEqual(visibleConversations(list, 'nova').map((c) => c.id), ['nova', 'main']);
  assert.equal(conversationLabel(list[2]!), 'Boa tarde');
  assert.equal(conversationLabel(list[0]!), 'Nova conversa');
});

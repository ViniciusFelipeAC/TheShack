import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjustPrompt, adjustTitle, downloadName, imagesText } from '../src/design.ts';

test('ajuste: o que mudar vem primeiro, e o pedido original não empilha', () => {
  const first = adjustPrompt('Um carrossel de 3 imagens sobre o projeto.', '  Troque o título da segunda. ');
  assert.equal(first, 'O que mudar:\nTroque o título da segunda.\n\nPedido original:\nUm carrossel de 3 imagens sobre o projeto.');
  const second = adjustPrompt(first, 'Fundo mais escuro.');
  assert.equal(second, 'O que mudar:\nFundo mais escuro.\n\nPedido original:\nUm carrossel de 3 imagens sobre o projeto.');
  assert.equal(adjustTitle('Ajuste: ajuste: Carrossel'), 'Ajuste: Carrossel');
  assert.ok(adjustTitle('x'.repeat(300)).length <= 200);
});

test('nome do arquivo baixado e contagem de imagens', () => {
  assert.equal(downloadName('Carrossel do The Shack: ação!', '01'), 'carrossel-do-the-shack-acao-01.png');
  assert.equal(downloadName('!!!', '02'), 'imagem-02.png');
  assert.equal(imagesText(1), '1 imagem');
  assert.equal(imagesText(5), '5 imagens');
});

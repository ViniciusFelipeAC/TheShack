import assert from 'node:assert/strict';
import { test } from 'node:test';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** Simula o aparelho: agente do navegador, app instalado ou não, e o que ele suporta. */
function device(o: { ua: string; standalone: boolean; push: boolean; secure?: boolean }) {
  // O Node já tem um `navigator` só de leitura: troca pela versão do aparelho simulado.
  const set = (name: string, value: unknown) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  set('navigator', { userAgent: o.ua, maxTouchPoints: 5, standalone: o.standalone, ...(o.push ? { serviceWorker: {} } : {}) });
  set('matchMedia', (q: string) => ({ matches: q.includes('standalone') ? o.standalone : false }));
  set('window', { isSecureContext: o.secure ?? true, ...(o.push ? { PushManager: {}, Notification: {} } : {}) });
}

const pwa = await import('../src/pwa.ts');

test('iPhone no Safari: manda instalar antes de ativar o push', () => {
  device({ ua: IPHONE, standalone: false, push: false });
  assert.equal(pwa.isIOS(), true);
  assert.equal(pwa.defaultDeviceName(), 'iPhone');
  assert.match(pwa.pushBlocker()!, /Adicionar à Tela de Início/);
});

test('iPhone instalado e com iOS novo: o push pode ser ativado', () => {
  device({ ua: IPHONE, standalone: true, push: true });
  assert.equal(pwa.isStandalone(), true);
  assert.equal(pwa.pushBlocker(), null);
});

test('iPhone instalado com iOS antigo: pede para atualizar para 16.4', () => {
  device({ ua: IPHONE, standalone: true, push: false });
  assert.match(pwa.pushBlocker()!, /16\.4/);
});

test('sem HTTPS não há push, e o aviso aponta o endereço do Tailscale', () => {
  device({ ua: CHROME, standalone: false, push: true, secure: false });
  assert.equal(pwa.isIOS(), false);
  assert.match(pwa.pushBlocker()!, /HTTPS.*Tailscale/);
});

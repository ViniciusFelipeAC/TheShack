/** Detalhes do app instalado (PWA), com atenção especial ao iPhone, que tem regras próprias. */

/** iPhone ou iPad (o iPad moderno se apresenta como Mac, mas tem tela de toque). */
export function isIOS(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/** Aberto pelo ícone da Tela de Início, sem a barra do Safari. */
export function isStandalone(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Nome sugerido para o dispositivo no pareamento. */
export function defaultDeviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (isIOS()) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  return 'Navegador';
}

/** No build de produção, registra o service worker: abre mais rápido e recebe push com o app fechado. */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

/**
 * No celular, a altura útil é a da parte visível da tela. No iPhone, o teclado não encolhe a página:
 * sem isso, a caixa de texto do chat fica escondida atrás dele.
 */
export function watchViewport(): void {
  const vv = window.visualViewport;
  if (!vv || !matchMedia('(pointer: coarse)').matches) return;
  const root = document.documentElement;
  root.classList.add('vv');
  const update = () => {
    root.style.setProperty('--app-h', `${Math.round(vv.height)}px`);
    root.style.setProperty('--app-top', `${Math.round(vv.offsetTop)}px`);
    root.toggleAttribute('data-keyboard', window.innerHeight - vv.height > 120);
  };
  vv.addEventListener('resize', update);
  vv.addEventListener('scroll', update);
  update();
}

/** O que falta para o push funcionar neste aparelho, em português. Nulo quando dá para ativar. */
export function pushBlocker(): string | null {
  if (isIOS() && !isStandalone()) {
    return 'No iPhone, as notificações só funcionam com a Shack instalada. No Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início". Abra a Shack pelo ícone novo, entre com um código de pareamento e ative aqui.';
  }
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS()
      ? 'Este iPhone não suporta notificações de apps da web. Atualize o iOS para a versão 16.4 ou mais nova.'
      : 'Este navegador não suporta notificações push.';
  }
  if (!window.isSecureContext) return 'As notificações exigem HTTPS. No celular, abra a Shack pelo endereço do Tailscale (https://…).';
  return null;
}

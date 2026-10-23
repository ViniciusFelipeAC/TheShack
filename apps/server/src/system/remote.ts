import { execFile } from 'node:child_process';

/** Como o celular chega na Shack: pelo Tailscale, com HTTPS de verdade (o iPhone exige HTTPS para PWA e push). */
export type RemoteInfo = {
  tailscale: 'missing' | 'stopped' | 'running';
  /** Endereço HTTPS da máquina na sua tailnet, por exemplo https://meu-pc.tail1234.ts.net */
  url: string | null;
  /** Verdadeiro quando o `tailscale serve` já repassa o HTTPS para a porta da Shack. Nulo quando não deu para saber. */
  serving: boolean | null;
  /** Comando para ligar o repasse, com a porta certa. */
  serveCommand: string;
};

export type Exec = (file: string, args: string[]) => Promise<string>;

const run: Exec = (file, args) => new Promise((resolve, reject) => {
  execFile(file, args, { windowsHide: true, timeout: 4000, maxBuffer: 2 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
});

// No Windows o instalador nem sempre põe o tailscale no PATH de quem já tinha um terminal aberto.
const CANDIDATES = process.platform === 'win32' ? ['tailscale', 'C:\\Program Files\\Tailscale\\tailscale.exe'] : ['tailscale'];

export async function remoteInfo(port: number, exec: Exec = run): Promise<RemoteInfo> {
  const serveCommand = `tailscale serve --bg ${port}`;
  for (const bin of CANDIDATES) {
    let status: { BackendState?: string; Self?: { DNSName?: string } };
    try { status = JSON.parse(await exec(bin, ['status', '--json'])); } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      // O binário existe, mas o serviço está parado ou deslogado.
      return { tailscale: 'stopped', url: null, serving: null, serveCommand };
    }
    const host = status.Self?.DNSName?.replace(/\.$/, '') || null;
    if (status.BackendState !== 'Running' || !host) return { tailscale: 'stopped', url: null, serving: null, serveCommand };
    let serving: boolean | null = null;
    try {
      const serve = JSON.parse((await exec(bin, ['serve', 'status', '--json'])) || '{}') as { Web?: Record<string, { Handlers?: Record<string, { Proxy?: string }> }> };
      const handlers = Object.values(serve.Web ?? {}).flatMap((w) => Object.values(w.Handlers ?? {}));
      serving = handlers.some((h) => h.Proxy && new RegExp(`:${port}/?$`).test(h.Proxy));
    } catch { /* versão antiga do Tailscale: sem saída em JSON */ }
    return { tailscale: 'running', url: `https://${host}`, serving, serveCommand };
  }
  return { tailscale: 'missing', url: null, serving: null, serveCommand };
}

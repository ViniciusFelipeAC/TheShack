import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Onde o Edge, o Chrome ou o Chromium costumam estar. O render do Harker usa o navegador que já está
 * instalado: o Playwright não baixa outro.
 */
function candidates(env: Record<string, string | undefined>): string[] {
  if (process.platform === 'win32') {
    const dirs = [env['ProgramFiles(x86)'], env.ProgramFiles, env.LOCALAPPDATA].filter((d): d is string => Boolean(d));
    return dirs.flatMap((d) => [join(d, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), join(d, 'Google', 'Chrome', 'Application', 'chrome.exe')]);
  }
  if (process.platform === 'darwin') {
    return ['Microsoft Edge', 'Google Chrome', 'Chromium'].map((app) => `/Applications/${app}.app/Contents/MacOS/${app}`);
  }
  return ['chromium', 'chromium-browser', 'google-chrome-stable', 'google-chrome', 'microsoft-edge-stable', 'microsoft-edge']
    .map((name) => `/usr/bin/${name}`);
}

/** O caminho de SHACK_BROWSER_PATH, se existir; senão, o primeiro navegador encontrado. Nulo quando não há nenhum. */
export function findBrowser(env: Record<string, string | undefined> = process.env): string | null {
  const chosen = env.SHACK_BROWSER_PATH?.trim();
  if (chosen) return existsSync(chosen) ? chosen : null;
  return candidates(env).find((p) => existsSync(p)) ?? null;
}

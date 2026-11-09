// Cria o atalho "The Shack", com o ícone de pixel art do app. Uso: npm run shortcut.
// Windows: atalho na Área de Trabalho (shortcut.ps1). Linux: lançador no menu de aplicativos, que roda o open.sh.
// Rode uma vez em cada máquina; o atalho aponta para esta pasta.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

if (process.platform === 'win32') {
  const ps = spawnSync('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', join(root, 'scripts', 'shortcut.ps1')], { stdio: 'inherit' });
  process.exit(ps.status ?? 1);
}

// Argumento do Exec de um .desktop: entre aspas, com \ " ` $ escapados, e o \ dobrado de novo por ser valor de texto.
const arg = (s: string) => `"${s.replace(/[\\"`$]/g, (c) => `\\${c}`).replace(/\\/g, '\\\\').replace(/%/g, '%%')}"`;

// O GNOME não mostra ícones na Área de Trabalho; o lançador vai para o menu, de onde dá para fixá-lo na barra.
const dir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'applications');
const file = join(dir, 'the-shack.desktop');
mkdirSync(dir, { recursive: true });
writeFileSync(file, [
  '[Desktop Entry]',
  'Type=Application',
  'Name=The Shack',
  'Comment=Abre a Shack (sobe o servidor se precisar)',
  `Exec=bash ${arg(join(root, 'scripts', 'open.sh'))}`,
  `Icon=${join(root, 'apps', 'web', 'public', 'icons', 'icon-512.png').replace(/\\/g, '\\\\')}`,
  'Terminal=false',
  // A janela que abre é do navegador; sem isso, o cursor fica girando à espera de uma janela da Shack.
  'StartupNotify=false',
  'Categories=Utility;',
  'Actions=stop;',
  '',
  '[Desktop Action stop]',
  'Name=Desligar o servidor',
  'Exec=systemctl --user stop the-shack',
  '',
].join('\n'));
console.log(`Lançador criado em ${file}`);

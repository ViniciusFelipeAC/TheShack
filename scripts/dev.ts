// Sobe o servidor e o app web juntos. Ctrl+C encerra os dois.
import { type ChildProcess, spawn, spawnSync } from 'node:child_process';

const isWindows = process.platform === 'win32';
const procs: Array<{ name: string; color: string; child: ChildProcess }> = [];

function run(name: string, color: string, workspace: string) {
  const child = spawn(isWindows ? 'npm.cmd' : 'npm', ['run', 'dev', '-w', workspace], { stdio: ['ignore', 'pipe', 'pipe'], shell: isWindows });
  const print = (chunk: Buffer) => {
    for (const line of chunk.toString().split(/\r?\n/)) if (line.trim()) console.log(`${color}[${name}]\x1b[0m ${line}`);
  };
  child.stdout?.on('data', print);
  child.stderr?.on('data', print);
  child.on('exit', (code) => { console.log(`${color}[${name}]\x1b[0m encerrado (${code ?? 0})`); shutdown(); });
  procs.push({ name, color, child });
}

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  for (const { child } of procs) {
    if (child.exitCode !== null || !child.pid) continue;
    // No Windows, matar o shell não mata o node filho: derruba a árvore inteira.
    if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGINT');
  }
  setTimeout(() => process.exit(0), 500);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

run('servidor', '\x1b[33m', '@shack/server');
run('web', '\x1b[36m', '@shack/web');
console.log('Abra http://127.0.0.1:5173 quando o Vite avisar que está pronto. Ctrl+C encerra tudo.');

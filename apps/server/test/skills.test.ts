import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse } from 'yaml';
import { ROOT } from '../src/config.ts';

// As skills de plugins/shack foram lidas antes de entrar (docs/PHASE-9.md, seção 4).
// Estes testes seguram as regras quando alguém copiar uma versão nova do original.
const PLUGIN = join(ROOT, 'plugins', 'shack');
const SKILLS = join(PLUGIN, 'skills');

const filesIn = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? filesIn(join(dir, e.name)) : [join(dir, e.name)]));

test('o plugin se chama shack e traz só as skills lidas', () => {
  const manifest = JSON.parse(readFileSync(join(PLUGIN, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'shack');
  // Skill nova só entra depois de lida: mudar esta lista é uma decisão consciente.
  assert.deepEqual(readdirSync(SKILLS).sort(), ['canvas-design', 'theme-factory']);
});

test('cada skill tem SKILL.md com o nome da pasta, licença e origem', () => {
  for (const name of readdirSync(SKILLS)) {
    const dir = join(SKILLS, name);
    const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(readFileSync(join(dir, 'SKILL.md'), 'utf8'));
    assert.ok(front, `${name}: SKILL.md sem cabeçalho`);
    assert.equal(parse(front[1]).name, name);
    assert.match(readFileSync(join(dir, 'LICENSE.txt'), 'utf8'), /Apache License\s+Version 2\.0/);
    assert.match(readFileSync(join(dir, 'SOURCE.md'), 'utf8'), /Commit:\*\* `[0-9a-f]{40}`/);
  }
});

test('nenhuma instrução manda baixar, instalar ou abrir endereço', () => {
  // O SOURCE.md cita a frase que saiu, por isso fica de fora.
  const texts = filesIn(SKILLS).filter((f) => f.endsWith('.md') && !f.endsWith('SOURCE.md'));
  assert.ok(texts.length >= 12);
  for (const f of texts) {
    const text = readFileSync(f, 'utf8');
    assert.doesNotMatch(text, /\b(download|install|curl|wget|pip|npm|npx)\b/i, f);
    assert.doesNotMatch(text, /https?:\/\//i, f);
  }
});

test('o guia de "cara de IA" do Harker é a mesma cópia do da Mina', () => {
  const read = (agent: string) => readFileSync(join(ROOT, 'agents', agent, 'knowledge', 'ai-look-signals.md'), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(read('harker'), read('mina'), 'atualize as duas cópias juntas');
});

test('cada fonte é TrueType e a família tem a licença OFL', () => {
  const dir = join(SKILLS, 'canvas-design', 'canvas-fonts');
  const files = readdirSync(dir);
  const fonts = files.filter((f) => f.endsWith('.ttf'));
  assert.ok(fonts.length >= 50);
  for (const f of fonts) {
    assert.equal(readFileSync(join(dir, f)).readUInt32BE(0), 0x00010000, `${f} não é TrueType`);
    const license = `${f.split('-')[0]}-OFL.txt`;
    assert.ok(files.includes(license), `${f} sem ${license}`);
    assert.match(readFileSync(join(dir, license), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  }
});

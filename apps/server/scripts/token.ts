// Cria um token de dispositivo. Uso: npm run token -- --name "Meu PC" --kind web
import { parseArgs } from 'node:util';
import { DeviceKind } from '@shack/shared';
import { Auth } from '../src/auth/tokens.ts';
import { loadConfig, loadDotEnv } from '../src/config.ts';
import { openDb } from '../src/db/database.ts';
import { devicesRepo } from '../src/db/repos.ts';

const { values } = parseArgs({
  options: { name: { type: 'string', default: 'Este PC' }, kind: { type: 'string', default: 'web' } },
});
const kind = DeviceKind.parse(values.kind);

loadDotEnv();
const db = openDb(loadConfig().dbPath);
const { token, device } = new Auth(devicesRepo(db)).createDevice(values.name ?? 'Este PC', kind);
db.close();

console.log(`Dispositivo criado: ${device.name} (${device.kind})`);
console.log('Guarde este token agora. Ele não aparece de novo:');
console.log('');
console.log(token);

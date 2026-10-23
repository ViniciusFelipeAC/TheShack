import { createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import type { Device, DeviceKind, PairingCode, PairResult } from '@shack/shared';
import { now } from '../db/database.ts';
import type { DevicesRepo } from '../db/repos.ts';
import { HttpError, notFound } from '../errors.ts';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const PAIRING_TTL_MS = 5 * 60_000;
const TOUCH_EVERY_MS = 60_000;
const MAX_FAILED_PAIRINGS = 10;
const FAILED_WINDOW_MS = 10 * 60_000;

/**
 * Tokens por dispositivo. O token aparece uma única vez; o banco guarda só o hash SHA-256.
 * Estes tokens são do Shack e não têm relação com o seu login da Anthropic.
 */
export class Auth {
  #repo: DevicesRepo;
  #failedPairings: number[] = [];

  constructor(repo: DevicesRepo) {
    this.#repo = repo;
  }

  createDevice(name: string, kind: DeviceKind): PairResult {
    const token = `shk_${randomBytes(32).toString('base64url')}`;
    const device = this.#repo.insert({ id: randomUUID(), name, kind, tokenHash: sha256(token) });
    return { token, device };
  }

  verify(token: string | null | undefined): Device | null {
    if (!token || !token.startsWith('shk_')) return null;
    const device = this.#repo.byTokenHash(sha256(token));
    if (!device || device.revokedAt) return null;
    const at = now();
    if (!device.lastSeenAt || Date.parse(at) - Date.parse(device.lastSeenAt) > TOUCH_EVERY_MS) this.#repo.touch(device.id, at);
    return device;
  }

  list(): Device[] {
    return this.#repo.list();
  }

  revoke(id: string): Device {
    if (!this.#repo.get(id)) throw notFound('Dispositivo');
    this.#repo.revoke(id, now());
    return this.#repo.get(id)!;
  }

  /** Código de 6 dígitos, válido por 5 minutos, criado por um dispositivo já autenticado. */
  createPairingCode(createdBy: string): PairingCode {
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString();
    this.#repo.insertPairing(sha256(code), createdBy, expiresAt);
    return { code, expiresAt };
  }

  pair(code: string, deviceName: string, kind: DeviceKind): PairResult {
    const t = Date.now();
    this.#failedPairings = this.#failedPairings.filter((at) => t - at < FAILED_WINDOW_MS);
    if (this.#failedPairings.length >= MAX_FAILED_PAIRINGS) {
      throw new HttpError(429, 'too_many_attempts', 'Muitas tentativas de pareamento. Espere alguns minutos.');
    }
    if (!this.#repo.usePairing(sha256(code), now())) {
      this.#failedPairings.push(t);
      throw new HttpError(401, 'invalid_code', 'Código inválido ou expirado.');
    }
    return this.createDevice(deviceName, kind);
  }
}

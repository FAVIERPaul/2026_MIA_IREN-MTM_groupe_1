import type { ErrorCode } from '../../src/network/types.js';
export class NetworkError extends Error {
 constructor(public code: ErrorCode, message: string) { super(message); }
}
export function fail(code: ErrorCode, message: string): never { throw new NetworkError(code, message); }
export function payload(value: unknown, keys: string[]): Record<string, unknown> {
 if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_PAYLOAD', 'Objet attendu.');
 const record = value as Record<string, unknown>;
 if (Object.keys(record).length !== keys.length || keys.some(k => !Object.hasOwn(record, k))) fail('INVALID_PAYLOAD', 'Champs invalides.');
 return record;
}
export function bounded(value: unknown, max: number): string {
 if (typeof value !== 'string' || value.length > max) fail('INVALID_PAYLOAD', 'Texte invalide ou trop long.');
 return value;
}
export function nickname(value: unknown): string {
 const name = bounded(value, 100).trim().replace(/\s+/gu, ' ').normalize('NFC');
 if (name.length < 2 || name.length > 20 || /[\p{C}<>]/u.test(name)) fail('INVALID_PAYLOAD', 'Pseudo : 2 à 20 caractères, sans caractères de contrôle ni chevrons.');
 return name;
}
export function roomCode(value: unknown): string {
 const code = bounded(value, 6).toUpperCase();
 if (!/^[A-Z0-9]{6}$/.test(code)) fail('INVALID_PAYLOAD', 'Code de salon invalide.');
 return code;
}

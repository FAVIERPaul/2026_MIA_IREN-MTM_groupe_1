import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import type { Player } from '../rooms/roomTypes.js';
export class PlayerManager {
 readonly players = new Map<string, Player>();
 readonly connections = new Map<string, string>();
 hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
 issue(player: Player): string { const token = randomBytes(32).toString('hex'); player.tokenHash = this.hash(token); return token; }
 verify(player: Player, token: string) { return timingSafeEqual(Buffer.from(player.tokenHash, 'hex'), Buffer.from(this.hash(token), 'hex')); }
 create(roomId: string, nickname: string, socketId: string, arrivalOrder: number): Player {
 const player: Player = { id: randomUUID(), nickname, roomId, socketId, arrivalOrder, connectedAt: Date.now(), status: 'connected', tokenHash: '', expiresAt: null };
 this.players.set(player.id, player); this.connections.set(socketId, player.id); return player;
 }
 remove(player: Player) { if (player.socketId) this.connections.delete(player.socketId); this.players.delete(player.id); }
}

import { randomInt, randomUUID } from 'node:crypto';
import { PlayerManager } from '../players/PlayerManager.js';
import { fail } from '../security/validation.js';
import type { Room, Player } from './roomTypes.js';
import type { PublicRoom, Membership } from '../../src/network/types.js';
export interface RoomOptions { graceMs?: number; maxRooms?: number; maxPlayers?: number }
export class RoomManager {
 readonly rooms = new Map<string, Room>();
 readonly players = new PlayerManager();
 readonly graceMs: number;
 constructor(readonly options: RoomOptions = {}) { this.graceMs = options.graceMs ?? 60_000; }
 publicRoom(room: Room): PublicRoom {
 const players = [...room.players.values()].map(p => ({ id: p.id, nickname: p.nickname, roomId: p.roomId, status: p.status, isHost: p.id === room.hostId, connectedAt: p.connectedAt, arrivalOrder: p.arrivalOrder }));
 return { id: room.id, code: room.code, state: room.state, players, hostId: room.hostId, remainingSlots: 8 - players.length, connectedCount: players.filter(p => p.status === 'connected').length, revision: room.revision };
 }
 get(code: string) { const room = this.rooms.get(code); if (!room) fail('ROOM_NOT_FOUND', 'Salon introuvable.'); return room; }
 member(socketId: string): { player: Player; room: Room } {
 const id = this.players.connections.get(socketId); const player = id && this.players.players.get(id);
 if (!player) fail('NOT_IN_ROOM', 'Vous ne faites partie d’aucun salon.');
 return { player, room: [...this.rooms.values()].find(r => r.id === player.roomId)! };
 }
 available(socketId: string) {
 if (this.players.connections.has(socketId)) fail('ALREADY_IN_ROOM', 'Vous êtes déjà dans un salon.');
 if (this.players.players.size >= (this.options.maxPlayers ?? 8000)) fail('LIMIT_REACHED', 'Limite de joueurs atteinte.');
 }
 create(socketId: string, name: string): Membership {
 this.available(socketId);
 if (this.rooms.size >= (this.options.maxRooms ?? 1000)) fail('LIMIT_REACHED', 'Limite de salons atteinte.');
 const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let code: string;
 do { code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join(''); } while (this.rooms.has(code));
 const room: Room = { id: randomUUID(), code, state: 'waiting', players: new Map(), hostId: null, revision: 0, nextOrder: 0 };
 this.rooms.set(code, room); return this.add(room, socketId, name);
 }
 join(socketId: string, code: string, name: string) {
 this.available(socketId); const room = this.get(code);
 if (room.state !== 'waiting') fail('ROOM_NOT_WAITING', 'La session a déjà commencé.');
 if (room.players.size >= 8) fail('ROOM_FULL', 'Salon complet.');
 if ([...room.players.values()].some(p => p.nickname.toLowerCase() === name.toLowerCase())) fail('NICKNAME_TAKEN', 'Pseudo déjà utilisé.');
 return this.add(room, socketId, name);
 }
 private add(room: Room, socketId: string, name: string): Membership {
 const player = this.players.create(room.id, name, socketId, room.nextOrder++); room.players.set(player.id, player);
 if (!room.hostId) room.hostId = player.id;
 room.revision++; return { room: this.publicRoom(room), playerId: player.id, reconnectToken: this.players.issue(player) };
 }
 reconnect(socketId: string, id: string, token: string): Membership {
 if (this.players.connections.has(socketId)) fail('ALREADY_IN_ROOM', 'Vous êtes déjà dans un salon.');
 const p = this.players.players.get(id);
 if (!p || p.status !== 'disconnected' || p.expiresAt === null || p.expiresAt <= Date.now() || !this.players.verify(p, token)) fail('INVALID_TOKEN', 'Reconnexion invalide ou expirée.');
 const room = [...this.rooms.values()].find(r => r.id === p.roomId)!;
 p.socketId = socketId; p.status = 'connected'; p.expiresAt = null; this.players.connections.set(socketId, p.id);
 if (!room.hostId) room.hostId = p.id;
 room.revision++; return { room: this.publicRoom(room), playerId: p.id, reconnectToken: this.players.issue(p) };
 }
 disconnect(socketId: string) {
 if (!this.players.connections.has(socketId)) return;
 const { player, room } = this.member(socketId); this.players.connections.delete(socketId);
 player.socketId = null; player.status = 'disconnected'; player.expiresAt = Date.now() + this.graceMs; room.revision++;
 return { room, playerId: player.id };
 }
 private remove(room: Room, player: Player) {
 room.players.delete(player.id); this.players.remove(player);
 if (room.hostId === player.id) room.hostId = [...room.players.values()].filter(p => p.status === 'connected').sort((a,b) => a.arrivalOrder - b.arrivalOrder)[0]?.id ?? null;
 room.revision++; if (!room.players.size) this.rooms.delete(room.code);
 }
 leave(socketId: string) { const { room, player } = this.member(socketId); this.remove(room, player); return room; }
 expire(now = Date.now()) {
 const changed = new Set<Room>();
 for (const room of this.rooms.values()) for (const p of room.players.values()) if (p.expiresAt !== null && p.expiresAt <= now) { this.remove(room, p); changed.add(room); }
 return [...changed];
 }
 start(socketId: string) {
 const { player, room } = this.member(socketId);
 if (room.hostId !== player.id) fail('NOT_HOST', 'Action réservée à l’hôte.');
 if (room.state !== 'waiting') fail('ROOM_NOT_WAITING', 'Le salon n’est plus en attente.');
 if (this.publicRoom(room).connectedCount < 3) fail('NOT_ENOUGH_PLAYERS', 'Trois joueurs connectés sont nécessaires.');
 room.state = 'playing'; room.revision++; return room;
 }
 // Extension réservée au moteur serveur : aucune commande client ne termine une partie.
 finish(code: string) { const room = this.get(code); if (room.state !== 'playing') fail('ROOM_NOT_WAITING', 'Session non démarrée.'); room.state = 'finished'; room.revision++; return room; }
}

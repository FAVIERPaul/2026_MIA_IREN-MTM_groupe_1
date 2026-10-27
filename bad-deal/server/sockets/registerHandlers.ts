import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ServerToClientEvents } from '../../src/network/events.js';
import type { Ack } from '../../src/network/types.js';
import { RoomManager } from '../rooms/RoomManager.js';
import { NetworkError, payload, nickname, roomCode, bounded, fail } from '../security/validation.js';
export type GameServer = Server<ClientToServerEvents, ServerToClientEvents>;
export type GameSocket = Socket<ClientToServerEvents, ServerToClientEvents>;
// Le futur moteur d’enchères recevra cette identité uniquement après contrôle serveur.
export interface AuthorizedActionContext { playerId: string; roomId: string; revision: number }
export interface GameActionValidator { validate(context: AuthorizedActionContext, action: unknown): void }
export function registerHandlers(io: GameServer, socket: GameSocket, manager: RoomManager) {
 let windowAt = Date.now(); let requests = 0;
 const publish = (code: string) => io.to(manager.get(code).id).emit('room:updated', manager.publicRoom(manager.get(code)));
 function command(event: keyof ClientToServerEvents, keys: string[], run: (p: Record<string, unknown>) => unknown) {
 // Tous les handlers restent synchrones : une connexion ne peut pas acquérir deux places entre deux await.
 socket.on(event, ((raw: unknown, ack: unknown) => {
 if (typeof ack !== 'function') return;
 let result: Ack<unknown>;
 try {
 if (Date.now() - windowAt >= 10_000) { windowAt = Date.now(); requests = 0; }
 if (++requests > 30) fail('RATE_LIMITED', 'Trop de demandes ; réessayez dans quelques secondes.');
 result = { success: true, data: run(payload(raw, keys)) };
 } catch (error) {
 result = error instanceof NetworkError ? { success: false, code: error.code, message: error.message } : { success: false, code: 'INTERNAL_ERROR', message: 'Erreur interne du serveur.' };
 }
 ack(result);
 }) as never);
 }
 command('room:create', ['nickname'], p => { const data = manager.create(socket.id, nickname(p.nickname)); void socket.join(data.room.id); publish(data.room.code); return data; });
 command('room:join', ['nickname', 'code'], p => { const data = manager.join(socket.id, roomCode(p.code), nickname(p.nickname)); void socket.join(data.room.id); publish(data.room.code); return data; });
 command('room:reconnect', ['playerId', 'reconnectToken'], p => {
 const data = manager.reconnect(socket.id, bounded(p.playerId, 36), bounded(p.reconnectToken, 64));
 void socket.join(data.room.id); publish(data.room.code); io.to(data.room.id).emit('player:reconnected', { room: data.room, playerId: data.playerId }); return data;
 });
 command('room:leave', [], () => { const room = manager.leave(socket.id); void socket.leave(room.id); io.to(room.id).emit('room:updated', manager.publicRoom(room)); return null; });
 command('room:start', [], () => { const room = manager.start(socket.id); const data = manager.publicRoom(room); io.to(room.id).emit('room:updated', data); io.to(room.id).emit('room:started', data); return data; });
 socket.on('disconnect', () => { const data = manager.disconnect(socket.id); if (data) { const room = manager.publicRoom(data.room); io.to(room.id).emit('room:updated', room); io.to(room.id).emit('player:disconnected', { room, playerId: data.playerId }); } });
}

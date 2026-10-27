import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { io, type Socket } from 'socket.io-client';
import { createApp } from '../app.js';
import type { Ack, Membership, PublicRoom } from '../../src/network/types.js';
import type { AddressInfo } from 'node:net';
let app: ReturnType<typeof createApp>;
let url: string;
let clients: Socket[];
beforeEach(async () => {
 app = createApp({ graceMs: 150 }); clients = [];
 await new Promise<void>(resolve => app.httpServer.listen(0, '127.0.0.1', resolve));
 url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => { clients.forEach(c => c.disconnect()); await app.close(); });
async function client() {
 const socket = io(url, { transports: ['websocket'], forceNew: true, reconnection: false }); clients.push(socket);
 await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); return socket;
}
function command<T = Membership>(socket: Socket, event: string, payload: unknown = {}): Promise<Ack<T>> {
 return new Promise((resolve, reject) => socket.timeout(2000).emit(event, payload, (error: Error | null, result: Ack<T>) => error ? reject(error) : resolve(result)));
}
function success<T>(result: Ack<T>): T { expect(result.success).toBe(true); if (!result.success) throw new Error(result.message); return result.data; }
function error(result: Ack<unknown>, code: string) { expect(result).toMatchObject({ success: false, code }); }
async function create() { const host = await client(); const data = success(await command(host, 'room:create', { nickname: 'Alice' })); return { host, data }; }
async function join(code: string, nickname = 'Bob') { const socket = await client(); const data = success(await command(socket, 'room:join', { code, nickname })); return { socket, data }; }
async function until(test: () => boolean) { await expect.poll(test, { timeout: 3000, interval: 10 }).toBe(true); }
describe('Serveur HTTP et clients Socket.IO réels', () => {
 it('crée un salon, un code sûr, des identités distinctes et aucun secret public', async () => {
 const { host, data } = await create(); expect(data.room.code).toMatch(/^[A-Z0-9]{6}$/); expect(data.room.state).toBe('waiting');
 expect(new Set([data.room.id, data.playerId, host.id, data.room.code]).size).toBe(4);
 expect(data.room.hostId).toBe(data.playerId); expect(data.reconnectToken).toHaveLength(64);
 expect(JSON.stringify(data.room)).not.toMatch(/token|socketId|expiresAt/i);
 });
 it('connecte trois joueurs et synchronise la liste avec révision', async () => {
 const { host, data } = await create(); const updates: PublicRoom[] = []; host.on('room:updated', r => updates.push(r));
 await join(data.room.code); await join(data.room.code, 'Charlie');
 await until(() => updates.some(r => r.players.length === 3));
 expect(updates.at(-1)).toMatchObject({ connectedCount: 3, remainingSlots: 5, revision: 3 });
 });
 it('refuse le neuvième joueur', async () => {
 const { data } = await create(); for (let i = 0; i < 7; i++) await join(data.room.code, `Joueur${i}`);
 error(await command(await client(), 'room:join', { code: data.room.code, nickname: 'Neuvième' }), 'ROOM_FULL');
 });
 it('refuse un salon inexistant, un pseudo invalide et les doublons normalisés', async () => {
 const socket = await client(); error(await command(socket, 'room:join', { code: 'ZZZZZZ', nickname: 'Bob' }), 'ROOM_NOT_FOUND');
 error(await command(socket, 'room:create', { nickname: ' x ' }), 'INVALID_PAYLOAD');
 const { data } = await create(); error(await command(socket, 'room:join', { code: data.room.code, nickname: ' ALICE ' }), 'NICKNAME_TAKEN');
 });
 it('contrôle le nombre de joueurs, le rôle hôte et l’état avant démarrage', async () => {
 const { host, data } = await create(); error(await command(host, 'room:start'), 'NOT_ENOUGH_PLAYERS');
 const second = await join(data.room.code); await join(data.room.code, 'Charlie');
 error(await command(second.socket, 'room:start'), 'NOT_HOST');
 const event = new Promise<PublicRoom>(resolve => second.socket.once('room:started', resolve));
 expect(success(await command<PublicRoom>(host, 'room:start')).state).toBe('playing'); expect((await event).state).toBe('playing');
 error(await command(await client(), 'room:join', { code: data.room.code, nickname: 'Late' }), 'ROOM_NOT_WAITING');
 error(await command(host, 'room:start'), 'ROOM_NOT_WAITING');
 });
 it('notifie la déconnexion et restaure l’identité avec rotation du jeton', async () => {
 const { host, data } = await create(); const second = await join(data.room.code);
 const disconnected = new Promise<{ room: PublicRoom }>(resolve => second.socket.once('player:disconnected', resolve)); host.disconnect();
 expect((await disconnected).room.players[0].status).toBe('disconnected');
 const replacement = await client();
 error(await command(replacement, 'room:reconnect', { playerId: data.playerId, reconnectToken: 'invalid' }), 'INVALID_TOKEN');
 const notification = new Promise(resolve => second.socket.once('player:reconnected', resolve));
 const restored = success(await command(replacement, 'room:reconnect', { playerId: data.playerId, reconnectToken: data.reconnectToken })); await notification;
 expect(restored.playerId).toBe(data.playerId); expect(restored.reconnectToken).not.toBe(data.reconnectToken);
 replacement.disconnect(); await until(() => app.manager.players.players.get(data.playerId)?.status === 'disconnected');
 error(await command(await client(), 'room:reconnect', { playerId: data.playerId, reconnectToken: data.reconnectToken }), 'INVALID_TOKEN');
 });
 it('expire la réservation et transfère l’hôte au plus ancien connecté', async () => {
 const { host, data } = await create(); const second = await join(data.room.code); await join(data.room.code, 'Charlie'); host.disconnect();
 await until(() => !app.manager.players.players.has(data.playerId));
 expect(app.manager.get(data.room.code).hostId).toBe(second.data.playerId);
 error(await command(await client(), 'room:reconnect', { playerId: data.playerId, reconnectToken: data.reconnectToken }), 'INVALID_TOKEN');
 });
 it('transfère immédiatement au départ volontaire et détruit un salon vide', async () => {
 const { host, data } = await create(); const second = await join(data.room.code);
 success(await command(host, 'room:leave')); expect(app.manager.get(data.room.code).hostId).toBe(second.data.playerId);
 success(await command(second.socket, 'room:leave')); expect(app.manager.rooms.size).toBe(0);
 });
 it('supprime le salon après expiration de tous les joueurs déconnectés', async () => {
 const { host } = await create(); host.disconnect(); await until(() => app.manager.rooms.size === 0);
 });
 it('isole intégralement deux salons et interdit une double inscription', async () => {
 const first = await create(); const second = await create(); const updates: PublicRoom[] = []; second.host.on('room:updated', r => updates.push(r));
 await join(first.data.room.code); success(await command(first.host, 'room:leave'));
 success(await command(second.host, 'room:leave')); // aller-retour : tous les messages antérieurs ont été traités
 expect(updates).toHaveLength(0);
 const third = await create(); error(await command(third.host, 'room:join', { code: first.data.room.code, nickname: 'Other' }), 'ALREADY_IN_ROOM');
 });
 it('résiste aux payloads malformés et ignore les commandes sans acknowledgment', async () => {
 const socket = await client();
 for (const payload of [null, [], 12, 'text', {}, { nickname: 'A'.repeat(1000) }, { nickname: {} }, { nickname: 'Valid', hostId: 'fake' }]) error(await command(socket, 'room:create', payload), 'INVALID_PAYLOAD');
 socket.emit('room:create', { nickname: 'NoAck' });
 success(await command(socket, 'room:create', { nickname: 'Valid' })); expect(app.manager.rooms.size).toBe(1);
 });
 it('limite la fréquence et reste utilisable', async () => {
 const socket = await client(); for (let i = 0; i < 30; i++) await command(socket, 'room:create', null);
 error(await command(socket, 'room:create', { nickname: 'Valid' }), 'RATE_LIMITED');
 await create();
 });
 it('bloque les origines navigateur interdites', async () => {
 const socket = io(url, { transports: ['websocket'], reconnection: false, extraHeaders: { Origin: 'https://evil.example' } }); clients.push(socket);
 await new Promise<void>(resolve => socket.once('connect_error', () => resolve())); expect(socket.connected).toBe(false);
 });
});
it('sérialise les demandes concurrentes d’une même connexion', async () => {
 const socket = await client();
 const results = await Promise.all([command(socket, 'room:create', { nickname: 'First' }), command(socket, 'room:create', { nickname: 'Second' })]);
 expect(results.filter(r => r.success)).toHaveLength(1); error(results[1], 'ALREADY_IN_ROOM');
 expect(app.manager.rooms.size).toBe(1);
});
it('réserve le pseudo et la place sans autoriser une usurpation par identifiant', async () => {
 const { host, data } = await create(); const observer = await join(data.room.code);
 host.disconnect(); await until(() => app.manager.players.players.get(data.playerId)?.status === 'disconnected');
 const stranger = await client();
 error(await command(stranger, 'room:reconnect', { playerId: data.playerId, reconnectToken: data.playerId }), 'INVALID_TOKEN');
 error(await command(stranger, 'room:join', { code: data.room.code, nickname: 'Alice' }), 'NICKNAME_TAKEN');
 expect(app.manager.publicRoom(app.manager.get(data.room.code))).toMatchObject({ remainingSlots: 6, connectedCount: 1, hostId: data.playerId });
 error(await command(stranger, 'room:start'), 'NOT_IN_ROOM');
 error(await command(stranger, 'room:leave'), 'NOT_IN_ROOM');
 expect(observer.data.room.players).toHaveLength(2);
});

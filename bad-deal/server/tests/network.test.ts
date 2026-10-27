/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { createNetwork } from '../../src/network/socket.js';
import type { ConnectionState } from '../../src/network/socket.js';
import type { PublicRoom } from '../../src/network/types.js';

let app: ReturnType<typeof createApp>;
let url: string;
let clients: ReturnType<typeof createNetwork>[];
beforeEach(async () => {
  app = createApp({ graceMs: 300 });
  clients = [];
  await new Promise<void>(resolve => app.httpServer.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(app.httpServer.address() as AddressInfo).port}`;
});
afterEach(async () => {
  clients.forEach(client => client.dispose());
  await app.close();
});
async function connected() {
  const client = createNetwork(url);
  clients.push(client);
  client.connect();
  await expect.poll(() => client.getConnectionState()).toBe('connected');
  return client;
}
it('utilise le client de la console pour créer, rejoindre, synchroniser et démarrer à trois', async () => {
  const [jimmy, emma, paul] = await Promise.all([connected(), connected(), connected()]);
  const membership = await jimmy.createRoom('Jimmy');
  await emma.joinRoom(membership.room.code, 'Emma');
  await paul.joinRoom(membership.room.code, 'Paul');
  await expect.poll(() => jimmy.getRoom()?.players.length).toBe(3);
  expect(jimmy.getPlayerId()).toBe(membership.playerId);
  expect(emma.getRoom()).toEqual(paul.getRoom());
  await expect(emma.startRoom()).rejects.toMatchObject({ code: 'NOT_HOST' });
  await jimmy.startRoom();
  await expect.poll(() => paul.getRoom()?.state).toBe('playing');
  expect(emma.getRoom()?.state).toBe('playing');
});
it('restaure la même identité après une coupure, sans duplication', async () => {
  const host = await connected();
  const membership = await host.createRoom('Jimmy');
  const observer = await connected();
  await observer.joinRoom(membership.room.code, 'Emma');
  const phases: ConnectionState[] = [];
  host.onConnectionState(state => phases.push(state));
  host.disconnect();
  await expect.poll(() => observer.getRoom()?.connectedCount).toBe(1);
  host.connect();
  await expect.poll(() => host.getConnectionState()).toBe('connected');
  await expect.poll(() => observer.getRoom()?.connectedCount).toBe(2);
  expect(phases).toContain('reconnecting');
  expect(host.getPlayerId()).toBe(membership.playerId);
  expect(host.getRoom()?.players).toHaveLength(2);
});
it('signale une réservation expirée, efface le salon et permet une nouvelle création', async () => {
  const host = await connected();
  const membership = await host.createRoom('Jimmy');
  const errors: unknown[] = [];
  host.onError(error => errors.push(error));
  host.disconnect();
  await expect.poll(() => app.manager.players.players.has(membership.playerId)).toBe(false);
  host.connect();
  await expect.poll(() => errors.length).toBe(1);
  expect(errors[0]).toMatchObject({ code: 'INVALID_TOKEN' });
  expect(host.getRoom()).toBeNull();
  expect(host.getPlayerId()).toBeNull();
  expect(host.getConnectionState()).toBe('connected');
  await host.createRoom('Jimmy');
});
it('ignore une ancienne révision et nettoie les abonnements et la connexion', async () => {
  const host = await connected();
  const membership = await host.createRoom('Jimmy');
  const seen: (PublicRoom | null)[] = [];
  const off = host.onRoom(room => seen.push(room));
  const newer = { ...membership.room, revision: 50 };
  app.io.to(membership.room.id).emit('room:updated', newer);
  await expect.poll(() => host.getRoom()?.revision).toBe(50);
  app.io.to(membership.room.id).emit('room:updated', { ...membership.room, revision: 2 });
  // Une commande et son acknowledgment garantissent que les événements antérieurs ont été reçus.
  await expect(host.startRoom()).rejects.toMatchObject({ code: 'NOT_ENOUGH_PLAYERS' });
  expect(host.getRoom()?.revision).toBe(50);
  off();
  await host.leaveRoom();
  expect(seen).toHaveLength(1);
  expect(host.getPlayerId()).toBeNull();
  host.dispose();
  await expect.poll(() => app.io.engine.clientsCount).toBe(0);
  await expect(host.createRoom('Jimmy')).rejects.toThrow('Serveur déconnecté');
});
it('conserve l’isolation des salons dans le client et propage les erreurs utiles', async () => {
  const a = await connected();
  const b = await connected();
  const first = await a.createRoom('Jimmy');
  const second = await b.createRoom('Emma');
  await expect(b.joinRoom(first.room.code, 'Paul')).rejects.toMatchObject({ code: 'ALREADY_IN_ROOM' });
  expect(b.getRoom()?.code).toBe(second.room.code);
  await b.leaveRoom();
  await expect(b.joinRoom(first.room.code, 'JIMMY')).rejects.toMatchObject({ code: 'NICKNAME_TAKEN' });
  await b.joinRoom(first.room.code, 'Emma');
  expect(b.getRoom()?.players).toHaveLength(2);
});

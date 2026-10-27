import { expect, it } from 'vitest';
import { RoomManager } from '../rooms/RoomManager.js';
import { createApp } from '../app.js';
it('limite salons et joueurs, vérifie unicité des codes', () => {
 const manager = new RoomManager({ maxRooms: 2, maxPlayers: 3 });
 const a = manager.create('a', 'Alice'); const b = manager.create('b', 'Bob');
 expect(a.room.code).not.toBe(b.room.code);
 expect(() => manager.create('c', 'Charlie')).toThrow('Limite de salons');
 manager.join('c', a.room.code, 'Charlie'); expect(() => manager.join('d', b.room.code, 'David')).toThrow('Limite de joueurs');
});
it('refuse une configuration production sans origines explicites', () => {
 expect(() => createApp({ production: true, origins: [] })).toThrow('ALLOWED_ORIGINS');
 expect(() => createApp({ production: true, origins: ['*'] })).toThrow('ALLOWED_ORIGINS');
});
it('prépare la transition serveur vers finished', () => {
 const manager = new RoomManager(); const a = manager.create('a', 'Alice'); manager.join('b', a.room.code, 'Bob'); manager.join('c', a.room.code, 'Charlie');
 manager.start('a'); expect(manager.finish(a.room.code).state).toBe('finished');
 expect(() => manager.join('d', a.room.code, 'David')).toThrow();
});

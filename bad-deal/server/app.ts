import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { RoomManager } from './rooms/RoomManager.js';
import type { RoomOptions } from './rooms/RoomManager.js';
import { registerHandlers } from './sockets/registerHandlers.js';
import type { ClientToServerEvents, ServerToClientEvents } from '../src/network/events.js';
export interface AppOptions extends RoomOptions { origins?: string[]; production?: boolean; maxConnections?: number }
export function createApp(options: AppOptions = {}) {
 const production = options.production ?? process.env.NODE_ENV === 'production';
 const origins = options.origins ?? process.env.ALLOWED_ORIGINS?.split(',').map(s => s.trim()).filter(Boolean) ?? (production ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173']);
 if (production && (!origins.length || origins.includes('*'))) throw new Error('ALLOWED_ORIGINS doit contenir des origines explicites en production.');
 const httpServer = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"status":"ok"}'); });
 const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
 cors: { origin: origins }, maxHttpBufferSize: 4096,
 // CORS seul ne protège pas le transport WebSocket. Les clients natifs sans Origin restent autorisés.
 allowRequest: (req, callback) => callback(null, !req.headers.origin || origins.includes(req.headers.origin)),
 });
 const manager = new RoomManager(options);
 io.use((_socket, next) => next(io.engine.clientsCount > (options.maxConnections ?? 10000) ? new Error('Limite de connexions atteinte.') : undefined));
 io.on('connection', socket => registerHandlers(io, socket, manager));
 const timer = setInterval(() => { for (const room of manager.expire()) io.to(room.id).emit('room:updated', manager.publicRoom(room)); }, Math.min(1000, Math.max(10, manager.graceMs)));
 timer.unref();
 return { httpServer, io, manager, close: async () => { clearInterval(timer); await new Promise<void>(resolve => io.close(() => resolve())); } };
}

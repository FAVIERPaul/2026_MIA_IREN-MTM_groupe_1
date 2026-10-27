import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from './events.js';
import type { Ack, Membership, PublicRoom } from './types.js';
export type ConnectionState = 'connected' | 'connecting' | 'reconnecting' | 'disconnected';
export function createNetwork(url = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001') {
 const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(url, { autoConnect: false });
 let room: PublicRoom | null = null;
 let credentials: { playerId: string; reconnectToken: string } | null = null;
 let state: ConnectionState = 'disconnected';
 const roomListeners = new Set<(room: PublicRoom | null) => void>();
 const stateListeners = new Set<(state: ConnectionState) => void>();
 const errors = new Set<(error: unknown) => void>();
 function update(next: PublicRoom) { if (!room || (room.id === next.id && next.revision > room.revision)) { room = next; roomListeners.forEach(fn => fn(room)); } }
 function setState(next: ConnectionState) { state = next; stateListeners.forEach(fn => fn(state)); }
 function request<T>(send: (ack: (result: Ack<T>) => void) => void): Promise<T> {
 if (!socket.connected) return Promise.reject(new Error('Serveur déconnecté.'));
 return new Promise((resolve, reject) => {
 const timeout = setTimeout(() => reject(new Error('Délai de réponse dépassé.')), 5000);
 send(result => { clearTimeout(timeout); if (result.success === true) resolve(result.data); else reject(Object.assign(new Error(result.message), { code: result.code })); });
 });
 }
 function membership(data: Membership) { credentials = { playerId: data.playerId, reconnectToken: data.reconnectToken }; update(data.room); return data; }
 function reconnect() {
 if (!credentials) return Promise.reject(new Error('Aucune identité à reconnecter.'));
 return request<Membership>(ack => socket.emit('room:reconnect', credentials!, ack)).then(membership);
 }
 socket.on('room:updated', update); socket.on('room:started', update);
 socket.on('connect', () => {
 if (!credentials) { setState('connected'); return; }
 setState('reconnecting');
 void reconnect().then(() => setState('connected')).catch(error => {
 if (error && typeof error === 'object' && 'code' in error && error.code === 'INVALID_TOKEN') {
 credentials = null; room = null; roomListeners.forEach(fn => fn(null));
 }
 setState('connected');
 errors.forEach(fn => fn(error));
 });
 });
 socket.on('disconnect', () => setState('disconnected'));
 socket.on('connect_error', error => { setState('disconnected'); errors.forEach(fn => fn(error)); });
 return {
 connect: () => { setState('connecting'); socket.connect(); },
 disconnect: () => socket.disconnect(),
 createRoom: (nickname: string) => request<Membership>(ack => socket.emit('room:create', { nickname }, ack)).then(membership),
 joinRoom: (code: string, nickname: string) => request<Membership>(ack => socket.emit('room:join', { code, nickname }, ack)).then(membership),
 leaveRoom: async () => { await request<null>(ack => socket.emit('room:leave', {}, ack)); credentials = null; room = null; roomListeners.forEach(fn => fn(null)); },
 reconnect,
 startRoom: () => request<PublicRoom>(ack => socket.emit('room:start', {}, ack)).then(next => { update(next); return next; }),
 getPlayerId: () => credentials?.playerId ?? null,
 getRoom: () => room, getConnectionState: () => state,
 onRoom: (fn: (room: PublicRoom | null) => void) => { roomListeners.add(fn); return () => { roomListeners.delete(fn); }; },
 onConnectionState: (fn: (state: ConnectionState) => void) => { stateListeners.add(fn); return () => { stateListeners.delete(fn); }; },
 onError: (fn: (error: unknown) => void) => { errors.add(fn); return () => { errors.delete(fn); }; },
 dispose: () => { socket.disconnect(); socket.removeAllListeners(); roomListeners.clear(); stateListeners.clear(); errors.clear(); credentials = null; room = null; },
 };
}

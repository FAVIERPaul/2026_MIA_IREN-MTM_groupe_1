export type RoomState = 'waiting' | 'playing' | 'finished';
export interface PublicPlayer { id: string; nickname: string; roomId: string; status: 'connected' | 'disconnected'; isHost: boolean; connectedAt: number; arrivalOrder: number }
export interface PublicRoom { id: string; code: string; state: RoomState; players: PublicPlayer[]; hostId: string | null; remainingSlots: number; connectedCount: number; revision: number }
export type ErrorCode = 'INVALID_PAYLOAD' | 'ROOM_NOT_FOUND' | 'ROOM_FULL' | 'ROOM_NOT_WAITING' | 'NICKNAME_TAKEN' | 'ALREADY_IN_ROOM' | 'NOT_IN_ROOM' | 'NOT_HOST' | 'NOT_ENOUGH_PLAYERS' | 'INVALID_TOKEN' | 'LIMIT_REACHED' | 'RATE_LIMITED' | 'INTERNAL_ERROR';
export type Ack<T> = { success: true; data: T } | { success: false; code: ErrorCode; message: string };
export interface Membership { room: PublicRoom; playerId: string; reconnectToken: string }
export interface CreatePayload { nickname: string }
export interface JoinPayload extends CreatePayload { code: string }
export interface ReconnectPayload { playerId: string; reconnectToken: string }
export type EmptyPayload = Record<string, never>;
export interface PresenceEvent { room: PublicRoom; playerId: string }

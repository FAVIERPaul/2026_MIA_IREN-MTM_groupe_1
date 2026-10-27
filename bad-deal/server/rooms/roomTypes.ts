import type { PublicPlayer, RoomState } from '../../src/network/types.js';
export interface Player extends Omit<PublicPlayer, 'isHost'> { socketId: string | null; tokenHash: string; expiresAt: number | null }
export interface Room { id: string; code: string; state: RoomState; players: Map<string, Player>; hostId: string | null; revision: number; nextOrder: number }

import type { Ack, CreatePayload, JoinPayload, ReconnectPayload, EmptyPayload, Membership, PublicRoom, PresenceEvent } from './types.js';
export interface ClientToServerEvents {
 'room:create': (payload: CreatePayload, ack: (result: Ack<Membership>) => void) => void;
 'room:join': (payload: JoinPayload, ack: (result: Ack<Membership>) => void) => void;
 'room:reconnect': (payload: ReconnectPayload, ack: (result: Ack<Membership>) => void) => void;
 'room:leave': (payload: EmptyPayload, ack: (result: Ack<null>) => void) => void;
 'room:start': (payload: EmptyPayload, ack: (result: Ack<PublicRoom>) => void) => void;
}
export interface ServerToClientEvents {
 'room:updated': (room: PublicRoom) => void;
 'room:started': (room: PublicRoom) => void;
 'player:disconnected': (event: PresenceEvent) => void;
 'player:reconnected': (event: PresenceEvent) => void;
}

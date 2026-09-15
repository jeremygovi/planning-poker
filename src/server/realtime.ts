import type { WebSocket } from 'ws';
import type { ReactionView, RealtimeEvent, RealtimeEventType, ReactionRealtimeEvent, RoomSnapshot } from '../shared/types.js';

interface Connection {
  socket: WebSocket;
  participantId: string;
  sessionToken: string;
  snapshot: () => RoomSnapshot;
}

export class RealtimeHub {
  private readonly rooms = new Map<string, Set<Connection>>();

  add(roomSlug: string, connection: Connection): void {
    const room = this.rooms.get(roomSlug) ?? new Set<Connection>();
    room.add(connection);
    this.rooms.set(roomSlug, room);
    this.send(connection, 'room.snapshot');
    void this.broadcast(roomSlug, 'presence.changed');

    connection.socket.on('close', () => {
      room.delete(connection);
      if (room.size === 0) this.rooms.delete(roomSlug);
      void this.broadcast(roomSlug, 'presence.changed');
    });
    connection.socket.on('error', () => connection.socket.close());
  }

  presentIds(roomSlug: string): Set<string> {
    return new Set([...(this.rooms.get(roomSlug) ?? [])].map((connection) => connection.participantId));
  }

  presenceCount(roomSlug: string): number {
    return this.presentIds(roomSlug).size;
  }

  closeSession(sessionToken: string): void {
    for (const connections of this.rooms.values()) {
      for (const connection of connections) {
        if (connection.sessionToken === sessionToken) connection.socket.close(1000, 'session closed');
      }
    }
  }

  async broadcast(roomSlug: string, type: RealtimeEventType): Promise<void> {
    const connections = [...(this.rooms.get(roomSlug) ?? [])];
    await Promise.all(connections.map(async (connection) => this.send(connection, type)));
  }

  broadcastReaction(roomSlug: string, payload: ReactionView): void {
    const event: ReactionRealtimeEvent = {
      type: 'reaction.sent',
      payload,
      occurredAt: new Date().toISOString()
    };
    for (const connection of this.rooms.get(roomSlug) ?? []) {
      if (connection.socket.readyState === connection.socket.OPEN) {
        connection.socket.send(JSON.stringify(event));
      }
    }
  }

  private send(connection: Connection, type: RealtimeEventType): void {
    if (connection.socket.readyState !== connection.socket.OPEN) return;
    try {
      const event: RealtimeEvent = {
        type,
        payload: connection.snapshot(),
        occurredAt: new Date().toISOString()
      };
      connection.socket.send(JSON.stringify(event));
    } catch {
      connection.socket.close(1011, 'snapshot unavailable');
    }
  }
}

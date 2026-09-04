import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreateRoomBodySchema,
  FinalizeBodySchema,
  JoinRoomBodySchema,
  ProfileBodySchema,
  RejoinRoomBodySchema,
  StartStoryBodySchema,
  TimerBodySchema,
  UpdateRoomBodySchema,
  UpdateRoleBodySchema,
  VoteBodySchema
} from '../shared/schemas.js';
import type { AvatarKey, DeckKey, ParticipationRole, RoomTheme, UserProfile } from '../shared/types.js';
import type { AuthManager } from './auth.js';
import type { Config } from './config.js';
import { AppError } from './errors.js';
import { RealtimeHub } from './realtime.js';
import { RoomService } from './room-service.js';

interface SlugParams { slug: string }

export function originAllowed(request: FastifyRequest, config: Config): boolean {
  const originHeader = request.headers.origin;
  if (!originHeader) return true;
  try {
    const origin = new URL(originHeader).origin;
    if (config.publicOrigin) return origin === config.publicOrigin;
    const requestOrigin = `${request.protocol}://${request.headers.host}`;
    if (origin === requestOrigin) return true;
    if (process.env.NODE_ENV !== 'production') {
      const host = new URL(origin).hostname;
      return host === 'localhost' || host === '127.0.0.1';
    }
    return false;
  } catch {
    return false;
  }
}

export function registerRoomRoutes(
  app: FastifyInstance,
  config: Config,
  service: RoomService,
  hub: RealtimeHub,
  auth: AuthManager
): void {
  const snapshot = (request: FastifyRequest, slug: string) => {
    const roomId = service.roomId(slug);
    return service.getSnapshot(
      slug,
      auth.getParticipantId(request, roomId),
      hub.presentIds(slug)
    );
  };
  const requireRoomParticipant = (request: FastifyRequest, slug: string) => {
    const roomId = service.roomId(slug);
    service.assertRoomParticipant(slug, auth.getParticipantId(request, roomId));
  };

  app.get('/api/rooms', async (request) => service.listRooms(
    (slug) => hub.presenceCount(slug),
    (roomId) => auth.getParticipantId(request, roomId)
  ));

  app.patch<{ Body: UserProfile }>('/api/profile', { schema: { body: ProfileBodySchema } }, async (request, reply) => {
    const changedRooms = service.updateProfiles(request.authSession?.memberships.values() ?? [], request.body);
    for (const slug of changedRooms) void hub.broadcast(slug, 'presence.changed');
    return reply.code(204).send();
  });

  app.post<{ Body: { name: string; theme?: RoomTheme; defaultDeckKey?: DeckKey } }>(
    '/api/rooms',
    { schema: { body: CreateRoomBodySchema } },
    async (request, reply) => {
      return reply.code(201).send(service.createRoom(request.body));
    }
  );

  app.get<{ Params: SlugParams }>('/api/rooms/:slug', async (request) => snapshot(request, request.params.slug));

  app.get<{ Params: SlugParams }>('/api/rooms/:slug/history', async (request) =>
    snapshot(request, request.params.slug).history
  );

  app.patch<{
    Params: SlugParams;
    Body: { name?: string; theme?: RoomTheme; soundEnabled?: boolean; autoRevealEnabled?: boolean; defaultDeckKey?: DeckKey };
  }>('/api/rooms/:slug', { schema: { body: UpdateRoomBodySchema } }, async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.updateRoom(request.params.slug, request.body);
    void hub.broadcast(request.params.slug, 'room.settings_changed');
    return reply.code(204).send();
  });

  app.post<{ Params: SlugParams }>('/api/rooms/:slug/archive', async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.archiveRoom(request.params.slug);
    void hub.broadcast(request.params.slug, 'room.settings_changed');
    return reply.code(204).send();
  });

  app.post<{ Params: SlugParams }>('/api/rooms/:slug/restore', async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.restoreRoom(request.params.slug);
    return reply.code(204).send();
  });

  app.post<{ Params: SlugParams; Body: { displayName: string; role: ParticipationRole; avatar: AvatarKey; avatarImage?: string | null } }>(
    '/api/rooms/:slug/join',
    { schema: { body: JoinRoomBodySchema } },
    async (request, reply) => {
      const roomId = service.roomId(request.params.slug);
      const joined = service.joinRoom(
        request.params.slug,
        request.body,
        auth.getParticipantId(request, roomId)
      );
      auth.setParticipantId(request, roomId, joined.participant.id);
      return reply.send({ snapshot: snapshot(request, request.params.slug), rejoinToken: joined.rejoinToken });
    }
  );

  app.post<{ Params: SlugParams; Body: { token: string } }>(
    '/api/rooms/:slug/rejoin',
    { schema: { body: RejoinRoomBodySchema } },
    async (request, reply) => {
      const roomId = service.roomId(request.params.slug);
      const participant = service.rejoinRoom(request.params.slug, request.body.token);
      auth.setParticipantId(request, roomId, participant.id);
      return reply.send(snapshot(request, request.params.slug));
    }
  );

  app.patch<{ Params: SlugParams; Body: { role: ParticipationRole } }>(
    '/api/rooms/:slug/role',
    { schema: { body: UpdateRoleBodySchema } },
    async (request, reply) => {
      const roomId = service.roomId(request.params.slug);
      service.updateRole(request.params.slug, auth.getParticipantId(request, roomId), request.body.role);
      void hub.broadcast(request.params.slug, 'presence.changed');
      return reply.send(snapshot(request, request.params.slug));
    }
  );

  app.post<{ Params: SlugParams }>('/api/rooms/:slug/invite-token', async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    return reply.header('Cache-Control', 'no-store').send({ token: config.accessToken });
  });

  app.post<{
    Params: SlugParams;
    Body: { title: string; timerDurationSeconds?: 60 | 120 | 180 | 300 | null };
  }>('/api/rooms/:slug/stories', { schema: { body: StartStoryBodySchema } }, async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.startStory(request.params.slug, request.body);
    void hub.broadcast(request.params.slug, 'story.started');
    return reply.code(201).send(snapshot(request, request.params.slug));
  });

  app.delete<{ Params: SlugParams }>('/api/rooms/:slug/stories/active', async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.cancelStory(request.params.slug);
    void hub.broadcast(request.params.slug, 'story.finalized');
    return reply.code(204).send();
  });

  app.put<{ Params: SlugParams; Body: { value: string } }>(
    '/api/rooms/:slug/vote',
    { schema: { body: VoteBodySchema } },
    async (request, reply) => {
      const roomId = service.roomId(request.params.slug);
      service.vote(request.params.slug, auth.getParticipantId(request, roomId), request.body);
      void hub.broadcast(request.params.slug, 'vote.status_changed');
      return reply.code(204).send();
    }
  );

  app.post<{ Params: SlugParams }>('/api/rooms/:slug/reveal', async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.reveal(request.params.slug);
    void hub.broadcast(request.params.slug, 'story.revealed');
    return reply.code(204).send();
  });

  app.post<{ Params: SlugParams; Body: { finalValue: string } }>(
    '/api/rooms/:slug/finalize',
    { schema: { body: FinalizeBodySchema } },
    async (request, reply) => {
      requireRoomParticipant(request, request.params.slug);
      service.finalize(request.params.slug, request.body);
      void hub.broadcast(request.params.slug, 'story.finalized');
      return reply.code(204).send();
    }
  );

  app.post<{
    Params: SlugParams;
    Body: { action: 'start' | 'pause' | 'resume' | 'reset'; durationSeconds?: 60 | 120 | 180 | 300 };
  }>('/api/rooms/:slug/timer', { schema: { body: TimerBodySchema } }, async (request, reply) => {
    requireRoomParticipant(request, request.params.slug);
    service.timer(request.params.slug, request.body);
    void hub.broadcast(request.params.slug, 'timer.changed');
    return reply.code(204).send();
  });

  app.get<{ Params: SlugParams }>('/api/rooms/:slug/events', { websocket: true }, (socket, request) => {
    if (!originAllowed(request, config)) {
      socket.close(1008, 'origin denied');
      return;
    }
    try {
      const roomId = service.roomId(request.params.slug);
      const participantId = auth.getParticipantId(request, roomId);
      if (!participantId || !request.sessionToken) throw new AppError('JOIN_REQUIRED', 403);
      hub.add(request.params.slug, {
        socket,
        participantId,
        sessionToken: request.sessionToken,
        snapshot: () => snapshot(request, request.params.slug)
      });
    } catch {
      socket.close(1008, 'join required');
    }
  });
}

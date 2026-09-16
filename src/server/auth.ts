import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { AppError } from './errors.js';

export interface AuthSession {
  expiresAt: number;
  memberships: Map<string, string>;
}

declare module 'fastify' {
  interface FastifyRequest {
    authSession: AuthSession | null;
    sessionToken: string | null;
  }
}

const COOKIE_NAME = 'poker_express_session';
const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60;

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

function usesHttps(request: FastifyRequest): boolean {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const forwardedProtocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
  return request.protocol === 'https' || forwardedProtocol?.split(',')[0].trim() === 'https';
}

function sessionCookie(token: string, secure: boolean): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_DURATION_SECONDS}`,
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

function expiredCookie(secure: boolean): string {
  return [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    'Max-Age=0',
    secure ? 'Secure' : ''
  ].filter(Boolean).join('; ');
}

export interface AuthManager {
  getParticipantId(request: FastifyRequest, roomId: string): string | null;
  setParticipantId(request: FastifyRequest, roomId: string, participantId: string): void;
}

export function registerAuth(
  app: FastifyInstance,
  onSessionRemoved: (token: string) => void
): AuthManager {
  const sessions = new Map<string, AuthSession>();

  app.decorateRequest('authSession', null);
  app.decorateRequest('sessionToken', null);

  app.post('/api/session', async (_request, reply) => {
    const now = Date.now();
    for (const [token, session] of sessions) {
      if (session.expiresAt <= now) {
        sessions.delete(token);
        onSessionRemoved(token);
      }
    }
    const token = randomBytes(32).toString('base64url');
    sessions.set(token, {
      expiresAt: now + SESSION_DURATION_SECONDS * 1000,
      memberships: new Map()
    });
    return reply
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', sessionCookie(token, usesHttps(_request)))
      .send({ authenticated: true });
  });

  app.addHook('preHandler', async (request) => {
    if (!request.url.startsWith('/api/') || (request.routeOptions.url === '/api/session' && request.method === 'POST')) return;
    const isSessionStatusRequest = request.routeOptions.url === '/api/session' && request.method === 'GET';
    const token = cookieValue(request.headers.cookie, COOKIE_NAME);
    const session = token ? sessions.get(token) : undefined;
    if (!session || session.expiresAt <= Date.now()) {
      if (token && session) {
        sessions.delete(token);
        onSessionRemoved(token);
      }
      if (isSessionStatusRequest) return;
      throw new AppError('AUTH_REQUIRED', 401);
    }
    request.authSession = session;
    request.sessionToken = token ?? null;
  });

  app.get('/api/session', async (request, reply) =>
    reply.header('Cache-Control', 'no-store').send({ authenticated: request.authSession !== null })
  );

  app.delete('/api/session', async (request, reply) => {
    if (request.sessionToken) {
      sessions.delete(request.sessionToken);
      onSessionRemoved(request.sessionToken);
    }
    return reply
      .header('Cache-Control', 'no-store')
      .header('Set-Cookie', expiredCookie(usesHttps(request)))
      .code(204)
      .send();
  });

  return {
    getParticipantId(request, roomId) {
      return request.authSession?.memberships.get(roomId) ?? null;
    },
    setParticipantId(request, roomId, participantId) {
      if (!request.authSession) throw new AppError('AUTH_REQUIRED', 401);
      request.authSession.memberships.set(roomId, participantId);
    }
  };
}

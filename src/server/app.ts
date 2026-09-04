import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import { registerAuth } from './auth.js';
import { openDatabase } from './database/database.js';
import { AppError } from './errors.js';
import { RealtimeHub } from './realtime.js';
import { originAllowed, registerRoomRoutes } from './routes.js';
import { RoomService } from './room-service.js';

export async function buildApp(config: Config): Promise<FastifyInstance> {
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDatabase(config.databasePath, config.migrationsDir);
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
    trustProxy: true,
    bodyLimit: 64 * 1024,
    ajv: { customOptions: { removeAdditional: false } }
  });
  const hub = new RealtimeHub();
  const service = new RoomService(db);

  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'")
      .header('Referrer-Policy', 'no-referrer')
      .header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
      .header('X-Content-Type-Options', 'nosniff')
      .header('X-Frame-Options', 'DENY');
    const forwardedProto = request.headers['x-forwarded-proto'];
    const forwardedProtocol = Array.isArray(forwardedProto) ? forwardedProto[0] : forwardedProto;
    if (request.protocol === 'https' || forwardedProtocol?.split(',')[0].trim() === 'https') {
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    if (
      request.url.startsWith('/api/') &&
      ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) &&
      !originAllowed(request, config)
    ) {
      throw new AppError('ORIGIN_DENIED', 403);
    }
  });

  await app.register(websocket, { options: { maxPayload: 16 * 1024 } });
  const auth = registerAuth(app, config, (token) => hub.closeSession(token));
  registerRoomRoutes(app, config, service, hub, auth);

  app.get('/health', async () => {
    db.prepare('SELECT 1').get();
    mkdirSync(config.dataDir, { recursive: true });
    return { status: 'ok' };
  });

  if (existsSync(config.publicDir)) {
    await app.register(fastifyStatic, { root: config.publicDir, prefix: '/' });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ code: 'ROUTE_NOT_FOUND' });
    if (!existsSync(config.publicDir)) return reply.code(404).send({ code: 'CLIENT_NOT_BUILT' });
    const requestPath = new URL(request.url, 'http://localhost').pathname;
    const isPageNavigation = ['GET', 'HEAD'].includes(request.method) && path.posix.extname(requestPath) === '';
    if (isPageNavigation) return reply.sendFile('index.html');
    return reply.code(404).send({ code: 'ROUTE_NOT_FOUND' });
  });

  app.setErrorHandler((error, request, reply) => {
    const validationError = typeof error === 'object' && error !== null && 'validation' in error;
    const appError = error instanceof AppError ? error : null;
    const statusCode = validationError ? 400 : appError?.statusCode ?? 500;
    if (statusCode >= 500) request.log.error(error);
    return reply.code(statusCode).send({
      code: validationError ? 'INVALID_REQUEST' : appError?.code ?? 'INTERNAL_ERROR',
      ...(appError?.details ? { details: appError.details } : {})
    });
  });

  app.addHook('onClose', async () => db.close());
  return app;
}

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import WebSocket from 'ws';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import type { RealtimeEvent, RoomSummary } from '../src/shared/types.js';

let app: FastifyInstance;
let directory: string;
const ACCESS_TOKEN = 'shared-realtime-access-token';

async function login(): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { token: ACCESS_TOKEN } });
  return response.headers['set-cookie']!.split(';', 1)[0];
}

function nextEvent(socket: WebSocket, expectedType?: string): Promise<RealtimeEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('WebSocket event timeout')), 3000);
    const listener = (data: WebSocket.RawData) => {
      const event = JSON.parse(data.toString()) as RealtimeEvent;
      if (expectedType && event.type !== expectedType) return;
      clearTimeout(timeout);
      socket.off('message', listener);
      resolve(event);
    };
    socket.on('message', listener);
  });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'poker-express-ws-'));
  app = await buildApp(loadConfig({
    dataDir: directory,
    databasePath: path.join(directory, 'db.sqlite'),
    migrationsDir: path.resolve('migrations'),
    publicDir: path.join(directory, 'missing'),
    accessToken: ACCESS_TOKEN
  }));
});

afterEach(async () => {
  await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('realtime', () => {
  it('diffuse le statut de vote sans sa valeur avant révélation', async () => {
    const aliceCookie = await login();
    const bobCookie = await login();
    const roomResponse = await app.inject({ method: 'POST', url: '/api/rooms', headers: { cookie: aliceCookie }, payload: { name: 'WebSocket room' } });
    const room = roomResponse.json() as RoomSummary;
    await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/join`, headers: { cookie: aliceCookie }, payload: { displayName: 'Alice', role: 'voter', avatar: 'rocket' } });
    await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/join`, headers: { cookie: bobCookie }, payload: { displayName: 'Bob', role: 'voter', avatar: 'robot' } });
    await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/stories`, headers: { cookie: aliceCookie }, payload: { title: 'WS-1' } });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP address');
    const socket = new WebSocket(`ws://127.0.0.1:${address.port}/api/rooms/${room.slug}/events`, { headers: { Cookie: bobCookie, Origin: `http://127.0.0.1:${address.port}` } });
    await nextEvent(socket, 'room.snapshot');

    const eventPromise = nextEvent(socket, 'vote.status_changed');
    await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: aliceCookie }, payload: { value: '8' } });
    const event = await eventPromise;
    expect(event.payload.story?.revealedVotes).toBeNull();
    expect(event.payload.ownVote).toBeNull();
    expect(event.payload.participants.find((participant) => participant.displayName === 'Alice')?.hasVoted).toBe(true);
    expect(JSON.stringify(event.payload.story)).not.toContain('"value":"8"');
    socket.close();
  });

  it('synchronise présence, réglages et minuteur sur plusieurs connexions puis à la reconnexion', async () => {
    const aliceCookie = await login();
    const bobCookie = await login();
    const room = (await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { cookie: bobCookie },
      payload: { name: 'Train synchronisé' }
    })).json() as RoomSummary;
    await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/join`, headers: { cookie: aliceCookie }, payload: { displayName: 'Alice', role: 'voter', avatar: 'fox' } });
    await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/join`, headers: { cookie: bobCookie }, payload: { displayName: 'Bob', role: 'voter', avatar: 'cactus' } });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address();
    if (!address || typeof address === 'string') throw new Error('No TCP address');
    const url = `ws://127.0.0.1:${address.port}/api/rooms/${room.slug}/events`;
    const origin = `http://127.0.0.1:${address.port}`;
    const alice = new WebSocket(url, { headers: { Cookie: aliceCookie, Origin: origin } });
    await nextEvent(alice, 'room.snapshot');
    const alicePresence = nextEvent(alice, 'presence.changed');
    const bob = new WebSocket(url, { headers: { Cookie: bobCookie, Origin: origin } });
    const bobSnapshot = await nextEvent(bob, 'room.snapshot');
    expect((await alicePresence).payload.participants.filter((participant) => participant.online)).toHaveLength(2);
    expect(bobSnapshot.payload.participants.filter((participant) => participant.online)).toHaveLength(2);

    const aliceSettings = nextEvent(alice, 'room.settings_changed');
    const bobSettings = nextEvent(bob, 'room.settings_changed');
    expect((await app.inject({
      method: 'PATCH',
      url: `/api/rooms/${room.slug}`,
      headers: { cookie: bobCookie },
      payload: { theme: 'station', soundEnabled: false, defaultDeckKey: 'tshirt' }
    })).statusCode).toBe(204);
    expect((await aliceSettings).payload.room).toMatchObject({ theme: 'station', soundEnabled: false, defaultDeckKey: 'tshirt' });
    expect((await bobSettings).payload.room).toMatchObject({ theme: 'station', soundEnabled: false, defaultDeckKey: 'tshirt' });

    const storyStarted = nextEvent(alice, 'story.started');
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.slug}/stories`,
      headers: { cookie: aliceCookie },
      payload: { title: 'TIMER-1 — Minuteur', timerDurationSeconds: 60 }
    });
    expect((await storyStarted).payload.story?.timer).toMatchObject({ durationSeconds: 60, running: false });
    const timerChanged = nextEvent(alice, 'timer.changed');
    await app.inject({
      method: 'POST',
      url: `/api/rooms/${room.slug}/timer`,
      headers: { cookie: aliceCookie },
      payload: { action: 'resume' }
    });
    expect((await timerChanged).payload.story?.timer?.running).toBe(true);

    await new Promise<void>((resolve) => {
      bob.once('close', () => resolve());
      bob.close();
    });
    const reconnected = new WebSocket(url, { headers: { Cookie: bobCookie, Origin: origin } });
    const resynced = await nextEvent(reconnected, 'room.snapshot');
    expect(resynced.payload.room).toMatchObject({ theme: 'station', soundEnabled: false });
    expect(resynced.payload.story).toMatchObject({ deckKey: 'tshirt', status: 'voting' });
    expect(resynced.payload.story?.timer?.running).toBe(true);
    alice.close();
    reconnected.close();
  });
});

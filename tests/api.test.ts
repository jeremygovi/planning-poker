import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';
import type { JoinRoomResponse, RoomSnapshot, RoomSummary } from '../src/shared/types.js';

const ACCESS_TOKEN = 'shared-access-token-long-enough';
let directory: string;
let app: FastifyInstance;

async function login(token = ACCESS_TOKEN): Promise<string> {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { token } });
  expect(response.statusCode).toBe(200);
  return response.headers['set-cookie']!.split(';', 1)[0];
}

async function createRoom(cookie: string, name = 'Orient Express', defaultDeckKey: 'scrum' | 'fibonacci' | 'powers' | 'tshirt' = 'scrum', theme: 'classic' | 'train' | 'station' | 'turbo' = 'classic'): Promise<RoomSummary> {
  const response = await app.inject({
    method: 'POST', url: '/api/rooms', headers: { cookie },
    payload: { name, theme, defaultDeckKey }
  });
  expect(response.statusCode).toBe(201);
  return response.json() as RoomSummary;
}

async function join(
  cookie: string,
  slug: string,
  displayName: string,
  role: 'voter' | 'observer' = 'voter',
  avatar: 'train' | 'rocket' | 'robot' | 'owl' = 'train'
): Promise<JoinRoomResponse> {
  const response = await app.inject({
    method: 'POST', url: `/api/rooms/${slug}/join`, headers: { cookie }, payload: { displayName, role, avatar }
  });
  expect(response.statusCode).toBe(200);
  return response.json() as JoinRoomResponse;
}

function config() {
  return loadConfig({
    dataDir: directory,
    databasePath: path.join(directory, 'poker-express.db'),
    migrationsDir: path.resolve('migrations'),
    publicDir: path.join(directory, 'missing-public'),
    accessToken: ACCESS_TOKEN
  });
}

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'poker-express-test-'));
  app = await buildApp(config());
});

afterEach(async () => {
  await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('Poker Express API', () => {
  it('expose un healthcheck, protège les routes et authentifie avec un jeton unique', async () => {
    expect((await app.inject({ method: 'GET', url: '/health' })).json()).toEqual({ status: 'ok' });
    expect((await app.inject({ method: 'GET', url: '/api/rooms' })).statusCode).toBe(401);
    const denied = await app.inject({
      method: 'POST', url: '/api/auth/login', payload: { token: 'incorrect-token-long-enough' }
    });
    expect(denied.statusCode).toBe(401);
    expect(denied.json()).toEqual({ code: 'INVALID_TOKEN' });
  });

  it('nomme le premier participant chef de bord et réserve ensuite les réglages de la salle', async () => {
    const creatorCookie = await login();
    const memberCookie = await login();
    const room = await createRoom(creatorCookie);
    expect(room).toMatchObject({
      name: 'Orient Express', theme: 'classic', soundEnabled: true, status: 'active', canAdminister: false
    });

    const beforeJoining = await app.inject({
      method: 'PATCH', url: `/api/rooms/${room.slug}`, headers: { cookie: creatorCookie }, payload: { theme: 'turbo' }
    });
    expect(beforeJoining.statusCode).toBe(403);

    const conductor = await join(creatorCookie, room.slug, 'Camille', 'observer', 'robot');
    const member = await join(memberCookie, room.slug, 'Alice', 'voter', 'rocket');
    expect(conductor.snapshot.me).toMatchObject({ displayName: 'Camille', avatar: 'robot', isAdmin: true });
    expect(member.snapshot.me).toMatchObject({ displayName: 'Alice', avatar: 'rocket', isAdmin: false });
    expect(conductor.rejoinToken).toHaveLength(43);

    expect((await app.inject({
      method: 'PATCH', url: `/api/rooms/${room.slug}`, headers: { cookie: memberCookie }, payload: { theme: 'station' }
    })).statusCode).toBe(403);
    expect((await app.inject({
      method: 'PATCH', url: `/api/rooms/${room.slug}`, headers: { cookie: creatorCookie }, payload: { theme: 'turbo', soundEnabled: false }
    })).statusCode).toBe(204);

    const invite = await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/invite-token`, headers: { cookie: creatorCookie }
    });
    expect(invite.statusCode).toBe(200);
    expect(invite.headers['cache-control']).toBe('no-store');
    expect(invite.json()).toEqual({ token: ACCESS_TOKEN });
    expect((await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/invite-token`, headers: { cookie: memberCookie }
    })).statusCode).toBe(403);

    const rooms = (await app.inject({ method: 'GET', url: '/api/rooms', headers: { cookie: creatorCookie } })).json() as RoomSummary[];
    expect(rooms.find((item) => item.id === room.id)?.canAdminister).toBe(true);
  });

  it('accepte un titre libre et ne divulgue pas les votes avant révélation', async () => {
    const adminCookie = await login();
    const voterOneCookie = await login();
    const voterTwoCookie = await login();
    const room = await createRoom(adminCookie);
    await join(adminCookie, room.slug, 'Chef de bord', 'observer', 'train');
    await join(voterOneCookie, room.slug, 'Alice', 'voter', 'rocket');
    await join(voterTwoCookie, room.slug, 'Bob', 'voter', 'robot');

    const missingTitle = await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/stories`, headers: { cookie: adminCookie },
      payload: { title: '   ' }
    });
    expect(missingTitle.statusCode).toBe(400);
    expect(missingTitle.json()).toEqual({ code: 'INVALID_STORY_TITLE' });

    const perStoryDeck = await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/stories`, headers: { cookie: adminCookie },
      payload: { title: 'Le jeu appartient à la salle', deckKey: 'fibonacci' }
    });
    expect(perStoryDeck.statusCode).toBe(400);
    expect(perStoryDeck.json()).toEqual({ code: 'INVALID_REQUEST' });

    expect((await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/stories`, headers: { cookie: adminCookie },
      payload: { title: 'EXP-42 — simplifier le billet', timerDurationSeconds: 60 }
    })).statusCode).toBe(201);
    expect((await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: voterOneCookie }, payload: { value: '5' } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: voterOneCookie }, payload: { value: '13' } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: voterOneCookie }, payload: { value: '5' } })).statusCode).toBe(204);
    expect((await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: voterTwoCookie }, payload: { value: '8' } })).statusCode).toBe(204);
    expect((await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/stories`, headers: { cookie: adminCookie }, payload: { title: 'duplicate' }
    })).statusCode).toBe(409);
    expect((await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: adminCookie }, payload: { value: '5' } })).statusCode).toBe(403);

    const beforeReveal = (await app.inject({
      method: 'GET', url: `/api/rooms/${room.slug}`, headers: { cookie: adminCookie }
    })).json() as RoomSnapshot;
    expect(beforeReveal.story).toMatchObject({ title: 'EXP-42 — simplifier le billet', deckKey: 'scrum' });
    expect(beforeReveal.story?.revealedVotes).toBeNull();
    expect(beforeReveal.ownVote).toBeNull();
    expect(JSON.stringify(beforeReveal.story)).not.toContain('"value":"5"');
    expect(beforeReveal.participants.filter((participant) => participant.hasVoted)).toHaveLength(2);

    expect((await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/reveal`, headers: { cookie: adminCookie } })).statusCode).toBe(204);
    const revealed = (await app.inject({
      method: 'GET', url: `/api/rooms/${room.slug}`, headers: { cookie: adminCookie }
    })).json() as RoomSnapshot;
    expect(revealed.story).toMatchObject({ status: 'revealed', suggestedValue: '6.5', unanimous: false });
    expect(revealed.story?.revealedVotes?.map((vote) => vote.value)).toEqual(['5', '8']);

    expect((await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/finalize`, headers: { cookie: adminCookie }, payload: { finalValue: 'à découper' }
    })).statusCode).toBe(204);
    const completed = (await app.inject({
      method: 'GET', url: `/api/rooms/${room.slug}`, headers: { cookie: voterOneCookie }
    })).json() as RoomSnapshot;
    expect(completed.story).toBeNull();
    expect(completed.history[0]).toMatchObject({
      title: 'EXP-42 — simplifier le billet', finalValue: 'à découper', suggestedValue: '6.5'
    });
    expect(completed.history[0].votes).toHaveLength(2);
  });

  it('ignore la carte neutre pour le consensus et isole les salles', async () => {
    const aliceCookie = await login();
    const bobCookie = await login();
    const first = await createRoom(aliceCookie, 'Premier train', 'fibonacci');
    const second = await createRoom(aliceCookie, 'Deuxième train');
    await join(aliceCookie, first.slug, 'Alice', 'voter', 'rocket');
    await join(bobCookie, first.slug, 'Bob', 'voter', 'robot');
    await app.inject({
      method: 'POST', url: `/api/rooms/${first.slug}/stories`, headers: { cookie: aliceCookie },
      payload: { title: 'Story sans URL' }
    });
    await app.inject({ method: 'PUT', url: `/api/rooms/${first.slug}/vote`, headers: { cookie: aliceCookie }, payload: { value: '3' } });
    await app.inject({ method: 'PUT', url: `/api/rooms/${first.slug}/vote`, headers: { cookie: bobCookie }, payload: { value: 'abstain' } });
    await app.inject({ method: 'POST', url: `/api/rooms/${first.slug}/reveal`, headers: { cookie: aliceCookie } });
    const firstSnapshot = (await app.inject({ method: 'GET', url: `/api/rooms/${first.slug}`, headers: { cookie: aliceCookie } })).json() as RoomSnapshot;
    const secondSnapshot = (await app.inject({ method: 'GET', url: `/api/rooms/${second.slug}`, headers: { cookie: aliceCookie } })).json() as RoomSnapshot;
    expect(firstSnapshot.story).toMatchObject({ suggestedValue: '3', unanimous: false });
    expect(secondSnapshot.story).toBeNull();
  });

  it('archive et restaure une salle sans supprimer ses données', async () => {
    const adminCookie = await login();
    const room = await createRoom(adminCookie);
    await join(adminCookie, room.slug, 'Camille', 'observer', 'train');
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/archive`, headers: { cookie: adminCookie } })).statusCode).toBe(204);
    let rooms = (await app.inject({ method: 'GET', url: '/api/rooms', headers: { cookie: adminCookie } })).json() as RoomSummary[];
    expect(rooms.find((item) => item.id === room.id)).toMatchObject({ status: 'archived', canAdminister: true });
    expect((await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/restore`, headers: { cookie: adminCookie } })).statusCode).toBe(204);
    rooms = (await app.inject({ method: 'GET', url: '/api/rooms', headers: { cookie: adminCookie } })).json() as RoomSummary[];
    expect(rooms.find((item) => item.id === room.id)?.status).toBe('active');
  });

  it('restaure après redémarrage l’historique et les droits via le jeton de reprise local', async () => {
    let adminCookie = await login();
    const room = await createRoom(adminCookie, 'Train persistant', 'powers');
    const joined = await join(adminCookie, room.slug, 'Alice', 'voter', 'owl');
    await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/stories`, headers: { cookie: adminCookie },
      payload: { title: 'PERSIST-1 — Persistance' }
    });
    await app.inject({ method: 'PUT', url: `/api/rooms/${room.slug}/vote`, headers: { cookie: adminCookie }, payload: { value: '8' } });
    await app.inject({ method: 'POST', url: `/api/rooms/${room.slug}/reveal`, headers: { cookie: adminCookie } });
    await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/finalize`, headers: { cookie: adminCookie }, payload: { finalValue: '8' }
    });

    await app.close();
    app = await buildApp(config());
    adminCookie = await login();
    const beforeRejoin = (await app.inject({
      method: 'GET', url: `/api/rooms/${room.slug}`, headers: { cookie: adminCookie }
    })).json() as RoomSnapshot;
    expect(beforeRejoin.me).toBeNull();

    const rejoin = await app.inject({
      method: 'POST', url: `/api/rooms/${room.slug}/rejoin`, headers: { cookie: adminCookie },
      payload: { token: joined.rejoinToken }
    });
    expect(rejoin.statusCode).toBe(200);
    const restored = rejoin.json() as RoomSnapshot;
    expect(restored.me).toMatchObject({ displayName: 'Alice', avatar: 'owl', isAdmin: true });
    expect(restored.room.name).toBe('Train persistant');
    expect(restored.history[0]).toMatchObject({ title: 'PERSIST-1 — Persistance', finalValue: '8', suggestedValue: '8' });
    expect(restored.history[0].votes[0]).toMatchObject({ displayName: 'Alice', value: '8' });
    expect((await app.inject({
      method: 'PATCH', url: `/api/rooms/${room.slug}`, headers: { cookie: adminCookie }, payload: { soundEnabled: false }
    })).statusCode).toBe(204);
  });
});

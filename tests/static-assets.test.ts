import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/server/app.js';
import { loadConfig } from '../src/server/config.js';

let app: FastifyInstance;
let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'poker-express-static-test-'));
  const publicDir = path.join(directory, 'public');
  await mkdir(publicDir);
  await writeFile(path.join(publicDir, 'index.html'), '<!doctype html><title>Poker Express</title>');
  await writeFile(path.join(publicDir, 'reaction-yes.gif'), Buffer.from('GIF89a'));
  app = await buildApp(loadConfig({
    dataDir: directory,
    databasePath: path.join(directory, 'poker-express.db'),
    migrationsDir: path.resolve('migrations'),
    publicDir
  }));
});

afterEach(async () => {
  await app.close();
  await rm(directory, { recursive: true, force: true });
});

describe('fichiers statiques', () => {
  it('sert les GIF et ne remplace pas un fichier absent par la page d’accueil', async () => {
    const asset = await app.inject({ method: 'GET', url: '/reaction-yes.gif' });
    expect(asset.statusCode).toBe(200);
    expect(asset.headers['content-type']).toContain('image/gif');
    expect(asset.rawPayload.toString()).toBe('GIF89a');

    const missingAsset = await app.inject({
      method: 'GET', url: '/reaction-missing.gif', headers: { accept: 'text/html' }
    });
    expect(missingAsset.statusCode).toBe(404);
    expect(missingAsset.json()).toEqual({ code: 'ROUTE_NOT_FOUND' });

    const clientRoute = await app.inject({ method: 'GET', url: '/rooms/AGILE' });
    expect(clientRoute.statusCode).toBe(200);
    expect(clientRoute.body).toContain('<title>Poker Express</title>');
  });
});

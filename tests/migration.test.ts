import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/server/database/database.js';

let directory: string | null = null;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = null;
});

describe('migrations SQLite', () => {
  it('crée directement le schéma V1 final dans une base vide', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'poker-express-migration-'));
    const database = openDatabase(path.join(directory, 'poker-express.db'), path.resolve('migrations'));
    const columns = (table: string) => (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(({ name }) => name);

    expect(columns('rooms')).toContain('theme');
    expect(columns('rooms')).not.toContain('visual_theme');
    expect(columns('participants')).toEqual(expect.arrayContaining(['avatar', 'avatar_image', 'is_admin', 'rejoin_token_hash']));
    expect(columns('stories')).toContain('title');
    expect(columns('stories')).not.toContain('url');

    database.prepare(`
      INSERT INTO rooms (id, slug, name, theme, sound_enabled, default_deck_key, status, created_at)
      VALUES ('room-1', 'AGILE', 'Salle Agile', 'classic', 1, 'fibonacci', 'active', '2026-01-01T00:00:00.000Z')
    `).run();
    database.prepare(`
      INSERT INTO participants (id, room_id, display_name, role, avatar, created_at, last_seen_at)
      VALUES ('participant-1', 'room-1', 'Alice', 'voter', 'pirate', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();
    database.prepare(`
      INSERT INTO stories (id, room_id, title, deck_key, deck_values_json, status, created_at)
      VALUES ('story-1', 'room-1', 'EXP-1 — titre unique', 'fibonacci', '["0","1"]', 'voting', '2026-01-01T00:00:00.000Z')
    `).run();

    expect(database.prepare('SELECT theme, default_deck_key FROM rooms').get()).toEqual({ theme: 'classic', default_deck_key: 'fibonacci' });
    expect(database.prepare('SELECT avatar, avatar_image, is_admin FROM participants').get()).toEqual({ avatar: 'pirate', avatar_image: null, is_admin: 0 });
    expect(database.prepare('SELECT title FROM stories').get()).toEqual({ title: 'EXP-1 — titre unique' });
    expect((database.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map(({ name }) => name)).toEqual(['001_initial.sql', '002_shared_profiles.sql']);
    database.close();
  });
});

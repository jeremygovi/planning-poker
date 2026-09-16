import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from '../src/server/database/database.js';
import { runMigrations } from '../src/server/database/migrations.js';

let directory: string | null = null;

afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = null;
});

describe('migrations SQLite', () => {
  it('crée directement le schéma courant dans une base vide', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'poker-express-migration-'));
    const database = openDatabase(path.join(directory, 'poker-express.db'), path.resolve('migrations'));
    const columns = (table: string) => (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(({ name }) => name);

    expect(columns('rooms')).toEqual(expect.arrayContaining(['theme', 'auto_reveal_enabled', 'default_deck_key']));
    expect(columns('rooms')).not.toContain('visual_theme');
    expect(columns('participants')).toEqual(expect.arrayContaining(['avatar', 'avatar_image', 'rejoin_token_hash']));
    expect(columns('participants')).not.toContain('avatar_style');
    expect(columns('participants')).not.toContain('is_admin');
    expect(columns('stories')).toContain('title');
    expect(columns('stories')).not.toContain('url');

    database.prepare(`
      INSERT INTO rooms (id, slug, name, theme, sound_enabled, default_deck_key, status, created_at)
      VALUES ('room-1', 'AGILE', 'Salle Agile', 'classic', 1, 'approval', 'active', '2026-01-01T00:00:00.000Z')
    `).run();
    database.prepare(`
      INSERT INTO participants (id, room_id, display_name, role, avatar, created_at, last_seen_at)
      VALUES ('participant-1', 'room-1', 'Alice', 'voter', 'pirate', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')
    `).run();
    database.prepare(`
      INSERT INTO stories (id, room_id, title, deck_key, deck_values_json, status, created_at)
      VALUES ('story-1', 'room-1', 'EXP-1 — titre unique', 'fibonacci', '["0","1"]', 'voting', '2026-01-01T00:00:00.000Z')
    `).run();

    expect(database.prepare('SELECT theme, auto_reveal_enabled, default_deck_key FROM rooms').get()).toEqual({ theme: 'classic', auto_reveal_enabled: 1, default_deck_key: 'approval' });
    database.prepare("UPDATE participants SET avatar = 'pirate_punk' WHERE id = 'participant-1'").run();
    expect(database.prepare('SELECT avatar, avatar_image FROM participants').get()).toEqual({ avatar: 'pirate_punk', avatar_image: null });
    expect(database.prepare('SELECT title FROM stories').get()).toEqual({ title: 'EXP-1 — titre unique' });
    expect((database.prepare('SELECT name FROM schema_migrations').all() as { name: string }[]).map(({ name }) => name)).toEqual(['001_initial.sql', '003_flexible_avatars.sql']);
    database.close();
  });

  it('retire la liste fermée des avatars sans perdre les participants ni leurs votes', async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'poker-express-avatar-migration-'));
    const database = new Database(path.join(directory, 'poker-express.db'));
    database.pragma('foreign_keys = ON');
    database.exec(readFileSync(path.resolve('migrations/001_initial.sql'), 'utf8'));
    database.exec(`
      CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations VALUES ('001_initial.sql', '2026-01-01T00:00:00.000Z');
      INSERT INTO rooms (id, slug, name, default_deck_key, created_at)
      VALUES ('room-1', 'AVATARS', 'Avatars', 'fibonacci', '2026-01-01T00:00:00.000Z');
      INSERT INTO participants (id, room_id, display_name, role, avatar, rejoin_token_hash, created_at, last_seen_at)
      VALUES ('participant-1', 'room-1', 'Alice', 'voter', 'train', 'token', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
      INSERT INTO stories (id, room_id, title, deck_key, deck_values_json, status, created_at)
      VALUES ('story-1', 'room-1', 'Story', 'fibonacci', '["1"]', 'voting', '2026-01-01T00:00:00.000Z');
      INSERT INTO votes (story_id, participant_id, value, created_at, updated_at)
      VALUES ('story-1', 'participant-1', '1', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
    `);

    runMigrations(database, path.resolve('migrations'));
    database.prepare("UPDATE participants SET avatar = 'alien_punk' WHERE id = 'participant-1'").run();

    expect(database.prepare('SELECT avatar, rejoin_token_hash FROM participants').get()).toEqual({ avatar: 'alien_punk', rejoin_token_hash: 'token' });
    expect(database.prepare('SELECT participant_id, value FROM votes').get()).toEqual({ participant_id: 'participant-1', value: '1' });
    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect((database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'participants'").get() as { sql: string }).sql).not.toContain('CHECK(avatar IN');
    database.close();
  });
});

CREATE TABLE rooms (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT 'classic' CHECK(theme IN ('classic', 'train', 'station', 'turbo')),
  sound_enabled INTEGER NOT NULL DEFAULT 1 CHECK(sound_enabled IN (0, 1)),
  auto_reveal_enabled INTEGER NOT NULL DEFAULT 1 CHECK(auto_reveal_enabled IN (0, 1)),
  default_deck_key TEXT NOT NULL CHECK(default_deck_key IN ('fibonacci', 'scrum', 'powers', 'tshirt', 'approval')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'archived')),
  created_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('voter', 'observer')),
  avatar TEXT NOT NULL DEFAULT 'train' CHECK(avatar IN ('train', 'rocket', 'robot', 'fox', 'owl', 'cat', 'cactus', 'comet', 'frog', 'panda', 'alien', 'pirate')),
  avatar_image TEXT,
  rejoin_token_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE stories (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  title TEXT NOT NULL,
  deck_key TEXT NOT NULL,
  deck_values_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('voting', 'revealed', 'finalized', 'cancelled')),
  suggested_value TEXT,
  final_value TEXT,
  timer_duration_seconds INTEGER,
  timer_end_at TEXT,
  timer_remaining_seconds INTEGER,
  created_at TEXT NOT NULL,
  revealed_at TEXT,
  finalized_at TEXT,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE TABLE votes (
  story_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  value TEXT NOT NULL,
  is_abstention INTEGER NOT NULL DEFAULT 0 CHECK(is_abstention IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(story_id, participant_id),
  FOREIGN KEY(story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY(participant_id) REFERENCES participants(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX one_active_story_per_room
  ON stories(room_id)
  WHERE status IN ('voting', 'revealed');

CREATE INDEX stories_room_history_idx ON stories(room_id, created_at DESC);
CREATE INDEX participants_room_idx ON participants(room_id, created_at);
CREATE INDEX votes_story_idx ON votes(story_id, updated_at);

CREATE UNIQUE INDEX participant_rejoin_token_idx
  ON participants(rejoin_token_hash)
  WHERE rejoin_token_hash IS NOT NULL;

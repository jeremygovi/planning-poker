CREATE TEMP TABLE votes_before_avatar_migration AS
SELECT story_id, participant_id, value, is_abstention, created_at, updated_at
FROM votes;

DROP TABLE votes;

CREATE TABLE participants_without_avatar_check (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('voter', 'observer')),
  avatar TEXT NOT NULL DEFAULT 'train',
  avatar_image TEXT,
  rejoin_token_hash TEXT,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  FOREIGN KEY(room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

INSERT INTO participants_without_avatar_check (
  id, room_id, display_name, role, avatar, avatar_image, rejoin_token_hash, created_at, last_seen_at
)
SELECT id, room_id, display_name, role, avatar, avatar_image, rejoin_token_hash, created_at, last_seen_at
FROM participants;

DROP TABLE participants;
ALTER TABLE participants_without_avatar_check RENAME TO participants;

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

INSERT INTO votes (story_id, participant_id, value, is_abstention, created_at, updated_at)
SELECT story_id, participant_id, value, is_abstention, created_at, updated_at
FROM votes_before_avatar_migration;

DROP TABLE votes_before_avatar_migration;

CREATE INDEX participants_room_idx ON participants(room_id, created_at);
CREATE UNIQUE INDEX participant_rejoin_token_idx ON participants(rejoin_token_hash)
WHERE rejoin_token_hash IS NOT NULL;
CREATE INDEX votes_story_idx ON votes(story_id, updated_at);

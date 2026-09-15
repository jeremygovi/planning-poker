import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { ABSTAIN_VALUE, DECKS, isDeckKey } from '../shared/decks.js';
import type {
  AvatarKey,
  DeckKey,
  HistoryItem,
  ParticipantView,
  ParticipationRole,
  RoomSnapshot,
  RoomSummary,
  RoomTheme,
  StoryView,
  TimerView,
  VoteView
} from '../shared/types.js';
import { calculateEstimation } from './core/estimation.js';
import { AppError } from './errors.js';

interface RoomRow {
  id: string;
  slug: string;
  name: string;
  theme: RoomTheme;
  sound_enabled: number;
  auto_reveal_enabled: number;
  default_deck_key: DeckKey;
  status: 'active' | 'archived';
  created_at: string;
  archived_at: string | null;
}

interface ParticipantRow {
  id: string;
  room_id: string;
  display_name: string;
  role: ParticipationRole;
  avatar: AvatarKey;
  avatar_image: string | null;
  rejoin_token_hash: string | null;
  created_at: string;
  last_seen_at: string;
}

interface StoryRow {
  id: string;
  room_id: string;
  title: string;
  deck_key: DeckKey;
  deck_values_json: string;
  status: 'voting' | 'revealed' | 'finalized' | 'cancelled';
  suggested_value: string | null;
  final_value: string | null;
  timer_duration_seconds: number | null;
  timer_end_at: string | null;
  timer_remaining_seconds: number | null;
  created_at: string;
  revealed_at: string | null;
  finalized_at: string | null;
}

interface VoteRow {
  participant_id: string;
  display_name: string;
  value: string;
  is_abstention: number;
}

const THEMES = new Set<RoomTheme>(['classic', 'train', 'station', 'turbo']);
const PARTICIPATION_ROLES = new Set<ParticipationRole>(['voter', 'observer']);
const AVATARS = new Set<AvatarKey>([
  'train', 'rocket', 'robot', 'fox', 'owl', 'cat', 'cactus', 'comet', 'frog', 'panda', 'alien', 'pirate'
]);
const TIMER_DURATIONS = new Set([60, 120, 180, 300]);

function cleanText(value: unknown, maxLength: number, code: string): string {
  if (typeof value !== 'string') throw new AppError(code, 400);
  const cleaned = value.trim();
  if (!cleaned || cleaned.length > maxLength) throw new AppError(code, 400);
  return cleaned;
}

function tokenHash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function cleanAvatarImage(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || value.length > 48_000) throw new AppError('INVALID_AVATAR_IMAGE', 400);
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) throw new AppError('INVALID_AVATAR_IMAGE', 400);
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length === 0 || bytes.length > 32 * 1024) throw new AppError('INVALID_AVATAR_IMAGE', 400);
  const mime = match[1];
  const validSignature = mime === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    : mime === 'jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.subarray(0, 4).toString('ascii') === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!validSignature) throw new AppError('INVALID_AVATAR_IMAGE', 400);
  return value;
}

function nowIso(): string {
  return new Date().toISOString();
}

function remainingSeconds(story: StoryRow): number | null {
  if (story.timer_duration_seconds === null) return null;
  if (story.timer_end_at) {
    return Math.max(0, Math.ceil((Date.parse(story.timer_end_at) - Date.now()) / 1000));
  }
  return story.timer_remaining_seconds ?? story.timer_duration_seconds;
}

function timerView(story: StoryRow): TimerView | null {
  if (story.timer_duration_seconds === null) return null;
  const remaining = remainingSeconds(story) ?? story.timer_duration_seconds;
  return {
    durationSeconds: story.timer_duration_seconds,
    endAt: story.timer_end_at,
    remainingSeconds: remaining,
    running: Boolean(story.timer_end_at && remaining > 0)
  };
}

export class RoomService {
  constructor(private readonly db: Database.Database) {}

  private roomBySlug(slug: string): RoomRow {
    const room = this.db.prepare('SELECT * FROM rooms WHERE slug = ?').get(slug) as RoomRow | undefined;
    if (!room) throw new AppError('ROOM_NOT_FOUND', 404);
    return room;
  }

  roomId(slug: string): string {
    return this.roomBySlug(slug).id;
  }

  private participant(participantId: string | null, roomId: string): ParticipantRow | null {
    if (!participantId) return null;
    return (this.db.prepare('SELECT * FROM participants WHERE id = ? AND room_id = ?').get(
      participantId,
      roomId
    ) as ParticipantRow | undefined) ?? null;
  }

  private activeStory(roomId: string): StoryRow | null {
    return (this.db.prepare(
      "SELECT * FROM stories WHERE room_id = ? AND status IN ('voting', 'revealed') ORDER BY created_at DESC LIMIT 1"
    ).get(roomId) as StoryRow | undefined) ?? null;
  }

  private votes(storyId: string): VoteRow[] {
    return this.db.prepare(`
      SELECT v.participant_id, p.display_name, v.value, v.is_abstention
      FROM votes v
      JOIN participants p ON p.id = v.participant_id
      WHERE v.story_id = ?
      ORDER BY p.created_at, p.display_name
    `).all(storyId) as VoteRow[];
  }

  private roomSummary(room: RoomRow, participantCount: number, isMember: boolean): RoomSummary {
    const active = this.activeStory(room.id);
    return {
      id: room.id,
      slug: room.slug,
      name: room.name,
      theme: room.theme,
      soundEnabled: Boolean(room.sound_enabled),
      autoRevealEnabled: Boolean(room.auto_reveal_enabled),
      defaultDeckKey: room.default_deck_key,
      status: room.status,
      participantCount,
      activeStoryTitle: active?.title ?? null,
      isMember,
      createdAt: room.created_at
    };
  }

  listRooms(presenceCount: (slug: string) => number, participantId: (roomId: string) => string | null): RoomSummary[] {
    const rooms = this.db.prepare('SELECT * FROM rooms ORDER BY status, created_at DESC').all() as RoomRow[];
    return rooms.map((room) => this.roomSummary(
      room,
      presenceCount(room.slug),
      this.isRoomParticipant(room.id, participantId(room.id))
    ));
  }

  isRoomParticipant(roomId: string, participantId: string | null): boolean {
    if (!participantId) return false;
    return Boolean(this.db.prepare(
      'SELECT 1 FROM participants WHERE id = ? AND room_id = ?'
    ).get(participantId, roomId));
  }

  assertRoomParticipant(slug: string, participantId: string | null): void {
    const room = this.roomBySlug(slug);
    if (!this.isRoomParticipant(room.id, participantId)) throw new AppError('JOIN_REQUIRED', 403);
  }

  assertReactionTarget(slug: string, participantId: string): void {
    const room = this.roomBySlug(slug);
    if (!this.isRoomParticipant(room.id, participantId)) throw new AppError('REACTION_TARGET_NOT_FOUND', 404);
  }

  createRoom(input: { name: unknown; theme?: unknown; defaultDeckKey?: unknown }): RoomSummary {
    const name = cleanText(input.name, 80, 'INVALID_ROOM_NAME');
    const theme = input.theme === undefined ? 'classic' : input.theme;
    const defaultDeckKey = input.defaultDeckKey === undefined ? 'scrum' : input.defaultDeckKey;
    if (typeof theme !== 'string' || !THEMES.has(theme as RoomTheme)) throw new AppError('INVALID_THEME', 400);
    if (!isDeckKey(defaultDeckKey)) throw new AppError('INVALID_DECK', 400);
    const id = randomUUID();
    const slug = randomBytes(5).toString('base64url').toUpperCase();
    const createdAt = nowIso();
    this.db.prepare(`
      INSERT INTO rooms (id, slug, name, theme, sound_enabled, auto_reveal_enabled, default_deck_key, status, created_at)
      VALUES (?, ?, ?, ?, 1, 1, ?, 'active', ?)
    `).run(id, slug, name, theme, defaultDeckKey, createdAt);
    return this.roomSummary(this.roomBySlug(slug), 0, false);
  }

  updateRoom(slug: string, input: { name?: unknown; theme?: unknown; soundEnabled?: unknown; autoRevealEnabled?: unknown; defaultDeckKey?: unknown }): void {
    const room = this.roomBySlug(slug);
    const name = input.name === undefined ? room.name : cleanText(input.name, 80, 'INVALID_ROOM_NAME');
    const theme = input.theme === undefined ? room.theme : input.theme;
    const soundEnabled = input.soundEnabled === undefined ? Boolean(room.sound_enabled) : input.soundEnabled;
    const autoRevealEnabled = input.autoRevealEnabled === undefined ? Boolean(room.auto_reveal_enabled) : input.autoRevealEnabled;
    const deck = input.defaultDeckKey === undefined ? room.default_deck_key : input.defaultDeckKey;
    if (typeof theme !== 'string' || !THEMES.has(theme as RoomTheme)) throw new AppError('INVALID_THEME', 400);
    if (typeof soundEnabled !== 'boolean') throw new AppError('INVALID_SOUND_SETTING', 400);
    if (typeof autoRevealEnabled !== 'boolean') throw new AppError('INVALID_AUTO_REVEAL_SETTING', 400);
    if (!isDeckKey(deck)) throw new AppError('INVALID_DECK', 400);
    this.db.prepare(`
      UPDATE rooms SET name = ?, theme = ?, sound_enabled = ?, auto_reveal_enabled = ?, default_deck_key = ? WHERE id = ?
    `).run(name, theme, soundEnabled ? 1 : 0, autoRevealEnabled ? 1 : 0, deck, room.id);
  }

  archiveRoom(slug: string): void {
    const room = this.roomBySlug(slug);
    if (this.activeStory(room.id)) throw new AppError('ACTIVE_STORY_EXISTS', 409);
    this.db.prepare("UPDATE rooms SET status = 'archived', archived_at = ? WHERE id = ?").run(nowIso(), room.id);
  }

  restoreRoom(slug: string): void {
    const room = this.roomBySlug(slug);
    this.db.prepare("UPDATE rooms SET status = 'active', archived_at = NULL WHERE id = ?").run(room.id);
  }

  joinRoom(
    slug: string,
    input: { displayName: unknown; role: unknown; avatar: unknown; avatarImage?: unknown },
    existingParticipantId: string | null
  ): { participant: ParticipantRow; rejoinToken: string } {
    const displayName = cleanText(input.displayName, 40, 'INVALID_DISPLAY_NAME');
    if (typeof input.role !== 'string' || !PARTICIPATION_ROLES.has(input.role as ParticipationRole)) {
      throw new AppError('INVALID_PARTICIPATION_ROLE', 400);
    }
    if (typeof input.avatar !== 'string' || !AVATARS.has(input.avatar as AvatarKey)) {
      throw new AppError('INVALID_AVATAR', 400);
    }
    const role = input.role as ParticipationRole;
    const avatar = input.avatar as AvatarKey;
    const avatarImage = cleanAvatarImage(input.avatarImage);
    const rejoinToken = randomBytes(32).toString('base64url');
    return this.db.transaction(() => {
      const room = this.roomBySlug(slug);
      if (room.status !== 'active') throw new AppError('ROOM_ARCHIVED', 409);
      const existing = this.participant(existingParticipantId, room.id);
      if (existing) {
        const timestamp = nowIso();
        this.db.prepare(`
          UPDATE participants
          SET display_name = ?, role = ?, avatar = ?, avatar_image = ?, rejoin_token_hash = ?, last_seen_at = ?
          WHERE id = ?
        `).run(displayName, role, avatar, avatarImage, tokenHash(rejoinToken), timestamp, existing.id);
        return {
          participant: {
            ...existing,
            display_name: displayName,
            role,
            avatar,
            avatar_image: avatarImage,
            rejoin_token_hash: tokenHash(rejoinToken),
            last_seen_at: timestamp
          },
          rejoinToken
        };
      }
      const timestamp = nowIso();
      const participant: ParticipantRow = {
        id: randomUUID(),
        room_id: room.id,
        display_name: displayName,
        role,
        avatar,
        avatar_image: avatarImage,
        rejoin_token_hash: tokenHash(rejoinToken),
        created_at: timestamp,
        last_seen_at: timestamp
      };
      this.db.prepare(`
        INSERT INTO participants (
          id, room_id, display_name, role, avatar, avatar_image, rejoin_token_hash, created_at, last_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        participant.id,
        participant.room_id,
        participant.display_name,
        participant.role,
        participant.avatar,
        participant.avatar_image,
        participant.rejoin_token_hash,
        participant.created_at,
        participant.last_seen_at
      );
      return { participant, rejoinToken };
    })();
  }

  updateRole(slug: string, participantId: string | null, role: unknown): void {
    const room = this.roomBySlug(slug);
    const participant = this.participant(participantId, room.id);
    if (!participant) throw new AppError('JOIN_REQUIRED', 403);
    if (typeof role !== 'string' || !PARTICIPATION_ROLES.has(role as ParticipationRole)) {
      throw new AppError('INVALID_PARTICIPATION_ROLE', 400);
    }
    if (participant.role === role) return;
    this.db.transaction(() => {
      const story = this.activeStory(room.id);
      if (story?.status === 'voting' && role === 'observer') {
        this.db.prepare('DELETE FROM votes WHERE story_id = ? AND participant_id = ?').run(story.id, participant.id);
      }
      this.db.prepare('UPDATE participants SET role = ?, last_seen_at = ? WHERE id = ?')
        .run(role, nowIso(), participant.id);
    })();
  }

  rejoinRoom(slug: string, rejoinToken: string): ParticipantRow {
    const room = this.roomBySlug(slug);
    const participant = this.db.prepare(
      'SELECT * FROM participants WHERE room_id = ? AND rejoin_token_hash = ?'
    ).get(room.id, tokenHash(rejoinToken)) as ParticipantRow | undefined;
    if (!participant) throw new AppError('REJOIN_DENIED', 403);
    this.db.prepare('UPDATE participants SET last_seen_at = ? WHERE id = ?').run(nowIso(), participant.id);
    return participant;
  }

  updateProfiles(
    participantIds: Iterable<string>,
    input: { displayName: unknown; avatar: unknown; avatarImage: unknown }
  ): string[] {
    const displayName = cleanText(input.displayName, 40, 'INVALID_DISPLAY_NAME');
    if (typeof input.avatar !== 'string' || !AVATARS.has(input.avatar as AvatarKey)) {
      throw new AppError('INVALID_AVATAR', 400);
    }
    const avatar = input.avatar as AvatarKey;
    const avatarImage = cleanAvatarImage(input.avatarImage);
    const findParticipant = this.db.prepare(`
      SELECT p.display_name, p.avatar, p.avatar_image, r.slug
      FROM participants p
      JOIN rooms r ON r.id = p.room_id
      WHERE p.id = ?
    `);
    const updateParticipant = this.db.prepare(`
      UPDATE participants
      SET display_name = ?, avatar = ?, avatar_image = ?, last_seen_at = ?
      WHERE id = ?
    `);
    return this.db.transaction(() => {
      const changedRooms = new Set<string>();
      for (const participantId of new Set(participantIds)) {
        const current = findParticipant.get(participantId) as {
          display_name: string;
          avatar: AvatarKey;
          avatar_image: string | null;
          slug: string;
        } | undefined;
        if (!current) continue;
        if (current.display_name === displayName && current.avatar === avatar && current.avatar_image === avatarImage) continue;
        updateParticipant.run(displayName, avatar, avatarImage, nowIso(), participantId);
        changedRooms.add(current.slug);
      }
      return [...changedRooms];
    })();
  }

  startStory(slug: string, input: { title: unknown; timerDurationSeconds?: unknown }): void {
    const room = this.roomBySlug(slug);
    if (room.status !== 'active') throw new AppError('ROOM_ARCHIVED', 409);
    if (this.activeStory(room.id)) throw new AppError('ACTIVE_STORY_EXISTS', 409);
    const title = cleanText(input.title, 2048, 'INVALID_STORY_TITLE');
    const deckKey = room.default_deck_key;
    let duration: number | null = null;
    if (input.timerDurationSeconds !== undefined && input.timerDurationSeconds !== null) {
      if (typeof input.timerDurationSeconds !== 'number' || !TIMER_DURATIONS.has(input.timerDurationSeconds)) {
        throw new AppError('INVALID_TIMER_DURATION', 400);
      }
      duration = input.timerDurationSeconds;
    }
    this.db.prepare(`
      INSERT INTO stories (
        id, room_id, title, deck_key, deck_values_json, status,
        timer_duration_seconds, timer_remaining_seconds, created_at
      ) VALUES (?, ?, ?, ?, ?, 'voting', ?, ?, ?)
    `).run(
      randomUUID(),
      room.id,
      title,
      deckKey,
      JSON.stringify(DECKS[deckKey].values),
      duration,
      duration,
      nowIso()
    );
  }

  vote(slug: string, participantId: string | null, input: { value: unknown }): void {
    const room = this.roomBySlug(slug);
    const participant = this.participant(participantId, room.id);
    if (!participant) throw new AppError('JOIN_REQUIRED', 403);
    if (participant.role !== 'voter') throw new AppError('OBSERVER_CANNOT_VOTE', 403);
    const story = this.activeStory(room.id);
    if (!story) throw new AppError('NO_ACTIVE_STORY', 409);
    if (story.status !== 'voting') throw new AppError('VOTE_LOCKED', 409);
    if (typeof input.value !== 'string') throw new AppError('INVALID_VOTE', 400);
    const deckValues = JSON.parse(story.deck_values_json) as string[];
    if (input.value !== ABSTAIN_VALUE && !deckValues.includes(input.value)) throw new AppError('INVALID_VOTE', 400);
    const timestamp = nowIso();
    this.db.prepare(`
      INSERT INTO votes (story_id, participant_id, value, is_abstention, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(story_id, participant_id) DO UPDATE SET
        value = excluded.value,
        is_abstention = excluded.is_abstention,
        updated_at = excluded.updated_at
    `).run(story.id, participant.id, input.value, input.value === ABSTAIN_VALUE ? 1 : 0, timestamp, timestamp);
  }

  reveal(slug: string): void {
    const room = this.roomBySlug(slug);
    const story = this.activeStory(room.id);
    if (!story) throw new AppError('NO_ACTIVE_STORY', 409);
    if (story.status !== 'voting') throw new AppError('VOTE_LOCKED', 409);
    const votes = this.votes(story.id);
    if (votes.length === 0) throw new AppError('NO_VOTES', 409);
    const validValues = votes.filter((vote) => !vote.is_abstention).map((vote) => vote.value);
    const estimation = calculateEstimation(story.deck_key, validValues);
    const remaining = remainingSeconds(story);
    this.db.prepare(`
      UPDATE stories
      SET status = 'revealed', suggested_value = ?, revealed_at = ?,
          timer_end_at = NULL, timer_remaining_seconds = ?
      WHERE id = ?
    `).run(estimation.suggestion, nowIso(), remaining, story.id);
  }

  finalize(slug: string, input: { finalValue: unknown }): void {
    const room = this.roomBySlug(slug);
    const story = this.activeStory(room.id);
    if (!story) throw new AppError('NO_ACTIVE_STORY', 409);
    if (story.status !== 'revealed') throw new AppError('STORY_NOT_REVEALED', 409);
    const finalValue = cleanText(input.finalValue, 32, 'INVALID_FINAL_VALUE');
    this.db.prepare(`
      UPDATE stories SET status = 'finalized', final_value = ?, finalized_at = ? WHERE id = ?
    `).run(finalValue, nowIso(), story.id);
  }

  cancelStory(slug: string): void {
    const room = this.roomBySlug(slug);
    const story = this.activeStory(room.id);
    if (!story) throw new AppError('NO_ACTIVE_STORY', 409);
    this.db.prepare("UPDATE stories SET status = 'cancelled', finalized_at = ? WHERE id = ?").run(nowIso(), story.id);
  }

  timer(slug: string, input: { action: unknown; durationSeconds?: unknown }): void {
    const room = this.roomBySlug(slug);
    const story = this.activeStory(room.id);
    if (!story) throw new AppError('NO_ACTIVE_STORY', 409);
    if (story.status !== 'voting') throw new AppError('TIMER_LOCKED', 409);
    if (!['start', 'pause', 'resume', 'reset'].includes(String(input.action))) {
      throw new AppError('INVALID_TIMER_ACTION', 400);
    }
    const action = String(input.action);
    if (action === 'start') {
      if (typeof input.durationSeconds !== 'number' || !TIMER_DURATIONS.has(input.durationSeconds)) {
        throw new AppError('INVALID_TIMER_DURATION', 400);
      }
      const endAt = new Date(Date.now() + input.durationSeconds * 1000).toISOString();
      this.db.prepare(`
        UPDATE stories SET timer_duration_seconds = ?, timer_end_at = ?, timer_remaining_seconds = NULL WHERE id = ?
      `).run(input.durationSeconds, endAt, story.id);
      return;
    }
    if (story.timer_duration_seconds === null) throw new AppError('TIMER_NOT_CONFIGURED', 409);
    if (action === 'pause') {
      const remaining = remainingSeconds(story) ?? story.timer_duration_seconds;
      this.db.prepare('UPDATE stories SET timer_end_at = NULL, timer_remaining_seconds = ? WHERE id = ?')
        .run(remaining, story.id);
      return;
    }
    if (action === 'resume') {
      const remaining = remainingSeconds(story) ?? story.timer_duration_seconds;
      if (remaining <= 0) throw new AppError('TIMER_EXPIRED', 409);
      this.db.prepare('UPDATE stories SET timer_end_at = ?, timer_remaining_seconds = NULL WHERE id = ?')
        .run(new Date(Date.now() + remaining * 1000).toISOString(), story.id);
      return;
    }
    this.db.prepare('UPDATE stories SET timer_end_at = NULL, timer_remaining_seconds = ? WHERE id = ?')
      .run(story.timer_duration_seconds, story.id);
  }

  getSnapshot(
    slug: string,
    participantId: string | null,
    presentIds: Set<string>
  ): RoomSnapshot {
    const room = this.roomBySlug(slug);
    const story = this.activeStory(room.id);
    const participantRows = this.db.prepare('SELECT * FROM participants WHERE room_id = ? ORDER BY created_at')
      .all(room.id) as ParticipantRow[];
    const voteRows = story ? this.votes(story.id) : [];
    const voteByParticipant = new Map(voteRows.map((vote) => [vote.participant_id, vote]));
    const visibleRows = participantRows.filter((participant) =>
      presentIds.has(participant.id) || voteByParticipant.has(participant.id) || participant.id === participantId
    );
    const participants: ParticipantView[] = visibleRows.map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      role: participant.role,
      avatar: participant.avatar,
      avatarImage: participant.avatar_image,
      online: presentIds.has(participant.id),
      hasVoted: voteByParticipant.has(participant.id)
    }));
    const current = this.participant(participantId, room.id);
    const me = current ? participants.find((participant) => participant.id === current.id) ?? {
      id: current.id,
      displayName: current.display_name,
      role: current.role,
      avatar: current.avatar,
      avatarImage: current.avatar_image,
      online: presentIds.has(current.id),
      hasVoted: voteByParticipant.has(current.id)
    } : null;

    let storyView: StoryView | null = null;
    if (story) {
      const validValues = voteRows.filter((vote) => !vote.is_abstention).map((vote) => vote.value);
      const estimation = calculateEstimation(story.deck_key, validValues);
      const revealedVotes: VoteView[] | null = story.status === 'revealed'
        ? voteRows.map((vote) => ({
            participantId: vote.participant_id,
            displayName: vote.display_name,
            value: vote.value,
            isAbstention: Boolean(vote.is_abstention)
          }))
        : null;
      storyView = {
        id: story.id,
        title: story.title,
        deckKey: story.deck_key,
        deckValues: JSON.parse(story.deck_values_json) as string[],
        status: story.status as 'voting' | 'revealed',
        suggestedValue: story.suggested_value,
        unanimous: story.status === 'revealed' && estimation.unanimous,
        createdAt: story.created_at,
        revealedAt: story.revealed_at,
        timer: timerView(story),
        revealedVotes
      };
    }

    const historyRows = this.db.prepare(`
      SELECT * FROM stories
      WHERE room_id = ? AND status = 'finalized'
      ORDER BY finalized_at DESC
      LIMIT 50
    `).all(room.id) as StoryRow[];
    const history: HistoryItem[] = historyRows.map((item) => ({
      id: item.id,
      title: item.title,
      deckKey: item.deck_key,
      deckValues: JSON.parse(item.deck_values_json) as string[],
      suggestedValue: item.suggested_value,
      finalValue: item.final_value ?? '',
      createdAt: item.created_at,
      revealedAt: item.revealed_at ?? item.created_at,
      finalizedAt: item.finalized_at ?? item.created_at,
      votes: this.votes(item.id).map((vote) => ({
        participantId: vote.participant_id,
        displayName: vote.display_name,
        value: vote.value,
        isAbstention: Boolean(vote.is_abstention)
      }))
    }));

    return {
      room: this.roomSummary(room, presentIds.size, Boolean(current)),
      me,
      participants,
      story: storyView,
      ownVote: story?.status === 'voting' && participantId
        ? voteByParticipant.get(participantId)?.value ?? null
        : null,
      history,
      serverNow: nowIso()
    };
  }
}

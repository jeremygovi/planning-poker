export type ParticipationRole = 'voter' | 'observer';
export type RoomTheme = 'classic' | 'train' | 'station' | 'turbo';
export type DeckKey = 'fibonacci' | 'scrum' | 'powers' | 'tshirt' | 'approval';
export type RoomStatus = 'active' | 'archived';
export type StoryStatus = 'voting' | 'revealed' | 'finalized' | 'cancelled';
export type AvatarKey = string;

export interface UserProfile {
  displayName: string;
  avatar: AvatarKey;
  avatarImage: string | null;
}

export interface DeckDefinition {
  key: DeckKey;
  values: readonly string[];
  numeric: boolean;
}

export interface SessionView {
  authenticated: true;
}

export interface RoomSummary {
  id: string;
  slug: string;
  name: string;
  theme: RoomTheme;
  soundEnabled: boolean;
  autoRevealEnabled: boolean;
  defaultDeckKey: DeckKey;
  status: RoomStatus;
  participantCount: number;
  activeStoryTitle: string | null;
  isMember: boolean;
  createdAt: string;
}

export interface ParticipantView {
  id: string;
  displayName: string;
  role: ParticipationRole;
  avatar: AvatarKey;
  avatarImage: string | null;
  online: boolean;
  hasVoted: boolean;
}

export interface VoteView {
  participantId: string;
  displayName: string;
  value: string;
  isAbstention: boolean;
}

export interface TimerView {
  durationSeconds: number;
  endAt: string | null;
  remainingSeconds: number;
  running: boolean;
}

export interface StoryView {
  id: string;
  title: string;
  deckKey: DeckKey;
  deckValues: string[];
  status: 'voting' | 'revealed';
  suggestedValue: string | null;
  unanimous: boolean;
  createdAt: string;
  revealedAt: string | null;
  timer: TimerView | null;
  revealedVotes: VoteView[] | null;
}

export interface HistoryItem {
  id: string;
  title: string;
  deckKey: DeckKey;
  deckValues: string[];
  suggestedValue: string | null;
  finalValue: string;
  createdAt: string;
  revealedAt: string;
  finalizedAt: string;
  votes: VoteView[];
}

export interface RoomSnapshot {
  room: RoomSummary;
  me: ParticipantView | null;
  participants: ParticipantView[];
  story: StoryView | null;
  ownVote: string | null;
  history: HistoryItem[];
  serverNow: string;
}

export interface JoinRoomResponse {
  snapshot: RoomSnapshot;
  rejoinToken: string;
}

export interface ReactionView {
  id: string;
  emoji: import('./reactions.js').ReactionEmoji;
  fromParticipantId: string;
  targetParticipantId: string;
}

export type RealtimeEventType =
  | 'room.snapshot'
  | 'presence.changed'
  | 'story.started'
  | 'vote.status_changed'
  | 'story.revealed'
  | 'story.finalized'
  | 'timer.changed'
  | 'room.settings_changed';

export interface RealtimeEvent {
  type: RealtimeEventType;
  payload: RoomSnapshot;
  occurredAt: string;
}

export interface ReactionRealtimeEvent {
  type: 'reaction.sent';
  payload: ReactionView;
  occurredAt: string;
}

export type RealtimeMessage = RealtimeEvent | ReactionRealtimeEvent;

export interface ApiErrorBody {
  code: string;
  details?: Record<string, unknown>;
}

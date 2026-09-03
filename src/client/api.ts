import type { ApiErrorBody, DeckKey, JoinRoomResponse, ParticipationRole, RoomSnapshot, RoomSummary, RoomTheme, SessionView, UserProfile } from '../shared/types.js';

export class ApiClientError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers
  });
  if (!response.ok) {
    let body: ApiErrorBody = { code: 'INTERNAL_ERROR' };
    try { body = await response.json() as ApiErrorBody; } catch { /* response had no JSON body */ }
    throw new ApiClientError(body.code);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const api = {
  session: () => request<SessionView>('/api/auth/session'),
  login: (token: string) => request<SessionView>('/api/auth/login', { method: 'POST', body: JSON.stringify({ token }) }),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  rooms: () => request<RoomSummary[]>('/api/rooms'),
  updateProfile: (body: UserProfile) => request<void>('/api/profile', { method: 'PATCH', body: JSON.stringify(body) }),
  createRoom: (body: { name: string; theme: RoomTheme; defaultDeckKey: DeckKey }) =>
    request<RoomSummary>('/api/rooms', { method: 'POST', body: JSON.stringify(body) }),
  room: (slug: string) => request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(slug)}`),
  join: (slug: string, body: UserProfile & { role: ParticipationRole }) =>
    request<JoinRoomResponse>(`/api/rooms/${encodeURIComponent(slug)}/join`, { method: 'POST', body: JSON.stringify(body) }),
  rejoin: (slug: string, token: string) =>
    request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(slug)}/rejoin`, { method: 'POST', body: JSON.stringify({ token }) }),
  inviteToken: (slug: string) =>
    request<{ token: string }>(`/api/rooms/${encodeURIComponent(slug)}/invite-token`, { method: 'POST' }),
  updateRoom: (slug: string, body: { name?: string; theme?: RoomTheme; soundEnabled?: boolean; defaultDeckKey?: DeckKey }) =>
    request<void>(`/api/rooms/${encodeURIComponent(slug)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  archiveRoom: (slug: string) => request<void>(`/api/rooms/${encodeURIComponent(slug)}/archive`, { method: 'POST' }),
  restoreRoom: (slug: string) => request<void>(`/api/rooms/${encodeURIComponent(slug)}/restore`, { method: 'POST' }),
  startStory: (slug: string, body: { title: string; timerDurationSeconds: number | null }) =>
    request<RoomSnapshot>(`/api/rooms/${encodeURIComponent(slug)}/stories`, { method: 'POST', body: JSON.stringify(body) }),
  cancelStory: (slug: string) => request<void>(`/api/rooms/${encodeURIComponent(slug)}/stories/active`, { method: 'DELETE' }),
  vote: (slug: string, value: string) => request<void>(`/api/rooms/${encodeURIComponent(slug)}/vote`, { method: 'PUT', body: JSON.stringify({ value }) }),
  reveal: (slug: string) => request<void>(`/api/rooms/${encodeURIComponent(slug)}/reveal`, { method: 'POST' }),
  finalize: (slug: string, finalValue: string) => request<void>(`/api/rooms/${encodeURIComponent(slug)}/finalize`, { method: 'POST', body: JSON.stringify({ finalValue }) }),
  timer: (slug: string, action: 'start' | 'pause' | 'resume' | 'reset', durationSeconds?: number) =>
    request<void>(`/api/rooms/${encodeURIComponent(slug)}/timer`, { method: 'POST', body: JSON.stringify({ action, ...(durationSeconds ? { durationSeconds } : {}) }) })
};

export function realtimeUrl(slug: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(slug)}/events`;
}

// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../../src/client/App.js';
import type { RoomSummary } from '../../src/shared/types.js';

const rooms: RoomSummary[] = [
  { id: '1', slug: 'AGILE', name: 'Agile', theme: 'classic', soundEnabled: true, defaultDeckKey: 'scrum', status: 'active', participantCount: 4, activeStoryTitle: null, canAdminister: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: '2', slug: 'TRAIN', name: 'Train', theme: 'train', soundEnabled: true, defaultDeckKey: 'scrum', status: 'active', participantCount: 2, activeStoryTitle: null, canAdminister: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: '3', slug: 'QUAI8', name: 'Quai', theme: 'station', soundEnabled: false, defaultDeckKey: 'tshirt', status: 'active', participantCount: 1, activeStoryTitle: null, canAdminister: false, createdAt: '2026-01-01T00:00:00Z' },
  { id: '4', slug: 'TURBO', name: 'Turbo', theme: 'turbo', soundEnabled: true, defaultDeckKey: 'powers', status: 'active', participantCount: 3, activeStoryTitle: 'Story', canAdminister: false, createdAt: '2026-01-01T00:00:00Z' }
];

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('poker-express-locale', 'fr');
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === '/api/auth/session') return new Response(JSON.stringify({ code: 'AUTH_REQUIRED' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    if (path === '/api/auth/login' && init?.method === 'POST') return Response.json({ authenticated: true });
    if (path === '/api/rooms') return Response.json(rooms);
    throw new Error(`Unexpected request: ${path}`);
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('permet une connexion au clavier, rend les quatre thèmes et change de langue', async () => {
    const user = userEvent.setup();
    render(<App />);
    const token = await screen.findByLabelText('Jeton d’accès');
    await waitFor(() => expect(token).toHaveFocus());
    await user.type(token, 'shared-token-for-tests{Enter}');

    expect(await screen.findByRole('heading', { name: 'Où chiffre-t-on aujourd’hui ?' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Rejoindre Agile' }).closest('article')).toHaveClass('room-card-classic');
    expect(screen.getByRole('button', { name: 'Rejoindre Train' }).closest('article')).toHaveClass('room-card-train');
    expect(screen.getByRole('button', { name: 'Rejoindre Quai' }).closest('article')).toHaveClass('room-card-station');
    expect(screen.getByRole('button', { name: 'Rejoindre Turbo' }).closest('article')).toHaveClass('room-card-turbo');

    await user.selectOptions(screen.getByLabelText('Langue'), 'en');
    expect(await screen.findByRole('heading', { name: 'Where are we sizing today?' })).toBeVisible();
    expect(document.documentElement.lang).toBe('en');
  });

  it('consomme le jeton d’une invitation et le retire immédiatement de l’URL', async () => {
    window.history.replaceState({}, '', '/#token=shared-invitation-token-32-chars');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Où chiffre-t-on aujourd’hui ?' })).toBeVisible();
    expect(window.location.hash).toBe('');
    expect(screen.queryByLabelText('Jeton d’accès')).not.toBeInTheDocument();
    const loginCall = vi.mocked(fetch).mock.calls.find(([input]) => String(input) === '/api/auth/login');
    expect(JSON.parse(String(loginCall?.[1]?.body))).toEqual({ token: 'shared-invitation-token-32-chars' });
  });
});

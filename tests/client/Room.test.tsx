// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../../src/client/api.js';
import { Room } from '../../src/client/components/Room.js';
import { translate, type TFunction } from '../../src/client/i18n.js';
import { playRoomSound } from '../../src/client/sound.js';
import type { RealtimeMessage, RoomSnapshot, RoomTheme } from '../../src/shared/types.js';

vi.mock('../../src/client/sound.js', () => ({
  playRoomSound: vi.fn(),
  unlockRoomSounds: vi.fn()
}));

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  private listeners = new Map<string, Array<(event: MessageEvent) => void>>();

  constructor() {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {}

  emitMessage(message: RealtimeMessage) {
    for (const listener of this.listeners.get('message') ?? []) {
      listener({ data: JSON.stringify(message) } as MessageEvent);
    }
  }
}

const profile = { displayName: 'Camille', avatar: 'train', avatarImage: null };
const t: TFunction = (key, values) => translate('fr', key, values);

function roomSnapshot(theme: RoomTheme = 'classic', slug = 'AGILE'): RoomSnapshot {
  return {
    room: {
      id: `room-${slug}`,
      slug,
      name: slug,
      theme,
      soundEnabled: true,
      autoRevealEnabled: false,
      defaultDeckKey: 'scrum',
      status: 'active',
      participantCount: 2,
      activeStoryTitle: null,
      isMember: true,
      createdAt: '2026-01-01T00:00:00Z'
    },
    me: {
      id: 'me',
      displayName: 'Camille',
      role: 'voter',
      avatar: 'train',
      avatarImage: null,
      online: true,
      hasVoted: false
    },
    participants: [
      {
        id: 'me',
        displayName: 'Camille',
        role: 'voter',
        avatar: 'train',
        avatarImage: null,
        online: true,
        hasVoted: false
      },
      {
        id: 'alex',
        displayName: 'Alex',
        role: 'voter',
        avatar: 'owl',
        avatarImage: null,
        online: true,
        hasVoted: false
      }
    ],
    story: null,
    ownVote: null,
    history: [],
    serverNow: '2026-01-01T00:00:00Z'
  };
}

function renderRoom(snapshot = roomSnapshot(), slug = snapshot.room.slug) {
  vi.spyOn(api, 'room').mockResolvedValue(snapshot);
  vi.spyOn(api, 'updateRoom').mockResolvedValue(undefined);
  vi.spyOn(api, 'react').mockResolvedValue(undefined);
  return render(
    <Room
      slug={slug}
      profile={profile}
      onEditProfile={vi.fn()}
      t={t}
      locale="fr"
      navigate={vi.fn()}
      onSessionExpired={vi.fn()}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  MockWebSocket.instances = [];
  vi.stubGlobal('WebSocket', MockWebSocket);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete document.documentElement.dataset.theme;
});

describe('Room', () => {
  it('conserve un thème local validé malgré les snapshots temps réel et l’utilise pour les sons', async () => {
    localStorage.setItem('poker-express-theme:AGILE', 'invalid-theme');
    const user = userEvent.setup();
    renderRoom();

    const themeSelect = await screen.findByLabelText('Thème');
    expect(themeSelect).toHaveValue('classic');
    expect(localStorage.getItem('poker-express-theme:AGILE')).toBeNull();

    await user.selectOptions(themeSelect, 'station');

    expect(themeSelect).toHaveValue('station');
    expect(document.documentElement.dataset.theme).toBe('station');
    expect(localStorage.getItem('poker-express-theme:AGILE')).toBe('station');
    expect(api.updateRoom).not.toHaveBeenCalledWith('AGILE', { theme: expect.anything() });

    const realtimeSnapshot = roomSnapshot('train');
    realtimeSnapshot.story = {
      id: 'story-1',
      title: 'Story',
      deckKey: 'scrum',
      deckValues: ['1', '2', '3'],
      status: 'voting',
      suggestedValue: null,
      unanimous: false,
      createdAt: '2026-01-01T00:01:00Z',
      revealedAt: null,
      timer: null,
      revealedVotes: null
    };
    const socket = MockWebSocket.instances[0];
    expect(socket).toBeDefined();
    socket!.emitMessage({
      type: 'story.started',
      payload: realtimeSnapshot,
      occurredAt: '2026-01-01T00:01:00Z'
    });

    await waitFor(() => expect(screen.getByLabelText('Thème')).toHaveValue('station'));
    expect(document.documentElement.dataset.theme).toBe('station');
    expect(playRoomSound).toHaveBeenCalledWith('story-start', 'station');
  });

  it('restaure un thème local valide après remontage et l’isole par slug de salle', async () => {
    const user = userEvent.setup();
    const firstMount = renderRoom(roomSnapshot('classic', 'AGILE'));

    await user.selectOptions(await screen.findByLabelText('Thème'), 'station');
    expect(localStorage.getItem('poker-express-theme:AGILE')).toBe('station');

    firstMount.unmount();
    delete document.documentElement.dataset.theme;

    const agileReload = renderRoom(roomSnapshot('train', 'AGILE'));
    expect(await screen.findByLabelText('Thème')).toHaveValue('station');
    expect(document.documentElement.dataset.theme).toBe('station');

    agileReload.unmount();
    delete document.documentElement.dataset.theme;

    const otherRoom = renderRoom(roomSnapshot('classic', 'RETRO'));
    const otherThemeSelect = await screen.findByLabelText('Thème');
    expect(otherThemeSelect).toHaveValue('classic');
    expect(document.documentElement.dataset.theme).toBe('classic');

    await user.selectOptions(otherThemeSelect, 'turbo');
    expect(localStorage.getItem('poker-express-theme:RETRO')).toBe('turbo');
    expect(localStorage.getItem('poker-express-theme:AGILE')).toBe('station');

    otherRoom.unmount();
    renderRoom(roomSnapshot('train', 'AGILE'));
    expect(await screen.findByLabelText('Thème')).toHaveValue('station');
    expect(document.documentElement.dataset.theme).toBe('station');
  });

  it('se replie sur le thème serveur quand la lecture du thème local échoue', async () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) {
      if (key === 'poker-express-theme:AGILE') throw new DOMException('Storage unavailable', 'SecurityError');
      return getItem.call(this, key);
    });

    renderRoom(roomSnapshot('train'));

    expect(await screen.findByLabelText('Thème')).toHaveValue('train');
    expect(document.documentElement.dataset.theme).toBe('train');
  });

  it('se replie sur le thème serveur si la suppression d’un thème local invalide échoue', async () => {
    localStorage.setItem('poker-express-theme:AGILE', 'invalid-theme');
    const removeItem = Storage.prototype.removeItem;
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, key) {
      if (key === 'poker-express-theme:AGILE') throw new DOMException('Storage unavailable', 'SecurityError');
      return removeItem.call(this, key);
    });

    renderRoom(roomSnapshot('turbo'));

    expect(await screen.findByLabelText('Thème')).toHaveValue('turbo');
    expect(document.documentElement.dataset.theme).toBe('turbo');
  });

  it('applique le thème en mémoire quand sa persistance locale échoue', async () => {
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'poker-express-theme:AGILE') throw new DOMException('Storage unavailable', 'SecurityError');
      setItem.call(this, key, value);
    });
    const user = userEvent.setup();
    renderRoom(roomSnapshot('classic'));

    const themeSelect = await screen.findByLabelText('Thème');
    await user.selectOptions(themeSelect, 'station');

    expect(themeSelect).toHaveValue('station');
    expect(document.documentElement.dataset.theme).toBe('station');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('laisse le sélecteur de réactions ouvert pour plusieurs envois successifs puis le ferme à la sortie du focus', async () => {
    const user = userEvent.setup();
    renderRoom();

    const trigger = await screen.findByRole('button', { name: 'Réagir à Alex' });
    await user.click(trigger);
    const heart = screen.getByRole('menuitem', { name: 'Envoyer ❤️ à Alex' });

    await user.click(heart);
    expect(screen.getByRole('menuitem', { name: 'Envoyer ❤️ à Alex' })).toBeVisible();
    await user.click(screen.getByRole('menuitem', { name: 'Envoyer ❤️ à Alex' }));

    await waitFor(() => expect(api.react).toHaveBeenCalledTimes(2));
    expect(api.react).toHaveBeenNthCalledWith(1, 'AGILE', 'alex', '❤️');
    expect(api.react).toHaveBeenNthCalledWith(2, 'AGILE', 'alex', '❤️');
    expect(screen.getByRole('menu', { name: 'Choisir une réaction' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: /Retour/ }));

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu', { name: 'Choisir une réaction' })).not.toBeInTheDocument();
  });
});

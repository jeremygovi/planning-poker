import { useCallback, useEffect, useState } from 'react';
import { DECKS } from '../../shared/decks.js';
import type { DeckKey, RoomSummary, RoomTheme } from '../../shared/types.js';
import { api } from '../api.js';
import type { TFunction } from '../i18n.js';
import { useErrorMessage } from '../useErrorMessage.js';
import { TrainArt } from './TrainArt.js';

export function Lobby({ t, navigate }: { t: TFunction; navigate: (to: string) => void }) {
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const messageFor = useErrorMessage(t);
  const load = useCallback(async () => {
    try {
      let nextRooms = await api.rooms();
      const recoverable = nextRooms.flatMap((room) => {
        const key = `poker-express-membership:${room.slug}`;
        const token = window.localStorage.getItem(key);
        return token ? [{ room, key, token }] : [];
      });
      if (recoverable.length) {
        const recovered = await Promise.all(recoverable.map(async ({ room, key, token }) => {
          try { await api.rejoin(room.slug, token); return true; }
          catch { window.localStorage.removeItem(key); return false; }
        }));
        if (recovered.some(Boolean)) nextRooms = await api.rooms();
      }
      setRooms(nextRooms);
      setError('');
    }
    catch (reason) { setError(messageFor(reason)); }
    finally { setLoading(false); }
  }, [messageFor]);
  useEffect(() => { document.documentElement.dataset.theme = 'classic'; void load(); }, [load]);
  const active = rooms.filter((room) => room.status === 'active');
  const archived = rooms.filter((room) => room.status === 'archived' && room.canAdminister);

  return (
    <main className="page lobby-page">
      <section className="lobby-hero">
        <div><p className="eyebrow">{t('lobbyEyebrow')}</p><h1>{t('lobbyTitle')}</h1><p>{t('lobbyCopy')}</p></div>
        <button className="button button-primary button-large" type="button" onClick={() => setCreating(true)}><span>＋</span>{t('createRoom')}</button>
      </section>
      {error && <div className="banner banner-error" role="alert">{error}</div>}
      <section className="room-section">
        <div className="section-heading"><h2>{t('activeRooms')}</h2><span className="count-badge">{active.length}</span></div>
        {loading ? <div className="room-grid skeleton-grid"><i /><i /><i /></div> : active.length ? (
          <div className="room-grid">{active.map((room, index) => <RoomCard key={room.id} room={room} index={index} t={t} onClick={() => navigate(`/rooms/${room.slug}`)} />)}</div>
        ) : <EmptyState text={t('noRooms')} />}
      </section>
      {archived.length > 0 && (
        <section className="room-section archived-section">
          <div className="section-heading"><h2>{t('archivedRooms')}</h2><span className="count-badge">{archived.length}</span></div>
          {archived.length ? <div className="archive-list">{archived.map((room) => (
            <div className="archive-row" key={room.id}><span className="room-dot" /><strong>{room.name}</strong><code>{room.slug}</code><button className="button button-ghost" type="button" onClick={async () => { await api.restoreRoom(room.slug); await load(); }}>{t('restore')}</button></div>
          ))}</div> : <p className="muted">{t('noArchivedRooms')}</p>}
        </section>
      )}
      {creating && <CreateRoomDialog t={t} onClose={() => setCreating(false)} onCreate={async (input) => {
        try { const room = await api.createRoom(input); setCreating(false); navigate(`/rooms/${room.slug}`); }
        catch (reason) { setError(messageFor(reason)); }
      }} />}
    </main>
  );
}

function RoomCard({ room, index, t, onClick }: { room: RoomSummary; index: number; t: TFunction; onClick: () => void }) {
  return (
    <article className={`room-card room-card-${room.theme}`} style={{ '--room-index': index } as React.CSSProperties}>
      <div className="room-card-top"><span className={`status-dot ${room.activeStoryTitle ? 'live' : ''}`} /><span>{room.activeStoryTitle ? t('votingNow') : t('waiting')}</span><code>{room.slug}</code></div>
      <TrainArt value={String(room.participantCount || '')} />
      <h3>{room.name}</h3>
      <div className="room-card-meta"><span>{t('peopleOnline', { count: room.participantCount })}</span><span>{room.defaultDeckKey === 'tshirt' ? 'T-shirt' : DECKS[room.defaultDeckKey].values.slice(1, 5).join(' · ')}</span></div>
      <button className="room-card-action" type="button" onClick={onClick} aria-label={`${t('joinRoom')} ${room.name}`}><span>{t('joinRoom')}</span><b>→</b></button>
    </article>
  );
}

function CreateRoomDialog({ t, onClose, onCreate }: { t: TFunction; onClose: () => void; onCreate: (input: { name: string; theme: RoomTheme; defaultDeckKey: DeckKey }) => void }) {
  const [name, setName] = useState('');
  const [theme, setTheme] = useState<RoomTheme>('classic');
  const [deck, setDeck] = useState<DeckKey>('scrum');
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="create-title">
        <div className="modal-heading"><div><p className="eyebrow">{t('lobbyEyebrow')}</p><h2 id="create-title">{t('createRoom')}</h2></div><button className="icon-button" onClick={onClose} aria-label={t('close')} type="button">×</button></div>
        <form onSubmit={(event) => { event.preventDefault(); onCreate({ name, theme, defaultDeckKey: deck }); }}>
          <label>{t('roomName')}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder={t('roomNamePlaceholder')} maxLength={80} required /></label>
          <div className="form-grid"><label>{t('theme')}<select value={theme} onChange={(event) => setTheme(event.target.value as RoomTheme)}><option value="classic">{t('themeClassic')}</option><option value="train">{t('themeTrain')}</option><option value="station">{t('themeStation')}</option><option value="turbo">{t('themeTurbo')}</option></select></label>
          <label>{t('deck')}<select value={deck} onChange={(event) => setDeck(event.target.value as DeckKey)}><option value="scrum">Scrum</option><option value="fibonacci">Fibonacci</option><option value="powers">1 · 2 · 4 · 8</option><option value="tshirt">T-shirt</option></select></label></div>
          <div className="modal-actions"><button className="button button-ghost" type="button" onClick={onClose}>{t('cancel')}</button><button className="button button-primary" type="submit">{t('create')}</button></div>
        </form>
      </section>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state"><TrainArt variant="empty" /><p>{text}</p></div>;
}

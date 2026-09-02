import { useCallback, useEffect, useRef, useState } from 'react';
import { ABSTAIN_VALUE } from '../../shared/decks.js';
import type { AvatarKey, DeckKey, HistoryItem, ParticipationRole, RealtimeEvent, RoomSnapshot, RoomTheme, StoryView, TimerView } from '../../shared/types.js';
import { api, ApiClientError, realtimeUrl } from '../api.js';
import type { Locale, TFunction } from '../i18n.js';
import { playRoomSound, unlockRoomSounds } from '../sound.js';
import { useErrorMessage } from '../useErrorMessage.js';
import { Avatar } from './Avatar.js';
import { TrainArt } from './TrainArt.js';
import { AVATAR_OPTIONS } from './avatar-options.js';

export function Room({
  slug, t, locale, navigate, onSessionExpired
}: {
  slug: string;
  t: TFunction;
  locale: Locale;
  navigate: (to: string) => void;
  onSessionExpired: () => void;
}) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [error, setError] = useState('');
  const [connectionLost, setConnectionLost] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const messageFor = useErrorMessage(t);
  const joined = Boolean(snapshot?.me);
  const celebrationTimer = useRef<number | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);

  const load = useCallback(async () => {
    try {
      let next = await api.room(slug);
      const savedToken = window.localStorage.getItem(membershipStorageKey(slug));
      if (!next.me && savedToken) {
        try { next = await api.rejoin(slug, savedToken); }
        catch { window.localStorage.removeItem(membershipStorageKey(slug)); }
      }
      snapshotRef.current = next;
      setSnapshot(next);
      setError('');
    }
    catch (reason) {
      const message = messageFor(reason); setError(message);
      if (reason instanceof ApiClientError && reason.code === 'AUTH_REQUIRED') onSessionExpired();
    }
  }, [messageFor, onSessionExpired, slug]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const unlock = () => unlockRoomSounds();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);
  useEffect(() => {
    if (snapshot) document.documentElement.dataset.theme = snapshot.room.theme;
  }, [snapshot]);

  useEffect(() => {
    if (!joined) return;
    let closed = false;
    let reconnectTimer: number | null = null;
    let socket: WebSocket | null = null;
    const connect = () => {
      socket = new WebSocket(realtimeUrl(slug));
      socket.addEventListener('open', () => setConnectionLost(false));
      socket.addEventListener('message', (message) => {
        const event = JSON.parse(String(message.data)) as RealtimeEvent;
        const previous = snapshotRef.current;
        snapshotRef.current = event.payload;
        setSnapshot(event.payload);
        if (event.payload.room.soundEnabled) {
          if (event.type === 'story.started') playRoomSound('story-start', event.payload.room.theme);
          if (event.type === 'story.finalized') playRoomSound('finalized', event.payload.room.theme);
          if (event.type === 'timer.changed' && event.payload.story?.timer?.running && !previous?.story?.timer?.running) {
            playRoomSound('timer-start', event.payload.room.theme);
          }
        }
        if (event.type === 'story.revealed') {
          if (event.payload.story?.unanimous) {
            setCelebrating(true);
            if (event.payload.room.soundEnabled) playRoomSound('consensus', event.payload.room.theme);
            if (celebrationTimer.current) window.clearTimeout(celebrationTimer.current);
            celebrationTimer.current = window.setTimeout(() => setCelebrating(false), 3600);
          } else if (event.payload.room.soundEnabled) {
            playRoomSound('reveal', event.payload.room.theme);
          }
        }
      });
      socket.addEventListener('close', () => {
        if (closed) return;
        setConnectionLost(true);
        reconnectTimer = window.setTimeout(connect, 1400);
      });
    };
    connect();
    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [joined, slug]);

  if (!snapshot) return <main className="loading-screen"><TrainArt variant="empty" /><p>{error || t('loading')}</p></main>;
  if (!snapshot.me) return <JoinRoom snapshot={snapshot} t={t} onJoin={async (displayName, role, avatar) => {
    try {
      const joinedRoom = await api.join(slug, { displayName, role, avatar });
      window.localStorage.setItem(membershipStorageKey(slug), joinedRoom.rejoinToken);
      snapshotRef.current = joinedRoom.snapshot;
      setSnapshot(joinedRoom.snapshot);
      setError('');
    }
    catch (reason) { setError(messageFor(reason)); }
  }} error={error} navigate={navigate} />;

  const isAdmin = Boolean(snapshot.me.isAdmin);
  return (
    <main className="room-page">
      {connectionLost && <div className="connection-banner" role="status">{t('connectionLost')}</div>}
      {celebrating && <Celebration theme={snapshot.room.theme} t={t} />}
      <section className="room-toolbar page">
        <button className="back-link" type="button" onClick={() => navigate('/')}><span>←</span>{t('backLobby')}</button>
        <div className="room-identity"><p>{t('roomCode', { code: snapshot.room.slug })}</p><h1>{snapshot.room.name}</h1></div>
        <div className="room-tools">
          {isAdmin && <button className="button button-ghost compact" type="button" onClick={async (event) => {
            const button = event.currentTarget;
            try {
              const { token } = await api.inviteToken(slug);
              const invitation = `${window.location.origin}/rooms/${encodeURIComponent(slug)}#token=${encodeURIComponent(token)}`;
              await navigator.clipboard.writeText(invitation);
              const old = button.textContent;
              button.textContent = t('copied');
              window.setTimeout(() => { button.textContent = old; }, 1200);
            } catch (reason) { setError(messageFor(reason)); }
          }}>↗ <span>{t('share')}</span></button>}
          {isAdmin && <>
            <label className="compact-select"><span>{t('theme')}</span><select value={snapshot.room.theme} onChange={async (event) => {
              const theme = event.target.value as RoomTheme;
              const next = { ...snapshot, room: { ...snapshot.room, theme } };
              snapshotRef.current = next;
              setSnapshot(next);
              document.documentElement.dataset.theme = theme;
              try { await api.updateRoom(slug, { theme }); } catch (reason) { setError(messageFor(reason)); await load(); }
            }}><option value="classic">{t('themeClassic')}</option><option value="train">{t('themeTrain')}</option><option value="station">{t('themeStation')}</option><option value="turbo">{t('themeTurbo')}</option></select></label>
            <label className="compact-select"><span>{t('deck')}</span><select value={snapshot.room.defaultDeckKey} disabled={Boolean(snapshot.story)} title={snapshot.story ? t('deckLocked') : ''} onChange={async (event) => {
              const defaultDeckKey = event.target.value as DeckKey;
              const next = { ...snapshot, room: { ...snapshot.room, defaultDeckKey } };
              snapshotRef.current = next;
              setSnapshot(next);
              try { await api.updateRoom(slug, { defaultDeckKey }); } catch (reason) { setError(messageFor(reason)); await load(); }
            }}><option value="scrum">Scrum</option><option value="fibonacci">Fibonacci</option><option value="powers">1 · 2 · 4 · 8</option><option value="tshirt">T-shirt</option></select></label>
            <button className={`sound-toggle ${snapshot.room.soundEnabled ? 'enabled' : ''}`} type="button" aria-pressed={snapshot.room.soundEnabled} onClick={() => void api.updateRoom(slug, { soundEnabled: !snapshot.room.soundEnabled })}>
              <span aria-hidden="true">{snapshot.room.soundEnabled ? '♪' : '×'}</span><small>{snapshot.room.soundEnabled ? t('soundOn') : t('soundOff')}</small>
            </button>
          </>}
        </div>
      </section>
      {error && <div className="page banner banner-error" role="alert">{error}<button type="button" onClick={() => setError('')}>×</button></div>}
      <div className="page room-layout">
        <div className="room-main-column">
          <StoryArea
            snapshot={snapshot}
            t={t}
            locale={locale}
            onSnapshot={(next) => { snapshotRef.current = next; setSnapshot(next); }}
            onError={(reason) => setError(messageFor(reason))}
          />
        </div>
        <aside className="room-side-column">
          {!snapshot.story && <Participants snapshot={snapshot} t={t} />}
          <History items={snapshot.history} roomTheme={snapshot.room.theme} t={t} locale={locale} />
          {isAdmin && !snapshot.story && <button className="archive-button" type="button" onClick={async () => {
            if (!window.confirm(t('archiveConfirm'))) return;
            try { await api.archiveRoom(slug); navigate('/'); } catch (reason) { setError(messageFor(reason)); }
          }}>⌑ {t('archiveRoom')}</button>}
        </aside>
      </div>
    </main>
  );
}

function JoinRoom({ snapshot, t, onJoin, error, navigate }: {
  snapshot: RoomSnapshot;
  t: TFunction;
  onJoin: (name: string, role: ParticipationRole, avatar: AvatarKey) => void;
  error: string;
  navigate: (to: string) => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<ParticipationRole>('voter');
  const [avatar, setAvatar] = useState<AvatarKey>('train');
  return (
    <main className="join-page page">
      <button className="back-link" type="button" onClick={() => navigate('/')}><span>←</span>{t('backLobby')}</button>
      <div className="join-layout">
        <section className="join-card">
          <p className="eyebrow">{t('joinEyebrow')}</p><h1>{t('joinTitle')}</h1><p className="room-destination">→ {snapshot.room.name} <code>{snapshot.room.slug}</code></p>
          <form onSubmit={(event) => { event.preventDefault(); onJoin(name, role, avatar); }}>
            <label>{t('displayName')}<input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={40} required /></label>
            <fieldset className="avatar-choice"><legend>{t('avatar')}</legend><div>{AVATAR_OPTIONS.map((option) => <label className={avatar === option.key ? 'selected' : ''} key={option.key} title={option.label}><input type="radio" name="avatar" value={option.key} checked={avatar === option.key} onChange={() => setAvatar(option.key)} /><Avatar avatar={option.key} size="large" /><span className="sr-only">{option.label}</span></label>)}</div></fieldset>
            <div className="role-choice" role="radiogroup">
              <label className={role === 'voter' ? 'selected' : ''}><input type="radio" name="role" checked={role === 'voter'} onChange={() => setRole('voter')} /><span className="role-icon">♠</span><strong>{t('voter')}</strong></label>
              <label className={role === 'observer' ? 'selected' : ''}><input type="radio" name="role" checked={role === 'observer'} onChange={() => setRole('observer')} /><span className="role-icon">◉</span><strong>{t('observer')}</strong></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-large" type="submit">{t('board')} <span>→</span></button>
          </form>
        </section>
        <div className="join-visual"><TrainArt variant="hero" /><div className="ticket-stamp">{snapshot.room.slug}</div></div>
      </div>
    </main>
  );
}

function StoryArea({ snapshot, t, locale, onSnapshot, onError }: {
  snapshot: RoomSnapshot;
  t: TFunction;
  locale: Locale;
  onSnapshot: (snapshot: RoomSnapshot) => void;
  onError: (reason: unknown) => void;
}) {
  const story = snapshot.story;
  if (!story) return snapshot.me?.isAdmin
    ? <StartStory snapshot={snapshot} t={t} onSnapshot={onSnapshot} onError={onError} />
    : <WaitingStage title={t('readyTitle')} copy={t('readyCopyUser')} />;
  const link = urlInText(story.title);
  return (
    <>
      <article className="story-ticket">
        <div className="story-ticket-label"><span>{t('currentStory')}</span><b>{story.deckKey === 'tshirt' ? 'T-SHIRT' : story.deckKey.toUpperCase()}</b></div>
        {link ? <a className="story-reference" href={link.href} target="_blank" rel="noreferrer" title={story.title}><span className="story-domain">{link.hostname}</span><strong>{story.title}</strong><em>{t('openStory')} ↗</em></a>
          : <div className="story-reference"><span className="story-domain">{t('currentStory')}</span><strong>{story.title}</strong></div>}
        {story.timer && <Timer slug={snapshot.room.slug} timer={story.timer} isAdmin={Boolean(snapshot.me?.isAdmin)} soundEnabled={snapshot.room.soundEnabled} theme={snapshot.room.theme} t={t} onError={onError} />}
      </article>
      {story.status === 'voting' ? (
        <VotingStage snapshot={snapshot} story={story} t={t} onError={onError} />
      ) : (
        <ResultsStage snapshot={snapshot} story={story} t={t} locale={locale} onError={onError} />
      )}
    </>
  );
}

function StartStory({ snapshot, t, onSnapshot, onError }: { snapshot: RoomSnapshot; t: TFunction; onSnapshot: (value: RoomSnapshot) => void; onError: (reason: unknown) => void }) {
  const [title, setTitle] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  return (
    <section className="start-story stage-card">
      <div className="stage-intro"><div className="station-orbit"><TrainArt variant="empty" /></div><div><p className="eyebrow">{t('nextStory')}</p><h2>{t('readyTitle')}</h2><p>{t('readyCopyAdmin')}</p></div></div>
      <form onSubmit={async (event) => {
        event.preventDefault();
        try { onSnapshot(await api.startStory(snapshot.room.slug, { title, timerDurationSeconds: duration })); }
        catch (reason) { onError(reason); }
      }}>
        <div className="story-fields"><label className="story-title-field">{t('storyTitle')}<span><i aria-hidden="true">✦</i><input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={t('storyTitlePlaceholder')} required maxLength={2048} /></span></label></div>
        <div className="form-grid story-options"><label>{t('timer')}<select value={duration ?? ''} onChange={(event) => setDuration(event.target.value ? Number(event.target.value) : null)}><option value="">{t('noTimer')}</option><option value="60">1 min</option><option value="120">2 min</option><option value="180">3 min</option><option value="300">5 min</option></select></label><p className="room-deck-reminder"><span>{t('deck')}</span><strong>{deckLabel(snapshot.room.defaultDeckKey)}</strong></p></div>
        <button className="button button-primary button-large launch-button" type="submit"><span className="signal-mini" />{t('launchVote')} →</button>
      </form>
    </section>
  );
}

function VotingStage({ snapshot, story, t, onError }: { snapshot: RoomSnapshot; story: StoryView; t: TFunction; onError: (reason: unknown) => void }) {
  const canVote = snapshot.me?.role === 'voter';
  const anyVote = snapshot.participants.some((participant) => participant.hasVoted);
  return (
    <section className="voting-stage stage-card">
      <div className="voting-heading"><div><p className="eyebrow">{t('participantsTitle')}</p><h2>{t('participantsTitle')}</h2><p>{t('chooseCardCopy')}</p></div><span className="privacy-badge">● {snapshot.participants.filter((participant) => participant.hasVoted).length}/{snapshot.participants.filter((participant) => participant.role === 'voter').length}</span></div>
      <PokerTable snapshot={snapshot} story={story} revealed={false} t={t} />
      <div className="estimate-dock">
        <div className="estimate-dock-heading"><div><p className="eyebrow">{canVote ? t('chooseCard') : t('observerBadge')}</p><h3>{canVote ? t('chooseCard') : t('observerCopy')}</h3></div>{canVote && snapshot.ownVote && <p className="vote-confirmation">✓ {t('waitingReveal')}</p>}</div>
        {canVote ? <div className="estimate-deck" role="radiogroup" aria-label={t('ariaDeck')}>
          {[...story.deckValues, ABSTAIN_VALUE].map((value, index) => {
            const selected = snapshot.ownVote === value;
            const label = value === ABSTAIN_VALUE ? abstainLabel(snapshot.room.theme, t) : value;
            return <button key={value} data-estimate-value={value} className={`estimate-card ${selected ? 'selected' : ''} ${value === ABSTAIN_VALUE ? 'abstain-card' : ''}`} style={{ '--card-index': index } as React.CSSProperties} role="radio" aria-checked={selected} type="button" onClick={async () => {
              try {
                await api.vote(snapshot.room.slug, value);
                if (snapshot.room.soundEnabled) playRoomSound('vote', snapshot.room.theme);
              } catch (reason) { onError(reason); }
            }}><strong>{label}</strong>{selected && <small>✓</small>}</button>;
          })}
        </div> : <div className="observer-stage compact-observer"><div className="observer-eye">◉</div><p>{t('observerCopy')}</p></div>}
        {snapshot.me?.isAdmin && <div className="admin-vote-controls"><button className="button button-danger-ghost" type="button" onClick={async () => { try { await api.cancelStory(snapshot.room.slug); } catch (reason) { onError(reason); } }}>{t('cancelStory')}</button><span /><button className="button button-reveal" disabled={!anyVote} title={!anyVote ? t('revealEmpty') : ''} type="button" onClick={async () => { try { await api.reveal(snapshot.room.slug); } catch (reason) { onError(reason); } }}><b>◉</b>{t('reveal')}</button></div>}
      </div>
    </section>
  );
}

function PokerTable({ snapshot, story, revealed, t }: { snapshot: RoomSnapshot; story: StoryView; revealed: boolean; t: TFunction }) {
  const votes = new Map((story.revealedVotes ?? []).map((vote) => [vote.participantId, vote]));
  const voters = snapshot.participants.filter((participant) => participant.role === 'voter').length;
  const played = snapshot.participants.filter((participant) => participant.hasVoted).length;
  return (
    <div className={`poker-table-shell ${revealed ? 'cards-revealed' : ''}`} aria-label={t('participantsTitle')}>
      <div className="poker-table-felt"><div className="table-center-mark"><small>{revealed ? t('suggestion') : t('votes')}</small><strong>{revealed ? story.suggestedValue ?? '—' : `${played}/${voters}`}</strong></div></div>
      {snapshot.participants.map((participant, index) => {
        const angle = (Math.PI * 2 * index / Math.max(snapshot.participants.length, 1)) - Math.PI / 2;
        const vote = votes.get(participant.id);
        const isRevealed = revealed && Boolean(vote);
        const status = participant.role === 'observer' ? t('observerBadge') : vote ? (vote.isAbstention ? abstainLabel(snapshot.room.theme, t) : vote.value) : participant.hasVoted ? t('voted') : t('thinking');
        const style = {
          '--seat-x': `${50 + Math.cos(angle) * 43}%`,
          '--seat-y': `${50 + Math.sin(angle) * 39}%`,
          '--seat-delay': `${index * 55}ms`
        } as React.CSSProperties;
        return (
          <article className={`poker-seat ${participant.online ? '' : 'offline'} ${participant.role === 'observer' ? 'observer-seat' : ''}`} key={participant.id} style={style}>
            <div className={`table-vote-card ${participant.hasVoted ? 'voted' : ''} ${isRevealed ? 'is-revealed' : ''} ${vote?.isAbstention ? 'neutral' : ''}`} aria-label={`${participant.displayName} — ${status}`}>
              <span className="card-inner"><span className="card-back">{participant.role === 'observer' ? '◉' : participant.hasVoted ? '✓' : '?'}</span><span className="card-front">{vote ? vote.isAbstention ? abstainLabel(snapshot.room.theme, t) : vote.value : '—'}</span></span>
            </div>
            <div className="seat-profile"><Avatar avatar={participant.avatar} size="large" /><span><strong>{participant.displayName}{participant.isAdmin && <i className="conductor-mark" title={t('admin')}>★</i>}</strong><small>{status}</small></span></div>
          </article>
        );
      })}
    </div>
  );
}

function ResultsStage({ snapshot, story, t, locale, onError }: { snapshot: RoomSnapshot; story: StoryView; t: TFunction; locale: Locale; onError: (reason: unknown) => void }) {
  const [finalValue, setFinalValue] = useState(story.suggestedValue ?? '');
  return (
    <section className={`results-stage stage-card ${story.unanimous ? 'unanimous' : ''}`}>
      <div className="results-heading"><div><p className="eyebrow">{t('resultTitle')}</p><h2>{story.unanimous ? t('unanimousTitle') : t('resultTitle')}</h2>{story.unanimous && <p>{t('unanimousCopy')}</p>}</div></div>
      <PokerTable snapshot={snapshot} story={story} revealed t={t} />
      {snapshot.me?.isAdmin && <form className="finalize-form" onSubmit={async (event) => { event.preventDefault(); try { await api.finalize(snapshot.room.slug, finalValue); } catch (reason) { onError(reason); } }}>
        <label>{t('finalValue')}<input value={finalValue} onChange={(event) => setFinalValue(event.target.value)} placeholder={t('finalValuePlaceholder')} maxLength={32} required /></label>
        <button className="button button-primary button-large" type="submit">{t('validate')} →</button>
      </form>}
      {!snapshot.me?.isAdmin && <p className="waiting-final">{new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(story.revealedAt ?? story.createdAt))} · {t('waiting')}</p>}
    </section>
  );
}

function Participants({ snapshot, t }: { snapshot: RoomSnapshot; t: TFunction }) {
  return (
    <section className="side-card participants-card"><div className="side-card-heading"><div><p className="eyebrow">{t('participantsTitle')}</p><h2>{t('participantsTitle')}</h2></div><span className="count-badge">{snapshot.participants.length}</span></div>
      <div className="participant-list">{snapshot.participants.length ? snapshot.participants.map((participant) => <div className={`participant-row ${participant.online ? '' : 'offline'}`} key={participant.id}><Avatar avatar={participant.avatar} /><span className="participant-name"><strong>{participant.displayName}{participant.isAdmin && <span className="conductor-mark" title={t('admin')}>★</span>}{participant.id === snapshot.me?.id && <em>YOU</em>}</strong><small>{participant.role === 'observer' ? t('observerBadge') : participant.hasVoted ? t('voted') : t('thinking')}</small></span><i className={participant.hasVoted ? 'vote-ready' : ''}>{participant.role === 'observer' ? '◉' : participant.hasVoted ? '✓' : '…'}</i></div>) : <p className="muted">{t('noParticipants')}</p>}</div>
    </section>
  );
}

function History({ items, roomTheme, t, locale }: { items: HistoryItem[]; roomTheme: RoomTheme; t: TFunction; locale: Locale }) {
  return (
    <section className="side-card history-card"><div className="side-card-heading"><div><p className="eyebrow">HISTORIQUE</p><h2>{t('history')}</h2></div><span className="count-badge">{items.length}</span></div>
      {items.length ? <div className="history-list">{items.map((item) => { const link = urlInText(item.title); return <details key={item.id}><summary><span className="history-route"><i /><span><strong>{item.title}</strong><small>{new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(item.finalizedAt))}</small></span></span><b>{item.finalValue}</b></summary><div className="history-detail">{link && <a href={link.href} target="_blank" rel="noreferrer">{link.hostname} ↗</a>}<p><span>{t('suggested')}</span><strong>{item.suggestedValue ?? '—'}</strong></p><div className="history-votes">{item.votes.map((vote) => <span key={vote.participantId}>{vote.displayName} <b>{vote.isAbstention ? abstainLabel(roomTheme, t) : vote.value}</b></span>)}</div></div></details>; })}</div> : <p className="muted history-empty">{t('noHistory')}</p>}
    </section>
  );
}

function Timer({ slug, timer, isAdmin, soundEnabled, theme, t, onError }: { slug: string; timer: TimerView; isAdmin: boolean; soundEnabled: boolean; theme: RoomTheme; t: TFunction; onError: (reason: unknown) => void }) {
  const [remaining, setRemaining] = useState(timer.remainingSeconds);
  const previousRemaining = useRef(timer.remainingSeconds);
  useEffect(() => {
    const update = () => setRemaining(timer.endAt ? Math.max(0, Math.ceil((Date.parse(timer.endAt) - Date.now()) / 1000)) : timer.remainingSeconds);
    update(); const interval = window.setInterval(update, 250); return () => window.clearInterval(interval);
  }, [timer.endAt, timer.remainingSeconds]);
  useEffect(() => {
    if (previousRemaining.current > 0 && remaining === 0 && soundEnabled) playRoomSound('timer-end', theme);
    previousRemaining.current = remaining;
  }, [remaining, soundEnabled, theme]);
  const minutes = Math.floor(remaining / 60).toString().padStart(2, '0');
  const seconds = (remaining % 60).toString().padStart(2, '0');
  return <div className={`timer-block ${remaining === 0 ? 'expired' : ''}`}><div className="timer-face"><small>{remaining === 0 ? t('timerExpired') : t('timer')}</small><strong>{minutes}<i>:</i>{seconds}</strong><span><i style={{ width: `${Math.max(0, Math.min(100, remaining / timer.durationSeconds * 100))}%` }} /></span></div>{isAdmin && <div className="timer-actions"><button type="button" onClick={() => void api.timer(slug, timer.running ? 'pause' : 'resume').catch(onError)}>{timer.running ? t('timerPause') : remaining === timer.durationSeconds ? t('timerStart') : t('timerResume')}</button><button type="button" onClick={() => void api.timer(slug, 'reset').catch(onError)}>↺</button></div>}</div>;
}

function Celebration({ theme, t }: { theme: RoomTheme; t: TFunction }) {
  return <div className="celebration" role="status"><div className="confetti">{Array.from({ length: 28 }, (_, index) => <i key={index} style={{ '--confetti-index': index, left: `${(index * 37) % 100}%` } as React.CSSProperties} />)}</div><TrainArt variant="hero" /><div><strong>{t('unanimousTitle')}</strong><span>{t('unanimousCopy')}</span></div><b className="celebration-theme">{theme === 'station' ? '✓' : theme === 'turbo' ? '⚡' : '→'}</b></div>;
}

function WaitingStage({ title, copy }: { title: string; copy: string }) {
  return <section className="stage-card waiting-stage"><div className="station-orbit"><TrainArt variant="empty" /></div><h2>{title}</h2><p>{copy}</p><div className="waiting-dots"><i /><i /><i /></div></section>;
}

function urlInText(text: string): URL | null {
  const candidate = text.match(/https?:\/\/[^\s<>"']+/i)?.[0].replace(/[),.;!?]+$/, '');
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed : null;
  } catch {
    return null;
  }
}

function deckLabel(deck: DeckKey): string {
  if (deck === 'tshirt') return 'T-shirt';
  if (deck === 'powers') return '1 · 2 · 4 · 8';
  return deck === 'fibonacci' ? 'Fibonacci' : 'Scrum';
}

function membershipStorageKey(slug: string): string {
  return `poker-express-membership:${slug}`;
}

function abstainLabel(theme: RoomTheme, t: TFunction): string {
  return theme === 'station' ? t('abstainStation') : theme === 'classic' || theme === 'turbo' ? t('abstainTurbo') : t('abstainTrain');
}

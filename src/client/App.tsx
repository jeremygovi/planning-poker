import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionView, UserProfile } from '../shared/types.js';
import { api } from './api.js';
import { Avatar } from './components/Avatar.js';
import { Lobby } from './components/Lobby.js';
import { ProfileDialog } from './components/ProfileDialog.js';
import { RouteLine, TrainArt } from './components/TrainArt.js';
import { Room } from './components/Room.js';
import { errorTranslationKey, translate, type Locale, type TFunction } from './i18n.js';
import { readStoredProfile, storedMemberships, storeProfile } from './profile.js';

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = window.localStorage.getItem('poker-express-locale');
    return stored === 'en' || stored === 'fr' ? stored : navigator.language.startsWith('en') ? 'en' : 'fr';
  });
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  const [profile, setProfile] = useState<UserProfile | null>(readStoredProfile);
  const [editingProfile, setEditingProfile] = useState(false);
  const [path, setPath] = useState(currentPath);
  const chipRainKey = useKonamiCode();
  const t = useCallback<TFunction>((key, values) => translate(locale, key, values), [locale]);
  const chipRain = chipRainKey !== null ? <ChipRain key={chipRainKey} t={t} /> : null;

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem('poker-express-locale', locale);
  }, [locale]);

  useEffect(() => {
    api.session().then(setSession).catch(() => setSession(null));
  }, []);

  useEffect(() => {
    const onPopState = () => setPath(currentPath());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((to: string) => {
    window.history.pushState({}, '', to);
    setPath(currentPath());
  }, []);
  const expireSession = useCallback(() => setSession(null), []);

  const changeLocale = (next: Locale) => setLocale(next);

  if (session === undefined) return <><Loading t={t} />{chipRain}</>;
  if (!session) return <><Login t={t} locale={locale} setLocale={changeLocale} onLogin={setSession} />{chipRain}</>;

  const saveProfile = async (nextProfile: UserProfile) => {
    await Promise.all(storedMemberships().map(async ({ key, slug, token }) => {
      try { await api.rejoin(slug, token); }
      catch { window.localStorage.removeItem(key); }
    }));
    await api.updateProfile(nextProfile);
    storeProfile(nextProfile);
    setProfile(nextProfile);
    setEditingProfile(false);
  };

  if (!profile) {
    return <><div className="app-shell"><ProfileDialog initial={null} required t={t} onSave={saveProfile} /></div>{chipRain}</>;
  }

  const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
  return (
    <div className="app-shell">
      <Header
        t={t}
        locale={locale}
        setLocale={changeLocale}
        profile={profile}
        onEditProfile={() => setEditingProfile(true)}
        onHome={() => navigate('/')}
        onLogout={async () => {
          await api.logout();
          for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
            const key = window.localStorage.key(index);
            if (key?.startsWith('poker-express-membership:')) window.localStorage.removeItem(key);
          }
          document.documentElement.dataset.theme = 'classic';
          navigate('/');
          setSession(null);
        }}
      />
      {roomMatch ? (
        <Room slug={decodeURIComponent(roomMatch[1])} profile={profile} onEditProfile={() => setEditingProfile(true)} t={t} locale={locale} navigate={navigate} onSessionExpired={expireSession} />
      ) : (
        <Lobby profile={profile} t={t} navigate={navigate} />
      )}
      {editingProfile && <ProfileDialog initial={profile} t={t} onSave={saveProfile} onClose={() => setEditingProfile(false)} />}
      {chipRain}
    </div>
  );
}

function Header({
  t, locale, setLocale, profile, onEditProfile, onHome, onLogout
}: {
  t: TFunction;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  profile: UserProfile;
  onEditProfile: () => void;
  onHome: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="app-header">
      <button type="button" className="brand" onClick={onHome} aria-label="Poker Express">
        <BrandMark />
        <span><strong>POKER EXPRESS</strong><small>{t('brandTagline')}</small></span>
      </button>
      <nav className="header-actions" aria-label={t('ariaNavigation')}>
        <button className="profile-button" type="button" onClick={onEditProfile} aria-label={t('editProfile')}><Avatar avatar={profile.avatar} avatarImage={profile.avatarImage} size="small" /><span>{profile.displayName}</span></button>
        <label className="language-switch">
          <span className="sr-only">{t('language')}</span>
          <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)} aria-label={t('language')}>
            <option value="fr">FR</option><option value="en">EN</option>
          </select>
        </label>
        <button type="button" className="button button-ghost logout" onClick={onLogout}>{t('logout')}</button>
      </nav>
    </header>
  );
}

function Login({
  t, locale, setLocale, onLogin
}: {
  t: TFunction;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  onLogin: (session: SessionView) => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.documentElement.dataset.theme = 'classic'; }, []);
  return (
    <main className="login-page">
      <RouteLine />
      <div className="login-language">
        <button className={locale === 'fr' ? 'active' : ''} onClick={() => setLocale('fr')} type="button">FR</button>
        <button className={locale === 'en' ? 'active' : ''} onClick={() => setLocale('en')} type="button">EN</button>
      </div>
      <section className="login-hero">
        <div className="login-copy-block">
          <div className="login-brand"><BrandMark /> POKER EXPRESS</div>
          <p className="eyebrow">{t('loginEyebrow')}</p>
          <h1>{t('loginTitle')}</h1>
          <p>{t('loginCopy')}</p>
          <form onSubmit={async (event) => {
            event.preventDefault(); setBusy(true); setError('');
            try { onLogin(await api.startSession()); }
            catch { setError(t(errorTranslationKey(''))); }
            finally { setBusy(false); }
          }}>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-large" autoFocus disabled={busy} type="submit">{t('login')}<span aria-hidden="true">→</span></button>
          </form>
        </div>
        <div className="login-train-stage">
          <div className="signal" aria-hidden="true"><i /><i /><i /></div>
          <TrainArt variant="hero" />
          <div className="speed-lines" aria-hidden="true"><i /><i /><i /><i /></div>
          <div className="platform-label"><small>VOIE</small><strong>13</strong></div>
        </div>
      </section>
    </main>
  );
}

function BrandMark() {
  return (
    <span className="brand-symbol" aria-hidden="true">
      <svg className="brand-mark-art" viewBox="0 0 40 40">
        <path className="brand-mark-body" d="M7 11.5A5.5 5.5 0 0 1 12.5 6h13A7.5 7.5 0 0 1 33 13.5V27H7Z" />
        <path className="brand-mark-window" d="M12 11h7v7h-7zm10 0h3.5a3.5 3.5 0 0 1 3.5 3.5V18h-7z" />
        <path className="brand-mark-stripe" d="M9 22h22M5 32h30" />
        <circle className="brand-mark-wheel" cx="13" cy="28" r="3.5" />
        <circle className="brand-mark-wheel" cx="27" cy="28" r="3.5" />
      </svg>
    </span>
  );
}

function Loading({ t }: { t: TFunction }) {
  return <main className="loading-screen"><TrainArt variant="empty" /><p>{t('loading')}</p></main>;
}

function useKonamiCode(): number | null {
  const [activation, setActivation] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const sequence = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
    let index = 0;
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (key === sequence[index]) index += 1;
      else index = key === sequence[0] ? 1 : 0;
      if (index !== sequence.length) return;
      index = 0;
      if (timer.current) window.clearTimeout(timer.current);
      setActivation(Date.now());
      timer.current = window.setTimeout(() => setActivation(null), 4_500);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, []);
  return activation;
}

function ChipRain({ t }: { t: TFunction }) {
  const labels = ['1', '2', '3', '5', '8', '13', '21', '?', '☕', '★'];
  return (
    <div className="chip-rain" aria-hidden="true">
      <span className="chip-rain-message">{t('konamiActivated')}</span>
      {Array.from({ length: 42 }, (_, index) => <i key={index} style={{
        '--chip-left': `${(index * 37) % 101}%`,
        '--chip-delay': `${-(index % 12) * .21}s`,
        '--chip-duration': `${2.7 + (index % 6) * .16}s`,
        '--chip-drift': `${((index * 23) % 140) - 70}px`
      } as React.CSSProperties}>{labels[index % labels.length]}</i>)}
    </div>
  );
}

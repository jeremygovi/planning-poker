import { useCallback, useEffect, useState } from 'react';
import type { SessionView } from '../shared/types.js';
import { api, ApiClientError } from './api.js';
import { Lobby } from './components/Lobby.js';
import { RouteLine, TrainArt } from './components/TrainArt.js';
import { Room } from './components/Room.js';
import { errorTranslationKey, translate, type Locale, type TFunction } from './i18n.js';

function currentPath(): string {
  return window.location.pathname.replace(/\/+$/, '') || '/';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(() => {
    const stored = window.localStorage.getItem('poker-express-locale');
    return stored === 'en' || stored === 'fr' ? stored : navigator.language.startsWith('en') ? 'en' : 'fr';
  });
  const [session, setSession] = useState<SessionView | null | undefined>(undefined);
  const [path, setPath] = useState(currentPath);
  const t = useCallback<TFunction>((key, values) => translate(locale, key, values), [locale]);

  useEffect(() => {
    document.documentElement.lang = locale;
    window.localStorage.setItem('poker-express-locale', locale);
  }, [locale]);

  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    const inviteToken = fragment.get('token');
    if (inviteToken) {
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
      api.login(inviteToken).then(setSession).catch(() => setSession(null));
      return;
    }
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

  if (session === undefined) return <Loading t={t} />;
  if (!session) return <Login t={t} locale={locale} setLocale={changeLocale} onLogin={setSession} />;

  const roomMatch = path.match(/^\/rooms\/([^/]+)$/);
  return (
    <div className="app-shell">
      <Header
        t={t}
        locale={locale}
        setLocale={changeLocale}
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
        <Room slug={decodeURIComponent(roomMatch[1])} t={t} locale={locale} navigate={navigate} onSessionExpired={expireSession} />
      ) : (
        <Lobby t={t} navigate={navigate} />
      )}
    </div>
  );
}

function Header({
  t, locale, setLocale, onHome, onLogout
}: {
  t: TFunction;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  onHome: () => void;
  onLogout: () => void;
}) {
  return (
    <header className="app-header">
      <button type="button" className="brand" onClick={onHome} aria-label="Poker Express">
        <span className="brand-symbol" aria-hidden="true"><i /><i /><i /></span>
        <span><strong>POKER EXPRESS</strong><small>{t('brandTagline')}</small></span>
      </button>
      <nav className="header-actions" aria-label={t('ariaNavigation')}>
        <span className="role-pill role-user"><span />{t('participant')}</span>
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
  const [token, setToken] = useState('');
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
          <div className="login-brand"><span className="brand-symbol"><i /><i /><i /></span> POKER EXPRESS</div>
          <p className="eyebrow">{t('loginEyebrow')}</p>
          <h1>{t('loginTitle')}</h1>
          <p>{t('loginCopy')}</p>
          <form onSubmit={async (event) => {
            event.preventDefault(); setBusy(true); setError('');
            try { onLogin(await api.login(token)); }
            catch (reason) { setError(t(errorTranslationKey(reason instanceof ApiClientError ? reason.code : ''))); }
            finally { setBusy(false); }
          }}>
            <label>{t('accessToken')}<input type="password" autoFocus autoComplete="off" value={token} onChange={(event) => setToken(event.target.value)} minLength={16} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="button button-primary button-large" disabled={busy} type="submit">{t('login')}<span aria-hidden="true">→</span></button>
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

function Loading({ t }: { t: TFunction }) {
  return <main className="loading-screen"><TrainArt variant="empty" /><p>{t('loading')}</p></main>;
}

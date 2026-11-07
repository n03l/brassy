import { useEffect, useState } from 'react';
import { boot } from './boot';
import { DataProvider } from './data';
import { useRoute, routeHref, type Route } from './router';
import { checkWriter, onWriterLost, isWriterLost } from '../db/db';
import { Icon } from '../ui/Icon';
import { applyUpdate, useUpdateReady } from './pwa';
import { flushAll } from './flush';
import { Library } from '../screens/Library';
import { PlayerScreen } from '../screens/Player';
import { EditorScreen } from '../screens/Editor';
import { Fingerings } from '../screens/Fingerings';
import { Settings } from '../screens/Settings';
import { About } from '../screens/About';
import { initSync, needsGrownUp, useSync, connect } from '../sync/syncEngine';
import { ToastProvider } from '../ui/Toast';
import { useNamingPref } from '../i18n/noteNames';
import { t, useLang } from '../i18n';

export function App() {
  const [state, setState] = useState<'booting' | 'ready' | { error: string }>('booting');
  const [writerLost, setWriterLost] = useState(isWriterLost());
  // Changing the language or note names re-renders every screen.
  const lang = useLang();
  const naming = useNamingPref();

  useEffect(() => {
    boot().then(
      () => {
        setState('ready');
        void initSync();
      },
      (e: unknown) => setState({ error: e instanceof Error ? e.message : t('app.startFailed') }),
    );
    const off = onWriterLost(() => setWriterLost(true));
    const onVis = () => {
      if (document.visibilityState === 'visible') void checkWriter().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      off();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (state === 'booting') return <div className="boot" aria-busy="true">{t('app.starting')}</div>;
  if (typeof state === 'object') {
    return (
      <main className="boot">
        <h1>{t('app.ohNo')}</h1>
        <p>{state.error}</p>
      </main>
    );
  }
  return (
    <DataProvider>
     <ToastProvider>
      {writerLost && (
        <div className="banner" role="alert">
          {t('app.otherTab')}
          <button className="btn btn--small" onClick={() => location.reload()}>{t('app.useHere')}</button>
        </div>
      )}
      <Shell key={`${lang}-${naming}`} />
     </ToastProvider>
    </DataProvider>
  );
}

function Shell() {
  const route = useRoute();
  return (
    <div className={route.name === 'player' || route.name === 'editor' ? 'app app--fit' : 'app'}>
      <TopBar route={route} />
      <main className="app-main" id="main">
        <Screen route={route} />
      </main>
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  switch (route.name) {
    case 'library':
      return <Library />;
    case 'player':
      return <PlayerScreen songId={route.songId} />;
    case 'editor':
      return <EditorScreen songId={route.songId} />;
    case 'fingerings':
      return <Fingerings />;
    case 'settings':
      return <Settings />;
    case 'about':
      return <About />;
  }
}

export function TopBar({ route }: { route: Route }) {
  const songs = route.name === 'library' || route.name === 'player' || route.name === 'editor';
  return (
    <header className="topbar">
      <a className="logo" href={routeHref({ name: 'library' })} aria-label={t('nav.home')}>
        <span className="logo-mark"><Icon name="trumpet" size={26} /></span>
        <span className="logo-word">Brassy</span>
      </a>
      <nav className="topnav" aria-label={t('nav.main')}>
        <a className="pill" href={routeHref({ name: 'library' })} aria-current={songs ? 'page' : undefined}>
          <Icon name="music" size={20} /> {t('nav.songs')}
        </a>
        <a className="pill" href={routeHref({ name: 'fingerings' })} aria-current={route.name === 'fingerings' ? 'page' : undefined}>
          <Icon name="trumpet" size={20} /> {t('nav.fingerings')}
        </a>
      </nav>
      <UpdateButton />
      <SyncButton />
      <a className="btn btn--ghost btn--icon gear" href={routeHref({ name: 'settings' })} aria-label={t('nav.settings')}>
        <Icon name="gear" size={22} />
      </a>
    </header>
  );
}

function UpdateButton() {
  const ready = useUpdateReady();
  if (!ready) return null;
  return (
    <button className="btn btn--small btn--brass update-btn" onClick={() => void applyUpdate(flushAll)}>
      {t('nav.update')}
    </button>
  );
}

/** Small backup indicator: asks for a tap when sign-in expired with unsaved changes, or for a grown-up on conflict. */
function SyncButton() {
  const v = useSync();
  if (needsGrownUp(v)) {
    return (
      <a className="btn btn--small sync-btn sync-btn--warn" href={routeHref({ name: 'settings' })}>
        <Icon name="cloud" size={20} /> {t('sync.needsGrownUp')}
      </a>
    );
  }
  if (v.status.kind === 'needs-signin' && v.unsynced) {
    return (
      <button className="btn btn--small sync-btn" onClick={() => void connect()}>
        <Icon name="cloud" size={20} /> {t('sync.tapToBackUp')}
      </button>
    );
  }
  if (v.status.kind === 'syncing') return <span className="sync-note muted" role="status"><Icon name="cloud" size={20} /> {t('sync.saving')}</span>;
  return null;
}

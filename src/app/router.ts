import { useEffect, useState } from 'react';
import { isValidId } from '../model/ids';

export type Route =
  | { name: 'library' }
  | { name: 'player'; songId: string }
  | { name: 'editor'; songId: string }
  | { name: 'fingerings' }
  | { name: 'settings' }
  | { name: 'about' };

/** Hash routes work on any static host without rewrite rules. */
export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (parts[0] === 'song' && parts[1] && isValidId(parts[1])) {
    return parts[2] === 'edit' ? { name: 'editor', songId: parts[1] } : { name: 'player', songId: parts[1] };
  }
  if (parts[0] === 'fingerings') return { name: 'fingerings' };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 'about') return { name: 'about' };
  return { name: 'library' };
}

export function routeHref(r: Route): string {
  switch (r.name) {
    case 'library': return '#/';
    case 'player': return `#/song/${r.songId}`;
    case 'editor': return `#/song/${r.songId}/edit`;
    case 'fingerings': return '#/fingerings';
    case 'settings': return '#/settings';
    case 'about': return '#/about';
  }
}

export function navigate(r: Route, opts: { replace?: boolean } = {}) {
  const href = routeHref(r);
  if (opts.replace) history.replaceState(null, '', href);
  else history.pushState(null, '', href);
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', on);
    window.addEventListener('popstate', on);
    return () => {
      window.removeEventListener('hashchange', on);
      window.removeEventListener('popstate', on);
    };
  }, []);
  return route;
}

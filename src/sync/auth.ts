import { flushAll } from '../app/flush';
import { t } from '../i18n';

/**
 * Google OAuth 2.0 for a static site, implicit flow with a full-page redirect (no Google script, works in an
 * installed iPad web app where popups are unreliable). Scope: drive.file only — Brassy can see just the files it
 * created. The access token lives in memory only.
 */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
const PENDING_KEY = 'brassy-oauth-pending';
const CLIENT_ID_PATTERN = /^[0-9]{5,30}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;
const TOKEN_PATTERN = /^[A-Za-z0-9._~+/=-]{20,4096}$/;

export function clientId(): string | null {
  const id = import.meta.env.GOOGLE_CLIENT_ID?.trim();
  return id && CLIENT_ID_PATTERN.test(id) ? id : null;
}

export function redirectUri(): string {
  return new URL(import.meta.env.BASE_URL, location.origin).href;
}

type Token = { accessToken: string; expiresAt: number };
let token: Token | null = null;

export function currentToken(): string | null {
  if (!token || Date.now() > token.expiresAt - 60_000) return null;
  return token.accessToken;
}

export function dropToken() {
  token = null;
}

function randomState(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Leaves the page. Only call from a tap. */
export async function startSignIn(opts: { selectAccount: boolean; loginHint?: string }) {
  const id = clientId();
  if (!id) throw new Error(t('auth.notSetUp'));
  const state = randomState();
  const returnHash = location.hash.startsWith('#/') ? location.hash : '#/settings';
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ state, returnHash, at: Date.now() }));
  await flushAll();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(),
    response_type: 'token',
    scope: DRIVE_SCOPE,
    include_granted_scopes: 'false',
    state,
  });
  if (opts.selectAccount) p.set('prompt', 'select_account');
  else if (opts.loginHint) p.set('login_hint', opts.loginHint);
  location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${p}`);
}

export type RedirectResult = { ok: true } | { ok: false; error: string } | null;

/**
 * Run once at start-up, before the router reads the URL: take the token out of the URL fragment, check the
 * state, and put the user back where they were.
 */
export function consumeRedirect(): RedirectResult {
  const hash = location.hash;
  if (!/^#(access_token|error|state)=/.test(hash) && !/[#&](access_token|error)=/.test(hash)) return null;
  const params = new URLSearchParams(hash.slice(1));
  let pending: { state?: unknown; returnHash?: unknown; at?: unknown } = {};
  try {
    pending = JSON.parse(sessionStorage.getItem(PENDING_KEY) ?? '{}') as typeof pending;
  } catch {
    /* ignore */
  }
  sessionStorage.removeItem(PENDING_KEY);
  const back = typeof pending.returnHash === 'string' && /^#\/[A-Za-z0-9/_-]*$/.test(pending.returnHash) ? pending.returnHash : '#/settings';
  history.replaceState(null, '', `${location.pathname}${location.search}${back}`);

  const fresh = typeof pending.at === 'number' && Date.now() - pending.at < 15 * 60_000;
  if (!fresh || typeof pending.state !== 'string' || params.get('state') !== pending.state) {
    return { ok: false, error: t('auth.mismatch') };
  }
  const err = params.get('error');
  if (err) return { ok: false, error: err === 'access_denied' ? t('auth.cancelled') : t('auth.failed') };
  const access = params.get('access_token') ?? '';
  const expiresIn = Number(params.get('expires_in'));
  const scopes = (params.get('scope') ?? '').split(' ');
  if (!TOKEN_PATTERN.test(access) || !Number.isFinite(expiresIn) || expiresIn <= 0) return { ok: false, error: t('auth.failed') };
  if (!scopes.includes(DRIVE_SCOPE)) return { ok: false, error: t('auth.needScope') };
  token = { accessToken: access, expiresAt: Date.now() + Math.min(expiresIn, 3600) * 1000 };
  return { ok: true };
}

export async function revokeToken(): Promise<void> {
  const t = token?.accessToken;
  token = null;
  if (!t) return;
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: t }),
    });
  } catch {
    /* best effort */
  }
}

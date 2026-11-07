/** Where the source lives and which commit this build came from (shown on the About page and the library footer). */

const DEFAULT_REPO = 'https://github.com/n03l/brassy';

/** Only http(s) URLs, without a trailing slash; anything else falls back to the default repository. */
export function safeRepoUrl(v: string | undefined): string {
  const s = v?.trim();
  if (!s) return DEFAULT_REPO;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.href.replace(/\/+$/, '') : DEFAULT_REPO;
  } catch {
    return DEFAULT_REPO;
  }
}

/** A full or abbreviated git commit id, lower-case hex; anything else is treated as unknown. */
export function safeCommit(v: string | undefined): string {
  const s = v?.trim().toLowerCase() ?? '';
  return /^[0-9a-f]{7,40}$/.test(s) ? s : '';
}

export const REPO_URL = safeRepoUrl(import.meta.env.VITE_SOURCE_URL);
export const COMMIT = safeCommit(import.meta.env.BRASSY_COMMIT);
export const SHORT_COMMIT = COMMIT.slice(0, 7);
/** The source tree of exactly this build, or the repository when the commit is unknown. */
export const SOURCE_URL = COMMIT ? `${REPO_URL}/tree/${COMMIT}` : REPO_URL;

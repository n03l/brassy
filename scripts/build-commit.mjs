// The git commit this build comes from (Vercel's VERCEL_GIT_COMMIT_SHA, else `git rev-parse HEAD`), or ''.
// Used by vite.config.ts to show the version and link its source on GitHub.
import { execFileSync } from 'node:child_process';

export function buildCommit() {
  let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? '';
  if (!sha) {
    try {
      sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
      sha = '';
    }
  }
  sha = sha.trim().toLowerCase();
  return /^[0-9a-f]{7,40}$/.test(sha) ? sha : '';
}

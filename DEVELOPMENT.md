# Developing Brassy

Technical notes for running, building and deploying Brassy. What the app does is described in the
[README](README.md); rules for coding agents are in [AGENTS.md](AGENTS.md), open work in [TODO.md](TODO.md).

Brassy is a static web app (Vite + React + TypeScript, alphaTab for notation and playback). There is no server and
no accounts: songs are stored on the device in IndexedDB, with an optional backup to Google Drive.

## Run it locally

```sh
npm ci
npm run dev          # http://127.0.0.1:5173
```

Over SSH: `ssh -L 5173:localhost:5173 <server>`, then open http://localhost:5173.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (Vitest) |
| `npm run build` | Type-check, build into `dist/`, add the licence, notices and source archive |
| `npm run preview` | Serve `dist/` on http://127.0.0.1:4173 with the production security headers (test offline mode here) |

## Google Drive backup (optional)

Brassy uses the `drive.file` permission: it can only see files it created itself. It keeps one file,
`Brassy backup.json`, in the Drive of the account that connects. Without a client id the Drive section is hidden
and everything else works.

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and **enable the Google Drive API**.
2. **OAuth consent screen**: user type *External*, app name *Brassy*, add the scope
   `https://www.googleapis.com/auth/drive.file`. This is a non-sensitive scope, so you can publish the app without
   Google's verification. While it stays in *Testing* mode, only the test users you add can sign in.
3. **Credentials → Create OAuth client ID → Web application**:
   - Authorized JavaScript origins: `https://<your-app>.vercel.app` (and `http://localhost:5173` for local testing)
   - Authorized redirect URIs: `https://<your-app>.vercel.app/` (exactly, **with** the trailing slash) and
     `http://localhost:5173/`
4. Put the client id in the `GOOGLE_CLIENT_ID` environment variable (it is public, not a secret):
   - locally: copy `.env.example` to `.env` and fill it in (`.env` is git-ignored);
   - on Vercel: *Project → Settings → Environment Variables → `GOOGLE_CLIENT_ID`*, then redeploy.

Google sign-ins last about an hour; after that the app shows a *Tap to back up* button when there are unsaved
changes. Sync rules live in `src/sync/decide.ts` and `src/sync/syncEngine.ts`.

## Deploy to Vercel

1. Push the repo to GitHub/GitLab and *Import Project* in Vercel. Framework preset: **Other**. `vercel.json`
   already sets the build command (`npm run build`), the output directory (`dist`) and the security headers
   (CSP with `frame-ancestors 'none'`, `X-Frame-Options: DENY`, no-cache for the service worker).
2. Add `GOOGLE_CLIENT_ID` (see above) and redeploy.
3. Or from the command line: `npx vercel` / `npx vercel --prod`.

## Serve `dist/` with Caddy

```caddy
brassy.example.org {
	root * /srv/brassy/dist
	encode zstd gzip
	file_server

	header {
		Content-Security-Policy "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; connect-src 'self' https://www.googleapis.com https://oauth2.googleapis.com; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
		X-Frame-Options DENY
		X-Content-Type-Options nosniff
		Referrer-Policy no-referrer
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
	}
	@immutable path /assets/*
	header @immutable Cache-Control "public, max-age=31536000, immutable"
	@nocache path / /index.html /sw.js /manifest.webmanifest
	header @nocache Cache-Control "no-cache"
}
```

Build with `GOOGLE_CLIENT_ID=... npm run build` and add `https://brassy.example.org` (origin) and
`https://brassy.example.org/` (redirect URI) to the Google OAuth client. A service worker needs HTTPS, which Caddy
provides automatically.

## Licence and source code in builds

The AGPL requires that everyone who uses a deployed copy can get its source code. `npm run build` takes care of
that: it puts `LICENSE.txt`, `THIRD-PARTY-NOTICES.txt` and **`brassy-source.zip`** (the source of exactly what was
built, which `npm ci && npm run build` turns back into the site) next to the app. *About Brassy* (footer of
*My songs*, and Settings) links to the licence, the notices and the GitHub repository at the exact commit that was
built (`VERCEL_GIT_COMMIT_SHA`, else `git rev-parse HEAD`); the *My songs* footer shows that commit too. If you
change Brassy and deploy it, keep that page and the build step, and set `VITE_SOURCE_URL` to your own public
repository.

New bundled dependencies must be AGPL-compatible and listed in `bundled` in `scripts/build-legal.mjs`, so their
licence lands in the notices.

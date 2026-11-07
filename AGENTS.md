# Brassy — notes for coding agents

Kid-friendly PWA for practising and editing B♭ trumpet music. Vite + React + TypeScript, alphaTab for notation and
playback, IndexedDB (`idb`) for storage, optional Google Drive backup (`drive.file`). Static site, hosted on Vercel.

## Commands
- `npm run dev` — dev server on http://127.0.0.1:5173
- `npm test` — Vitest unit tests (node environment; alphaTab runs headless in tests)
- `npm run build` — typecheck + production build into `dist/`, then `scripts/build-legal.mjs` adds LICENSE.txt,
  THIRD-PARTY-NOTICES.txt and brassy-source.zip (AGPL Corresponding Source; the About page links to them)
- `npm run preview` — serve `dist/` on http://127.0.0.1:4173 (use this to test the service worker / offline)

Setup, deployment and build details are in `DEVELOPMENT.md`; the README is for users. Open work and known gaps are listed in `TODO.md`; update it when you ship or find something.

## Rules
- Our song model (`src/model/types.ts`) is the source of truth. alphaTab only renders/plays the alphaTex we generate
  (`src/music/alphatex.ts`). Each NoteEvent is exactly one alphaTab beat, in order.
- Pitches are WRITTEN pitch. Playback sounds 2 semitones lower via `\transpose -2 \displaytranspose 2` (tested).
- All size/value limits live in `src/model/limits.ts`; apply them on every write path. `normalizeSong` is the loader
  and migration path: normalise stored data, never reject what can be repaired.
- Writes go through `writeTx` (`src/db/db.ts`), which enforces the one-writer-tab lock.
- Changing the IndexedDB schema or the Song shape needs a migration in `getDb()` that keeps existing songs. Ask the
  owner first.
- Ask the owner before adding dependencies. New bundled dependencies must be AGPL-compatible and listed in
  `bundled` in `scripts/build-legal.mjs` so their licence lands in the notices.
- Licence: AGPL-3.0-or-later. Keep the About page's source/licence links and the alphaTab attribution visible.
- Google Drive: `GOOGLE_CLIENT_ID` env var (injected in `vite.config.ts`, exactly that variable). Scope is
  `drive.file` only. Sync rules live in `src/sync/decide.ts` (tested) and `src/sync/syncEngine.ts`.
- Security headers live in `vercel.json`; `npm run preview` serves the same headers, so test CSP changes there.
- Playwright tests with stubbed Google routes: use `page.wait_for_timeout`, not `time.sleep` (route handlers only run
  while Playwright is pumping events), and locator waits instead of `wait_for_function` (blocked by the CSP).
- Check alphaTab APIs against `node_modules/@coderline/alphatab/dist/alphaTab.d.ts`, never guess.
- Untrusted input everywhere (imported files, backups, Drive responses): render with React text only, no
  `innerHTML`/`dangerouslySetInnerHTML`.
- All UI text goes through `t()` from `src/i18n`. Add every new key to `src/i18n/en.ts`, `src/i18n/it.ts` and
  `src/i18n/de.ts` (the type check fails if a translation is missing a key). Note names go through `noteName()`/`spokenName()`, which follow the
  separate note-naming setting (letters, German, solfège) in `src/i18n/noteNames.ts`.
- UI copy is short and friendly, written for a 9–12 year old. Touch targets ≥ 48px, real buttons, aria-labels on
  icon buttons, never colour alone.

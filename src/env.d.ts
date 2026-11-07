/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Injected by vite.config.ts from GOOGLE_CLIENT_ID. Empty when Drive backup isn't set up. */
  readonly GOOGLE_CLIENT_ID: string;
  /** Optional public source repository URL shown on the About page. */
  readonly VITE_SOURCE_URL?: string;
  /** Injected by vite.config.ts: the git commit this build came from, or empty. */
  readonly BRASSY_COMMIT: string;
}

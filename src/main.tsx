import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/baloo-2/latin-700.css';
import '@fontsource/baloo-2/latin-800.css';
import '@fontsource/nunito/latin-400.css';
import '@fontsource/nunito/latin-700.css';
import '@fontsource/nunito/latin-800.css';
import './ui/tokens.css';
import './app/app.css';
import './player/player.css';
import './screens/screens.css';
import './editor/editor.css';
import { App } from './app/App';
import { installFlushHandlers } from './app/flush';
import { registerPwa } from './app/pwa';
import { takeRedirect } from './sync/syncEngine';

// Refuse to run inside a frame on hosts that can't send frame-ancestors / X-Frame-Options headers.
if (window.top !== window.self) {
  document.body.textContent = 'Brassy cannot be shown inside another page.';
} else {
  // Take a Google sign-in answer out of the URL before the router sees it.
  takeRedirect();
  installFlushHandlers();
  void registerPwa();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

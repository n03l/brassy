import { useState } from 'react';
import { Icon } from '../ui/Icon';
import { LIMITS } from '../model/limits';
import { t } from '../i18n';

export const SPEED_STEP = 5;

export function clampSpeed(v: number): number {
  return Math.min(LIMITS.speedMax, Math.max(LIMITS.speedMin, Math.round(v / SPEED_STEP) * SPEED_STEP));
}

type Props = {
  ready: boolean;
  /** The song's tempo (♩ per minute); the playing tempo is tempo × speed. */
  tempo: number;
  playing: boolean;
  speed: number;
  loop: boolean;
  click: boolean;
  /** Trumpet sound on (off = the notes are only shown). */
  sound: boolean;
  compact?: boolean;
  onRestart: () => void;
  onPlayPause: () => void;
  onSpeed: (v: number) => void;
  onLoop: () => void;
  onClick: () => void;
  onSound: () => void;
};

export function Transport(p: Props) {
  const [speedOpen, setSpeedOpen] = useState(false);
  const bpm = Math.round((p.tempo * p.speed) / 100);
  return (
    <footer className={`card transport${speedOpen ? ' transport--speed-open' : ''}`} aria-label={t('transport.controls')}>
      <button className="btn" onClick={p.onRestart} aria-label={t('transport.restartAria')} disabled={!p.ready}>
        <Icon name="restart" /> <span className="t-label">{t('transport.restart')}</span>
      </button>
      <button className="btn btn--primary play-btn" onClick={p.onPlayPause} disabled={!p.ready}
        aria-label={p.playing ? t('transport.pause') : t('transport.play')}>
        <Icon name={p.playing ? 'pause' : 'play'} size={40} strokeWidth={3} />
      </button>
      <button className="btn speed-chip" aria-expanded={speedOpen} onClick={() => setSpeedOpen((o) => !o)}
        aria-label={`${t('transport.speedChip', p.speed)}. ${t('transport.tempoAria', bpm)}`}>
        {p.speed}%
        <span className="chip-tempo">{t('transport.tempo', bpm)}</span>
      </button>
      <div className="speed" role="group" aria-label={t('transport.speedGroup')}>
        <button className="btn btn--icon" onClick={() => p.onSpeed(clampSpeed(p.speed - SPEED_STEP))}
          disabled={p.speed <= LIMITS.speedMin} aria-label={t('transport.slower')}>
          <Icon name="minus" />
        </button>
        <output className="speed-value" aria-live="polite" aria-label={`${t('transport.speedAria', p.speed)}. ${t('transport.tempoAria', bpm)}`}>
          {p.speed}%
          <span className="speed-cap">{t('transport.speedCap')} · {t('transport.tempo', bpm)}</span>
        </output>
        <button className="btn btn--icon" onClick={() => p.onSpeed(clampSpeed(p.speed + SPEED_STEP))}
          disabled={p.speed >= LIMITS.speedMax} aria-label={t('transport.faster')}>
          <Icon name="plus" />
        </button>
      </div>
      <div className="toggles">
        <button className="btn" aria-pressed={p.sound} onClick={p.onSound} aria-label={t('transport.soundAria')}>
          <Icon name="trumpet" /> <span className="t-label">{t('transport.sound')}</span>
        </button>
        <button className="btn" aria-pressed={p.click} onClick={p.onClick} aria-label={t('transport.click')}>
          <Icon name="click" /> <span className="t-label">{t('transport.click')}</span>
        </button>
        <button className="btn" aria-pressed={p.loop} onClick={p.onLoop} disabled={!p.ready} aria-label={t('transport.loop')}>
          <Icon name="loop" /> <span className="t-label">{t('transport.loop')}</span>
        </button>
      </div>
    </footer>
  );
}

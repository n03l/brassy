import { Icon } from '../ui/Icon';
import type { LadderConfig, LadderState } from './ladder';
import type { LoopRange } from './LoopOverlay';
import { LIMITS } from '../model/limits';
import { t } from '../i18n';

export function LoopPanel({ range, ladder, cfg, onCfg, onBumpy, onStop }: {
  range: LoopRange; ladder: LadderState; cfg: LadderConfig;
  onCfg: (c: LadderConfig) => void; onBumpy: () => void; onStop: () => void;
}) {
  const span = Math.max(1, cfg.goal - ladder.start);
  const pct = Math.min(100, Math.max(0, ((ladder.speed - ladder.start) / span) * 100));
  return (
    <section className="card loop-panel" aria-labelledby="loop-h">
      <h2 id="loop-h" className="side-h">{t('loop.title')}</h2>
      <p className="loop-bars">{range.first === range.last ? t('loop.bar', range.first + 1) : t('loop.bars', range.first + 1, range.last + 1)}</p>

      <div className="ladder" aria-label={t('loop.ladderAria', ladder.start, ladder.speed, cfg.goal)}>
        <div className="ladder-track"><div className="ladder-fill" style={{ width: `${pct}%` }} /></div>
        <div className="ladder-labels">
          <span><small>{t('loop.start')}</small>{ladder.start}%</span>
          <span className="ladder-now"><small>{t('loop.now')}</small>{ladder.speed}%</span>
          <span><small>{t('loop.goal')}</small>{cfg.goal}%</span>
        </div>
      </div>

      <div className="loop-count">
        <span className="star-badge" aria-hidden="true"><Icon name="star" size={28} /></span>
        <span aria-live="polite"><strong>{ladder.loops}</strong> {t('loop.count', ladder.loops)}</span>
        <button className="btn btn--small" onClick={onBumpy} title={t('loop.bumpyHint')}>
          {t('loop.bumpy')}
        </button>
      </div>

      <details className="ladder-cfg">
        <summary>{t('loop.rules')}</summary>
        <div className="ladder-cfg-row">
          <span>{t('loop.goal')}</span>
          <button className="btn btn--small btn--icon" aria-label={t('loop.lowerGoal')} onClick={() => onCfg({ ...cfg, goal: Math.max(LIMITS.speedMin, cfg.goal - 5) })}><Icon name="minus" size={18} /></button>
          <strong>{cfg.goal}%</strong>
          <button className="btn btn--small btn--icon" aria-label={t('loop.higherGoal')} onClick={() => onCfg({ ...cfg, goal: Math.min(LIMITS.speedMax, cfg.goal + 5) })}><Icon name="plus" size={18} /></button>
        </div>
        <div className="ladder-cfg-row" role="group" aria-label={t('loop.stepGroup')}>
          <span>{t('loop.add')}</span>
          {[5, 10].map((v) => <button key={v} className="btn btn--small" aria-pressed={cfg.step === v} onClick={() => onCfg({ ...cfg, step: v })}>{v}%</button>)}
        </div>
        <div className="ladder-cfg-row" role="group" aria-label={t('loop.everyGroup')}>
          <span>{t('loop.every')}</span>
          {[1, 2, 3].map((v) => <button key={v} className="btn btn--small" aria-pressed={cfg.every === v} onClick={() => onCfg({ ...cfg, every: v })}>{v}</button>)}
          <span>{t('loop.loops')}</span>
        </div>
      </details>

      <button className="btn btn--brass" onClick={onStop}><Icon name="close" /> {t('loop.stop')}</button>
    </section>
  );
}

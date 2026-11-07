import { useRef } from 'react';
import type { ScoreController } from './ScoreController';
import { t } from '../i18n';

export type LoopRange = { first: number; last: number };

/**
 * Shades the looped bars and draws two brass handles that snap to whole bars. Handles are buttons, so arrow keys
 * move them one bar at a time.
 */
export function LoopOverlay({ ctl, range, onChange, renderTick }: {
  ctl: ScoreController; range: LoopRange; onChange: (r: LoopRange) => void; renderTick: number;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const count = ctl.barCount;
  void renderTick; // re-render when alphaTab re-lays out
  const rects = [];
  for (let i = range.first; i <= range.last; i++) {
    const b = ctl.barBounds(i);
    if (b) rects.push(<div key={i} className="loop-shade" style={{ left: b.x, top: b.y, width: b.w, height: b.h }} />);
  }
  const a = ctl.barBounds(range.first);
  const z = ctl.barBounds(range.last);

  const move = (which: 'start' | 'end', bar: number) => {
    const b = Math.max(0, Math.min(count - 1, bar));
    if (which === 'start') onChange({ first: Math.min(b, range.last), last: range.last });
    else onChange({ first: range.first, last: Math.max(b, range.first) });
  };

  const drag = (which: 'start' | 'end') => (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.focus();
    const id = e.pointerId;
    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      const box = layer.current?.getBoundingClientRect();
      if (!box) return;
      const bar = ctl.barAt(ev.clientX - box.left, ev.clientY - box.top);
      if (bar !== null) move(which, bar);
    };
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== id) return;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const keys = (which: 'start' | 'end') => (e: React.KeyboardEvent) => {
    const cur = which === 'start' ? range.first : range.last;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); move(which, cur - 1); }
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); move(which, cur + 1); }
  };

  return (
    <div className="loop-layer" ref={layer}>
      {rects}
      {a && (
        <button className="loop-handle loop-handle--start" style={{ left: a.x, top: a.y, height: a.h }}
          aria-label={t('loop.handleStart', range.first + 1)}
          onPointerDown={drag('start')} onKeyDown={keys('start')}>
          <span className="loop-grip" aria-hidden="true" />
        </button>
      )}
      {z && (
        <button className="loop-handle loop-handle--end" style={{ left: z.x + z.w, top: z.y, height: z.h }}
          aria-label={t('loop.handleEnd', range.last + 1)}
          onPointerDown={drag('end')} onKeyDown={keys('end')}>
          <span className="loop-grip" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

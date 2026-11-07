import type { ReactElement } from "react";
import type { Song } from "../model/types";
import { STEPS } from '../model/types';
import { durationTicks } from '../music/duration';

/** A tiny, decorative drawing of the first bars (no alphaTab needed for a card). */
export function SongPreview({ song, bars = 2 }: { song: Song; bars?: number }) {
  const W = 260, H = 64, top = 14, gap = 8; // staff: 5 lines from y=top to top+4*gap
  const shown = song.bars.slice(0, bars);
  const barW = (W - 8) / Math.max(1, shown.length);
  const yFor = (step: string, octave: number) => {
    const idx = octave * 7 + STEPS.indexOf(step as (typeof STEPS)[number]);
    const e4 = 4 * 7 + 2; // bottom line
    return top + 4 * gap - (idx - e4) * (gap / 2);
  };
  const items: ReactElement[] = [];
  shown.forEach((bar, bi) => {
    const total = bar.events.reduce((t, e) => t + durationTicks(e.duration, e.dotted), 0) || 1;
    let t = 0;
    bar.events.forEach((e, i) => {
      const x = 4 + bi * barW + 10 + (t / total) * (barW - 20);
      t += durationTicks(e.duration, e.dotted);
      if (e.rest || !e.pitch) {
        items.push(<rect key={`${bi}-${i}`} x={x - 3} y={top + gap * 1.5} width={6} height={gap} rx={2} fill="#9aa5c0" />);
        return;
      }
      const y = Math.min(H - 4, Math.max(4, yFor(e.pitch.step, e.pitch.octave)));
      const hollow = e.duration === 'whole' || e.duration === 'half';
      items.push(
        <g key={`${bi}-${i}`}>
          <ellipse cx={x} cy={y} rx={5} ry={4} fill={hollow ? '#fff' : 'var(--text)'} stroke="var(--text)" strokeWidth={2} />
          {e.duration !== 'whole' && <line x1={x + 4.5} y1={y} x2={x + 4.5} y2={y - 22} stroke="var(--text)" strokeWidth={1.6} />}
        </g>,
      );
    });
  });
  return (
    <svg className="song-preview" viewBox={`0 0 ${W} ${H}`} aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid meet">
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={4} x2={W - 4} y1={top + i * gap} y2={top + i * gap} stroke="#c9d2e8" strokeWidth={1.5} />
      ))}
      {shown.map((_, i) => (
        <line key={`bl${i}`} x1={4 + (i + 1) * barW} x2={4 + (i + 1) * barW} y1={top} y2={top + 4 * gap} stroke="#c9d2e8" strokeWidth={1.5} />
      ))}
      {items}
    </svg>
  );
}

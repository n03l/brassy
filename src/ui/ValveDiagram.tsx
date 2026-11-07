import type { Valves } from '../music/fingering';
import { valveCaption } from '../music/fingering';

/**
 * Three valves seen from above. Pressed valves are filled brass AND carry a dark dot, so the state doesn't
 * rely on colour alone.
 */
export function ValveDiagram({ valves, size = 'large' }: { valves: Valves | undefined; size?: 'large' | 'small' }) {
  const r = size === 'large' ? 26 : 8;
  const gap = size === 'large' ? 18 : 3;
  const stroke = size === 'large' ? 4 : 2;
  const w = 3 * 2 * r + 2 * gap + stroke * 2;
  const h = 2 * r + stroke * 2 + (size === 'large' ? 26 : 0);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={valveCaption(valves)}>
      {[1, 2, 3].map((v, i) => {
        const pressed = !!valves?.includes(v as 1 | 2 | 3);
        const cx = stroke + r + i * (2 * r + gap);
        const cy = stroke + r;
        return (
          <g key={v}>
            <circle cx={cx} cy={cy} r={r} fill={pressed ? 'var(--brass)' : '#fff'}
              stroke={pressed ? 'var(--brass-dark)' : '#9aa5c0'} strokeWidth={stroke} />
            {pressed && <circle cx={cx} cy={cy} r={r * 0.32} fill="var(--text)" />}
            {size === 'large' && (
              <text x={cx} y={h - 4} textAnchor="middle" fontSize="18" fontWeight="800" fill="var(--text-2)">{v}</text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

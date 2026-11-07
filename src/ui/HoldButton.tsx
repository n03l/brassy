import { useEffect, useRef, useState } from 'react';

/** Press and hold (pointer, or Space/Enter) for `ms` to confirm. Releasing early cancels. */
export function HoldButton({ ms = 2000, onDone, children }: { ms?: number; onDone: () => void; children: React.ReactNode }) {
  const [progress, setProgress] = useState(0);
  const start = useRef<number | null>(null);
  const raf = useRef<number | undefined>(undefined);
  const stop = () => {
    start.current = null;
    if (raf.current) cancelAnimationFrame(raf.current);
    setProgress(0);
  };
  const begin = () => {
    if (start.current !== null) return;
    start.current = performance.now();
    const tick = () => {
      if (start.current === null) return;
      const p = Math.min(1, (performance.now() - start.current) / ms);
      setProgress(p);
      if (p >= 1) {
        stop();
        onDone();
      } else raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };
  useEffect(() => stop, []);
  return (
    <button className="btn hold-btn" style={{ ['--p' as string]: progress }}
      onPointerDown={(e) => { e.preventDefault(); begin(); }} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); begin(); } }}
      onKeyUp={stop} onBlur={stop} onContextMenu={(e) => e.preventDefault()}>
      <span className="hold-fill" aria-hidden="true" />
      <span className="hold-label">{children}</span>
    </button>
  );
}

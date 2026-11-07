import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

type Toast = { id: number; message: string; action?: { label: string; run: () => void }; tone?: 'info' | 'warn' };
type ShowToast = (t: Omit<Toast, 'id'>, ms?: number) => void;

const Ctx = createContext<ShowToast>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const show = useCallback<ShowToast>((t, ms = 5000) => {
    window.clearTimeout(timer.current);
    setToast({ ...t, id: ++seq.current });
    timer.current = window.setTimeout(() => setToast(null), ms);
  }, []);
  return (
    <Ctx.Provider value={show}>
      {children}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className={`toast card${toast.tone === 'warn' ? ' toast--warn' : ''}`} key={toast.id}>
            <span>{toast.message}</span>
            {toast.action && (
              <button className="btn btn--small btn--brass" onClick={() => { toast.action!.run(); setToast(null); }}>
                {toast.action.label}
              </button>
            )}
          </div>
        )}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ShowToast {
  return useContext(Ctx);
}

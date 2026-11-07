import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';
import { t } from '../i18n';

/** Native <dialog> (focus trap, Esc to close) styled as a card. */
export function Dialog({ open, onClose, title, children, wide }: {
  open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className={`dialog card${wide ? ' dialog--wide' : ''}`} onClose={onClose} aria-labelledby="dialog-title"
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      {open && (
        <div className="dialog-inner">
          <div className="dialog-head">
            <h2 id="dialog-title">{title}</h2>
            <button className="btn btn--icon btn--ghost" onClick={onClose} aria-label={t('common.close')}><Icon name="close" /></button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({ open, title, message, confirmLabel, danger, onConfirm, onCancel }: {
  open: boolean; title: string; message: ReactNode; confirmLabel: string; danger?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <Dialog open={open} onClose={onCancel} title={title}>
      <div className="dialog-body">{message}</div>
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel} autoFocus>{t('common.cancel')}</button>
        <button className={`btn ${danger ? 'btn--warn' : 'btn--primary'}`} onClick={onConfirm}>{confirmLabel}</button>
      </div>
    </Dialog>
  );
}

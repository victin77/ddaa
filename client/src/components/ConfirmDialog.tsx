import { ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
}

export default function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
}: Props) {
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Enter') onConfirm();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose, onConfirm]);

  if (!open) return null;

  const isDanger = tone === 'danger';

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div
        className="relative w-full max-w-sm card overflow-hidden anim-pop"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="p-6">
          <div
            className={
              isDanger
                ? 'w-12 h-12 rounded-full grid place-items-center bg-danger/15 text-danger mb-4'
                : 'w-12 h-12 rounded-full grid place-items-center bg-accent/15 text-accent mb-4'
            }
          >
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div className="font-semibold text-lg mb-1.5">{title}</div>
          <div className="text-sm text-muted leading-relaxed">{description}</div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-overlay/[0.03] border-t border-overlay/[0.05]">
          <button type="button" className="btn-ghost" onClick={onClose} autoFocus>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={
              isDanger
                ? 'inline-flex items-center justify-center gap-2 rounded-full bg-danger hover:brightness-110 px-4 py-2 text-sm font-semibold text-white transition'
                : 'btn-primary'
            }
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

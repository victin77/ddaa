import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: ReactNode;
  requireText: string;
  confirmLabel?: string;
  loading?: boolean;
}

export default function DangerConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  requireText,
  confirmLabel = 'Apagar',
  loading = false,
}: Props) {
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (!open) setTyped('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !loading) onClose();
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, [open, onClose, loading]);

  if (!open) return null;

  const matches = typed.trim() === requireText;

  return createPortal(
    <div className="fixed inset-0 z-[60] grid place-items-center p-4">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm anim-fade"
        onClick={() => !loading && onClose()}
      />
      <div
        className="relative w-full max-w-md card overflow-hidden anim-pop border border-danger/30"
        role="alertdialog"
        aria-modal="true"
      >
        <div className="px-6 pt-6 pb-4">
          <div className="w-12 h-12 rounded-full grid place-items-center bg-danger/15 text-danger mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div className="font-semibold text-lg mb-1.5">{title}</div>
          <div className="text-sm text-muted leading-relaxed">{description}</div>

          <div className="mt-5">
            <div className="text-xs text-muted mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-danger" />
              Para confirmar, digite{' '}
              <code className="font-mono text-danger bg-danger/10 px-1.5 py-0.5 rounded">
                {requireText}
              </code>
            </div>
            <input
              autoFocus
              className="input border-danger/30 focus:border-danger focus:ring-danger/20 font-mono"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              disabled={loading}
              placeholder={requireText}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 bg-overlay/[0.03] border-t border-overlay/[0.05]">
          <button
            type="button"
            className="btn-ghost"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className={
              matches && !loading
                ? 'inline-flex items-center justify-center gap-2 rounded-full bg-danger hover:brightness-110 px-4 py-2 text-sm font-semibold text-white transition'
                : 'inline-flex items-center justify-center gap-2 rounded-full bg-overlay/[0.08] px-4 py-2 text-sm font-semibold text-muted cursor-not-allowed'
            }
            onClick={onConfirm}
            disabled={!matches || loading}
          >
            {loading ? 'Apagando…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

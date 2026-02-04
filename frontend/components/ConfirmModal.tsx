import React from 'react';
import { X } from 'lucide-react';

export type ConfirmModalVariant = 'danger' | 'warning' | 'default';

export interface ConfirmModalProps {
  open: boolean;
  title: string;
  message?: React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmModalVariant;
  isLoading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'default',
  isLoading = false,
  onConfirm,
  onCancel
}) => {
  if (!open) return null;

  const confirmClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : variant === 'warning'
        ? 'bg-orange-500 hover:bg-orange-600 text-white'
        : 'bg-primary hover:opacity-90 text-primary-foreground';

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={isLoading ? undefined : onCancel}
      />

      <div className="relative w-[92vw] max-w-lg rounded-2xl border border-border bg-card shadow-3d p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-foreground">{title}</h3>
            {message ? (
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{message}</div>
            ) : null}
          </div>

          <button
            type="button"
            className="p-2 rounded-lg hover:bg-muted/30 transition-colors"
            onClick={isLoading ? undefined : onCancel}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-4 py-2 rounded-xl border border-border bg-background/30 hover:bg-background/50 transition-colors text-sm font-semibold"
            onClick={isLoading ? undefined : onCancel}
            disabled={isLoading}
          >
            {cancelText}
          </button>
          <button
            type="button"
            className={`px-4 py-2 rounded-xl text-sm font-bold shadow-3d-sm active:translate-y-[1px] active:shadow-none transition-all ${confirmClass} ${isLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
            onClick={isLoading ? undefined : onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Working…' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

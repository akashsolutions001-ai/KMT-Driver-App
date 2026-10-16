import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ActionConfirmVariant = 'primary' | 'success' | 'warning' | 'destructive';

export interface ActionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  highlightText?: string;
  highlightNote?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ActionConfirmVariant;
  icon?: React.ReactNode;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

const variantStyles: Record<
  ActionConfirmVariant,
  {
    iconBg: string;
    iconColor: string;
    confirmButton: string;
    borderHighlight: string;
  }
> = {
  primary: {
    iconBg: 'bg-primary/10 border-primary/20',
    iconColor: 'text-primary',
    confirmButton:
      'bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25',
    borderHighlight: 'border-primary/20 bg-primary/5 text-primary',
  },
  success: {
    iconBg: 'bg-emerald-500/10 border-emerald-500/20',
    iconColor: 'text-emerald-600 dark:text-emerald-400',
    confirmButton:
      'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/25',
    borderHighlight:
      'border-emerald-500/20 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
  },
  warning: {
    iconBg: 'bg-amber-500/10 border-amber-500/20',
    iconColor: 'text-amber-600 dark:text-amber-400',
    confirmButton:
      'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25',
    borderHighlight:
      'border-amber-500/20 bg-amber-500/5 text-amber-700 dark:text-amber-300',
  },
  destructive: {
    iconBg: 'bg-red-500/10 border-red-500/20',
    iconColor: 'text-red-600 dark:text-red-400',
    confirmButton:
      'bg-red-600 hover:bg-red-700 text-white shadow-lg shadow-red-600/25',
    borderHighlight:
      'border-red-500/20 bg-red-500/5 text-red-700 dark:text-red-300',
  },
};

export function ActionConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  highlightText,
  highlightNote,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'primary',
  icon,
  isLoading = false,
  onConfirm,
  onCancel,
}: ActionConfirmDialogProps) {
  const styles = variantStyles[variant];

  // Close on Escape key press
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel?.();
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, isLoading, onCancel, onOpenChange]);

  if (!open) return null;

  const handleCancel = () => {
    if (isLoading) return;
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = async () => {
    if (isLoading) return;
    try {
      await onConfirm();
    } finally {
      onOpenChange(false);
    }
  };

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 overflow-y-auto"
    >
      {/* Dimmed backdrop with blur */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity animate-in fade-in-0 duration-200"
        onClick={handleCancel}
      />

      {/* Centered Dialog Card (pure flexbox centering, no translate matrix collision) */}
      <div
        className="relative z-10 w-full max-w-sm sm:max-w-md max-h-[90vh] overflow-y-auto rounded-2xl p-5 sm:p-6 bg-card border border-border shadow-2xl transition-all animate-in zoom-in-95 duration-200 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header row with icon badge */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 sm:gap-3.5 text-center sm:text-left">
          {icon && (
            <div
              className={cn(
                'w-12 h-12 rounded-xl flex items-center justify-center border flex-shrink-0 shadow-sm',
                styles.iconBg,
                styles.iconColor
              )}
            >
              {icon}
            </div>
          )}
          <div className="space-y-1 min-w-0 flex-1">
            <h2 className="text-lg sm:text-xl font-bold text-foreground tracking-tight">
              {title}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {/* Highlight Banner / Stop Info if available */}
        {highlightText && (
          <div
            className={cn(
              'px-3.5 py-2.5 rounded-lg border text-xs sm:text-sm font-medium flex items-center gap-2',
              styles.borderHighlight
            )}
          >
            <span className="truncate">{highlightText}</span>
          </div>
        )}

        {/* Optional Warning / Advisory Note */}
        {highlightNote && (
          <p className="text-[11px] sm:text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2.5 py-1.5 leading-snug">
            {highlightNote}
          </p>
        )}

        {/* Touch-friendly action buttons */}
        <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2 sm:gap-2.5">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full sm:w-1/2 h-11 sm:h-12 rounded-xl text-xs sm:text-sm font-medium border-border hover:bg-secondary active:scale-[0.98] transition-all"
          >
            {cancelText}
          </Button>

          <Button
            type="button"
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn(
              'w-full sm:w-1/2 h-11 sm:h-12 rounded-xl text-xs sm:text-sm font-bold active:scale-[0.98] transition-all',
              styles.confirmButton
            )}
          >
            {isLoading ? (
              <span className="flex items-center gap-2 justify-center">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </span>
            ) : (
              <span>{confirmText}</span>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

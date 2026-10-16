import { StopStatus } from '@/types/driver';
import { cn } from '@/lib/utils';

interface StatusBadgeProps {
  status: StopStatus;
}

const statusConfig: Record<StopStatus, { label: string; className: string }> = {
  reached: {
    label: 'Reached',
    className: 'bg-success text-success-foreground',
  },
  current: {
    label: 'On the Way',
    className: 'bg-accent text-accent-foreground animate-pulse-subtle',
  },
  pending: {
    label: 'Pending',
    className: 'bg-pending/20 text-pending',
  },
  skipped: {
    label: 'Skipped',
    className: 'bg-amber-500/20 text-amber-700 dark:text-amber-400 border border-amber-500/30',
  },
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center',
        'px-2 py-0.5 sm:px-2.5 sm:py-1',
        'rounded-md',
        'text-[10px] sm:text-xs font-medium',
        'whitespace-nowrap',
        'min-w-[4rem] sm:min-w-[4.5rem]',
        config.className
      )}
    >
      {config.label}
    </span>
  );
}

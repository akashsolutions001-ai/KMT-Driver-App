import { cn } from '@/lib/utils';
import { AlertCircle, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';

type MessageType = 'error' | 'warning' | 'info' | 'success';

interface InlineMessageProps {
  type: MessageType;
  message: string;
}

const messageConfig: Record<MessageType, { icon: typeof AlertCircle; className: string }> = {
  error: {
    icon: AlertCircle,
    className: 'text-destructive',
  },
  warning: {
    icon: AlertTriangle,
    className: 'text-warning',
  },
  info: {
    icon: Info,
    className: 'text-muted-foreground',
  },
  success: {
    icon: CheckCircle2,
    className: 'text-green-600 dark:text-green-400',
  },
};

export function InlineMessage({ type, message }: InlineMessageProps) {
  const config = messageConfig[type];
  const Icon = config.icon;

  const isSuccess = type === 'success';

  return (
    <div className={cn(
      'flex items-start gap-2',
      isSuccess ? 'text-sm sm:text-base font-semibold' : 'text-xs sm:text-sm',
      config.className
    )}>
      <Icon className={cn(
        'flex-shrink-0 mt-0.5',
        isSuccess ? 'w-4 h-4 sm:w-5 sm:h-5' : 'w-3.5 h-3.5 sm:w-4 sm:h-4'
      )} />
      <span className="leading-snug">{message}</span>
    </div>
  );
}

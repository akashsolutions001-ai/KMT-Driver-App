import { Button } from '@/components/ui/button';
import { RouteState } from '@/types/driver';
import { Play, CheckCircle, Flag, SkipForward } from 'lucide-react';

interface RouteActionButtonProps {
  routeState: RouteState;
  currentStopName?: string;
  isLastStop?: boolean;
  onStartRoute: () => void;
  onMarkReached: () => void;
  onSkipStop?: () => void;
}

export function RouteActionButton({
  routeState,
  isLastStop = false,
  onStartRoute,
  onMarkReached,
  onSkipStop,
}: RouteActionButtonProps) {
  if (routeState === 'not_started') {
    return (
      <Button
        onClick={onStartRoute}
        size="lg"
        className="action-button shadow-lg shadow-primary/30 hover:shadow-xl hover:shadow-primary/40"
      >
        <Play className="w-5 h-5 sm:w-6 sm:h-6" />
        <span>START TRIP</span>
      </Button>
    );
  }

  if (routeState === 'in_progress') {
    return (
      <div className="flex items-center gap-2 w-full">
        {onSkipStop && (
          <Button
            onClick={onSkipStop}
            type="button"
            size="lg"
            variant="outline"
            className="h-12 sm:h-14 px-3 sm:px-4 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 hover:bg-amber-500/20 hover:text-amber-700 dark:hover:text-amber-300 flex items-center justify-center gap-1.5 font-bold text-xs sm:text-sm flex-shrink-0 shadow-sm transition-all"
            title="Skip current stop and proceed to next stop"
          >
            <SkipForward className="w-4 h-4 sm:w-5 sm:h-5 text-amber-500" />
            <span>SKIP STOP</span>
          </Button>
        )}

        {isLastStop ? (
          <Button
            onClick={onMarkReached}
            size="lg"
            className="action-button flex-1 bg-success hover:bg-success/90 shadow-lg shadow-success/30 hover:shadow-xl hover:shadow-success/40 animate-pulse"
          >
            <Flag className="w-5 h-5 sm:w-6 sm:h-6" />
            <span>COMPLETE TRIP</span>
          </Button>
        ) : (
          <Button
            onClick={onMarkReached}
            size="lg"
            className="action-button flex-1 bg-success hover:bg-success/90 shadow-lg shadow-success/30 hover:shadow-xl hover:shadow-success/40"
          >
            <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
            <span className="text-center leading-tight truncate">MARK REACHED</span>
          </Button>
        )}
      </div>
    );
  }

  return (
    <Button disabled size="lg" variant="secondary" className="action-button opacity-80">
      <Flag className="w-5 h-5 sm:w-6 sm:h-6" />
      <span>TRIP COMPLETED</span>
    </Button>
  );
}

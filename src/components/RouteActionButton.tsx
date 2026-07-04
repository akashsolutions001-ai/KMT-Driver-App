import { Button } from '@/components/ui/button';
import { RouteState } from '@/types/driver';
import { Play, CheckCircle, Flag } from 'lucide-react';

interface RouteActionButtonProps {
  routeState: RouteState;
  currentStopName?: string;
  isLastStop?: boolean;
  onStartRoute: () => void;
  onMarkReached: () => void;
}

export function RouteActionButton({
  routeState,
  isLastStop = false,
  onStartRoute,
  onMarkReached,
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
    if (isLastStop) {
      return (
        <Button
          onClick={onMarkReached}
          size="lg"
          className="action-button bg-success hover:bg-success/90 shadow-lg shadow-success/30 hover:shadow-xl hover:shadow-success/40 animate-pulse"
        >
          <Flag className="w-5 h-5 sm:w-6 sm:h-6" />
          <span>COMPLETE TRIP</span>
        </Button>
      );
    }

    return (
      <Button
        onClick={onMarkReached}
        size="lg"
        className="action-button bg-success hover:bg-success/90 shadow-lg shadow-success/30 hover:shadow-xl hover:shadow-success/40"
      >
        <CheckCircle className="w-5 h-5 sm:w-6 sm:h-6" />
        <span className="text-center leading-tight">MARK CURRENT STOP AS REACHED</span>
      </Button>
    );
  }

  return (
    <Button disabled size="lg" variant="secondary" className="action-button opacity-80">
      <Flag className="w-5 h-5 sm:w-6 sm:h-6" />
      <span>TRIP COMPLETED</span>
    </Button>
  );
}

import { Stop } from '@/types/driver';
import { StatusBadge } from './StatusBadge';
import { MapPin, SkipForward } from 'lucide-react';

interface StopsListProps {
  stops: Stop[];
  onSkipStop?: (stopId: string) => void;
}

export function StopsList({ stops, onSkipStop }: StopsListProps) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-secondary border-b border-border flex items-center justify-between">
        <h3 className="font-medium text-foreground text-sm">Route Stops</h3>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">{stops.length} stops</span>
          {stops.some((s) => s.status === 'skipped') && (
            <span className="text-amber-500 font-medium">
              ({stops.filter((s) => s.status === 'skipped').length} skipped)
            </span>
          )}
        </div>
      </div>

      {/* Stop Items */}
      <ul className="divide-y divide-border">
        {stops.map((stop, index) => (
          <li
            key={stop.id}
            className={`stop-list-item ${
              stop.status === 'skipped' ? 'bg-amber-500/5' : ''
            }`}
          >
            {/* Left side - Number and Name */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              {/* Stop Number */}
              <div
                className={`stop-number ${
                  stop.status === 'skipped' ? 'border-amber-500/40 text-amber-500' : ''
                }`}
              >
                {index + 1}
              </div>

              {/* Stop Name with Icon */}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                <MapPin
                  className={`w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0 ${
                    stop.status === 'skipped'
                      ? 'text-amber-500'
                      : 'text-muted-foreground'
                  }`}
                />
                <span
                  className={`font-medium text-sm truncate ${
                    stop.status === 'skipped'
                      ? 'text-muted-foreground line-through'
                      : 'text-foreground'
                  }`}
                >
                  {stop.name}
                </span>
              </div>
            </div>

            {/* Right side - Status Badge & Quick Skip */}
            <div className="ml-2 flex-shrink-0 flex items-center gap-1.5">
              {onSkipStop && stop.status === 'current' && (
                <button
                  type="button"
                  onClick={() => onSkipStop(stop.id)}
                  title="Skip this stop"
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 border border-amber-500/30 flex items-center gap-1 transition-colors"
                >
                  <SkipForward className="w-3 h-3 text-amber-500" />
                  <span>Skip</span>
                </button>
              )}
              <StatusBadge status={stop.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

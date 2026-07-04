import { Stop } from '@/types/driver';
import { StatusBadge } from './StatusBadge';
import { MapPin } from 'lucide-react';

interface StopsListProps {
  stops: Stop[];
}

export function StopsList({ stops }: StopsListProps) {
  return (
    <div className="bg-card rounded-lg border border-border overflow-hidden">
      {/* Header */}
      <div className="px-3 sm:px-4 py-2 sm:py-2.5 bg-secondary border-b border-border">
        <h3 className="font-medium text-foreground text-sm">Route Stops</h3>
      </div>

      {/* Stop Items */}
      <ul className="divide-y divide-border">
        {stops.map((stop, index) => (
          <li
            key={stop.id}
            className="stop-list-item"
          >
            {/* Left side - Number and Name */}
            <div className="flex items-center gap-2 sm:gap-2.5 min-w-0 flex-1">
              {/* Stop Number */}
              <div className="stop-number">
                {index + 1}
              </div>

              {/* Stop Name with Icon */}
              <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-muted-foreground flex-shrink-0" />
                <span className="font-medium text-foreground text-sm truncate">
                  {stop.name}
                </span>
              </div>
            </div>

            {/* Right side - Status Badge */}
            <div className="ml-2 flex-shrink-0">
              <StatusBadge status={stop.status} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

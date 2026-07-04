import { Bus, Route, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface RouteHeaderProps {
  driverName: string;
  busNumber: string;
  routeName: string;
  onLogout?: () => void;
}

export function RouteHeader({ driverName, busNumber, routeName, onLogout }: RouteHeaderProps) {
  return (
    <header className="bg-card border-b border-border sticky top-0 z-10 shadow-sm safe-area-inset-top">
      <div className="container py-2.5 sm:py-3">
        {/* Top Row - Driver Name and Sign Out */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <h1 className="text-base sm:text-lg font-bold text-foreground truncate">
            Welcome, {driverName}
          </h1>
          {onLogout && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onLogout}
              className="flex-shrink-0 h-8 px-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="ml-1.5 text-xs hidden sm:inline">Sign Out</span>
            </Button>
          )}
        </div>

        {/* Info Chips - Responsive */}
        <div className="flex flex-wrap gap-1.5 sm:gap-2">
          {/* Bus Number Chip */}
          <div className="info-chip bg-primary/10 text-primary border-primary/20 flex-shrink-0">
            <Bus className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span>{busNumber}</span>
          </div>

          {/* Route Name Chip - Can grow and truncate */}
          <div className="info-chip bg-accent/10 text-accent border-accent/20 min-w-0 flex-1 max-w-full">
            <Route className="w-3.5 h-3.5 sm:w-4 sm:h-4 flex-shrink-0" />
            <span className="truncate">{routeName}</span>
          </div>
        </div>
      </div>
    </header>
  );
}

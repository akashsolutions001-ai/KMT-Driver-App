import { useState, useMemo, useEffect, useCallback } from 'react';
import { RouteHeader } from '@/components/RouteHeader';
import { StopsList } from '@/components/StopsList';
import { RouteActionButton } from '@/components/RouteActionButton';
import { InlineMessage } from '@/components/InlineMessage';
import { BackgroundLocationPrompt } from '@/components/BackgroundLocationPrompt';
import { DriverInfo, Stop, RouteState } from '@/types/driver';
import { MapPin, Wifi, WifiOff } from 'lucide-react';

import { useLocationTracking } from '@/hooks/useLocationTracking';
import { toast } from 'sonner';
import {
  markStopReachedInRTDB,
  saveStopsProgressToFirebase,
  updateRouteState,
  writeBusLocationMeta,
} from '@/services/firebaseService';
import { finishTrip, getActiveTrip, markStopReached, startTrip, updateTripRouteState } from '@/services/tripService';
import { EmergencyActions } from '@/components/EmergencyActions';

interface MainRoutePageProps {
  driver: DriverInfo;
  onLogout?: () => void;
}

export function MainRoutePage({ driver, onLogout }: MainRoutePageProps) {
  const [stops, setStops] = useState<Stop[]>(driver.route.stops);
  const [routeState, setRouteState] = useState<RouteState>('not_started');
  const [message, setMessage] = useState<{ type: 'error' | 'warning' | 'info' | 'success'; text: string } | null>(null);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [showBackgroundLocationPrompt, setShowBackgroundLocationPrompt] = useState(false);

  // Get current stop name for notification display
  const currentStopIndex = useMemo(() => {
    return stops.findIndex((stop) => stop.status === 'current');
  }, [stops]);
  const currentStop = currentStopIndex >= 0 ? stops[currentStopIndex] : undefined;

  const nextStop = useMemo(() => {
    if (currentStopIndex < 0) return stops[0];
    return stops[currentStopIndex + 1];
  }, [stops, currentStopIndex]);

  const remainingStops = useMemo(() => {
    if (currentStopIndex < 0) return stops.length;
    return Math.max(0, stops.length - currentStopIndex - 1);
  }, [stops, currentStopIndex]);

  const etaMinutes = remainingStops * 5;

  // --- Auto-stop reached handler (called by useLocationTracking) ---
  const handleAutoStopReached = useCallback((stopId: string) => {
    setStops((prevStops) => {
      const currentIndex = prevStops.findIndex((s) => s.id === stopId);
      if (currentIndex === -1) return prevStops;

      // If stop is already reached, skip
      if (prevStops[currentIndex].status === 'reached') return prevStops;

      const isLast = currentIndex === prevStops.length - 1;
      const reachedStop = prevStops[currentIndex];

      const nextStops = prevStops.map((stop, index) => {
        if (index === currentIndex) return { ...stop, status: 'reached' as const };
        if (index === currentIndex + 1 && !isLast) return { ...stop, status: 'current' as const };
        return stop;
      });

      // --- Fire-and-forget Firebase writes (same as handleMarkReached) ---
      const busNumber = driver.route.busNumber;

      // Firestore trip update
      if (activeTripId) {
        markStopReached({
          busNumber,
          tripId: activeTripId,
          stop: { id: reachedStop.id, name: reachedStop.name, order: reachedStop.order },
        }).catch(console.error);

        const nextCurrent = nextStops.find((s) => s.status === 'current') ?? null;
        updateTripRouteState({
          busNumber,
          tripId: activeTripId,
          routeState: isLast ? 'completed' : 'in_progress',
          currentStop: nextCurrent
            ? { id: nextCurrent.id, name: nextCurrent.name, order: nextCurrent.order, status: nextCurrent.status }
            : null,
        }).catch(console.error);
      }

      // RTDB update
      const nextCurrent = nextStops.find((s) => s.status === 'current') ?? null;
      markStopReachedInRTDB(
        busNumber,
        reachedStop.id,
        Date.now(),
        nextCurrent
          ? { id: nextCurrent.id, name: nextCurrent.name, order: nextCurrent.order, status: nextCurrent.status }
          : null,
      ).catch(console.error);

      // Handle last stop (route completion)
      if (isLast) {
        setRouteState('completed');
        updateRouteState(driver.id, busNumber, 'completed').catch(console.error);

        if (activeTripId) {
          finishTrip({ busNumber, tripId: activeTripId }).catch(console.error);
        }

        toast.success('Trip Completed!', {
          description: 'All passengers safely dropped off. Great job! 🎉',
          duration: 5000,
          position: 'top-center',
        });

        setMessage({ type: 'success', text: '🎉 Trip Completed! Great job!' });
        setTimeout(() => setMessage(null), 10000);
      } else {
        toast.info(`Auto-detected: ${reachedStop.name} reached`, {
          duration: 3000,
          position: 'top-center',
        });
        setMessage({ type: 'info', text: `📍 Auto: ${reachedStop.name} reached.` });
        setTimeout(() => setMessage(null), 3000);
      }

      return nextStops;
    });
  }, [driver, activeTripId]);

  // Location tracking hook - automatically starts when route is in progress
  const { currentLocation, isTracking, error: locationError } = useLocationTracking({
    driver,
    routeState,
    isActive: true,
    updateInterval: 2000,
    currentStopName: currentStop?.name,
    stops,
    onAutoStopReached: handleAutoStopReached,
  });

  const isLastStop = currentStopIndex === stops.length - 1;

  // Restore active trip state on mount
  useEffect(() => {
    let isMounted = true;

    const restoreTripState = async () => {
      try {
        const activeTrip = await getActiveTrip(driver.route.busNumber);

        if (!isMounted || !activeTrip) {
          return;
        }

        const restoredStops = driver.route.stops.map((stop) => {
          const tripStop = activeTrip.stops[stop.id];
          if (tripStop) {
            return { ...stop, status: tripStop.status };
          }
          return stop;
        });

        if (activeTrip.currentStop) {
          const currentStopIndex = restoredStops.findIndex(
            (s) => s.id === activeTrip.currentStop!.id
          );
          if (currentStopIndex >= 0) {
            restoredStops[currentStopIndex].status = 'current';
            for (let i = 0; i < currentStopIndex; i++) {
              if (restoredStops[i].status !== 'reached') {
                restoredStops[i].status = 'reached';
              }
            }
            for (let i = currentStopIndex + 1; i < restoredStops.length; i++) {
              if (restoredStops[i].status !== 'reached') {
                restoredStops[i].status = 'pending';
              }
            }
          }
        }

        if (!isMounted) return;

        setStops(restoredStops);
        setRouteState(activeTrip.routeState);
        setActiveTripId(activeTrip.tripId);

        const busNumber = driver.route.busNumber;
        updateRouteState(driver.id, busNumber, activeTrip.routeState).catch(console.error);
        saveStopsProgressToFirebase(
          busNumber,
          restoredStops.map((s) => ({ id: s.id, name: s.name, order: s.order, status: s.status }))
        ).catch(console.error);
        writeBusLocationMeta(busNumber, driver.route.id, driver.route.name, driver.name, activeTrip.routeState).catch(console.error);

        setMessage({ type: 'info', text: 'Route state restored.' });
        setTimeout(() => setMessage(null), 3000);
      } catch (error) {
        console.error('Error restoring trip state:', error);
        if (isMounted) {
          setMessage({ type: 'warning', text: 'Could not restore previous state.' });
          setTimeout(() => setMessage(null), 3000);
        }
      }
    };

    restoreTripState();
    return () => { isMounted = false; };
  }, [driver]);

  // Auto-reset after completion
  useEffect(() => {
    if (routeState !== 'completed') return;

    const resetTimer = setTimeout(() => {
      const resetStops = driver.route.stops.map((stop) => ({
        ...stop,
        status: 'pending' as const,
      }));

      setStops(resetStops);
      setRouteState('not_started');
      setMessage(null);
      setActiveTripId(null);

      const busNum = driver.route.busNumber;
      saveStopsProgressToFirebase(
        busNum,
        resetStops.map((s) => ({ id: s.id, name: s.name, order: s.order, status: s.status })),
      ).catch(console.error);
      updateRouteState(driver.id, busNum, "not_started").catch(console.error);
    }, 8000);

    return () => clearTimeout(resetTimer);
  }, [routeState, driver.route.stops]);

  const handleStartRoute = async () => {
    if (routeState === "in_progress") return;

    // Request permissions and check if background location prompt is needed
    const { requestPermissionsDirect } = await import('@/utils/requestPermissionsDirect');
    const permResult = await requestPermissionsDirect();

    // Show popup if user only granted "while using" permission
    if (permResult.needsBackgroundPrompt) {
      setShowBackgroundLocationPrompt(true);
      // Continue with route start anyway - just show the prompt
    }

    const nextStops = stops.map((stop, index) =>
      index === 0 ? { ...stop, status: 'current' as const } : { ...stop, status: 'pending' as const },
    );
    const busNumber = driver.route.busNumber;
    const routeId = driver.route.id;
    const routeName = driver.route.name;

    setStops(nextStops);
    setRouteState('in_progress');
    setMessage({ type: 'info', text: 'Route started. GPS tracking active.' });

    // 1) Write location meta FIRST and wait - Cloud Function reads routeId from here when routeState triggers
    try {
      await writeBusLocationMeta(busNumber, routeId, routeName, driver.name, 'in_progress');
    } catch (e) {
      console.error('Failed to write bus location meta:', e);
    }

    // 2) Then write routeState - this triggers notifyStudentsRouteStarted; routeId must already exist
    try {
      await updateRouteState(driver.id, busNumber, 'in_progress');
    } catch (e) {
      console.error('Failed to update route state:', e);
    }

    // 3) Stops progress (can be parallel)
    console.log('🚏 Saving stops progress for bus:', busNumber, 'with', nextStops.length, 'stops');
    saveStopsProgressToFirebase(
      busNumber,
      nextStops.map((s) => ({ id: s.id, name: s.name, order: s.order, status: s.status })),
    )
      .then(() => console.log('✅ Stops saved successfully'))
      .catch((err) => {
        console.error('❌ Failed to save stops:', err);
      });

    startTrip({
      busNumber: driver.route.busNumber,
      routeId: driver.route.id,
      routeName: driver.route.name,
      driverId: driver.id,
      driverName: driver.name,
      stops: nextStops,
    })
      .then((tripId) => {
        setActiveTripId(tripId);
        const current = nextStops.find((s) => s.status === "current") ?? null;
        return updateTripRouteState({
          busNumber: driver.route.busNumber,
          tripId,
          routeState: "in_progress",
          currentStop: current
            ? { id: current.id, name: current.name, order: current.order, status: current.status }
            : null,
        });
      })
      .catch(console.error);

    setTimeout(() => setMessage(null), 3000);
  };

  const handleBackgroundPromptDismiss = () => {
    setShowBackgroundLocationPrompt(false);
  };

  const handleBackgroundPermissionGranted = () => {
    setShowBackgroundLocationPrompt(false);
    toast.success('Background location enabled!', {
      description: 'GPS tracking will now work when the app is minimized.',
      duration: 4000,
    });
  };

  const handleMarkReached = () => {
    const currentIndex = stops.findIndex((stop) => stop.status === 'current');
    if (currentIndex === -1) return;

    const isLastStop = currentIndex === stops.length - 1;
    const reachedStop = stops[currentIndex];

    const nextStops = stops.map((stop, index) => {
      if (index === currentIndex) {
        return { ...stop, status: 'reached' as const };
      }
      if (index === currentIndex + 1 && !isLastStop) {
        return { ...stop, status: 'current' as const };
      }
      return stop;
    });

    setStops(nextStops);

    if (activeTripId) {
      markStopReached({
        busNumber: driver.route.busNumber,
        tripId: activeTripId,
        stop: { id: reachedStop.id, name: reachedStop.name, order: reachedStop.order },
      }).catch(console.error);

      const current = nextStops.find((s) => s.status === "current") ?? null;
      updateTripRouteState({
        busNumber: driver.route.busNumber,
        tripId: activeTripId,
        routeState: isLastStop ? "completed" : "in_progress",
        currentStop: current
          ? { id: current.id, name: current.name, order: current.order, status: current.status }
          : null,
      }).catch(console.error);
    }

    const nextCurrent = nextStops.find((s) => s.status === "current") ?? null;
    markStopReachedInRTDB(
      driver.route.busNumber,
      reachedStop.id,
      Date.now(),
      nextCurrent
        ? { id: nextCurrent.id, name: nextCurrent.name, order: nextCurrent.order, status: nextCurrent.status }
        : null,
    ).catch(console.error);

    if (isLastStop) {
      setRouteState('completed');
      updateRouteState(driver.id, driver.route.busNumber, 'completed').catch(console.error);

      if (activeTripId) {
        finishTrip({ busNumber: driver.route.busNumber, tripId: activeTripId }).catch(console.error);
      }

      toast.success('Trip Completed!', {
        description: 'All passengers safely dropped off. Great job! 🎉',
        duration: 5000,
        position: 'top-center',
      });

      setMessage({ type: 'success', text: '🎉 Trip Completed! Great job!' });
      setTimeout(() => setMessage(null), 10000);
    } else {
      setMessage({ type: 'info', text: `${stops[currentIndex].name} reached.` });
      setTimeout(() => setMessage(null), 3000);
    }
  };

  return (
    <>
      {/* Background Location Permission Prompt Modal */}
      {showBackgroundLocationPrompt && (
        <BackgroundLocationPrompt
          onDismiss={handleBackgroundPromptDismiss}
          onPermissionGranted={handleBackgroundPermissionGranted}
        />
      )}

      <div className="min-h-screen-safe bg-background flex flex-col">
        {/* Header - Sticky */}
        <RouteHeader
          driverName={driver.name}
          busNumber={driver.route.busNumber}
          routeName={driver.route.name}
          onLogout={onLogout}
        />

        {/* Main Scrollable Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide">
          <div className="container py-2.5 sm:py-3 space-y-2.5 sm:space-y-3 pb-24 sm:pb-28">
            {/* Message Area */}
            {message && (
              <div className={message.type === 'success'
                ? 'bg-green-50 dark:bg-green-950 border-2 border-green-200 dark:border-green-800 rounded-lg p-2.5 sm:p-3'
                : 'rounded-lg p-2.5 sm:p-3'
              }>
                <InlineMessage type={message.type} message={message.text} />
              </div>
            )}

            {/* Location Tracking Status - Compact */}
            {routeState === 'in_progress' && (
              <div className="gps-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <MapPin className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
                    <span className="font-medium text-sm truncate">GPS Tracking</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 flex items-center gap-1 ${isTracking
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                    }`}>
                    {isTracking ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {isTracking ? 'Active' : 'Connecting'}
                  </span>
                </div>

                {currentLocation && (
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground pt-1">
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide opacity-70">Lat</span>
                      <span className="font-mono text-foreground">{currentLocation.latitude.toFixed(5)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] uppercase tracking-wide opacity-70">Lng</span>
                      <span className="font-mono text-foreground">{currentLocation.longitude.toFixed(5)}</span>
                    </div>
                    {currentLocation.accuracy && (
                      <div className="flex flex-col">
                        <span className="text-[10px] uppercase tracking-wide opacity-70">Accuracy</span>
                        <span className="text-foreground">±{Math.round(currentLocation.accuracy)}m</span>
                      </div>
                    )}
                  </div>
                )}

                {locationError && (
                  <div className="pt-1">
                    <InlineMessage type="error" message={`GPS: ${locationError}`} />
                  </div>
                )}
              </div>
            )}

            {/* Trip progress */}
            {routeState !== 'not_started' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-lg bg-card border p-2.5">
                  <p className="text-muted-foreground text-[10px] uppercase">Current Stop</p>
                  <p className="font-medium truncate">{currentStop?.name ?? '—'}</p>
                </div>
                <div className="rounded-lg bg-card border p-2.5">
                  <p className="text-muted-foreground text-[10px] uppercase">Next Stop</p>
                  <p className="font-medium truncate">{nextStop?.name ?? 'Destination'}</p>
                </div>
                <div className="rounded-lg bg-card border p-2.5">
                  <p className="text-muted-foreground text-[10px] uppercase">ETA</p>
                  <p className="font-medium">~{etaMinutes} min</p>
                </div>
                <div className="rounded-lg bg-card border p-2.5">
                  <p className="text-muted-foreground text-[10px] uppercase">Remaining</p>
                  <p className="font-medium">{remainingStops} stops</p>
                </div>
              </div>
            )}

            <EmergencyActions
              busNumber={driver.route.busNumber}
              driverId={driver.id}
              driverName={driver.name}
              routeId={driver.route.id}
            />

            {/* Stops List */}
            <StopsList stops={stops} />

            {/* Footer */}
            <footer className="pt-6 pb-2 text-center border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Designed & Developed by{' '}
                <span className="font-semibold text-foreground">Akash.Solution</span>
              </p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                (Akash Vijay Awachar)
              </p>
              <p className="text-[10px] text-muted-foreground/60 mt-1">
                © 2026 All Rights Reserved
              </p>
            </footer>
          </div>
        </main>

        {/* Action Button - Fixed at bottom */}
        <div className="fixed-bottom-bar">
          <RouteActionButton
            routeState={routeState}
            currentStopName={currentStop?.name}
            isLastStop={isLastStop}
            onStartRoute={handleStartRoute}
            onMarkReached={handleMarkReached}
          />
        </div>
      </div>
    </>
  );
}


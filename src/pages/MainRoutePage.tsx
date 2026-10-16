import { useState, useMemo, useEffect, useCallback } from 'react';
import { RouteHeader } from '@/components/RouteHeader';
import { StopsList } from '@/components/StopsList';
import { RouteActionButton } from '@/components/RouteActionButton';
import { InlineMessage } from '@/components/InlineMessage';
import { DriverInfo, Stop, RouteState } from '@/types/driver';
import { MapPin, Wifi, WifiOff, Play, CheckCircle, Flag, SkipForward, LogOut } from 'lucide-react';
import { ActionConfirmDialog } from '@/components/ActionConfirmDialog';

import { useLocationTracking } from '@/hooks/useLocationTracking';
import { toast } from 'sonner';
import {
  markStopReachedInRTDB,
  markStopSkippedInRTDB,
  saveStopsProgressToFirebase,
  updateRouteState,
  writeBusLocationMeta,
} from '@/services/firebaseService';
import { finishTrip, getActiveTrip, markStopReached, markStopSkipped, startTrip, updateTripRouteState } from '@/services/tripService';
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

  type ConfirmActionState =
    | { type: 'start_trip' }
    | { type: 'mark_reached'; stop: Stop; isLast: boolean; skippedCount: number }
    | { type: 'skip_stop'; stop: Stop; targetStopId?: string }
    | { type: 'logout' }
    | null;

  const [confirmAction, setConfirmAction] = useState<ConfirmActionState>(null);
  const [isActionExecuting, setIsActionExecuting] = useState(false);

  // Prefer status === 'current'; if missing (restore/desync), use first pending while in progress
  const currentStopIndex = useMemo(() => {
    const currentIdx = stops.findIndex((stop) => stop.status === 'current');
    if (currentIdx >= 0) return currentIdx;
    if (routeState === 'in_progress') {
      return stops.findIndex((stop) => stop.status === 'pending');
    }
    return -1;
  }, [stops, routeState]);
  const currentStop = currentStopIndex >= 0 ? stops[currentStopIndex] : undefined;

  const nextStop = useMemo(() => {
    if (currentStopIndex < 0) return undefined;
    return stops[currentStopIndex + 1];
  }, [stops, currentStopIndex]);

  const remainingStops = useMemo(() => {
    return stops.filter((s) => s.status === 'pending' || s.status === 'current').length;
  }, [stops]);

  const etaMinutes = remainingStops * 5;

  // --- Auto-stop reached handler (called by useLocationTracking) ---
  const handleAutoStopReached = useCallback((stopId: string, skippedStopIds: string[] = []) => {
    setStops((prevStops) => {
      const currentIndex = prevStops.findIndex((s) => s.id === stopId);
      if (currentIndex === -1) return prevStops;

      // If stop is already reached, skip
      if (prevStops[currentIndex].status === 'reached') return prevStops;

      const isLast = currentIndex === prevStops.length - 1;
      const reachedStop = prevStops[currentIndex];

      // Identify any stops prior to currentIndex that haven't been reached or skipped
      const skippedIdsSet = new Set(skippedStopIds);
      for (let i = 0; i < currentIndex; i++) {
        if (prevStops[i].status !== 'reached' && prevStops[i].status !== 'skipped') {
          skippedIdsSet.add(prevStops[i].id);
        }
      }

      const nextStops = prevStops.map((stop, index) => {
        if (index === currentIndex) return { ...stop, status: 'reached' as const };
        if (skippedIdsSet.has(stop.id)) return { ...stop, status: 'skipped' as const };
        if (index === currentIndex + 1 && !isLast) return { ...stop, status: 'current' as const };
        return stop;
      });

      const actualSkippedIds = Array.from(skippedIdsSet);
      const busNumber = driver.route.busNumber;

      // Firestore trip update
      if (activeTripId) {
        markStopReached({
          busNumber,
          tripId: activeTripId,
          stop: { id: reachedStop.id, name: reachedStop.name, order: reachedStop.order },
          skippedStopIds: actualSkippedIds,
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
        actualSkippedIds
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
        const skippedNames = prevStops
          .filter((s) => skippedIdsSet.has(s.id))
          .map((s) => s.name);

        if (skippedNames.length > 0) {
          toast.warning(`Skipped: ${skippedNames.join(', ')}`, {
            description: `Auto-detected arrival at ${reachedStop.name}`,
            duration: 4000,
            position: 'top-center',
          });
          setMessage({
            type: 'warning',
            text: `⏭️ Skipped ${skippedNames.join(', ')} | 📍 Arrived at ${reachedStop.name}`,
          });
        } else {
          toast.info(`Auto-detected: ${reachedStop.name} reached`, {
            duration: 3000,
            position: 'top-center',
          });
          setMessage({ type: 'info', text: `📍 Auto: ${reachedStop.name} reached.` });
        }
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

  // Heal desynced in-progress trips that have no stop marked as current
  useEffect(() => {
    if (routeState !== 'in_progress') return;
    if (stops.some((s) => s.status === 'current')) return;
    const firstPendingIdx = stops.findIndex((s) => s.status === 'pending');
    if (firstPendingIdx < 0) return;

    setStops((prev) => {
      if (prev.some((s) => s.status === 'current')) return prev;
      const idx = prev.findIndex((s) => s.status === 'pending');
      if (idx < 0) return prev;
      return prev.map((stop, i) =>
        i === idx ? { ...stop, status: 'current' as const } : stop,
      );
    });
  }, [routeState, stops]);

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
          const restoredCurrentIdx = restoredStops.findIndex(
            (s) => s.id === activeTrip.currentStop!.id
          );
          if (restoredCurrentIdx >= 0) {
            restoredStops[restoredCurrentIdx].status = 'current';
            for (let i = 0; i < restoredCurrentIdx; i++) {
              if (restoredStops[i].status !== 'reached' && restoredStops[i].status !== 'skipped') {
                restoredStops[i].status = 'reached';
              }
            }
            for (let i = restoredCurrentIdx + 1; i < restoredStops.length; i++) {
              if (restoredStops[i].status !== 'reached' && restoredStops[i].status !== 'skipped') {
                restoredStops[i].status = 'pending';
              }
            }
          }
        }

        // If trip is in progress but no stop is marked current, promote first pending
        if (
          activeTrip.routeState === 'in_progress' &&
          !restoredStops.some((s) => s.status === 'current')
        ) {
          const firstPendingIdx = restoredStops.findIndex((s) => s.status === 'pending');
          if (firstPendingIdx >= 0) {
            restoredStops[firstPendingIdx].status = 'current';
          }
        }

        if (!isMounted) return;

        setStops(restoredStops);
        setRouteState(activeTrip.routeState);
        setActiveTripId(activeTrip.tripId);

        const busNumber = driver.route.busNumber;
        const restoredCurrent = restoredStops.find((s) => s.status === 'current') ?? null;
        updateRouteState(driver.id, busNumber, activeTrip.routeState).catch(console.error);
        saveStopsProgressToFirebase(
          busNumber,
          restoredStops.map((s) => ({ id: s.id, name: s.name, order: s.order, status: s.status }))
        ).catch(console.error);
        writeBusLocationMeta(busNumber, driver.route.id, driver.route.name, driver.name, activeTrip.routeState).catch(console.error);

        if (restoredCurrent && activeTrip.routeState === 'in_progress') {
          updateTripRouteState({
            busNumber,
            tripId: activeTrip.tripId,
            routeState: 'in_progress',
            currentStop: {
              id: restoredCurrent.id,
              name: restoredCurrent.name,
              order: restoredCurrent.order,
              status: restoredCurrent.status,
            },
          }).catch(console.error);
        }

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

  const executeStartRoute = async () => {
    if (routeState === "in_progress") return;

    setIsActionExecuting(true);
    try {
      // Verify mandatory location permissions before allowing trip to start
      const { checkMandatoryLocationStatus } = await import('@/utils/permissions');
      const permStatus = await checkMandatoryLocationStatus();

      if (permStatus.isBlocked) {
        toast.error('Location Access Required', {
          description: permStatus.message || 'Continuous location permission is required to start a trip.',
        });
        setMessage({
          type: 'error',
          text: permStatus.message || 'Cannot start trip: location permission is missing or GPS is disabled.',
        });
        return;
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

      await startTrip({
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
    } finally {
      setIsActionExecuting(false);
    }
  };

  const executeMarkReached = async () => {
    let currentIndex = stops.findIndex((stop) => stop.status === 'current');
    // Fallback when no stop is marked current (e.g. after restore desync)
    if (currentIndex === -1) {
      currentIndex = stops.findIndex((stop) => stop.status === 'pending');
    }
    if (currentIndex === -1) {
      toast.error('No stop to mark as reached');
      return;
    }

    setIsActionExecuting(true);
    try {
      const markingLastStop = currentIndex === stops.length - 1;
      const reachedStop = stops[currentIndex];

      // Any previous unreached stops before currentIndex should be marked as skipped
      const skippedStopIds: string[] = [];
      for (let i = 0; i < currentIndex; i++) {
        if (stops[i].status !== 'reached' && stops[i].status !== 'skipped') {
          skippedStopIds.push(stops[i].id);
        }
      }

      const nextStops = stops.map((stop, index) => {
        if (index === currentIndex) {
          return { ...stop, status: 'reached' as const };
        }
        if (skippedStopIds.includes(stop.id)) {
          return { ...stop, status: 'skipped' as const };
        }
        if (index === currentIndex + 1 && !markingLastStop) {
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
          skippedStopIds,
        }).catch(console.error);

        const current = nextStops.find((s) => s.status === "current") ?? null;
        updateTripRouteState({
          busNumber: driver.route.busNumber,
          tripId: activeTripId,
          routeState: markingLastStop ? "completed" : "in_progress",
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
        skippedStopIds
      ).catch(console.error);

      if (markingLastStop) {
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
        if (skippedStopIds.length > 0) {
          const skippedNames = stops.filter((s) => skippedStopIds.includes(s.id)).map((s) => s.name);
          toast.warning(`Skipped: ${skippedNames.join(', ')}`, {
            description: `Reached ${reachedStop.name}`,
            duration: 3000,
            position: 'top-center',
          });
          setMessage({ type: 'warning', text: `⏭️ Skipped ${skippedNames.join(', ')} | 📍 ${reachedStop.name} reached.` });
        } else {
          setMessage({ type: 'info', text: `${reachedStop.name} reached.` });
        }
        setTimeout(() => setMessage(null), 3000);
      }
    } finally {
      setIsActionExecuting(false);
    }
  };

  const executeSkipStop = async (targetStopId?: string) => {
    let targetIndex = -1;
    if (targetStopId) {
      targetIndex = stops.findIndex((s) => s.id === targetStopId);
    } else {
      targetIndex = stops.findIndex((s) => s.status === 'current');
      if (targetIndex === -1) {
        targetIndex = stops.findIndex((s) => s.status === 'pending');
      }
    }

    if (targetIndex === -1) {
      toast.error('No stop to skip');
      return;
    }

    setIsActionExecuting(true);
    try {
      const isLast = targetIndex === stops.length - 1;
      const skippedStop = stops[targetIndex];

      const nextStops = stops.map((stop, index) => {
        if (index === targetIndex) {
          return { ...stop, status: 'skipped' as const };
        }
        if (index === targetIndex + 1 && !isLast && stop.status === 'pending') {
          return { ...stop, status: 'current' as const };
        }
        return stop;
      });

      if (!isLast && !nextStops.some((s) => s.status === 'current')) {
        const firstPending = nextStops.findIndex((s) => s.status === 'pending');
        if (firstPending >= 0) {
          nextStops[firstPending].status = 'current';
        }
      }

      setStops(nextStops);

      const busNumber = driver.route.busNumber;
      const nextCurrent = nextStops.find((s) => s.status === 'current') ?? null;

      if (activeTripId) {
        markStopSkipped({
          busNumber,
          tripId: activeTripId,
          stopId: skippedStop.id,
        }).catch(console.error);

        updateTripRouteState({
          busNumber,
          tripId: activeTripId,
          routeState: isLast ? 'completed' : 'in_progress',
          currentStop: nextCurrent
            ? { id: nextCurrent.id, name: nextCurrent.name, order: nextCurrent.order, status: nextCurrent.status }
            : null,
        }).catch(console.error);
      }

      markStopSkippedInRTDB(
        busNumber,
        skippedStop.id,
        nextCurrent
          ? { id: nextCurrent.id, name: nextCurrent.name, order: nextCurrent.order, status: nextCurrent.status }
          : null
      ).catch(console.error);

      if (isLast) {
        setRouteState('completed');
        updateRouteState(driver.id, busNumber, 'completed').catch(console.error);
        if (activeTripId) {
          finishTrip({ busNumber, tripId: activeTripId }).catch(console.error);
        }
        toast.success('Trip Completed!', {
          description: 'All stops completed or skipped. Great job! 🎉',
          duration: 5000,
          position: 'top-center',
        });
        setMessage({ type: 'success', text: '🎉 Trip Completed! Great job!' });
        setTimeout(() => setMessage(null), 10000);
      } else {
        toast.warning(`Stop Skipped: ${skippedStop.name}`, {
          description: nextCurrent ? `Next stop: ${nextCurrent.name}` : undefined,
          duration: 3000,
          position: 'top-center',
        });
        setMessage({ type: 'warning', text: `⏭️ ${skippedStop.name} skipped.` });
        setTimeout(() => setMessage(null), 3000);
      }
    } finally {
      setIsActionExecuting(false);
    }
  };

  // Confirmation prompts
  const promptStartRoute = () => {
    if (routeState === 'in_progress') return;
    setConfirmAction({ type: 'start_trip' });
  };

  const promptMarkReached = () => {
    let currentIndex = stops.findIndex((stop) => stop.status === 'current');
    if (currentIndex === -1) {
      currentIndex = stops.findIndex((stop) => stop.status === 'pending');
    }
    if (currentIndex === -1) {
      toast.error('No stop to mark as reached');
      return;
    }

    const reachedStop = stops[currentIndex];
    const isLast = currentIndex === stops.length - 1;

    let skippedCount = 0;
    for (let i = 0; i < currentIndex; i++) {
      if (stops[i].status !== 'reached' && stops[i].status !== 'skipped') {
        skippedCount++;
      }
    }

    setConfirmAction({
      type: 'mark_reached',
      stop: reachedStop,
      isLast,
      skippedCount,
    });
  };

  const promptSkipStop = (targetStopId?: string) => {
    let targetIndex = -1;
    if (targetStopId) {
      targetIndex = stops.findIndex((s) => s.id === targetStopId);
    } else {
      targetIndex = stops.findIndex((s) => s.status === 'current');
      if (targetIndex === -1) {
        targetIndex = stops.findIndex((s) => s.status === 'pending');
      }
    }

    if (targetIndex === -1) {
      toast.error('No stop to skip');
      return;
    }

    const targetStop = stops[targetIndex];
    setConfirmAction({
      type: 'skip_stop',
      stop: targetStop,
      targetStopId,
    });
  };

  const promptLogout = () => {
    if (!onLogout) return;
    setConfirmAction({ type: 'logout' });
  };

  const getActionConfirmConfig = () => {
    if (!confirmAction) return null;

    switch (confirmAction.type) {
      case 'start_trip':
        return {
          title: 'Start Trip?',
          description:
            'Are you ready to start this route? Continuous GPS tracking and passenger live ETA updates will begin.',
          highlightText: `🚌 Route: ${driver.route.name} • Bus: ${driver.route.busNumber}`,
          confirmText: 'Yes, Start Trip',
          variant: 'primary' as const,
          icon: <Play className="w-6 h-6 text-primary fill-primary/20" />,
          onConfirm: executeStartRoute,
        };

      case 'mark_reached':
        if (confirmAction.isLast) {
          return {
            title: 'Complete Entire Trip?',
            description: `Are you sure you want to finish the trip at "${confirmAction.stop.name}"? This will complete the route and end tracking.`,
            highlightText: `🏁 Final Stop: ${confirmAction.stop.name}`,
            confirmText: 'Yes, Complete Trip',
            variant: 'success' as const,
            icon: <Flag className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
            onConfirm: executeMarkReached,
          };
        }
        return {
          title: 'Mark Stop Reached?',
          description: `Confirm arrival at "${confirmAction.stop.name}"? Passengers will be alerted of arrival.`,
          highlightText: `📍 Stop: ${confirmAction.stop.name}`,
          highlightNote:
            confirmAction.skippedCount > 0
              ? `⚠️ Note: ${confirmAction.skippedCount} prior unreached stop(s) will automatically be marked as skipped.`
              : undefined,
          confirmText: 'Yes, Mark Reached',
          variant: 'success' as const,
          icon: <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />,
          onConfirm: executeMarkReached,
        };

      case 'skip_stop':
        return {
          title: 'Skip Stop?',
          description: `Are you sure you want to skip "${confirmAction.stop.name}"? The bus will proceed directly to the next scheduled stop.`,
          highlightText: `⏭️ Skipping: ${confirmAction.stop.name}`,
          confirmText: 'Yes, Skip Stop',
          variant: 'warning' as const,
          icon: <SkipForward className="w-6 h-6 text-amber-600 dark:text-amber-400" />,
          onConfirm: () => executeSkipStop(confirmAction.targetStopId),
        };

      case 'logout':
        return {
          title: 'Sign Out?',
          description:
            routeState === 'in_progress'
              ? 'A trip is currently in progress! Signing out will disconnect live tracking on this device.'
              : 'Are you sure you want to sign out of the Driver App?',
          highlightText: `👤 Driver: ${driver.name} • Bus: ${driver.route.busNumber}`,
          highlightNote:
            routeState === 'in_progress'
              ? '⚠️ Warning: Trip is active. Tracking will stop if you sign out.'
              : undefined,
          confirmText: 'Yes, Sign Out',
          variant: 'destructive' as const,
          icon: <LogOut className="w-6 h-6 text-red-600 dark:text-red-400" />,
          onConfirm: () => {
            onLogout?.();
          },
        };
    }
  };

  const actionConfirmConfig = getActionConfirmConfig();

  return (
    <>

      <div className="min-h-screen-safe bg-background flex flex-col">
        {/* Header - Sticky */}
        <RouteHeader
          driverName={driver.name}
          busNumber={driver.route.busNumber}
          routeName={driver.route.name}
          onLogout={onLogout ? promptLogout : undefined}
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
            <StopsList stops={stops} onSkipStop={promptSkipStop} />

            {/* Footer */}
            <footer className="pt-6 pb-2 text-center border-t border-border/50">
              <p className="text-xs text-muted-foreground">
                Designed & Developed by{' '}
                <span className="font-semibold text-foreground">Akash.Solution</span>
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
            onStartRoute={promptStartRoute}
            onMarkReached={promptMarkReached}
            onSkipStop={promptSkipStop}
          />
        </div>
      </div>

      {/* Confirmation Dialog */}
      {actionConfirmConfig && (
        <ActionConfirmDialog
          open={confirmAction !== null}
          onOpenChange={(open) => !open && setConfirmAction(null)}
          title={actionConfirmConfig.title}
          description={actionConfirmConfig.description}
          highlightText={actionConfirmConfig.highlightText}
          highlightNote={actionConfirmConfig.highlightNote}
          confirmText={actionConfirmConfig.confirmText}
          cancelText="Cancel"
          variant={actionConfirmConfig.variant}
          icon={actionConfirmConfig.icon}
          isLoading={isActionExecuting}
          onConfirm={actionConfirmConfig.onConfirm}
        />
      )}
    </>
  );
}


import { useEffect, useRef, useState, useCallback } from 'react';
import { watchLocation, clearWatch, LocationData, LocationError } from '@/services/locationService';
import { saveLocationToFirebase } from '@/services/firebaseService';
import { DriverInfo } from '@/types/driver';
import { RouteState, Stop } from '@/types/driver';
import { WakeLockManager, AppStateMonitor } from '@/utils/backgroundTracking';
import { startForegroundService, stopForegroundService, StartForegroundServiceOptions } from '@/utils/foregroundService';
import { checkPermissions } from '@/utils/permissions';
import { Capacitor } from '@capacitor/core';
import { haversineDistance } from '@/utils/haversine';

/** Radius in meters — auto-mark a stop when the bus is within this distance */
const AUTO_MARK_RADIUS_METERS = 100;

interface UseLocationTrackingOptions {
  driver: DriverInfo;
  routeState: RouteState;
  isActive: boolean;
  updateInterval?: number;
  currentStopName?: string;
  /** Live stops array — needed for auto-stop detection */
  stops?: Stop[];
  /** Callback fired when auto-stop detection triggers; receives the stopId */
  onAutoStopReached?: (stopId: string) => void;
}

export const useLocationTracking = ({
  driver,
  routeState,
  isActive,
  updateInterval = 2000,
  currentStopName = '',
  stops,
  onAutoStopReached,
}: UseLocationTrackingOptions) => {
  const [currentLocation, setCurrentLocation] = useState<LocationData | null>(null);
  const [isTracking, setIsTracking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const watchIdRef = useRef<string | number | null>(null);
  const intervalIdRef = useRef<number | null>(null);
  const lastLocationRef = useRef<LocationData | null>(null);
  const driverRef = useRef(driver);
  const routeStateRef = useRef(routeState);
  const updateIntervalRef = useRef(updateInterval);
  const currentStopNameRef = useRef(currentStopName);
  const consecutiveErrorsRef = useRef<number>(0);
  const lastErrorRef = useRef<string | null>(null);
  const wakeLockManagerRef = useRef<WakeLockManager>(new WakeLockManager());
  const appStateMonitorRef = useRef<AppStateMonitor>(new AppStateMonitor());
  const isNativeRef = useRef(Capacitor.isNativePlatform());

  // --- Auto-stop marking refs ---
  /** Set of stopIds that have already been auto-marked (prevents duplicates) */
  const autoMarkedStopsRef = useRef<Set<string>>(new Set());
  const stopsRef = useRef(stops);
  const onAutoStopReachedRef = useRef(onAutoStopReached);

  // Track if tracking operation is in progress to prevent race conditions
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const isTrackingRef = useRef(false);

  // Keep refs updated
  useEffect(() => {
    driverRef.current = driver;
    routeStateRef.current = routeState;
    updateIntervalRef.current = updateInterval;
    currentStopNameRef.current = currentStopName;
    stopsRef.current = stops;
    onAutoStopReachedRef.current = onAutoStopReached;
  }, [driver, routeState, updateInterval, currentStopName, stops, onAutoStopReached]);

  /**
   * Check if the bus is within AUTO_MARK_RADIUS_METERS of the next pending stop.
   * If so, call onAutoStopReached and record the stopId to prevent duplicates.
   */
  const checkAutoStopMarking = useCallback((location: LocationData) => {
    const currentStops = stopsRef.current;
    const callback = onAutoStopReachedRef.current;
    const currentRouteState = routeStateRef.current;

    // Only auto-mark when route is in_progress and we have stops + callback
    if (currentRouteState !== 'in_progress' || !currentStops || !callback) return;

    // Find the next stop that is "current" or first "pending" (i.e. not yet reached)
    const nextStop = currentStops.find(
      (s) => s.status === 'current' || s.status === 'pending'
    );
    if (!nextStop) return;

    // Need coordinates to calculate distance
    if (nextStop.latitude == null || nextStop.longitude == null) return;

    // Already auto-marked this stop?
    if (autoMarkedStopsRef.current.has(nextStop.id)) return;

    const distance = haversineDistance(
      location.latitude,
      location.longitude,
      nextStop.latitude,
      nextStop.longitude
    );

    console.log(
      `[AutoStop] Distance to "${nextStop.name}" (${nextStop.id}): ${distance.toFixed(1)}m (threshold: ${AUTO_MARK_RADIUS_METERS}m)`
    );

    if (distance <= AUTO_MARK_RADIUS_METERS) {
      console.log(`[AutoStop] ✅ Auto-marking stop "${nextStop.name}" as reached`);
      autoMarkedStopsRef.current.add(nextStop.id);
      callback(nextStop.id);
    }
  }, []);

  // Stop location tracking
  const stopTracking = useCallback(async () => {
    // Prevent multiple concurrent stop calls
    if (isStoppingRef.current || !isTrackingRef.current) {
      return;
    }

    isStoppingRef.current = true;
    console.log('[LocationTracking] Stopping tracking...');

    if (watchIdRef.current !== null) {
      clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (intervalIdRef.current !== null) {
      window.clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }

    // Stop foreground service (Android)
    try {
      await stopForegroundService();
    } catch (err) {
      console.error('[LocationTracking] Error stopping foreground service:', err);
    }

    // Release wake lock
    await wakeLockManagerRef.current.release();

    isTrackingRef.current = false;
    setIsTracking(false);
    setError(null);
    isStoppingRef.current = false;
    console.log('[LocationTracking] Tracking stopped');
  }, []);

  // Start location tracking
  const startTracking = useCallback(async () => {
    // Prevent multiple concurrent start calls or starting while already tracking
    if (isStartingRef.current || isTrackingRef.current) {
      console.log('[LocationTracking] Already tracking or starting, skipping');
      return;
    }

    isStartingRef.current = true;
    console.log('[LocationTracking] Starting tracking...');

    // Set tracking state immediately
    isTrackingRef.current = true;
    setIsTracking(true);
    setError(null);

    // Verify permissions before starting
    try {
      const permStatus = await checkPermissions();
      console.log('[LocationTracking] Permission status:', permStatus);

      if (permStatus.foregroundLocation !== 'granted') {
        setError('Location permission not granted. Please grant all permissions.');
        isTrackingRef.current = false;
        setIsTracking(false);
        isStartingRef.current = false;
        return;
      }
    } catch (err) {
      console.error('[LocationTracking] Error checking permissions:', err);
    }

    const currentDriver = driverRef.current;
    const currentRouteState = routeStateRef.current;
    const stopName = currentStopNameRef.current;

    const serviceOptions: StartForegroundServiceOptions = {
      driverId: currentDriver.id,
      driverName: currentDriver.name,
      busNumber: currentDriver.route.busNumber,
      routeId: currentDriver.route.id,
      routeName: currentDriver.route.name,
      routeState: currentRouteState,
      currentStopName: stopName,
    };

    try {
      // Start foreground service (Android) - this starts NATIVE GPS tracking
      console.log('[LocationTracking] Starting foreground service with options:', serviceOptions);
      await startForegroundService(serviceOptions);
      console.log('[LocationTracking] Foreground service started successfully');

      // Acquire wake lock
      await wakeLockManagerRef.current.acquire();

      // Watch location for UI updates (on both native and web)
      try {
        const watchId = await watchLocation(
          (location) => {
            console.log('[LocationTracking] Location received:', location.latitude.toFixed(5), location.longitude.toFixed(5));
            setCurrentLocation(location);
            lastLocationRef.current = location;
            checkAutoStopMarking(location);
          },
          (locationError: LocationError) => {
            console.error('[LocationTracking] Location watch error:', locationError);
            if (!isNativeRef.current) {
              // On web, surface the error to UI
              setError(locationError.message);
              lastErrorRef.current = locationError.message;
            }
            // On native, the foreground service continues independently
          }
        );
        watchIdRef.current = watchId;
        console.log('[LocationTracking] Location watch started, watchId:', watchId);
      } catch (err) {
        console.warn('[LocationTracking] JS watch failed:', err);
        if (!isNativeRef.current) {
          throw err; // On web, this is critical — re-throw to stop tracking
        }
        // On native, the foreground service still runs GPS independently
      }

      // Push location to RTDB from JavaScript on BOTH web and native
      // On native this acts as a reliable fallback in case the Java service
      // fails to write (e.g. Firebase init error, missing busNumber, etc.)
      console.log('[LocationTracking] Starting RTDB push interval (every', updateIntervalRef.current, 'ms)');
      intervalIdRef.current = window.setInterval(() => {
        const location = lastLocationRef.current;
        if (!location) {
          return;
        }

        const driver = driverRef.current;
        const routeState = routeStateRef.current;

        saveLocationToFirebase(
          driver.id,
          driver.name,
          driver.route.busNumber,
          driver.route.id,
          driver.route.name,
          routeState,
          location
        )
          .then(() => {
            consecutiveErrorsRef.current = 0;
            if (lastErrorRef.current?.includes('save location')) {
              setError(null);
              lastErrorRef.current = null;
            }
          })
          .catch((err) => {
            console.error('[LocationTracking] Failed to save location to RTDB:', err);
            consecutiveErrorsRef.current += 1;

            if (consecutiveErrorsRef.current >= 3) {
              const errorMsg = 'Failed to save location to server. Check your connection.';
              setError(errorMsg);
              lastErrorRef.current = errorMsg;
            }
          });
      }, updateIntervalRef.current);

      console.log('[LocationTracking] Tracking started successfully (platform:', isNativeRef.current ? 'native' : 'web', ')');
    } catch (err) {
      console.error('[LocationTracking] Failed to start tracking:', err);
      isTrackingRef.current = false;
      setIsTracking(false);
      setError('Failed to start GPS tracking. Please check permissions.');
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  // Effect to manage tracking based on isActive and routeState
  useEffect(() => {
    const shouldTrack = isActive && routeState === 'in_progress';

    if (shouldTrack && !isTrackingRef.current) {
      startTracking();
    } else if (!shouldTrack && isTrackingRef.current) {
      stopTracking();
    }
  }, [isActive, routeState]); // Removed startTracking/stopTracking from deps to prevent loops

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isTrackingRef.current) {
        stopTracking();
      }
    };
  }, [stopTracking]);

  return {
    currentLocation,
    isTracking,
    error,
    startTracking,
    stopTracking
  };
};

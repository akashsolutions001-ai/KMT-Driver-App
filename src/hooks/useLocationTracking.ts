import { useEffect, useRef, useState, useCallback } from 'react';
import { watchLocation, clearWatch, LocationData, LocationError } from '@/services/locationService';
import { saveLocationToFirebase } from '@/services/firebaseService';
import { DriverInfo } from '@/types/driver';
import { RouteState, Stop } from '@/types/driver';
import { WakeLockManager, AppStateMonitor } from '@/utils/backgroundTracking';
import {
  startForegroundService,
  stopForegroundService,
  updateForegroundServiceRouteInfo,
  updateForegroundServiceAuthToken,
  StartForegroundServiceOptions
} from '@/utils/foregroundService';
import { checkMandatoryLocationStatus } from '@/utils/permissions';
import { Capacitor } from '@capacitor/core';
import { haversineDistance } from '@/utils/haversine';
import { auth } from '@/lib/firebase';

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
  /** Callback fired when auto-stop detection triggers; receives reached stopId and any skipped stopIds */
  onAutoStopReached?: (stopId: string, skippedStopIds?: string[]) => void;
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

  // Sync route / stop changes to native foreground service
  useEffect(() => {
    if (isTracking && isNativeRef.current) {
      updateForegroundServiceRouteInfo({
        driverId: driver.id,
        driverName: driver.name,
        busNumber: driver.route.busNumber,
        routeId: driver.route.id,
        routeName: driver.route.name,
        routeState: routeState,
        currentStopName: currentStopName,
      });
    }
  }, [currentStopName, isTracking, routeState, driver]);

  // Keep native foreground service auth token in sync with Firebase Web Auth
  useEffect(() => {
    const unsubscribe = auth.onIdTokenChanged(async (user) => {
      if (user && isTrackingRef.current && isNativeRef.current) {
        try {
          const token = await user.getIdToken();
          await updateForegroundServiceAuthToken(token, user.refreshToken);
        } catch (err) {
          console.warn('[LocationTracking] Failed to sync updated auth token:', err);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  /**
   * Check if the bus is within AUTO_MARK_RADIUS_METERS of any upcoming stop.
   * If the driver did not go to a prior stop and reaches a subsequent stop,
   * all bypassed unreached stops are identified as skipped!
   */
  const checkAutoStopMarking = useCallback((location: LocationData) => {
    const currentStops = stopsRef.current;
    const callback = onAutoStopReachedRef.current;
    const currentRouteState = routeStateRef.current;

    // Only auto-mark when route is in_progress and we have stops + callback
    if (currentRouteState !== 'in_progress' || !currentStops || !callback) return;

    // Find all unreached stops (not reached, not already skipped)
    const unreachedStops = currentStops.filter(
      (s) => s.status !== 'reached' && s.status !== 'skipped'
    );
    if (unreachedStops.length === 0) return;

    for (const targetStop of unreachedStops) {
      if (targetStop.latitude == null || targetStop.longitude == null) continue;
      if (autoMarkedStopsRef.current.has(targetStop.id)) continue;

      const distance = haversineDistance(
        location.latitude,
        location.longitude,
        targetStop.latitude,
        targetStop.longitude
      );

      console.log(
        `[AutoStop] Distance to "${targetStop.name}" (${targetStop.id}): ${distance.toFixed(1)}m (threshold: ${AUTO_MARK_RADIUS_METERS}m)`
      );

      if (distance <= AUTO_MARK_RADIUS_METERS) {
        const matchedIndex = currentStops.findIndex((s) => s.id === targetStop.id);
        
        // Any unreached stops before this matched stop were skipped by the driver!
        const skippedStopIds: string[] = [];
        for (let j = 0; j < matchedIndex; j++) {
          const priorStop = currentStops[j];
          if (priorStop.status !== 'reached' && priorStop.status !== 'skipped') {
            skippedStopIds.push(priorStop.id);
          }
        }

        console.log(
          `[AutoStop] ✅ Detected stop "${targetStop.name}" reached. Bypassed stops marked skipped:`,
          skippedStopIds
        );

        autoMarkedStopsRef.current.add(targetStop.id);
        for (const sId of skippedStopIds) {
          autoMarkedStopsRef.current.add(sId);
        }

        callback(targetStop.id, skippedStopIds);
        break; // Only handle one stop arrival per location update
      }
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

    // Verify mandatory location status before starting
    try {
      const permStatus = await checkMandatoryLocationStatus();
      console.log('[LocationTracking] Mandatory location status:', permStatus);

      if (permStatus.isBlocked) {
        setError(permStatus.message || 'Mandatory location permission not granted.');
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

    // Fetch Firebase Auth ID token and refresh token so native service can authenticate directly
    let authToken: string | undefined;
    let refreshToken: string | undefined;
    try {
      authToken = (await auth.currentUser?.getIdToken()) || undefined;
      refreshToken = auth.currentUser?.refreshToken || undefined;
    } catch (tokenErr) {
      console.warn('[LocationTracking] Could not retrieve auth tokens for native service:', tokenErr);
    }

    const serviceOptions: StartForegroundServiceOptions = {
      driverId: currentDriver.id,
      driverName: currentDriver.name,
      busNumber: currentDriver.route.busNumber,
      routeId: currentDriver.route.id,
      routeName: currentDriver.route.name,
      routeState: currentRouteState,
      currentStopName: stopName,
      authToken,
      refreshToken,
      databaseUrl: "https://kmt-tracker-62159-default-rtdb.firebaseio.com",
      apiKey: "AIzaSyBncLpnXmd5KIvE8Sq4iKi1ug4bl4hxhqk",
      projectId: "kmt-tracker-62159",
    };

    try {
      // Start foreground service (Android) - this starts NATIVE continuous GPS tracking
      console.log('[LocationTracking] Starting foreground service with options:', {
        busNumber: serviceOptions.busNumber,
        routeId: serviceOptions.routeId,
        hasAuthToken: !!serviceOptions.authToken,
      });
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
            const errMsg = locationError.message || '';
            setError(errMsg);
            lastErrorRef.current = errMsg;
            if (errMsg.includes('denied') || errMsg.includes('permission') || errMsg.includes('unavailable')) {
              checkMandatoryLocationStatus().then((check) => {
                if (check.isBlocked) {
                  console.warn('[LocationTracking] Mandatory location missing during tracking, stopping gracefully.');
                  stopTracking();
                }
              });
            }
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
      // When app is in foreground, this provides instant real-time sync.
      // When minimized or closed, the native Android service takes over 100%.
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
  }, [isActive, routeState]); // startTracking and stopTracking are stable callbacks

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // On web/PWA, stop tracking when component unmounts.
      // On native Android, DO NOT stop the foreground service on unmount if route is in progress!
      // The Android foreground service is designed to keep running when the app is minimized or closed.
      if (!isNativeRef.current && isTrackingRef.current) {
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

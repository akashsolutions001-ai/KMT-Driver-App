import { ref, set, update, serverTimestamp } from "firebase/database";
import { database } from "@/lib/firebase";
import { LocationData } from "./locationService";
import type { StopStatus } from "@/types/driver";

export interface BusLocationData extends LocationData {
  driverId: string;
  driverName: string;
  busNumber: string;
  routeId: string;
  routeName: string;
  routeState: 'not_started' | 'in_progress' | 'completed';
}

export interface StopProgress {
  id: string;
  name: string;
  order: number;
  status: StopStatus;
  reachedAt?: number;
}

/**
 * Remove undefined values from an object
 * Firebase Realtime Database doesn't allow undefined values
 */
const removeUndefined = (obj: any): any => {
  if (obj === null || obj === undefined) {
    return null;
  }

  if (Array.isArray(obj)) {
    return obj.map(removeUndefined);
  }

  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key) && obj[key] !== undefined) {
        cleaned[key] = removeUndefined(obj[key]);
      }
    }
    return cleaned;
  }

  return obj;
};

/**
 * Realtime Database keys cannot contain: . # $ [ ] /
 * This makes a "safe" key from a stop name for easy lookups.
 */
const toSafeKey = (value: string): string => {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[.#$\[\]\/]/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 120);
};

/**
 * Write bus location meta (routeId, routeName, driverName, routeState) so Cloud Functions
 * can read routeId before/when routeState triggers. Call this when route starts so routeId
 * exists before routeState is written.
 */
export const writeBusLocationMeta = async (
  busNumber: string,
  routeId: string,
  routeName: string,
  driverName: string,
  routeState: 'not_started' | 'in_progress' | 'completed'
): Promise<void> => {
  const path = `buses/${busNumber}/location`;
  console.log(`[writeBusLocationMeta] 📡 Writing meta to RTDB path: "${path}", routeState=${routeState}`);
  try {
    const locationRef = ref(database, path);
    await set(locationRef, {
      routeId,
      routeName,
      driverName,
      routeState,
      updatedAt: serverTimestamp()
    });
    console.log(`[writeBusLocationMeta] ✅ Meta written successfully for bus: ${busNumber}`);
  } catch (error: any) {
    console.error(`[writeBusLocationMeta] ❌ FAILED:`, error?.message || error);
    throw error;
  }
};

/**
 * Save location to Firebase Realtime Database
 */
export const saveLocationToFirebase = async (
  driverId: string,
  driverName: string,
  busNumber: string,
  routeId: string,
  routeName: string,
  routeState: 'not_started' | 'in_progress' | 'completed',
  location: LocationData
): Promise<void> => {
  // --- Input validation ---
  if (!busNumber) {
    console.error('[saveLocation] ❌ busNumber is empty/undefined, cannot write to RTDB');
    return;
  }
  if (!location || location.latitude == null || location.longitude == null) {
    console.error('[saveLocation] ❌ Invalid location data:', location);
    return;
  }
  if (!database) {
    console.error('[saveLocation] ❌ Firebase database is null/undefined. Check firebase.ts initialization.');
    return;
  }

  const path = `buses/${busNumber}/location`;
  console.log(`[saveLocation] 📡 Writing to RTDB path: "${path}" | lat=${location.latitude.toFixed(5)}, lng=${location.longitude.toFixed(5)}, routeState=${routeState}`);

  try {
    // Build location data object, only including defined values
    const locationData: any = {
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: location.timestamp,
      driverId,
      driverName,
      busNumber,
      routeId,
      routeName,
      routeState
    };

    // Only add optional fields if they are defined
    if (location.accuracy !== undefined && location.accuracy !== null) {
      locationData.accuracy = location.accuracy;
    }
    if (location.speed !== undefined && location.speed !== null) {
      locationData.speed = location.speed;
    }
    if (location.heading !== undefined && location.heading !== null) {
      locationData.heading = location.heading;
    }

    // Remove any undefined values (safety check)
    const cleanedLocationData = removeUndefined(locationData);

    // Save to Firebase Realtime Database
    // Structure: /buses/{busNumber}/location
    const locationRef = ref(database, path);
    await set(locationRef, {
      ...cleanedLocationData,
      updatedAt: serverTimestamp()
    });

    console.log(`[saveLocation] ✅ Location saved to RTDB for bus: ${busNumber}`);
  } catch (error: any) {
    console.error(`[saveLocation] ❌ RTDB write FAILED for path "${path}":`, error?.message || error);
    console.error('[saveLocation] Full error:', error);
    throw error;
  }
};

/**
 * Save stop progress to Firebase Realtime Database (single bus tree).
 *
 * Writes:
 * - /buses/{busNumber}/stops/{stopId} -> { name, order, status, reachedAt? }
 * - /buses/{busNumber}/stopsByName/{safeStopName} -> { stopId, name, order, status, reachedAt? }
 * - /buses/{busNumber}/currentStop -> { stopId, name, order, status, updatedAt }
 */
export const saveStopsProgressToFirebase = async (
  busNumber: string,
  stops: StopProgress[],
): Promise<void> => {
  try {
    const busRoot = `buses/${busNumber}`;
    const updates: Record<string, any> = {};

    const current =
      stops.find((s) => s.status === "current") ??
      stops.find((s) => s.status === "pending") ??
      null;

    for (const s of stops) {
      const reachedAt = s.status === "reached" ? Date.now() : undefined;

      updates[`${busRoot}/stops/${s.id}`] = removeUndefined({
        id: s.id,
        name: s.name,
        order: s.order,
        status: s.status,
        reachedAt,
      });

      updates[`${busRoot}/stopsByName/${toSafeKey(s.name)}`] = removeUndefined({
        stopId: s.id,
        name: s.name,
        order: s.order,
        status: s.status,
        reachedAt,
      });
    }

    updates[`${busRoot}/currentStop`] = removeUndefined({
      stopId: current?.id ?? null,
      name: current?.name ?? null,
      order: current?.order ?? null,
      status: current?.status ?? null,
      updatedAt: serverTimestamp(),
    });

    await update(ref(database), updates);
    console.log("Stops progress saved to Firebase for bus:", busNumber);
  } catch (error) {
    console.error("Error saving stops progress to Firebase:", error);
    throw error;
  }
};

/**
 * Write a single stop as "reached" and update currentStop (one write, no full-list spam).
 * Use this when the driver taps "Mark Reached" so the backend triggers once and sends one notification.
 */
export const markStopReachedInRTDB = async (
  busNumber: string,
  reachedStopId: string,
  reachedAt: number,
  nextCurrentStop: {
    id: string;
    name: string;
    order: number;
    status: string;
  } | null
): Promise<void> => {
  const busRoot = `buses/${busNumber}`;
  const updates: Record<string, unknown> = {
    [`${busRoot}/stops/${reachedStopId}/status`]: "reached",
    [`${busRoot}/stops/${reachedStopId}/reachedAt`]: reachedAt,
    [`${busRoot}/currentStop`]: nextCurrentStop
      ? removeUndefined({
        stopId: nextCurrentStop.id,
        name: nextCurrentStop.name,
        order: nextCurrentStop.order,
        status: nextCurrentStop.status,
        updatedAt: serverTimestamp(),
      })
      : removeUndefined({
        stopId: null,
        name: null,
        order: null,
        status: null,
        updatedAt: serverTimestamp(),
      }),
  };
  if (nextCurrentStop) {
    updates[`${busRoot}/stops/${nextCurrentStop.id}/status`] = "current";
  }
  await update(ref(database), updates);
};

/**
 * Update route state in Firebase
 */
export const updateRouteState = async (
  driverId: string,
  busNumber: string,
  routeState: 'not_started' | 'in_progress' | 'completed'
): Promise<void> => {
  const path = `buses/${busNumber}/routeState`;
  console.log(`[updateRouteState] 📡 Writing routeState="${routeState}" to RTDB path: "${path}"`);
  try {
    const routeStateRef = ref(database, path);
    await set(routeStateRef, {
      state: routeState,
      updatedAt: serverTimestamp()
    });
    console.log(`[updateRouteState] ✅ Route state updated for bus: ${busNumber}`);
  } catch (error: any) {
    console.error(`[updateRouteState] ❌ FAILED:`, error?.message || error);
    throw error;
  }
};

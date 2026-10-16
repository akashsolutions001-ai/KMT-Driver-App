import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type FieldValue,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import type { Stop, StopStatus } from "@/types/driver";
import type { RouteState } from "@/types/driver";

const COLLECTIONS = {
  BUSES: "buses",
  TRIPS: "trips",
} as const;

export type TripStatus = "in_progress" | "completed" | "cancelled";

export interface TripStopSnapshot {
  id: string;
  name: string;
  order: number;
  status: StopStatus;
  // server timestamp (authoritative)
  reachedAtServer?: FieldValue | null;
  // client tap time (milliseconds since epoch)
  reachedAtClient?: number | null;
}

export interface CreateTripInput {
  busNumber: string;
  routeId: string;
  routeName: string;
  driverId: string;
  driverName: string;
  stops: Stop[];
}

function busTripsCollection(busNumber: string) {
  // buses/{busNumber}/trips
  return collection(firestore, COLLECTIONS.BUSES, busNumber, COLLECTIONS.TRIPS);
}

function busTripDoc(busNumber: string, tripId: string) {
  // buses/{busNumber}/trips/{tripId}
  return doc(firestore, COLLECTIONS.BUSES, busNumber, COLLECTIONS.TRIPS, tripId);
}

/**
 * Creates a new trip document under `buses/{busNumber}/trips/`.
 * Returns the generated tripId.
 */
export async function startTrip(input: CreateTripInput): Promise<string> {
  const tripsRef = busTripsCollection(input.busNumber);

  const stopsMap: Record<string, TripStopSnapshot> = {};
  for (const s of input.stops) {
    stopsMap[s.id] = {
      id: s.id,
      name: s.name,
      order: s.order,
      status: s.status,
      reachedAtServer: null,
      reachedAtClient: null,
    };
  }

  const tripDoc = await addDoc(tripsRef, {
    busNumber: input.busNumber,
    routeId: input.routeId,
    routeName: input.routeName,
    driverId: input.driverId,
    driverName: input.driverName,

    status: "in_progress" satisfies TripStatus,
    routeState: "in_progress" satisfies RouteState,

    startedAtServer: serverTimestamp(),
    startedAtClient: Date.now(),
    finishedAt: null,

    // stop snapshots keyed by stopId
    stops: stopsMap,

    // current stop helper (passenger app can show it)
    currentStop: null,

    updatedAt: serverTimestamp(),
  });

  return tripDoc.id;
}

/**
 * Updates trip routeState + current stop snapshot.
 */
export async function updateTripRouteState(params: {
  busNumber: string;
  tripId: string;
  routeState: RouteState;
  currentStop?: { id: string; name: string; order: number; status: StopStatus } | null;
}): Promise<void> {
  const tripRef = busTripDoc(params.busNumber, params.tripId);
  await updateDoc(tripRef, {
    routeState: params.routeState,
    currentStop: params.currentStop ?? null,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Marks a stop as reached and stores the "arrived time".
 * Optionally marks any skipped stops as "skipped".
 * - reachedAtClient: time when driver tapped (device clock)
 * - reachedAtServer: server timestamp (authoritative ordering)
 */
export async function markStopReached(params: {
  busNumber: string;
  tripId: string;
  stop: { id: string; name: string; order: number };
  skippedStopIds?: string[];
}): Promise<void> {
  const tripRef = busTripDoc(params.busNumber, params.tripId);
  const updates: Record<string, any> = {
    [`stops.${params.stop.id}.status`]: "reached",
    [`stops.${params.stop.id}.reachedAtClient`]: Date.now(),
    [`stops.${params.stop.id}.reachedAtServer`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (params.skippedStopIds && params.skippedStopIds.length > 0) {
    for (const sId of params.skippedStopIds) {
      updates[`stops.${sId}.status`] = "skipped";
      updates[`stops.${sId}.skippedAtClient`] = Date.now();
      updates[`stops.${sId}.skippedAtServer`] = serverTimestamp();
    }
  }

  await updateDoc(tripRef, updates);
}

/**
 * Marks a single stop as skipped in the active trip.
 */
export async function markStopSkipped(params: {
  busNumber: string;
  tripId: string;
  stopId: string;
}): Promise<void> {
  const tripRef = busTripDoc(params.busNumber, params.tripId);
  await updateDoc(tripRef, {
    [`stops.${params.stopId}.status`]: "skipped",
    [`stops.${params.stopId}.skippedAtClient`]: Date.now(),
    [`stops.${params.stopId}.skippedAtServer`]: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Finalizes a trip.
 */
export async function finishTrip(params: { busNumber: string; tripId: string }): Promise<void> {
  const tripRef = busTripDoc(params.busNumber, params.tripId);
  await updateDoc(tripRef, {
    status: "completed" satisfies TripStatus,
    routeState: "completed" satisfies RouteState,
    finishedAtServer: serverTimestamp(),
    finishedAtClient: Date.now(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Gets the active (in_progress) trip for a bus number.
 * Returns null if no active trip exists.
 */
export async function getActiveTrip(busNumber: string): Promise<{
  tripId: string;
  routeState: RouteState;
  stops: Record<string, TripStopSnapshot>;
  currentStop: { id: string; name: string; order: number; status: StopStatus } | null;
} | null> {
  try {
    const tripsRef = busTripsCollection(busNumber);
    const activeTripsQuery = query(
      tripsRef,
      where("status", "==", "in_progress")
    );

    const querySnapshot = await getDocs(activeTripsQuery);
    
    if (querySnapshot.empty) {
      return null;
    }

    // Get the most recent active trip (by startedAtClient or updatedAt)
    const trips: Array<Record<string, any> & { id: string }> = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Sort by startedAtClient descending (most recent first)
    trips.sort((a, b) => {
      const aTime = a.startedAtClient || 0;
      const bTime = b.startedAtClient || 0;
      return bTime - aTime;
    });

    const activeTrip = trips[0];
    if (!activeTrip) {
      return null;
    }

    // Convert stops map to array and back to ensure proper typing
    const stopsMap = activeTrip.stops || {};
    const currentStopData = activeTrip.currentStop || null;

    return {
      tripId: activeTrip.id,
      routeState: activeTrip.routeState || "in_progress",
      stops: stopsMap,
      currentStop: currentStopData
        ? {
            id: currentStopData.id,
            name: currentStopData.name,
            order: currentStopData.order,
            status: currentStopData.status,
          }
        : null,
    };
  } catch (error) {
    console.error("Error fetching active trip:", error);
    return null;
  }
}


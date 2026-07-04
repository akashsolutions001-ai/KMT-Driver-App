import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy
} from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { DriverInfo, Stop, RouteInfo } from "@/types/driver";

/**
 * Firestore Collection Names
 */
const COLLECTIONS = {
  DRIVERS: "drivers",
  ROUTES: "routes",
  STOPS: "stops",
  BUSES: "buses"
} as const;

/**
 * Fetch driver data by driverId field (not document ID)
 * Queries by the driverId field value in Firestore
 */
export const getDriverById = async (driverId: string): Promise<DriverInfo | null> => {
  try {
    // Query by driverId field (not document ID)
    const driversQuery = query(
      collection(firestore, COLLECTIONS.DRIVERS),
      where("driverId", "==", driverId)
    );

    const querySnapshot = await getDocs(driversQuery);

    if (querySnapshot.empty) {
      return null;
    }

    // Get the first matching document
    const driverDoc = querySnapshot.docs[0];
    const driverData = driverDoc.data();

    // Get route from assigned bus
    // Supports both: driver.assignedBusId OR bus.assignedDriverId (reverse lookup)
    let routeId: string | null = null;
    let busNumber: string | null = null;
    let busData: any = null;

    // Method 1: Check if driver has a bus assigned directly
    if (driverData.assignedBusId) {
      try {
        const busDocRef = doc(firestore, COLLECTIONS.BUSES, driverData.assignedBusId);
        const busDoc = await getDoc(busDocRef);

        if (busDoc.exists()) {
          busData = busDoc.data();
          routeId = busData.assignedRouteId;
          busNumber = busData.busNumber;
        }
      } catch (busError) {
        console.error('Error fetching bus by assignedBusId:', busError);
      }
    }

    // Method 2: Reverse lookup - find bus where assignedDriverId matches this driver's document ID
    if (!busData) {
      try {
        const driverDocId = driverDoc.id;
        const busesQuery = query(
          collection(firestore, COLLECTIONS.BUSES),
          where("assignedDriverId", "==", driverDocId)
        );
        const busQuerySnapshot = await getDocs(busesQuery);

        if (!busQuerySnapshot.empty) {
          const busDoc = busQuerySnapshot.docs[0];
          busData = busDoc.data();
          routeId = busData.assignedRouteId;
          busNumber = busData.busNumber;
        }
      } catch (busError) {
        console.error('Error fetching bus by assignedDriverId:', busError);
      }
    }

    if (!routeId) {
      throw new Error("Driver has no associated route");
    }

    // Fetch route data with busNumber
    const route = await getRouteById(routeId, busNumber || undefined);
    if (!route) {
      throw new Error("Route not found for driver");
    }

    return {
      id: driverData.driverId || driverDoc.id, // Use driverId field or document ID as fallback
      name: driverData.name || "",
      route: route
    };
  } catch (error) {
    console.error("Error fetching driver:", error);
    throw error;
  }
};

/**
 * Authenticate driver with ID and password
 * @deprecated Use authService.authenticateDriver instead
 * This function is kept for backward compatibility but should use Firebase Auth
 */
export const authenticateDriver = async (
  driverId: string,
  password: string
): Promise<DriverInfo | null> => {
  try {
    const driverDocRef = doc(firestore, COLLECTIONS.DRIVERS, driverId);
    const driverDoc = await getDoc(driverDocRef);

    if (!driverDoc.exists()) {
      return null;
    }

    const driverData = driverDoc.data();

    // Verify password matches the one stored in Firestore (set by admin)
    if (driverData.password !== password) {
      return null;
    }

    const routeId = driverData.routeId;
    if (!routeId) {
      throw new Error("Driver has no associated route");
    }

    // Fetch route data
    const route = await getRouteById(routeId);
    if (!route) {
      throw new Error("Route not found for driver");
    }

    return {
      id: driverDoc.id,
      name: driverData.name || "",
      route: route
    };
  } catch (error) {
    console.error("Error authenticating driver:", error);
    throw error;
  }
};

/**
 * Fetch route data by route ID
 * Supports both embedded stops array and separate stops collection
 */
export const getRouteById = async (routeId: string, busNumber?: string): Promise<RouteInfo | null> => {
  try {
    const routeDocRef = doc(firestore, COLLECTIONS.ROUTES, routeId);
    const routeDoc = await getDoc(routeDocRef);

    if (!routeDoc.exists()) {
      return null;
    }

    const routeData = routeDoc.data();
    let stops: Stop[] = [];

    // Check if stops are embedded in the route document (as an array)
    if (routeData.stops && Array.isArray(routeData.stops) && routeData.stops.length > 0) {
      // Stops are embedded in the route document
      stops = routeData.stops.map((stop: any) => ({
        id: stop.id || stop.stopId || String(stop.order),
        name: stop.name || "",
        status: 'pending' as const,
        order: stop.order || 0,
        latitude: stop.latitude,
        longitude: stop.longitude,
      }));
    } else {
      // Fallback: Try to fetch stops using stopIds array
      const stopIds = routeData.stopIds;
      if (stopIds && Array.isArray(stopIds) && stopIds.length > 0) {
        stops = await getStopsByIds(stopIds);
      } else {
        // Fallback: Query stops by routeId
        stops = await getStopsByRouteId(routeId);
      }
    }

    return {
      id: routeDoc.id,
      name: routeData.name || "",
      busNumber: busNumber || routeData.busNumber || "",
      stops: stops.sort((a, b) => a.order - b.order)
    };
  } catch (error) {
    console.error("Error fetching route:", error);
    throw error;
  }
};

/**
 * Fetch stops by their IDs
 */
export const getStopsByIds = async (stopIds: string[]): Promise<Stop[]> => {
  try {
    if (stopIds.length === 0) {
      return [];
    }

    // Fetch stops in parallel
    const stopPromises = stopIds.map(async (stopId): Promise<Stop | null> => {
      const stopDocRef = doc(firestore, COLLECTIONS.STOPS, stopId);
      const stopDoc = await getDoc(stopDocRef);

      if (!stopDoc.exists()) {
        console.warn(`Stop ${stopId} not found`);
        return null;
      }

      const stopData = stopDoc.data();
      return {
        id: stopDoc.id,
        name: stopData.name || "",
        status: 'pending' as const,
        order: stopData.order || 0,
        latitude: stopData.latitude,
        longitude: stopData.longitude,
      } as Stop;
    });

    const stops = await Promise.all(stopPromises);
    return stops.filter((stop): stop is Stop => stop !== null);
  } catch (error) {
    console.error("Error fetching stops:", error);
    throw error;
  }
};

/**
 * Fetch all stops for a route (alternative method)
 */
export const getStopsByRouteId = async (routeId: string): Promise<Stop[]> => {
  try {
    const stopsQuery = query(
      collection(firestore, COLLECTIONS.STOPS),
      where("routeId", "==", routeId),
      orderBy("order", "asc")
    );

    const querySnapshot = await getDocs(stopsQuery);
    const stops: Stop[] = [];

    querySnapshot.forEach((doc) => {
      const stopData = doc.data();
      stops.push({
        id: doc.id,
        name: stopData.name || "",
        status: 'pending' as const,
        order: stopData.order || 0,
        latitude: stopData.latitude,
        longitude: stopData.longitude,
      });
    });

    return stops;
  } catch (error) {
    console.error("Error fetching stops by route:", error);
    throw error;
  }
};

/**
 * Fetch bus data by bus number
 */
export const getBusByNumber = async (busNumber: string): Promise<any | null> => {
  try {
    const busesQuery = query(
      collection(firestore, COLLECTIONS.BUSES),
      where("busNumber", "==", busNumber)
    );

    const querySnapshot = await getDocs(busesQuery);

    if (querySnapshot.empty) {
      return null;
    }

    const busDoc = querySnapshot.docs[0];
    return {
      id: busDoc.id,
      ...busDoc.data()
    };
  } catch (error) {
    console.error("Error fetching bus:", error);
    throw error;
  }
};

/**
 * Fetch all routes
 */
export const getAllRoutes = async (): Promise<RouteInfo[]> => {
  try {
    const routesQuery = query(collection(firestore, COLLECTIONS.ROUTES));
    const querySnapshot = await getDocs(routesQuery);
    const routes: RouteInfo[] = [];

    for (const doc of querySnapshot.docs) {
      const routeData = doc.data();
      const stopIds = routeData.stopIds || [];
      const stops = await getStopsByIds(stopIds);

      routes.push({
        id: doc.id,
        name: routeData.name || "",
        busNumber: routeData.busNumber || "",
        stops: stops.sort((a, b) => a.order - b.order)
      });
    }

    return routes;
  } catch (error) {
    console.error("Error fetching all routes:", error);
    throw error;
  }
};

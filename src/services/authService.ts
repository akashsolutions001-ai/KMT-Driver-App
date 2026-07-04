import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { DriverInfo } from "@/types/driver";
import { getRouteById } from "./firestoreService";

const COLLECTIONS = {
  DRIVERS: "drivers",
  BUSES: "buses",
  ROUTES: "routes"
} as const;

/**
 * Authenticate driver using credentials from Firestore (set by admin)
 * Verifies driverId (field) and password against Firestore, then authenticates with Firebase Auth
 * 
 * @param driverId - The driverId field value from Firestore (e.g., "DRV-001")
 * @param password - The password field value from Firestore
 */
export const authenticateDriver = async (
  driverId: string,
  password: string
): Promise<DriverInfo | null> => {
  try {
    console.log('[AUTH] Step 1: Querying Firestore for driverId:', driverId);
    // Step 1: Query driver by driverId field (not document ID)
    const driversQuery = query(
      collection(firestore, COLLECTIONS.DRIVERS),
      where("driverId", "==", driverId)
    );

    const querySnapshot = await getDocs(driversQuery);

    console.log('[AUTH] Firestore query completed. Found docs:', querySnapshot.size);
    if (querySnapshot.empty) {
      console.log('[AUTH] No driver found with driverId:', driverId);
      return null;
    }

    // Get the first matching document
    const driverDoc = querySnapshot.docs[0];
    const driverData = driverDoc.data();

    // Step 2: Verify password matches the one stored in Firestore (set by admin)
    console.log('[AUTH] Step 2: Verifying password...');
    if (driverData.password !== password) {
      console.log('[AUTH] Password mismatch for driver:', driverId);
      return null;
    }
    console.log('[AUTH] Password verified successfully');

    // Step 3: Get email from driver data or use driverId as email
    // Admin can set email field, otherwise we use driverId@driverapp.com
    const email = driverData.email || `${driverId}@driverapp.com`;

    // Step 4: Authenticate with Firebase Auth (optional - don't fail if it doesn't work)
    // If user doesn't exist, create it automatically
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (authError: any) {
      if (authError.code === 'auth/user-not-found') {
        // User doesn't exist in Firebase Auth, try to create it automatically
        try {
          await createUserWithEmailAndPassword(auth, email, password);
          console.log('Firebase Auth user created automatically for driver:', driverId);
        } catch (createError: any) {
          // If creation fails, continue with Firestore verification only
          // Firebase Auth is optional for this app
          console.log('Firebase Auth user creation skipped, using Firestore authentication only');
        }
      } else if (authError.code === 'auth/invalid-credential' || authError.code === 'auth/wrong-password') {
        // Password doesn't match Firebase Auth (but matches Firestore)
        // This is fine - we'll use Firestore authentication
        console.log('Firebase Auth credentials mismatch, using Firestore authentication only');
      } else {
        // Other auth errors - log but continue with Firestore verification
        console.log('Firebase Auth error:', authError.code, 'Continuing with Firestore verification only');
      }
    }

    // Step 5: Fetch route data
    // Supports two data models:
    // 1. Driver -> Bus (via driver.assignedBusId)
    // 2. Bus -> Driver (via bus.assignedDriverId) - reverse lookup
    console.log('[AUTH] Step 5: Looking up bus assignment...');
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
        const driverDocId = driverDoc.id; // The Firestore document ID of the driver
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
          console.log('Found bus via reverse lookup (assignedDriverId):', busNumber);
        }
      } catch (busError) {
        console.error('Error fetching bus by assignedDriverId:', busError);
      }
    }

    // If still no bus found, throw error
    if (!busData) {
      console.error('[AUTH] No bus found for driver:', driverId);
      throw new Error("No bus assigned to this driver. Please contact admin to assign a bus.");
    }
    console.log('[AUTH] Bus found. busNumber:', busNumber, 'routeId:', routeId);

    if (!routeId) {
      throw new Error("Bus has no route assigned. Please contact admin.");
    }

    if (!routeId) {
      throw new Error("Driver has no associated route. Please contact admin to assign a route.");
    }

    // Fetch route with busNumber (if available)
    console.log('[AUTH] Step 6: Fetching route data for routeId:', routeId);
    const route = await getRouteById(routeId, busNumber || undefined);
    if (!route) {
      throw new Error("Route not found. Please contact admin.");
    }

    console.log('[AUTH] Login successful for driver:', driverId, 'Route:', route.name);
    return {
      id: driverData.driverId || driverDoc.id, // Use driverId field or document ID as fallback
      name: driverData.name || "",
      route: route
    };
  } catch (error) {
    console.error("Error authenticating driver:", error);
    throw error;
  }
};

/**
 * Sign out the current user
 */
export const signOutDriver = async (): Promise<void> => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error signing out:", error);
    throw error;
  }
};

/**
 * Get current authenticated user
 */
export const getCurrentUser = (): User | null => {
  return auth.currentUser;
};

/**
 * Listen to authentication state changes
 */
export const onAuthStateChange = (callback: (user: User | null) => void) => {
  return onAuthStateChanged(auth, callback);
};

/**
 * Check if user is authenticated
 */
export const isAuthenticated = (): boolean => {
  return auth.currentUser !== null;
};

const DRIVER_SESSION_KEY = "driver_session";

/**
 * Save driver session to localStorage for persistence across page refreshes
 */
export const saveDriverSession = (driver: DriverInfo): void => {
  try {
    localStorage.setItem(DRIVER_SESSION_KEY, JSON.stringify(driver));
  } catch (e) {
    console.warn("Failed to save driver session to localStorage:", e);
  }
};

/**
 * Clear driver session from localStorage
 */
export const clearDriverSession = (): void => {
  try {
    localStorage.removeItem(DRIVER_SESSION_KEY);
  } catch (e) {
    console.warn("Failed to clear driver session from localStorage:", e);
  }
};

/**
 * Get saved driver session from localStorage
 */
export const getSavedDriverSession = (): DriverInfo | null => {
  try {
    const saved = localStorage.getItem(DRIVER_SESSION_KEY);
    if (saved) {
      return JSON.parse(saved) as DriverInfo;
    }
  } catch (e) {
    console.warn("Failed to get driver session from localStorage:", e);
  }
  return null;
};

/**
 * Restore driver session from Firebase Auth user (used on page refresh).
 * Extracts driverId from user's email and fetches driver data from Firestore.
 */
export const restoreDriverSession = async (user: User): Promise<DriverInfo | null> => {
  try {
    // Extract driverId from email (e.g., "DRV-001@driverapp.com" → "DRV-001")
    const email = user.email;
    if (!email) return null;

    const driverId = email.split("@")[0];
    if (!driverId) return null;

    // Query driver by driverId field
    const driversQuery = query(
      collection(firestore, COLLECTIONS.DRIVERS),
      where("driverId", "==", driverId)
    );

    const querySnapshot = await getDocs(driversQuery);
    if (querySnapshot.empty) {
      console.warn("Driver not found in Firestore for:", driverId);
      return null;
    }

    const driverDoc = querySnapshot.docs[0];
    const driverData = driverDoc.data();

    // Fetch route data (same logic as authenticateDriver)
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
        console.error("Error fetching bus by assignedBusId:", busError);
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
        console.error("Error fetching bus by assignedDriverId:", busError);
      }
    }

    if (!busData) {
      console.warn("Driver has no bus assigned:", driverId);
      return null;
    }

    if (!routeId) {
      console.warn("Bus has no route assigned for driver:", driverId);
      return null;
    }

    const route = await getRouteById(routeId, busNumber || undefined);
    if (!route) {
      console.warn("Route not found for driver:", driverId);
      return null;
    }

    return {
      id: driverData.driverId || driverDoc.id,
      name: driverData.name || "",
      route: route,
    };
  } catch (error) {
    console.error("Error restoring driver session:", error);
    return null;
  }
};

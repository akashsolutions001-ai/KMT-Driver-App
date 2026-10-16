import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User
} from "firebase/auth";
import { auth } from "@/lib/firebase";
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteField, Timestamp } from "firebase/firestore";
import { firestore } from "@/lib/firebase";
import { DriverInfo } from "@/types/driver";
import { getRouteById } from "./firestoreService";

const COLLECTIONS = {
  DRIVERS: "drivers",
  BUSES: "buses",
  ROUTES: "routes"
} as const;

/**
 * Format driver ID to a standardized email for Firebase Authentication
 */
const getDriverEmail = (driverId: string, customEmail?: string): string => {
  if (customEmail && customEmail.includes("@")) {
    return customEmail.trim();
  }
  const cleanId = driverId.toLowerCase().trim().replace(/[^a-z0-9_-]/g, "");
  return `${cleanId}@kmt.gov.in`;
};

/**
 * Authenticate driver using Firebase Authentication.
 * If the driver account exists only in legacy Firestore with a plaintext password,
 * this automatically migrates the credentials to Firebase Auth and scrubs
 * the plaintext password from Firestore.
 * 
 * @param driverId - The driverId field value from Firestore (e.g., "DRV-001")
 * @param password - The password entered by the driver
 */
export const authenticateDriver = async (
  driverId: string,
  password: string
): Promise<DriverInfo | null> => {
  try {
    const trimmedId = driverId.trim();
    console.log('[AUTH] Step 1: Querying driver record for:', trimmedId);

    // Step 1: Query driver by driverId field (or document ID fallback)
    const driversQuery = query(
      collection(firestore, COLLECTIONS.DRIVERS),
      where("driverId", "==", trimmedId)
    );

    let querySnapshot = await getDocs(driversQuery);
    let driverDoc = !querySnapshot.empty ? querySnapshot.docs[0] : null;

    // Fallback: Check if document ID matches
    if (!driverDoc) {
      const docRef = doc(firestore, COLLECTIONS.DRIVERS, trimmedId);
      const directDoc = await getDoc(docRef);
      if (directDoc.exists()) {
        driverDoc = directDoc;
      }
    }

    if (!driverDoc) {
      console.warn('[AUTH] No driver profile found with driverId:', trimmedId);
      return null;
    }

    const driverData = driverDoc.data();
    const email = getDriverEmail(trimmedId, driverData.email);

    // Step 2: Primary Authentication via Firebase Auth
    let authUser: User | null = null;
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      authUser = userCredential.user;
      console.log('[AUTH] Firebase Auth successful for:', email);

      // If document still contains a legacy plaintext password, scrub it now
      if (driverData.password) {
        try {
          await updateDoc(driverDoc.ref, {
            password: deleteField(),
            authUid: authUser.uid,
            email: email,
            updatedAt: Timestamp.now()
          });
          console.log('[AUTH] Successfully removed legacy plaintext password from Firestore');
        } catch (cleanErr) {
          console.warn('[AUTH] Note: Could not scrub legacy password:', cleanErr);
        }
      }
    } catch (authError: any) {
      console.log('[AUTH] Firebase Auth sign-in failed code:', authError.code);

      // Step 3: Safe migration path for legacy drivers
      // If user not in Firebase Auth, check if Firestore holds a legacy matching password
      if (
        (authError.code === 'auth/user-not-found' || authError.code === 'auth/invalid-credential') &&
        driverData.password &&
        driverData.password === password
      ) {
        console.log('[AUTH] Migrating legacy driver to Firebase Auth:', email);
        try {
          const newCredential = await createUserWithEmailAndPassword(auth, email, password);
          authUser = newCredential.user;

          // Immediately scrub the plaintext password
          await updateDoc(driverDoc.ref, {
            password: deleteField(),
            authUid: authUser.uid,
            email: email,
            updatedAt: Timestamp.now()
          });
          console.log('[AUTH] Driver successfully migrated to Firebase Auth and plaintext password removed.');
        } catch (createErr: any) {
          console.error('[AUTH] Failed to migrate driver account:', createErr);
          // If creation failed because user exists, then the password was wrong
          return null;
        }
      } else {
        // Invalid credentials or other auth failure
        return null;
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
    let driverDoc: any = null;
    let driverData: any = null;

    // Check by authUid first
    const uidQuery = query(
      collection(firestore, COLLECTIONS.DRIVERS),
      where("authUid", "==", user.uid)
    );
    const uidSnap = await getDocs(uidQuery);
    if (!uidSnap.empty) {
      driverDoc = uidSnap.docs[0];
      driverData = driverDoc.data();
    } else {
      // Fallback: match by email or driverId prefix
      const email = user.email || "";
      const driverId = email.includes("@") ? email.split("@")[0] : email;
      if (!driverId) return null;

      const driversQuery = query(
        collection(firestore, COLLECTIONS.DRIVERS),
        where("driverId", "==", driverId)
      );
      const querySnapshot = await getDocs(driversQuery);
      if (!querySnapshot.empty) {
        driverDoc = querySnapshot.docs[0];
        driverData = driverDoc.data();
      }
    }

    if (!driverDoc || !driverData) {
      console.warn("Driver record not found in Firestore for user:", user.uid, user.email);
      return null;
    }

    const driverId = driverData.driverId || driverDoc.id;

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

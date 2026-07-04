# 📋 **Student App - RTDB Integration Guide**

## 🗂️ **Firebase Realtime Database Structure**

### **Complete RTDB Path Structure**

The driver app writes to this structure:

```
/buses/
  {busNumber}/          // e.g., "BUS-002"
    location/           // ✅ Current GPS location
      latitude: number
      longitude: number
      accuracy: number
      timestamp: number
      busNumber: string
      routeId: string
      routeName: string
      driverId: string
      driverName: string
      routeState: string  // "not_started" | "in_progress" | "completed"
      updatedAt: timestamp
      
    currentStop/        // ✅ Current stop information
      stopId: string | null
      name: string | null
      order: number | null
      status: string | null
      updatedAt: timestamp
      
    stops/              // ✅ ALL stops with their status
      {stopId}/
        id: string
        name: string
        order: number
        status: "reached" | "current" | "pending"
        reachedAt: number (only if status = "reached")
        
    stopsByName/        // ✅ Stops indexed by name for quick lookup
      {safeStopName}/   // e.g., "ashoka_hotel"
        stopId: string
        name: string
        order: number
        status: "reached" | "current" | "pending"
        reachedAt: number (if reached)
        
    routeState/         // ✅ Top-level route state
      state: "not_started" | "in_progress" | "completed"
      updatedAt: timestamp
```

---

## 🔄 **Student App Integration Code**

### **Step 1: Find Bus for Student's Route**

```typescript
import { collection, query, where, getDocs } from 'firebase/firestore';
import { ref, onValue, off } from 'firebase/database';

interface StudentData {
  selectedRouteId: string;    // Route document ID
  selectedStopId: string;     // Stop ID
  stopName: string;           // Stop name
}

async function findBusForRoute(student: StudentData): Promise<string | null> {
  try {
    // Query Firestore to find which bus serves this route
    const busesRef = collection(firestore, 'buses');
    const q = query(busesRef, where('assignedRouteId', '==', student.selectedRouteId));
    const busSnapshot = await getDocs(q);
    
    if (busSnapshot.empty) {
      console.log('No bus assigned to this route');
      return null;
    }
    
    const busDoc = busSnapshot.docs[0];
    const busNumber = busDoc.data().busNumber;  // e.g., "BUS-002"
    
    console.log(`Found bus ${busNumber} for route ${student.selectedRouteId}`);
    return busNumber;
  } catch (error) {
    console.error('Error finding bus:', error);
    return null;
  }
}
```

---

### **Step 2: Real-Time Bus Location Tracking**

```typescript
interface BusLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  busNumber: string;
  routeState: 'not_started' | 'in_progress' | 'completed';
  driverName: string;
}

function trackBusLocation(
  busNumber: string, 
  onLocationUpdate: (location: BusLocation) => void
): () => void {
  const locationRef = ref(database, `buses/${busNumber}/location`);
  
  const unsubscribe = onValue(locationRef, (snapshot) => {
    const location = snapshot.val();
    
    if (location) {
      onLocationUpdate({
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || 0,
        timestamp: location.timestamp,
        busNumber: location.busNumber,
        routeState: location.routeState || 'not_started',
        driverName: location.driverName || 'Driver',
      });
    } else {
      console.log('Bus location not available yet');
    }
  });
  
  // Return cleanup function
  return () => off(locationRef);
}
```

---

### **Step 3: Track Student's Stop Status**

```typescript
interface StopStatus {
  id: string;
  name: string;
  order: number;
  status: 'reached' | 'current' | 'pending';
  reachedAt?: number;
}

function trackStudentStop(
  busNumber: string,
  studentStopId: string,
  onStopUpdate: (stop: StopStatus | null) => void
): () => void {
  const stopRef = ref(database, `buses/${busNumber}/stops/${studentStopId}`);
  
  const unsubscribe = onValue(stopRef, (snapshot) => {
    const stop = snapshot.val();
    
    if (stop) {
      onStopUpdate({
        id: stop.id,
        name: stop.name,
        order: stop.order,
        status: stop.status,
        reachedAt: stop.reachedAt,
      });
    } else {
      // Stop data not available yet
      onStopUpdate(null);
    }
  });
  
  return () => off(stopRef);
}
```

---

### **Step 4: Track Current Stop (for notifications)**

```typescript
interface CurrentStop {
  stopId: string | null;
  name: string | null;
  order: number | null;
  status: string | null;
}

function trackCurrentStop(
  busNumber: string,
  studentStopOrder: number,
  onCurrentStopChange: (stopsAway: number, currentStop: CurrentStop) => void
): () => void {
  const currentStopRef = ref(database, `buses/${busNumber}/currentStop`);
  
  const unsubscribe = onValue(currentStopRef, (snapshot) => {
    const currentStop = snapshot.val();
    
    if (currentStop && currentStop.order !== null) {
      const stopsAway = studentStopOrder - currentStop.order;
      
      onCurrentStopChange(stopsAway, {
        stopId: currentStop.stopId,
        name: currentStop.name,
        order: currentStop.order,
        status: currentStop.status,
      });
    } else {
      // Route not started yet
      onCurrentStopChange(-1, {
        stopId: null,
        name: null,
        order: null,
        status: null,
      });
    }
  });
  
  return () => off(currentStopRef);
}
```

---

### **Step 5: Get All Stops Status (for route visualization)**

```typescript
interface AllStopsStatus {
  [stopId: string]: StopStatus;
}

function trackAllStops(
  busNumber: string,
  onStopsUpdate: (stops: AllStopsStatus) => void
): () => void {
  const stopsRef = ref(database, `buses/${busNumber}/stops`);
  
  const unsubscribe = onValue(stopsRef, (snapshot) => {
    const stops = snapshot.val();
    
    if (stops) {
      onStopsUpdate(stops as AllStopsStatus);
    } else {
      console.log('Stops data not available yet');
      onStopsUpdate({});
    }
  });
  
  return () => off(stopsRef);
}
```

---

## 🔔 **Notification System**

### **Smart Notifications Based on Current Stop**

```typescript
function setupSmartNotifications(
  busNumber: string,
  studentStopOrder: number,
  sendNotification: (title: string, message: string) => void
): () => void {
  let lastStopsAway = -100; // Initialize to avoid duplicate notifications
  
  const unsubscribe = trackCurrentStop(
    busNumber,
    studentStopOrder,
    (stopsAway, currentStop) => {
      // Only send notification if stopsAway has changed
      if (stopsAway === lastStopsAway) return;
      lastStopsAway = stopsAway;
      
      if (stopsAway < 0) {
        // Route not started or bus hasn't reached any stop yet
        return;
      }
      
      if (stopsAway === 0) {
        sendNotification(
          '🚌 Bus Arrived!',
          `Bus is at ${currentStop.name || 'your stop'} NOW! Head out now.`
        );
      } else if (stopsAway === 1) {
        sendNotification(
          '🚌 Next Stop!',
          `Bus is at ${currentStop.name}. Your stop is next! Get ready.`
        );
      } else if (stopsAway === 2) {
        sendNotification(
          '🚌 Get Ready',
          `Bus is 2 stops away. Start heading to your stop.`
        );
      } else if (stopsAway === 3) {
        sendNotification(
          '🚌 Bus Approaching',
          `Bus is 3 stops away. Get ready to leave soon.`
        );
      } else if (stopsAway < 0) {
        // Bus already passed
        sendNotification(
          '❌ Bus Passed',
          'The bus has already passed your stop.'
        );
      }
    }
  );
  
  return unsubscribe;
}
```

---

## 🎯 **Complete Integration Example**

```typescript
// React component example
import { useEffect, useState } from 'react';

function BusTracking({ student }: { student: StudentData }) {
  const [busNumber, setBusNumber] = useState<string | null>(null);
  const [location, setLocation] = useState<BusLocation | null>(null);
  const [myStopStatus, setMyStopStatus] = useState<StopStatus | null>(null);
  const [stopsAway, setStopsAway] = useState<number>(-1);
  
  // Step 1: Find bus for student's route
  useEffect(() => {
    findBusForRoute(student).then(setBusNumber);
  }, [student.selectedRouteId]);
  
  // Step 2: Track bus location
  useEffect(() => {
    if (!busNumber) return;
    
    const unsubscribe = trackBusLocation(busNumber, setLocation);
    return unsubscribe;
  }, [busNumber]);
  
  // Step 3: Track student's stop
  useEffect(() => {
    if (!busNumber) return;
    
    const unsubscribe = trackStudentStop(
      busNumber,
      student.selectedStopId,
      setMyStopStatus
    );
    return unsubscribe;
  }, [busNumber, student.selectedStopId]);
  
  // Step 4: Track current stop for notifications
  useEffect(() => {
    if (!busNumber || !myStopStatus) return;
    
    const unsubscribe = trackCurrentStop(
      busNumber,
      myStopStatus.order,
      (stopsAway, currentStop) => {
        setStopsAway(stopsAway);
        
        // Show notifications
        if (stopsAway === 0) {
          showNotification('Bus at your stop!');
        } else if (stopsAway === 1) {
          showNotification('Bus is at next stop!');
        }
      }
    );
    return unsubscribe;
  }, [busNumber, myStopStatus]);
  
  return (
    <div>
      <h2>Bus: {busNumber || 'Loading...'}</h2>
      
      {location && (
        <div>
          <p>Status: {location.routeState}</p>
          <p>Driver: {location.driverName}</p>
          {/* Display map with location.latitude, location.longitude */}
        </div>
      )}
      
      {myStopStatus && (
        <div>
          <h3>Your Stop: {myStopStatus.name}</h3>
          <p>Status: {myStopStatus.status}</p>
          {stopsAway >= 0 && <p>{stopsAway} stops away</p>}
        </div>
      )}
    </div>
  );
}
```

---

## ✅ **What Changed from Old System**

### **OLD Way (Don't use):**
```typescript
// ❌ Old: Used route.id instead of route document ID
student.routeId = "JzvFUaupvbmt16SQQeYi"  // WRONG - this is not the document ID
```

### **NEW Way (Correct):**
```typescript
// ✅ New: Use actual route document ID
student.selectedRouteId = "m8pLb0vJ40ThcANbdpo3"  // Correct - Firestore document ID
```

### **Fields to Update in Student Documents:**

**Add these fields:**
- `selectedRouteId` - Route document ID from Firestore
- `selectedStopId` - Stop ID from the route's stops array

**Deprecated (but keep for backward compatibility):**
- `routeId` - Old format, no longer used
- `routeName` - Redundant (can fetch from route document)
- `stopId` - Duplicate of `selectedStopId`

---

## 🚀 **Testing Checklist**

1. ✅ Query Firestore to find bus by `assignedRouteId`
2. ✅ Listen to `/buses/{busNumber}/location` for GPS updates
3. ✅ Listen to `/buses/{busNumber}/stops/{stopId}` for stop status
4. ✅ Listen to `/buses/{busNumber}/currentStop` for current position
5. ✅ Calculate `stopsAway` = `studentStopOrder - currentStopOrder`
6. ✅ Show notifications at 3, 2, 1, and 0 stops away
7. ✅ Display bus on map using real-time coordinates
8. ✅ Show ETA based on current stop and average speed

---

## 📊 **Expected RTDB Data Flow**

### **When Driver Starts Route:**
```json
{
  "buses": {
    "BUS-002": {
      "location": { "latitude": 16.7, "longitude": 74.2, "routeState": "in_progress", ... },
      "currentStop": { "stopId": "stop-1", "name": "First Stop", "order": 1, "status": "current" },
      "stops": {
        "stop-1": { "status": "current", "order": 1, ... },
        "stop-2": { "status": "pending", "order": 2, ... },
        ...
      },
      "routeState": { "state": "in_progress", ... }
    }
  }
}
```

### **When Driver Marks Stop as Reached:**
```json
{
  "buses": {
    "BUS-002": {
      "currentStop": { "stopId": "stop-2", "name": "Second Stop", "order": 2, "status": "current" },
      "stops": {
        "stop-1": { "status": "reached", "order": 1, "reachedAt": 1707506400000 },
        "stop-2": { "status": "current", "order": 2 },
        ...
      }
    }
  }
}
```

---

**Copy this entire guide for your student app development team!** 🎓✨

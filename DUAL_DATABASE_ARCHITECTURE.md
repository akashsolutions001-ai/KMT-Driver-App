# 🗺️ Quick Reference: Dual Database Architecture

## The Problem (Before Fix)

```
Driver App
    ↓
LocationTrackingService.java
    ↓
    ✅ Firebase RTDB (/buses/{busNumber}/location)
         ↓
         Student App → Shows Map ✅
    
    ❌ Firestore (liveBuses) - MISSING!
         ↓
         Student App → No Notifications ❌
```

## The Solution (After Fix)

```
Driver App
    ↓
LocationTrackingService.java
    ↓
    ├─→ ✅ Firebase RTDB (/buses/{busNumber}/location)
    │        ↓
    │        Student App → Shows Map ✅
    │
    └─→ ✅ Firestore (liveBuses/{routeId}_{busNumber})
             ↓
             Student App → Notifications Work ✅
```

---

## Data Flow

### 1. Driver Starts Route

```
Driver clicks "Start Route"
    ↓
LocationTrackingService starts
    ↓
Every 2 seconds:
    ├─→ GPS Location → RTDB
    └─→ GPS Location → Firestore liveBuses
```

### 2. Student Receives Updates

```
Student App subscribes to:
    ├─→ RTDB: /buses/{busNumber}/location
    │   └─→ Updates map marker position
    │
    └─→ Firestore: liveBuses/{routeId}_{busNumber}
        └─→ Triggers notifications when bus approaches
```

### 3. Driver Ends Route

```
Driver clicks "End Route" or closes app
    ↓
LocationTrackingService.onDestroy()
    ↓
    ├─→ RTDB: Location updates stop
    └─→ Firestore: liveBuses document DELETED
           ↓
           Student App: "Bus not active" message
```

---

## Why Both Databases?

| Feature | RTDB | Firestore |
|---------|------|-----------|
| **Purpose** | Real-time location updates | Notification triggers |
| **Update Frequency** | Every 2 seconds | Every 2 seconds |
| **Student App Usage** | Show bus on map | Trigger proximity alerts |
| **Data Structure** | Nested: `/buses/{busNumber}/location` | Document: `liveBuses/{routeId}_{busNumber}` |
| **Cleanup** | Auto (stops updating) | Manual (deleted on destroy) |

---

## Quick Checks

### ✅ Is RTDB Working?

```
Firebase Console → Realtime Database → /buses/{busNumber}/location
Should show: { latitude, longitude, routeState, timestamp, ... }
```

### ✅ Is Firestore Working?

```
Firebase Console → Firestore → liveBuses collection
Should have document: {routeId}_{busNumber}
Document fields: { busNumber, routeId, latitude, longitude, routeState, ... }
```

### ✅ Are Notifications Working?

```
Student App → Select route → Wait for bus to start
Should see: 
  - Map with bus marker (from RTDB)
  - Notification when bus approaches (from Firestore)
```

---

## Document ID Format

```
Firestore liveBuses Document ID = {routeId}_{busNumber}

Example:
  routeId: "m8pLb0vJ40ThcANbdpo3"
  busNumber: "BUS-002"
  
  Document ID: "m8pLb0vJ40ThcANbdpo3_BUS-002"
```

This format ensures:
- Unique document per bus-route combination
- Easy to query by routeId
- Easy to find specific bus

---

## Student App Code (Quick Copy-Paste)

### Find Live Bus

```typescript
// Find bus by routeId
const docId = `${student.selectedRouteId}_${busNumber}`;
const liveBusRef = doc(firestore, 'liveBuses', docId);

// Subscribe to updates
const unsubscribe = onSnapshot(liveBusRef, (snapshot) => {
  if (snapshot.exists()) {
    const bus = snapshot.data();
    console.log('Live bus found:', bus);
    // Trigger notifications based on bus.routeState
  } else {
    console.log('No live bus for this route');
  }
});
```

### Alternative: Query All Live Buses for Route

```typescript
// If you don't know the busNumber
const liveBusesRef = collection(firestore, 'liveBuses');
const q = query(liveBusesRef, where('routeId', '==', student.selectedRouteId));

const unsubscribe = onSnapshot(q, (querySnapshot) => {
  querySnapshot.forEach((doc) => {
    const bus = doc.data();
    console.log('Found live bus:', bus.busNumber);
  });
});
```

---

## Troubleshooting One-Liner

```bash
# 1. Check Android logs
adb logcat | grep LocationTrackingService

# 2. Check Firestore Console
# Firebase Console → Firestore → liveBuses

# 3. Check RTDB Console
# Firebase Console → Realtime Database → buses

# 4. Rebuild Android app
npx cap sync android && npx cap open android
```

---

**Quick Summary:**
- RTDB = Map location (real-time updates)
- Firestore = Notifications (bus state tracking)
- Both are needed for full functionality

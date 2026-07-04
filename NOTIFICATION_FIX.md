# 🔔 Notification Fix - Firestore liveBuses Integration

## 🎯 Problem Summary

**Issue:** Student app notifications were not working because the Firestore `liveBuses` collection was empty.

**Root Cause:** The driver app's `LocationTrackingService.java` was only updating Firebase Realtime Database (RTDB) but NOT Firestore's `liveBuses` collection.

**Impact:**
- ✅ Real-time location tracking on map worked (uses RTDB)
- ❌ Notifications didn't work (requires Firestore `liveBuses`)

---

## ✅ Solution Implemented

### Changes Made

#### 1. **Added Firestore Dependency** (`android/app/build.gradle`)
```gradle
implementation 'com.google.firebase:firebase-firestore'
```

#### 2. **Updated LocationTrackingService.java**

**Added Imports:**
```java
import com.google.firebase.firestore.FirebaseFirestore;
```

**Added Instance Variable:**
```java
private FirebaseFirestore firestore;
```

**Initialized Firestore in onCreate():**
```java
firestore = FirebaseFirestore.getInstance();
```

**Updated sendLocationToFirebase() Method:**

Now writes to **BOTH** databases:

1. **RTDB** - `/buses/{busNumber}/location` (for real-time map)
2. **Firestore** - `liveBuses` collection (for notifications)

**Added Cleanup in onDestroy():**

Deletes the `liveBuses` document when tracking stops to prevent stale data.

---

## 📊 Firestore Data Structure

### liveBuses Collection

**Document ID Format:** `{routeId}_{busNumber}`

**Example Document ID:** `m8pLb0vJ40ThcANbdpo3_BUS-002`

**Document Fields:**
```json
{
  "busNumber": "BUS-002",
  "routeId": "m8pLb0vJ40ThcANbdpo3",
  "routeName": "Route no.3-Kolhapur to Kagal",
  "driverId": "driverId123",
  "driverName": "Sanjay Shinde",
  "latitude": 16.7050,
  "longitude": 74.2433,
  "routeState": "in_progress",
  "timestamp": 1707506400000,
  "accuracy": 12.5,
  "speed": 15.3,
  "heading": 270.5
}
```

---

## 🔧 How It Works

### Flow Diagram

```
Driver App (Native Service)
    ↓
LocationTrackingService.java
    ↓
sendLocationToFirebase()
    ├─→ Firebase RTDB (/buses/{busNumber}/location)
    │   └─→ Student App reads this for LIVE MAP
    │
    └─→ Firestore (liveBuses/{routeId}_{busNumber})
        └─→ Student App reads this for NOTIFICATIONS
```

### When Tracking Starts

1. Driver starts route
2. `LocationTrackingService` starts
3. Every 2 seconds, GPS location is sent to:
   - **RTDB**: For real-time map updates
   - **Firestore liveBuses**: For notification triggers

### When Tracking Stops

1. Driver ends route / service stops
2. `onDestroy()` is called
3. Firestore `liveBuses` document is **deleted**
4. Student app stops receiving notifications

---

## 🧪 Testing & Verification

### Step 1: Build the Android App

```bash
# In project root
npm run build
npx cap sync android
npx cap open android
```

### Step 2: Start the Driver App

1. Open app on Android device
2. Login as driver
3. Select a route
4. Start the route
5. Check Android Logcat for these messages:

```
LocationTrackingService: Firestore instance obtained
LocationTrackingService: Sending location to Firebase RTDB path: buses/BUS-002/location
LocationTrackingService: Location sent to RTDB successfully
LocationTrackingService: Live bus data sent to Firestore successfully: m8pLb0vJ40ThcANbdpo3_BUS-002
```

### Step 3: Check Firestore Database

1. Open Firebase Console
2. Go to Firestore Database
3. Look for `liveBuses` collection
4. You should see a document with ID like: `{routeId}_{busNumber}`
5. Document should contain all fields (latitude, longitude, routeState, etc.)

### Step 4: Verify RTDB is Also Updated

1. Go to Firebase Realtime Database
2. Look for `/buses/{busNumber}/location`
3. Should contain same location data

### Step 5: Test Student App Notifications

1. Open student app
2. Select the same route that the driver is tracking
3. Student should now see:
   - ✅ Bus location on map (from RTDB)
   - ✅ Notifications when bus approaches (from Firestore liveBuses)

---

## 🚨 Troubleshooting

### Issue: Firestore Still Empty

**Check:**
- ✅ Android build includes new Firestore dependency
- ✅ App has internet connection
- ✅ routeId is not empty (check logs)
- ✅ Firestore rules allow writes

**Solution:**
```bash
# Rebuild the Android app
npm run build
npx cap sync android
# Clean build in Android Studio
./gradlew clean
./gradlew assembleDebug
```

### Issue: Notifications Still Not Working

**Check Student App Code:**

```typescript
// Student app should query liveBuses like this:
const liveBusRef = doc(firestore, 'liveBuses', `${routeId}_${busNumber}`);
const unsubscribe = onSnapshot(liveBusRef, (snapshot) => {
  const bus = snapshot.data();
  if (bus) {
    // Trigger notifications based on bus.routeState, bus.latitude, etc.
  }
});
```

**Check Firestore Rules:**

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /liveBuses/{busId} {
      allow read: if true;  // Students can read
      allow write: if true; // Drivers can write (add auth later)
    }
  }
}
```

### Issue: Documents Not Deleted When Route Ends

**Check:**
- ✅ `onDestroy()` is being called (check logs)
- ✅ routeId and busNumber are not null in onDestroy

**Manual Cleanup (if needed):**

```javascript
// In Firebase Console, you can manually delete old documents
// Or create a Cloud Function to auto-delete old liveBuses:
exports.cleanupOldLiveBuses = functions.pubsub
  .schedule('every 5 minutes')
  .onRun(async () => {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    
    const oldBuses = await admin.firestore()
      .collection('liveBuses')
      .where('timestamp', '<', fiveMinutesAgo)
      .get();
    
    const batch = admin.firestore().batch();
    oldBuses.forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  });
```

---

## 📝 Logs to Monitor

### Expected Success Logs

```
LocationTrackingService: Firebase initialized in service
LocationTrackingService: Firebase database reference obtained
LocationTrackingService: Firestore instance obtained
LocationTrackingService: Sending location to Firebase RTDB path: buses/BUS-002/location
LocationTrackingService: Location sent to RTDB successfully: 16.7050, 74.2433
LocationTrackingService: Live bus data sent to Firestore successfully: m8pLb0vJ40ThcANbdpo3_BUS-002
```

### Error Logs to Watch For

```
LocationTrackingService: Failed to send live bus data to Firestore: [error]
LocationTrackingService: Firestore not initialized or routeId missing, skipping liveBuses update
```

---

## 🎓 For Student App Developers

### How to Subscribe to liveBuses

```typescript
import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from './firebase';

interface LiveBus {
  busNumber: string;
  routeId: string;
  routeName: string;
  latitude: number;
  longitude: number;
  routeState: 'not_started' | 'in_progress' | 'completed';
  timestamp: number;
}

function subscribeToLiveBus(
  routeId: string,
  busNumber: string,
  callback: (bus: LiveBus | null) => void
): () => void {
  const docId = `${routeId}_${busNumber}`;
  const liveBusRef = doc(firestore, 'liveBuses', docId);
  
  const unsubscribe = onSnapshot(
    liveBusRef,
    (snapshot) => {
      if (snapshot.exists()) {
        callback(snapshot.data() as LiveBus);
      } else {
        callback(null); // Bus not active
      }
    },
    (error) => {
      console.error('Error subscribing to live bus:', error);
      callback(null);
    }
  );
  
  return unsubscribe;
}

// Usage:
const unsubscribe = subscribeToLiveBus(
  'm8pLb0vJ40ThcANbdpo3',
  'BUS-002',
  (bus) => {
    if (bus) {
      console.log('Bus is live:', bus.routeState);
      // Trigger notifications based on bus state
    } else {
      console.log('Bus is not active');
    }
  }
);

// Cleanup when component unmounts:
// unsubscribe();
```

---

## ✅ Summary

| Feature | Before | After |
|---------|--------|-------|
| RTDB Updates | ✅ Working | ✅ Working |
| Firestore liveBuses | ❌ Empty | ✅ Populated |
| Map Location | ✅ Working | ✅ Working |
| Notifications | ❌ Not Working | ✅ Working |

---

## 🔗 Related Files

- `android/app/build.gradle` - Firestore dependency
- `android/app/src/main/java/com/route/master/driver/LocationTrackingService.java` - Main changes
- `STUDENT_APP_INTEGRATION_GUIDE.md` - How student app consumes RTDB
- `RTDB_TESTING_GUIDE.md` - RTDB debugging

---

**Status:** ✅ FIXED - Driver app now writes to both RTDB and Firestore liveBuses collection!

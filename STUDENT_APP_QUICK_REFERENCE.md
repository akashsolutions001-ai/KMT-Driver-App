# 📋 QUICK REFERENCE - Student App RTDB Paths

## 🔍 **Find Bus for Student**

```typescript
// Student has: selectedRouteId = "m8pLb0vJ40ThcANbdpo3"

const q = query(
  collection(firestore, 'buses'),
  where('assignedRouteId', '==', student.selectedRouteId)
);
const busSnapshot = await getDocs(q);
const busNumber = busSnapshot.docs[0].data().busNumber;
// Result: "BUS-002"
```

---

## 📡 **RTDB Paths to Listen**

### **Bus Location** (GPS)
```
Path: /buses/{busNumber}/location

Returns:
{
  latitude: 16.7050,
  longitude: 74.2433,
  routeState: "in_progress",
  driverName: "Sanjay Shinde",
  timestamp: 1707506400000
}
```

### **Current Stop** (Where bus is NOW)
```
Path: /buses/{busNumber}/currentStop

Returns:
{
  stopId: "stop-1",
  name: "Nandgaon",
  order: 1,
  status: "current"
}
```

### **All Stops** (Progress tracking)
```
Path: /buses/{busNumber}/stops

Returns:
{
  "stop-1": { status: "reached", order: 1, reachedAt: 1707506300000 },
  "stop-2": { status: "current", order: 2 },
  "stop-3": { status: "pending", order: 3 }
}
```

### **Student's Specific Stop**
```
Path: /buses/{busNumber}/stops/{student.selectedStopId}

Returns:
{
  id: "stop-5",
  name: "Ashoka Hotel",
  order: 5,
  status: "pending"  // or "current" or "reached"
}
```

---

## 🔔 **Notification Logic**

```typescript
// Calculate distance
const stopsAway = studentStopOrder - currentStopOrder;

if (stopsAway === 0) → "🚌 Bus at your stop NOW!"
if (stopsAway === 1) → "🚌 Bus at next stop!"
if (stopsAway === 2) → "🚌 Get ready!"
if (stopsAway === 3) → "🚌 Bus approaching"
if (stopsAway < 0) → "❌ Bus already passed"
```

---

## 📊 **Student Document Fields**

### **Use These (NEW):**
- `selectedRouteId` → Route document ID from Firestore
- `selectedStopId` → Stop ID from route's stops array
- `stopName` → For display

### **Deprecated (OLD):**
- ~~`routeId`~~ → Not the document ID
- ~~`routeName`~~ → Fetched from route doc
- ~~`stopId`~~ → Duplicate of selectedStopId

---

## 🎯 **Copy-Paste Code**

### **Track Bus Location:**
```typescript
import { ref, onValue } from 'firebase/database';

const locationRef = ref(database, `buses/${busNumber}/location`);
const unsubscribe = onValue(locationRef, (snapshot) => {
  const loc = snapshot.val();
  if (loc) {
    updateMap(loc.latitude, loc.longitude);
    showBusStatus(loc.routeState);
  }
});

// Cleanup: unsubscribe();
```

### **Track Current Stop:**
```typescript
const currentStopRef = ref(database, `buses/${busNumber}/currentStop`);
const unsubscribe = onValue(currentStopRef, (snapshot) => {
  const current = snapshot.val();
  if (current && current.order) {
    const stopsAway = studentStopOrder - current.order;
    
    if (stopsAway === 0) {
      sendNotification('Bus at your stop!');
    }
  }
});
```

### **Track All Stops:**
```typescript
const stopsRef = ref(database, `buses/${busNumber}/stops`);
const unsubscribe = onValue(stopsRef, (snapshot) => {
  const allStops = snapshot.val();
  
  Object.values(allStops).forEach((stop: any) => {
    console.log(`${stop.name}: ${stop.status}`);
  });
});
```

---

## ⚠️ **Common Issues**

### **Bus Not Found**
- ✅ Check if route has a bus assigned (`assignedRouteId` in buses collection)
- ✅ Verify `student.selectedRouteId` is the Firestore document ID

### **Location Not Updating**
- ✅ Check if driver started the route
- ✅ Verify RTDB path: `/buses/{busNumber}/location`
- ✅ Check if `routeState` is "in_progress"

### **Stops Missing**
- ✅ Driver needs to start route first
- ✅ Check RTDB path: `/buses/{busNumber}/stops`
- ✅ See `RTDB_TESTING_GUIDE.md` for debugging

---

## 📞 **Quick Help**

**For detailed guides, see:**
- `STUDENT_APP_INTEGRATION_GUIDE.md` - Complete integration code
- `INTEGRATION_SUMMARY.md` - Full system overview
- `RTDB_TESTING_GUIDE.md` - Debugging steps
- `FIRESTORE_SETUP_GUIDE.md` - Data structure setup

**Key Points:**
1. Find bus by querying `buses` where `assignedRouteId == student.selectedRouteId`
2. Listen to `/buses/{busNumber}/location` for GPS
3. Listen to `/buses/{busNumber}/currentStop` for notifications
4. Listen to `/buses/{busNumber}/stops/{stopId}` for student's stop status
5. Calculate distance: `stopsAway = studentStopOrder - currentStopOrder`

# Firestore Setup Guide

## Current Data Structure

The system now supports **two relationship models** between drivers and buses:

### Model 1: Driver → Bus (Direct Assignment)
Driver document has `assignedBusId` field pointing to Bus document ID

###Model 2: Bus → Driver (Reverse Lookup)
Bus document has `assignedDriverId` field pointing to Driver document ID

## Your Current Setup Issue

Based on your Firestore data:

**Driver Document** (`svqEV8c18Ecgt602RTic`):
- `driverId`: "DRV-001"
- `assignedBusId`: **null** ❌ (No bus assigned)

**Bus Document** (`hl2iMYESIoe17yoO6soF`):
- `busNumber`: "BUS-002"
- `assignedDriverId`: "wPhKwd0b9qzgRNC4amdP" (pointing to a DIFFERENT driver) ❌
- `assignedRouteId`: "m8pLb0vJ40ThcANbdpo3"

**Route Document** (`m8pLb0vJ40ThcANbdpo3`):
- `name`: "Route no.3-Kolhapur to Kagal"
- `stops`: [array of 16 stops]

## How to Fix

### Option A: Update the Bus to Point to the Correct Driver

In your Firestore console, edit the **bus** document `hl2iMYESIoe17yoO6soF`:

```
assignedDriverId: "svqEV8c18Ecgt602RTic"
```

This will link BUS-002 to driver DRV-001 via reverse lookup.

### Option B: Update the Driver to Point to the Bus

In your Firestore console, edit the **driver** document `svqEV8c18Ecgt602RTic`:

```
assignedBusId: "hl2iMYESIoe17yoO6soF"
```

This will link driver DRV-001 directly to BUS-002.

## After the Fix

Once you update the Firestore relationship, the login will work automatically:

1. Driver logs in with `DRV-001` and password
2. System finds driver document
3. System finds bus (either via `assignedBusId` or reverse lookup via `assignedDriverId`)
4. System loads route from bus's `assignedRouteId`
5. Driver sees route with all 16 stops
6. Location tracking writes to RTDB at `/buses/BUS-002/location`

## RTDB Structure

The Firebase Realtime Database will be updated at:

```
/buses/BUS-002/
  ├── location/
  │   ├── latitude
  │   ├── longitude
  │   ├── busNumber: "BUS-002"
  │   ├── routeId: "m8pLb0vJ40ThcANbdpo3"
  │   ├── routeName: "Route no.3-Kolhapur to Kagal"
  │   ├── driverName: "Sanjay Shinde"
  │   ├── routeState: "in_progress"
  │   └── updatedAt: <timestamp>
  ├── stops/
  │   ├── {stopId}/
  │   │   ├── name
  │   │   ├── status
  │   │   └── reachedAt
  ├── stopsByName/
  └── currentStop/
```

## Verification Steps

1. **Update Firestore** - Choose Option A or B above
2. **Clear browser cache** or use incognito mode
3. **Login** with DRV-001 and password
4. **Check console** for "Found bus via reverse lookup" message
5. **Start route** and verify RTDB updates at `/buses/BUS-002/`

## Login Credentials

- **Driver ID**: DRV-001
- **Password**: DRV-001@DYP

After fixing the Firestore relationship, this should work perfectly!

# Background GPS Tracking Implementation Guide

## Overview

This document describes the implementation of **continuous background GPS tracking** for the Route Master Driver app. The app now sends GPS location data to Firebase Realtime Database (RTDB) even when:

- The app is **minimized**
- The app is in the **background**
- The **screen is off**
- The app is **swiped away** from recent apps (within system limits)

## How It Works

### Native Android Foreground Service

The key to continuous GPS tracking is using an **Android Foreground Service** (`LocationTrackingService.java`) that:

1. **Runs independently of the WebView** - GPS tracking continues even if the React/JS code is paused
2. **Uses FusedLocationProviderClient** - Google's recommended location API for accurate GPS
3. **Sends data directly to Firebase** - Uses native Firebase SDK, not JavaScript
4. **Shows a persistent notification** - Required by Android for foreground services
5. **Uses START_STICKY** - Service restarts if killed by the system
6. **Has stopWithTask=false** - Continues running when app is swiped away

### Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                     Android Native Layer                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │           LocationTrackingService.java                   │ │
│  │  • Uses FusedLocationProviderClient for GPS              │ │
│  │  • Sends location to Firebase RTDB every 2 seconds       │ │
│  │  • Runs as a foreground service with notification        │ │
│  │  • Uses WakeLock to keep CPU running                     │ │
│  └─────────────────────────────────────────────────────────┘ │
│                            ↕ (Plugin Bridge)                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │    LocationServicePlugin.java + PermissionsPlugin.java   │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                               ↕
┌──────────────────────────────────────────────────────────────┐
│                   React/TypeScript Layer                      │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │              useLocationTracking.ts                      │ │
│  │  • Starts/stops the foreground service                   │ │
│  │  • Receives location updates for UI display              │ │
│  │  • On web, handles GPS tracking via JavaScript           │ │
│  └─────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
                               ↕
┌──────────────────────────────────────────────────────────────┐
│                   Firebase Realtime Database                  │
│                /buses/{busNumber}/location                    │
│  { latitude, longitude, timestamp, driverId, busNumber, ... }│
└──────────────────────────────────────────────────────────────┘
```

## Required Permissions

The app requests the following permissions (handled by `PermissionsPlugin.java`):

| Permission | Purpose | Android Version |
|------------|---------|-----------------|
| `ACCESS_FINE_LOCATION` | GPS tracking | All |
| `ACCESS_COARSE_LOCATION` | Network-based location | All |
| `ACCESS_BACKGROUND_LOCATION` | GPS when app is in background | Android 10+ (API 29+) |
| `FOREGROUND_SERVICE` | Running foreground service | Android 8+ (API 26+) |
| `FOREGROUND_SERVICE_LOCATION` | Location-type foreground service | Android 10+ (API 29+) |
| `POST_NOTIFICATIONS` | Foreground service notification | Android 13+ (API 33+) |
| `WAKE_LOCK` | Keep CPU running | All |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Prevent OS from killing app | Android 6+ (API 23+) |

## Files Modified/Created

### Android Native (Java)

| File | Purpose |
|------|---------|
| `LocationTrackingService.java` | Foreground service with native GPS + Firebase |
| `LocationServicePlugin.java` | Capacitor plugin to start/stop service |
| `PermissionsPlugin.java` | Handles all permission requests sequentially |
| `MainActivity.java` | Registers custom plugins |
| `BootReceiver.java` | (Optional) Restart tracking after device reboot |
| `AndroidManifest.xml` | Declares permissions and service |
| `build.gradle` | Added play-services-location + firebase-database |
| `google-services.json` | Firebase config for Android |

### TypeScript/React

| File | Purpose |
|------|---------|
| `useLocationTracking.ts` | Hook that manages tracking lifecycle |
| `foregroundService.ts` | TypeScript wrapper for the native plugin |
| `foregroundService.web.ts` | Web fallback (no-op) |
| `permissions.ts` | TypeScript wrapper for permissions plugin |
| `permissions.web.ts` | Web fallback |
| `firebase.ts` | Added databaseURL |

## Usage

### Starting Tracking

When the driver starts a route, the `useLocationTracking` hook automatically:

1. Requests all required permissions
2. Starts the foreground service with driver/route info
3. The native service begins tracking GPS and sending to Firebase

```typescript
// In your component
const { currentLocation, isTracking, error } = useLocationTracking({
  driver: driverInfo,
  routeState: 'in_progress',
  isActive: true,
  updateInterval: 2000, // 2 seconds
});
```

### Stopping Tracking

When the route is completed or paused:

```typescript
// Automatically stops when routeState changes or isActive becomes false
// Or manually:
stopTracking();
```

## Firebase Data Structure

Location data is written to:

```
/buses/{busNumber}/location
{
  latitude: number,
  longitude: number,
  timestamp: number,
  driverId: string,
  driverName: string,
  busNumber: string,
  routeId: string,
  routeName: string,
  routeState: 'in_progress' | 'completed' | 'not_started',
  accuracy: number (if available),
  speed: number (if available),
  heading: number (if available),
  updatedAt: ServerTimestamp
}
```

## Important Notes

### google-services.json

⚠️ **IMPORTANT**: I created a `google-services.json` file based on your Firebase web config, but you should:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Go to Project Settings > General
4. Under "Your apps", add an Android app if not already added
5. Use package name: `com.route.master.driver`
6. Download the official `google-services.json`
7. Replace `android/app/google-services.json`

### Battery Optimization

For best results, users should:

1. When prompted, allow "Unrestricted" battery usage
2. Manufacturers like Xiaomi, Huawei, Samsung have additional power management settings
3. Consider adding instructions in the app for specific device brands

### Testing Background Tracking

To test:

1. Start a route in the app
2. See the foreground notification appear
3. Minimize the app or turn off the screen
4. Check Firebase RTDB - locations should continue updating every 2 seconds
5. Check the student app - bus location should update in real-time

## Build Commands

```bash
# Build web assets
npm run build

# Sync to Android
npx cap sync android

# Build Android APK
cd android && .\gradlew.bat assembleDebug

# APK location:
# android/app/build/outputs/apk/debug/app-debug.apk
```

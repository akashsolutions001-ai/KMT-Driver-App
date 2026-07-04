# Android Setup Guide for Background GPS Tracking

This guide explains how to set up the Route Master Driver app for continuous GPS tracking even when the screen is off or the app is minimized.

## Prerequisites

- Android Studio installed
- Android device (Android 7.0+ / API 24+)
- USB debugging enabled on device

## Build and Install

1. **Build the web app:**
   ```bash
   npm run build
   ```

2. **Sync Capacitor:**
   ```bash
   npx cap sync android
   ```

3. **Open in Android Studio:**
   ```bash
   npx cap open android
   ```

4. **Build and Run:**
   - In Android Studio, click "Run" (green play button)
   - Select your connected device
   - Wait for the app to install and launch

## Required Permissions Setup

After installing the app, you **must** grant the following permissions manually:

### 1. Location Permissions

1. Open **Settings** on your Android device
2. Go to **Apps** → **Route Master Driver**
3. Tap **Permissions**
4. Enable:
   - **Location** → Select **"Allow all the time"** (not just "While using the app")
   - This is critical for background tracking!

### 2. Battery Optimization (Critical!)

To prevent Android from killing GPS tracking when the screen is off:

1. Open **Settings** → **Apps** → **Route Master Driver**
2. Tap **Battery**
3. Select **"Unrestricted"** or **"Don't optimize"**
4. This ensures the app can run in the background

### 3. Background App Refresh

1. **Settings** → **Apps** → **Route Master Driver**
2. Enable **"Allow background activity"** or **"Background data"**

## Testing Background GPS Tracking

1. **Start a route** in the app (tap "Start Route")
2. Verify GPS tracking is active (green "Active" indicator)
3. **Lock your phone screen** (press power button)
4. Wait 10-20 seconds
5. **Unlock and check Firebase Realtime Database:**
   - Path: `/buses/{BUS_NUMBER}/location`
   - The `timestamp` and `updatedAt` should continue updating every ~2 seconds
   - If updates stop, check permissions above

## Troubleshooting

### GPS stops when screen is off

**Solution:** Ensure you granted **"Allow all the time"** location permission (not "While using app")

### App gets killed in background

**Solution:** Set battery optimization to **"Unrestricted"** (see step 2 above)

### Location not updating

1. Check if GPS is enabled on device (Settings → Location)
2. Ensure app has location permissions
3. Try restarting the app
4. Check Firebase connection (network available?)

### Build Errors

- **Gradle sync failed:** Run `npx cap sync android` again
- **Missing dependencies:** In Android Studio, click **File → Sync Project with Gradle Files**
- **AGP version:** You can upgrade Android Gradle Plugin version if Android Studio suggests it

## Features Enabled

✅ **Capacitor Geolocation Plugin** - Better location tracking than web API  
✅ **Foreground Service** - Keeps app alive during tracking  
✅ **Wake Lock** - Prevents screen from sleeping during active route  
✅ **Background Location** - Continues tracking when app is minimized  
✅ **2-second update interval** - Smooth real-time tracking for students  

## Release Build

To create a release APK:

1. In Android Studio: **Build → Generate Signed Bundle / APK**
2. Follow the wizard to create a keystore (first time) or use existing
3. Select **APK** or **Android App Bundle** (AAB for Play Store)
4. Build and locate the APK in `android/app/release/`

## Notes

- The app uses a **foreground service** which shows a persistent notification when tracking is active
- This is required by Android for background location tracking
- The notification cannot be dismissed while tracking is active (by design)
- Students will see live bus movement on their map as long as the driver app is tracking

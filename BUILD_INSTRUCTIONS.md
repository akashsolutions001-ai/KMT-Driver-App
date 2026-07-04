# 🚀 Build & Deploy Instructions - Notification Fix

## 📋 Changes Summary

The following files were modified to fix notifications:

1. ✅ `android/app/build.gradle` - Added Firestore dependency
2. ✅ `android/app/src/main/java/com/route/master/driver/LocationTrackingService.java` - Added Firestore writes
3. ✅ `NOTIFICATION_FIX.md` - Comprehensive documentation
4. ✅ `DUAL_DATABASE_ARCHITECTURE.md` - Quick reference guide

---

## 🔨 Build Commands

### Step 1: Sync Dependencies

```bash
# Navigate to project root
cd "d:\BUSINEES\Bus Track\college bus tracking\driver\route-master-app-main"

# Install/update Node dependencies (if needed)
npm install

# Build the web app
npm run build
```

### Step 2: Sync Android

```bash
# Sync web build to Android
npx cap sync android
```

This will:
- Copy web build to Android `assets`
- Update native dependencies (including new Firestore)
- Generate updated gradle files

### Step 3: Build Android APK

**Option A: Using Android Studio (Recommended)**

```bash
# Open Android Studio
npx cap open android
```

Then in Android Studio:
1. Click "Sync Project with Gradle Files" (may happen automatically)
2. Wait for Gradle sync to complete
3. Build > Make Project (or Ctrl+F9)
4. Run > Run 'app' (or Shift+F10)

**Option B: Using Command Line**

```bash
# Navigate to Android directory
cd android

# Clean build
./gradlew clean

# Build debug APK
./gradlew assembleDebug

# Or build release APK (if configured)
./gradlew assembleRelease

# APK location:
# Debug: android/app/build/outputs/apk/debug/app-debug.apk
# Release: android/app/build/outputs/apk/release/app-release.apk
```

---

## 🧪 Testing Steps

### 1. Install on Device

```bash
# Install via ADB
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# Or use Android Studio's "Run" button
```

### 2. Monitor Logs

```bash
# Filter logs for LocationTrackingService
adb logcat | grep LocationTrackingService
```

Expected logs:
```
LocationTrackingService: Firestore instance obtained
LocationTrackingService: Sending location to Firebase RTDB path: buses/BUS-002/location
LocationTrackingService: Location sent to RTDB successfully: 16.7050, 74.2433
LocationTrackingService: Live bus data sent to Firestore successfully: m8pLb0vJ40ThcANbdpo3_BUS-002
```

### 3. Check Firebase Console

**Firestore:**
1. Go to: https://console.firebase.google.com/
2. Select project: `college-bus-tracking-903e7`
3. Firestore Database > liveBuses collection
4. Should see document: `{routeId}_{busNumber}`

**RTDB:**
1. Realtime Database > Data tab
2. Navigate to: `/buses/{busNumber}/location`
3. Should show current location data

### 4. Test Student App

1. Open student app on another device
2. Select the route that driver is tracking
3. Verify:
   - ✅ Map shows bus location (from RTDB)
   - ✅ Notifications appear when bus approaches (from Firestore)

---

## 🐛 Troubleshooting

### Build Errors

**Error: "Could not find firebase-firestore"**

```bash
# Clean and rebuild
cd android
./gradlew clean
./gradlew assembleDebug
```

**Error: "Manifest merger failed"**

Check `android/app/src/main/AndroidManifest.xml` - ensure proper permissions are set.

**Gradle sync failed**

```bash
# Update Gradle wrapper
cd android
./gradlew wrapper --gradle-version 8.0
```

### Runtime Errors

**"Firestore not initialized"**

- Ensure `google-services.json` is in `android/app/`
- Rebuild app after adding Firestore dependency

**"Failed to send live bus data to Firestore"**

Check Firestore Rules:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /liveBuses/{busId} {
      allow read: if true;
      allow write: if true; // Change to proper auth later
    }
  }
}
```

**"routeId missing, skipping liveBuses update"**

- Ensure driver selects a valid route before starting
- Check that route has a proper Firestore document ID

---

## 📱 APK Distribution

### Create Release APK

```bash
cd android
./gradlew assembleRelease
```

**Note:** You'll need to configure signing first:

1. Generate keystore:
```bash
keytool -genkey -v -keystore my-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias my-key-alias
```

2. Add to `android/gradle.properties`:
```properties
MYAPP_RELEASE_STORE_FILE=my-release-key.jks
MYAPP_RELEASE_KEY_ALIAS=my-key-alias
MYAPP_RELEASE_STORE_PASSWORD=****
MYAPP_RELEASE_KEY_PASSWORD=****
```

3. Add signing config to `android/app/build.gradle`:
```gradle
android {
    signingConfigs {
        release {
            storeFile file(MYAPP_RELEASE_STORE_FILE)
            storePassword MYAPP_RELEASE_STORE_PASSWORD
            keyAlias MYAPP_RELEASE_KEY_ALIAS
            keyPassword MYAPP_RELEASE_KEY_PASSWORD
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

---

## 🔄 Quick Rebuild (After Changes)

```bash
# From project root
npm run build && npx cap sync android

# Then in Android Studio: Run > Run 'app'
# Or via CLI:
cd android && ./gradlew installDebug
```

---

## ✅ Verification Checklist

Before deploying to production:

- [ ] Android build succeeds without errors
- [ ] App installs on test device
- [ ] Logs show "Firestore instance obtained"
- [ ] RTDB updates are visible in Firebase Console
- [ ] Firestore `liveBuses` collection populates
- [ ] Student app receives notifications
- [ ] liveBuses document is deleted when route ends
- [ ] No crashes in background service
- [ ] Wake lock is properly managed (no battery drain)

---

## 📞 Quick Commands Reference

```bash
# Build everything
npm run build && npx cap sync android && cd android && ./gradlew assembleDebug

# Install on device
adb install -r android/app/build/outputs/apk/debug/app-debug.apk

# View logs
adb logcat | grep LocationTrackingService

# Clear app data (for testing)
adb shell pm clear com.route.master.driver

# Restart app
adb shell am force-stop com.route.master.driver
adb shell am start -n com.route.master.driver/.MainActivity
```

---

## 🎯 Success Criteria

✅ **Fix is working when:**

1. Driver starts route → Firestore `liveBuses` document is created
2. Student app shows notification when bus approaches
3. Driver ends route → Firestore `liveBuses` document is deleted
4. Logs show both RTDB and Firestore updates

❌ **Fix is NOT working if:**

1. Firestore `liveBuses` collection is empty while route is active
2. Student app doesn't show notifications
3. Logs show "Firestore not initialized" or "routeId missing"
4. App crashes when starting route

---

**All changes are backwards compatible - existing RTDB functionality remains unchanged!**

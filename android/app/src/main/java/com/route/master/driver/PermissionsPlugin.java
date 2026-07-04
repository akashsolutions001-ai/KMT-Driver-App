package com.route.master.driver;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Permissions")
public class PermissionsPlugin extends Plugin {
    private static final String TAG = "PermissionsPlugin";

    private static final int FOREGROUND_LOCATION_REQUEST_CODE = 1001;
    private static final int BACKGROUND_LOCATION_REQUEST_CODE = 1002;
    private static final int BATTERY_OPTIMIZATION_REQUEST_CODE = 1003;
    private static final int NOTIFICATION_REQUEST_CODE = 1004;

    private PluginCall pendingCall;
    private int currentPermissionStep = 0;
    private boolean isStandaloneRequest = false; // Track standalone vs sequential requests

    @PluginMethod
    public void requestAllPermissions(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        pendingCall = call;
        currentPermissionStep = 0;
        isStandaloneRequest = false; // This is a sequential request

        Log.d(TAG, "Starting permission request flow...");
        requestNextPermission();
    }

    private void requestNextPermission() {
        if (pendingCall == null)
            return;

        Activity activity = getActivity();
        if (activity == null) {
            resolvePendingCall();
            return;
        }

        switch (currentPermissionStep) {
            case 0:
                // Step 1: Foreground Location
                if (!hasForegroundLocationPermission()) {
                    Log.d(TAG, "Requesting foreground location permission");
                    ActivityCompat.requestPermissions(
                            activity,
                            new String[] {
                                    Manifest.permission.ACCESS_FINE_LOCATION,
                                    Manifest.permission.ACCESS_COARSE_LOCATION
                            },
                            FOREGROUND_LOCATION_REQUEST_CODE);
                    return;
                }
                currentPermissionStep++;
                // Fall through

            case 1:
                // Step 2: Background Location (Android 10+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && !hasBackgroundLocationPermission()) {
                    Log.d(TAG, "Requesting background location permission");
                    ActivityCompat.requestPermissions(
                            activity,
                            new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
                            BACKGROUND_LOCATION_REQUEST_CODE);
                    return;
                }
                currentPermissionStep++;
                // Fall through

            case 2:
                // Step 3: Notifications (Android 13+)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasNotificationPermission()) {
                    Log.d(TAG, "Requesting notification permission");
                    ActivityCompat.requestPermissions(
                            activity,
                            new String[] { Manifest.permission.POST_NOTIFICATIONS },
                            NOTIFICATION_REQUEST_CODE);
                    return;
                }
                currentPermissionStep++;
                // Fall through

            case 3:
                // Step 4: Battery Optimization
                if (!isBatteryOptimizationIgnored()) {
                    Log.d(TAG, "Requesting battery optimization exemption");
                    requestBatteryOptimizationIgnore();
                    return;
                }
                currentPermissionStep++;
                // Fall through

            default:
                // All permissions requested
                Log.d(TAG, "All permissions requested, resolving call");
                resolvePendingCall();
                break;
        }
    }

    private void resolvePendingCall() {
        if (pendingCall == null)
            return;

        JSObject result = new JSObject();
        result.put("foregroundLocation", hasForegroundLocationPermission() ? "granted" : "denied");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            result.put("backgroundLocation", hasBackgroundLocationPermission() ? "granted" : "denied");
        } else {
            result.put("backgroundLocation", "granted");
        }

        result.put("batteryOptimization", isBatteryOptimizationIgnored() ? "granted" : "denied");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result.put("notifications", hasNotificationPermission() ? "granted" : "denied");
        } else {
            result.put("notifications", "granted");
        }

        Log.d(TAG, "Permission result: " + result.toString());
        pendingCall.resolve(result);
        pendingCall = null;
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject result = new JSObject();
        result.put("foregroundLocation", hasForegroundLocationPermission() ? "granted" : "denied");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            result.put("backgroundLocation", hasBackgroundLocationPermission() ? "granted" : "denied");
        } else {
            result.put("backgroundLocation", "granted");
        }

        result.put("batteryOptimization", isBatteryOptimizationIgnored() ? "granted" : "denied");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            result.put("notifications", hasNotificationPermission() ? "granted" : "denied");
        } else {
            result.put("notifications", "granted");
        }

        call.resolve(result);
    }

    private boolean hasForegroundLocationPermission() {
        return ContextCompat.checkSelfPermission(
                getContext(),
                Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    private boolean hasBackgroundLocationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return ContextCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private boolean hasNotificationPermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            return ContextCompat.checkSelfPermission(
                    getContext(),
                    Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
        }
        return true;
    }

    private boolean isBatteryOptimizationIgnored() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            android.os.PowerManager pm = (android.os.PowerManager) getContext()
                    .getSystemService(android.content.Context.POWER_SERVICE);
            if (pm != null) {
                return pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
            }
        }
        return true;
    }

    private void requestBatteryOptimizationIgnore() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            Activity activity = getActivity();
            if (activity != null) {
                try {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    activity.startActivityForResult(intent, BATTERY_OPTIMIZATION_REQUEST_CODE);
                } catch (Exception e) {
                    Log.e(TAG, "Error opening battery optimization settings: " + e.getMessage());
                    currentPermissionStep++;
                    requestNextPermission();
                }
            }
        }
    }

    @Override
    protected void handleRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.handleRequestPermissionsResult(requestCode, permissions, grantResults);

        Log.d(TAG, "Permission result received for code: " + requestCode);

        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;

        switch (requestCode) {
            case FOREGROUND_LOCATION_REQUEST_CODE:
                Log.d(TAG, "Foreground location " + (granted ? "granted" : "denied"));
                if (!granted) {
                    // If foreground denied, skip remaining location permissions
                    currentPermissionStep = 2;
                } else {
                    currentPermissionStep = 1;
                }
                break;

            case BACKGROUND_LOCATION_REQUEST_CODE:
                Log.d(TAG, "Background location " + (granted ? "granted" : "denied"));
                currentPermissionStep = 2;
                break;

            case NOTIFICATION_REQUEST_CODE:
                Log.d(TAG, "Notification " + (granted ? "granted" : "denied"));
                // If this was a standalone request, resolve immediately
                if (isStandaloneRequest && pendingCall != null) {
                    JSObject result = new JSObject();
                    result.put("status", granted ? "granted" : "denied");
                    pendingCall.resolve(result);
                    pendingCall = null;
                    isStandaloneRequest = false;
                    return;
                }
                currentPermissionStep = 3;
                break;
        }

        // Continue with next permission after a brief delay (only for sequential flow)
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            requestNextPermission();
        }, 500);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == BATTERY_OPTIMIZATION_REQUEST_CODE) {
            Log.d(TAG, "Battery optimization result received");
            currentPermissionStep = 4;
            requestNextPermission();
        }
    }

    /**
     * Open the app's location permission settings page directly
     * This allows users to select "Allow all the time" option
     * Similar to how professional apps like Uber, Swiggy redirect users
     */
    @PluginMethod
    public void openAppLocationSettings(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        try {
            // On Android 11+ (API 30+), we can open location permissions directly
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    // Try to open location permission settings directly
                    Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                    Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
                    intent.setData(uri);
                    // Add extra to try to scroll to permissions section
                    intent.putExtra(":android:show_fragment",
                            "com.android.settings.applications.appinfo.AppPermissionPreference");
                    activity.startActivity(intent);
                    Log.d(TAG, "Opened app settings (Android 11+)");
                    call.resolve();
                    return;
                } catch (Exception e) {
                    Log.d(TAG, "Failed to open with fragment, trying standard method");
                }
            }

            // Fallback: Open standard app details settings
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            activity.startActivity(intent);
            Log.d(TAG, "Opened app settings (standard method)");
            call.resolve();
        } catch (Exception e) {
            Log.e(TAG, "Error opening app settings: " + e.getMessage());
            call.reject("Could not open app settings: " + e.getMessage());
        }
    }

    /**
     * Request only background location permission
     * Shows the native Android dialog for background location (Android 10+)
     * This is called after user already has foreground location permission
     */
    @PluginMethod
    public void requestBackgroundLocationOnly(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        // Check if we already have background permission
        if (hasBackgroundLocationPermission()) {
            JSObject result = new JSObject();
            result.put("status", "already_granted");
            call.resolve(result);
            return;
        }

        // Check if we have foreground permission first
        if (!hasForegroundLocationPermission()) {
            call.reject("Foreground location permission required first");
            return;
        }

        // On Android 10+, request background location
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            pendingCall = call;
            Log.d(TAG, "Requesting background location permission directly");
            ActivityCompat.requestPermissions(
                    activity,
                    new String[] { Manifest.permission.ACCESS_BACKGROUND_LOCATION },
                    BACKGROUND_LOCATION_REQUEST_CODE);
        } else {
            // On older Android, foreground permission is enough
            JSObject result = new JSObject();
            result.put("status", "granted");
            call.resolve(result);
        }
    }

    /**
     * Check if background location is granted (separate method for precise
     * checking)
     * Returns "granted" only if ACCESS_BACKGROUND_LOCATION is granted
     * Returns "foreground_only" if only foreground location is granted
     * Returns "denied" if no location permission
     */
    @PluginMethod
    public void getLocationPermissionLevel(PluginCall call) {
        JSObject result = new JSObject();

        boolean hasForeground = hasForegroundLocationPermission();
        boolean hasBackground = hasBackgroundLocationPermission();

        String level;
        if (!hasForeground) {
            level = "denied";
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            level = hasBackground ? "always" : "while_using";
        } else {
            // Below Android 10, foreground permission is effectively "always"
            level = "always";
        }

        result.put("level", level);
        result.put("hasForeground", hasForeground);
        result.put("hasBackground", hasBackground);

        Log.d(TAG, "Location permission level: " + level);
        call.resolve(result);
    }

    /**
     * Request notification permission (Android 13+)
     * Required to show foreground service notification
     */
    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("Activity not available");
            return;
        }

        // Check if already granted or not needed
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // Android 12 and below don't need this permission
            JSObject result = new JSObject();
            result.put("status", "granted");
            result.put("notNeeded", true);
            call.resolve(result);
            return;
        }

        if (hasNotificationPermission()) {
            JSObject result = new JSObject();
            result.put("status", "already_granted");
            call.resolve(result);
            return;
        }

        // Request notification permission on Android 13+
        pendingCall = call;
        isStandaloneRequest = true; // Mark as standalone request
        Log.d(TAG, "Requesting notification permission (standalone)");
        ActivityCompat.requestPermissions(
                activity,
                new String[] { Manifest.permission.POST_NOTIFICATIONS },
                NOTIFICATION_REQUEST_CODE);
    }
}

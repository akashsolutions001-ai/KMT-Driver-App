package com.route.master.driver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Receiver to potentially restart location tracking after device reboot.
 * This is optional - tracking will only restart if there was an active session
 * before reboot.
 */
public class BootReceiver extends BroadcastReceiver {
    private static final String TAG = "BootReceiver";
    private static final String PREFS_NAME = "LocationTrackingPrefs";
    private static final String KEY_TRACKING_ACTIVE = "trackingActive";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            Log.d(TAG, "Device boot completed");

            // Check if tracking was active before reboot
            SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
            boolean wasTracking = prefs.getBoolean(KEY_TRACKING_ACTIVE, false);

            if (wasTracking) {
                Log.d(TAG, "Restarting location tracking after boot");

                // Get saved route info
                String driverId = prefs.getString("driverId", "");
                String driverName = prefs.getString("driverName", "");
                String busNumber = prefs.getString("busNumber", "");
                String routeId = prefs.getString("routeId", "");
                String routeName = prefs.getString("routeName", "");
                String routeState = prefs.getString("routeState", "in_progress");

                // Start the service
                Intent serviceIntent = new Intent(context, LocationTrackingService.class);
                serviceIntent.putExtra("driverId", driverId);
                serviceIntent.putExtra("driverName", driverName);
                serviceIntent.putExtra("busNumber", busNumber);
                serviceIntent.putExtra("routeId", routeId);
                serviceIntent.putExtra("routeName", routeName);
                serviceIntent.putExtra("routeState", routeState);

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(serviceIntent);
                } else {
                    context.startService(serviceIntent);
                }
            }
        }
    }

    /**
     * Save tracking state to SharedPreferences
     * Call this when starting/stopping tracking from the plugin
     */
    public static void setTrackingState(Context context, boolean isActive,
            String driverId, String driverName,
            String busNumber, String routeId,
            String routeName, String routeState) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        SharedPreferences.Editor editor = prefs.edit();
        editor.putBoolean(KEY_TRACKING_ACTIVE, isActive);

        if (isActive) {
            editor.putString("driverId", driverId);
            editor.putString("driverName", driverName);
            editor.putString("busNumber", busNumber);
            editor.putString("routeId", routeId);
            editor.putString("routeName", routeName);
            editor.putString("routeState", routeState);
        }

        editor.apply();
    }
}

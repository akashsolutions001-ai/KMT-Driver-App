package com.kmt.driver;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "LocationService")
public class LocationServicePlugin extends Plugin {

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        try {
            String driverId = call.getString("driverId", "");
            String driverName = call.getString("driverName", "");
            String busNumber = call.getString("busNumber", "");
            String routeId = call.getString("routeId", "");
            String routeName = call.getString("routeName", "");
            String routeState = call.getString("routeState", "in_progress");
            String currentStopName = call.getString("currentStopName", "");
            String authToken = call.getString("authToken", "");
            String refreshToken = call.getString("refreshToken", "");
            String databaseUrl = call.getString("databaseUrl", "https://kmt-tracker-62159-default-rtdb.firebaseio.com");
            String apiKey = call.getString("apiKey", "AIzaSyBncLpnXmd5KIvE8Sq4iKi1ug4bl4hxhqk");
            String projectId = call.getString("projectId", "kmt-tracker-62159");

            Intent serviceIntent = new Intent(getContext(), LocationTrackingService.class);
            serviceIntent.putExtra("driverId", driverId);
            serviceIntent.putExtra("driverName", driverName);
            serviceIntent.putExtra("busNumber", busNumber);
            serviceIntent.putExtra("routeId", routeId);
            serviceIntent.putExtra("routeName", routeName);
            serviceIntent.putExtra("routeState", routeState);
            serviceIntent.putExtra("currentStopName", currentStopName);
            serviceIntent.putExtra("authToken", authToken);
            serviceIntent.putExtra("refreshToken", refreshToken);
            serviceIntent.putExtra("databaseUrl", databaseUrl);
            serviceIntent.putExtra("apiKey", apiKey);
            serviceIntent.putExtra("projectId", projectId);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Foreground service started with continuous GPS tracking");
            call.resolve(result);
        } catch (SecurityException e) {
            call.reject("Permission denied: " + e.getMessage());
        } catch (Exception e) {
            call.reject("Failed to start foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        try {
            Intent serviceIntent = new Intent(getContext(), LocationTrackingService.class);
            serviceIntent.setAction(LocationTrackingService.ACTION_STOP_SERVICE);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(serviceIntent);
            } else {
                getContext().startService(serviceIntent);
            }

            getContext().stopService(new Intent(getContext(), LocationTrackingService.class));

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to stop foreground service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateRouteInfo(PluginCall call) {
        try {
            String driverId = call.getString("driverId", "");
            String driverName = call.getString("driverName", "");
            String busNumber = call.getString("busNumber", "");
            String routeId = call.getString("routeId", "");
            String routeName = call.getString("routeName", "");
            String routeState = call.getString("routeState", "in_progress");
            String currentStopName = call.getString("currentStopName", "");
            String authToken = call.getString("authToken", "");
            String refreshToken = call.getString("refreshToken", "");
            String databaseUrl = call.getString("databaseUrl", "");
            String apiKey = call.getString("apiKey", "");
            String projectId = call.getString("projectId", "");

            Intent startIntent = new Intent(getContext(), LocationTrackingService.class);
            startIntent.putExtra("driverId", driverId);
            startIntent.putExtra("driverName", driverName);
            startIntent.putExtra("busNumber", busNumber);
            startIntent.putExtra("routeId", routeId);
            startIntent.putExtra("routeName", routeName);
            startIntent.putExtra("routeState", routeState);
            startIntent.putExtra("currentStopName", currentStopName);
            if (!authToken.isEmpty()) startIntent.putExtra("authToken", authToken);
            if (!refreshToken.isEmpty()) startIntent.putExtra("refreshToken", refreshToken);
            if (!databaseUrl.isEmpty()) startIntent.putExtra("databaseUrl", databaseUrl);
            if (!apiKey.isEmpty()) startIntent.putExtra("apiKey", apiKey);
            if (!projectId.isEmpty()) startIntent.putExtra("projectId", projectId);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(startIntent);
            } else {
                getContext().startService(startIntent);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            result.put("message", "Route info and notification updated");
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to update route info: " + e.getMessage());
        }
    }

    @PluginMethod
    public void updateAuthToken(PluginCall call) {
        try {
            String authToken = call.getString("authToken", "");
            String refreshToken = call.getString("refreshToken", "");

            Intent intent = new Intent(getContext(), LocationTrackingService.class);
            intent.setAction(LocationTrackingService.ACTION_UPDATE_TOKEN);
            intent.putExtra("authToken", authToken);
            if (!refreshToken.isEmpty()) {
                intent.putExtra("refreshToken", refreshToken);
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }

            JSObject result = new JSObject();
            result.put("success", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to update auth token: " + e.getMessage());
        }
    }
}

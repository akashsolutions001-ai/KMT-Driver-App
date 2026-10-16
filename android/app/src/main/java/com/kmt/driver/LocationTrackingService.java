package com.kmt.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.location.Location;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;
import com.google.firebase.FirebaseApp;
import com.google.firebase.database.DatabaseReference;
import com.google.firebase.database.FirebaseDatabase;
import com.google.firebase.firestore.FirebaseFirestore;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LocationTrackingService extends Service {
    private static final String TAG = "LocationTrackingService";
    private static final String CHANNEL_ID = "trip_tracking_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final long UPDATE_INTERVAL_MS = 2000; // 2 seconds
    private static final long NOTIFICATION_REPIN_INTERVAL_MS = 30000; // 30 seconds

    public static final String ACTION_STOP_SERVICE = "com.kmt.driver.STOP_SERVICE";
    public static final String ACTION_UPDATE_TOKEN = "com.kmt.driver.UPDATE_TOKEN";

    // SharedPreferences for persistent background tracking across app minimizes & restarts
    private static final String PREFS_NAME = "KmtLocationTrackingPrefs";
    private static final String KEY_BUS_NUMBER = "busNumber";
    private static final String KEY_ROUTE_ID = "routeId";
    private static final String KEY_ROUTE_NAME = "routeName";
    private static final String KEY_DRIVER_ID = "driverId";
    private static final String KEY_DRIVER_NAME = "driverName";
    private static final String KEY_ROUTE_STATE = "routeState";
    private static final String KEY_CURRENT_STOP = "currentStopName";
    private static final String KEY_AUTH_TOKEN = "authToken";
    private static final String KEY_REFRESH_TOKEN = "refreshToken";
    private static final String KEY_DATABASE_URL = "databaseUrl";
    private static final String KEY_API_KEY = "apiKey";
    private static final String KEY_PROJECT_ID = "projectId";
    private static final String KEY_IS_TRACKING = "isTracking";

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private DatabaseReference databaseRef;
    private FirebaseFirestore firestore;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;
    private ExecutorService networkExecutor;

    // Route/Driver info
    private String driverId = "";
    private String driverName = "";
    private String busNumber = "";
    private String routeId = "";
    private String routeName = "";
    private String routeState = "in_progress";
    private String currentStopName = "";
    private String authToken = "";
    private String refreshToken = "";
    private String databaseUrl = "https://kmt-tracker-62159-default-rtdb.firebaseio.com";
    private String apiKey = "AIzaSyBncLpnXmd5KIvE8Sq4iKi1ug4bl4hxhqk";
    private String projectId = "kmt-tracker-62159";

    private boolean isServiceRunning = false;
    private Notification notification;
    private Handler notificationHandler;

    // Runnable to periodically re-pin the foreground notification
    private final Runnable notificationRepinRunnable = new Runnable() {
        @Override
        public void run() {
            if (isServiceRunning) {
                repinForegroundNotification();
                if (notificationHandler != null) {
                    notificationHandler.postDelayed(this, NOTIFICATION_REPIN_INTERVAL_MS);
                }
            }
        }
    };

    @Override
    public void onCreate() {
        super.onCreate();
        Log.d(TAG, "onCreate called");

        networkExecutor = Executors.newSingleThreadExecutor();
        notificationManager = getSystemService(NotificationManager.class);

        // Load any previously saved session configuration (if restarted by OS)
        loadFromPreferences();

        createNotificationChannel();
        notification = createNotification();

        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);

        // Initialize Firebase
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
                Log.d(TAG, "Firebase initialized in service");
            }

            FirebaseDatabase database = FirebaseDatabase.getInstance(databaseUrl);
            database.goOnline();
            databaseRef = database.getReference();
            Log.d(TAG, "Firebase database reference obtained for URL: " + databaseUrl);

            firestore = FirebaseFirestore.getInstance();
            Log.d(TAG, "Firestore instance obtained");
        } catch (Exception e) {
            Log.e(TAG, "Firebase initialization error: " + e.getMessage(), e);
        }

        // Acquire wake lock to keep CPU running when screen is off or app minimized
        try {
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "KmtDriver::LocationWakeLock");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours
                Log.d(TAG, "Wake lock acquired");
            }
        } catch (Exception e) {
            Log.e(TAG, "Error acquiring wake lock: " + e.getMessage());
        }

        // Setup location callback
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult locationResult) {
                Location location = locationResult.getLastLocation();
                if (location != null) {
                    sendLocationToFirebase(location);
                } else {
                    Log.w(TAG, "Location result was null");
                }
            }
        };
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Log.d(TAG, "onStartCommand called, isServiceRunning=" + isServiceRunning);

        if (intent != null) {
            String action = intent.getAction();
            if (ACTION_STOP_SERVICE.equals(action)) {
                Log.d(TAG, "Received ACTION_STOP_SERVICE");
                stopForegroundServiceInternal();
                return START_NOT_STICKY;
            }

            if (ACTION_UPDATE_TOKEN.equals(action)) {
                String newAuthToken = intent.getStringExtra("authToken");
                String newRefreshToken = intent.getStringExtra("refreshToken");
                if (newAuthToken != null && !newAuthToken.isEmpty()) {
                    this.authToken = newAuthToken;
                }
                if (newRefreshToken != null && !newRefreshToken.isEmpty()) {
                    this.refreshToken = newRefreshToken;
                }
                saveToPreferences();
                Log.d(TAG, "Auth token updated in background service");
                return START_STICKY;
            }

            // Extract route/driver info from intent
            String inDriverId = intent.getStringExtra("driverId");
            String inDriverName = intent.getStringExtra("driverName");
            String inBusNumber = intent.getStringExtra("busNumber");
            String inRouteId = intent.getStringExtra("routeId");
            String inRouteName = intent.getStringExtra("routeName");
            String inRouteState = intent.getStringExtra("routeState");
            String inCurrentStopName = intent.getStringExtra("currentStopName");
            String inAuthToken = intent.getStringExtra("authToken");
            String inRefreshToken = intent.getStringExtra("refreshToken");
            String inDatabaseUrl = intent.getStringExtra("databaseUrl");
            String inApiKey = intent.getStringExtra("apiKey");
            String inProjectId = intent.getStringExtra("projectId");

            if (inDriverId != null && !inDriverId.isEmpty()) this.driverId = inDriverId;
            if (inDriverName != null && !inDriverName.isEmpty()) this.driverName = inDriverName;
            if (inBusNumber != null && !inBusNumber.isEmpty()) this.busNumber = inBusNumber;
            if (inRouteId != null && !inRouteId.isEmpty()) this.routeId = inRouteId;
            if (inRouteName != null && !inRouteName.isEmpty()) this.routeName = inRouteName;
            if (inRouteState != null && !inRouteState.isEmpty()) this.routeState = inRouteState;
            if (inCurrentStopName != null) this.currentStopName = inCurrentStopName;
            if (inAuthToken != null && !inAuthToken.isEmpty()) this.authToken = inAuthToken;
            if (inRefreshToken != null && !inRefreshToken.isEmpty()) this.refreshToken = inRefreshToken;
            if (inDatabaseUrl != null && !inDatabaseUrl.isEmpty()) this.databaseUrl = inDatabaseUrl;
            if (inApiKey != null && !inApiKey.isEmpty()) this.apiKey = inApiKey;
            if (inProjectId != null && !inProjectId.isEmpty()) this.projectId = inProjectId;

            saveToPreferences();
        } else {
            // Intent is null: service restarted by OS (START_STICKY)
            Log.d(TAG, "Intent is null (restarted by system), restoring state from preferences...");
            loadFromPreferences();
        }

        // Recreate notification with updated route info
        notification = createNotification();

        // Start foreground IMMEDIATELY to prevent ANR or OS termination
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "startForeground called successfully for bus: " + busNumber);
        } catch (Exception e) {
            Log.e(TAG, "Error starting foreground: " + e.getMessage(), e);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Start location updates if not already running
        if (!isServiceRunning) {
            startLocationUpdates();
            isServiceRunning = true;

            notificationHandler = new Handler(Looper.getMainLooper());
            notificationHandler.postDelayed(notificationRepinRunnable, NOTIFICATION_REPIN_INTERVAL_MS);
            Log.d(TAG, "Notification re-pin handler started");
        }

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (notificationManager != null) {
                NotificationChannel existing = notificationManager.getNotificationChannel(CHANNEL_ID);
                if (existing == null) {
                    NotificationChannel channel = new NotificationChannel(
                            CHANNEL_ID,
                            "Trip Tracking - Active",
                            NotificationManager.IMPORTANCE_LOW);
                    channel.setDescription("Continuous GPS tracking during trips - cannot be dismissed while active");
                    channel.setShowBadge(true);
                    channel.setSound(null, null);
                    channel.enableVibration(false);
                    channel.enableLights(true);
                    channel.setLightColor(Color.parseColor("#10B981"));
                    channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
                    notificationManager.createNotificationChannel(channel);
                    Log.d(TAG, "Notification channel created");
                }
            }
        }
    }

    private Notification createNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        notificationIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
                this,
                0,
                notificationIntent,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String title = "🚌 Trip Ongoing";
        String content;

        if (!routeName.isEmpty()) {
            if (!currentStopName.isEmpty()) {
                content = "Bus " + busNumber + " • Next: " + currentStopName;
            } else {
                content = "Bus " + busNumber + " • " + routeName;
            }
        } else if (!busNumber.isEmpty() && !busNumber.equals("unknown")) {
            content = "Bus " + busNumber + " • GPS tracking active";
        } else {
            content = "GPS tracking active • Live updates running";
        }

        String subText = "Live Tracking Active";

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(content)
                .setSubText(subText)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .setSilent(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setColorized(true)
                .setColor(Color.parseColor("#10B981"))
                .setShowWhen(true)
                .setUsesChronometer(true)
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
                .setAutoCancel(false)
                .build();

        notif.flags |= Notification.FLAG_NO_CLEAR;
        notif.flags |= Notification.FLAG_ONGOING_EVENT;
        notif.flags |= Notification.FLAG_FOREGROUND_SERVICE;
        notif.flags &= ~Notification.FLAG_AUTO_CANCEL;

        return notif;
    }

    public void updateNotification(String currentStop, String routeState) {
        this.currentStopName = currentStop != null ? currentStop : "";
        this.routeState = routeState != null ? routeState : "";
        saveToPreferences();

        notification = createNotification();

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        }
    }

    private void repinForegroundNotification() {
        if (isServiceRunning && notification != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to re-pin notification: " + e.getMessage());
            }
        }
    }

    private void startLocationUpdates() {
        Log.d(TAG, "Starting location updates with interval: " + UPDATE_INTERVAL_MS + "ms");

        try {
            LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, UPDATE_INTERVAL_MS)
                    .setMinUpdateIntervalMillis(1000)
                    .setMaxUpdateDelayMillis(3000)
                    .setWaitForAccurateLocation(false)
                    .build();

            fusedLocationClient.requestLocationUpdates(
                    locationRequest,
                    locationCallback,
                    Looper.getMainLooper());

            Log.d(TAG, "Location updates started successfully");
        } catch (SecurityException e) {
            Log.e(TAG, "Location permission denied: " + e.getMessage(), e);
        } catch (Exception e) {
            Log.e(TAG, "Error starting location updates: " + e.getMessage(), e);
        }
    }

    /**
     * Primary location broadcast method.
     * Uses background networkExecutor to ensure no UI or location lag.
     * Sends location directly to RTDB via HTTPS REST (guaranteed to update even when app is minimized/closed)
     * AND dual-writes to native FirebaseDatabase and Firestore.
     */
    private void sendLocationToFirebase(Location location) {
        if (busNumber == null || busNumber.isEmpty() || busNumber.equals("unknown")) {
            loadFromPreferences();
            if (busNumber == null || busNumber.isEmpty() || busNumber.equals("unknown")) {
                Log.w(TAG, "Bus number is not set, skipping location update");
                return;
            }
        }

        final double lat = location.getLatitude();
        final double lng = location.getLongitude();
        final long time = System.currentTimeMillis();
        final float accuracy = location.getAccuracy();
        final Float speed = location.hasSpeed() ? location.getSpeed() : null;
        final Float heading = location.hasBearing() ? location.getBearing() : null;

        if (networkExecutor == null || networkExecutor.isShutdown()) {
            networkExecutor = Executors.newSingleThreadExecutor();
        }

        networkExecutor.execute(() -> {
            try {
                // 1. Build JSON payload for RTDB
                JSONObject locationJson = new JSONObject();
                locationJson.put("latitude", lat);
                locationJson.put("longitude", lng);
                locationJson.put("timestamp", time);
                locationJson.put("driverId", driverId);
                locationJson.put("driverName", driverName);
                locationJson.put("busNumber", busNumber);
                locationJson.put("routeId", routeId);
                locationJson.put("routeName", routeName);
                locationJson.put("routeState", routeState);
                locationJson.put("accuracy", (double) accuracy);

                if (speed != null) {
                    locationJson.put("speed", (double) speed);
                }
                if (heading != null) {
                    locationJson.put("heading", (double) heading);
                }

                if (currentStopName != null && !currentStopName.isEmpty()) {
                    JSONObject stopData = new JSONObject();
                    stopData.put("name", currentStopName);
                    stopData.put("updatedAt", time);
                    locationJson.put("currentStop", stopData);
                }

                // 2. Direct HTTPS REST PUT to Firebase RTDB
                // This bypasses Android WebSocket background connection pausing
                sendRtdbRest(locationJson.toString(), lat, lng);

                // 3. Complementary dual-write to native FirebaseDatabase SDK
                sendRtdbNative(lat, lng, time, accuracy, speed, heading);

                // 4. Update Firestore liveBuses collection
                sendFirestoreUpdate(lat, lng, time, accuracy, speed, heading);

            } catch (Exception e) {
                Log.e(TAG, "Error in sendLocationToFirebase executor: " + e.getMessage(), e);
            }
        });
    }

    /**
     * Send direct HTTPS PUT to Firebase Realtime Database.
     * Guaranteed to work in Android background/minimized states without depending on WebSocket persistence.
     */
    private boolean sendRtdbRest(String jsonBody, double lat, double lng) {
        if (busNumber == null || busNumber.isEmpty()) return false;

        String baseUrl = databaseUrl;
        if (baseUrl == null || baseUrl.isEmpty()) {
            baseUrl = "https://kmt-tracker-62159-default-rtdb.firebaseio.com";
        }
        if (baseUrl.endsWith("/")) {
            baseUrl = baseUrl.substring(0, baseUrl.length() - 1);
        }

        String path = baseUrl + "/buses/" + busNumber + "/location.json";
        if (authToken != null && !authToken.isEmpty()) {
            path += "?auth=" + authToken;
        }

        HttpURLConnection conn = null;
        try {
            URL url = new URL(path);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PUT");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Accept", "application/json");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            byte[] outputBytes = jsonBody.getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = conn.getOutputStream()) {
                os.write(outputBytes);
            }

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                Log.d(TAG, "RTDB REST update successful (" + code + "): " + lat + ", " + lng + " for bus " + busNumber);
                return true;
            } else if (code == 401 || code == 403) {
                Log.w(TAG, "RTDB REST returned " + code + " (Auth expired), refreshing token...");
                if (refreshAuthToken()) {
                    // Retry once with newly refreshed token
                    String retryPath = baseUrl + "/buses/" + busNumber + "/location.json?auth=" + authToken;
                    return executeRestPut(retryPath, outputBytes);
                }
            } else {
                Log.w(TAG, "RTDB REST returned code: " + code);
            }
        } catch (Exception e) {
            Log.e(TAG, "RTDB REST connection error: " + e.getMessage());
        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
        return false;
    }

    private boolean executeRestPut(String targetUrl, byte[] body) {
        HttpURLConnection conn = null;
        try {
            URL url = new URL(targetUrl);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PUT");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(body);
            }

            int code = conn.getResponseCode();
            return code >= 200 && code < 300;
        } catch (Exception e) {
            Log.e(TAG, "Retry REST PUT failed: " + e.getMessage());
            return false;
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * Refreshes Firebase Auth ID token using Google Secure Token API.
     * Allows background service to stay authorized indefinitely even after app is closed.
     */
    private synchronized boolean refreshAuthToken() {
        if (refreshToken == null || refreshToken.isEmpty() || apiKey == null || apiKey.isEmpty()) {
            Log.w(TAG, "Cannot refresh auth token: missing refreshToken or apiKey");
            return false;
        }

        try {
            URL url = new URL("https://securetoken.googleapis.com/v1/token?key=" + apiKey);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            conn.setDoOutput(true);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);

            String body = "grant_type=refresh_token&refresh_token=" + URLEncoder.encode(refreshToken, "UTF-8");
            try (OutputStream os = conn.getOutputStream()) {
                os.write(body.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code == 200) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder();
                String line;
                while ((line = reader.readLine()) != null) {
                    sb.append(line);
                }
                reader.close();

                JSONObject json = new JSONObject(sb.toString());
                String newIdToken = json.optString("id_token", null);
                String newRefreshToken = json.optString("refresh_token", null);
                if (newIdToken != null && !newIdToken.isEmpty()) {
                    this.authToken = newIdToken;
                    if (newRefreshToken != null && !newRefreshToken.isEmpty()) {
                        this.refreshToken = newRefreshToken;
                    }
                    saveToPreferences();
                    Log.d(TAG, "Successfully refreshed Firebase Auth token in background service");
                    return true;
                }
            } else {
                Log.e(TAG, "SecureToken API returned error code: " + code);
            }
        } catch (Exception e) {
            Log.e(TAG, "Exception during token refresh: " + e.getMessage(), e);
        }
        return false;
    }

    /**
     * Dual-write to native FirebaseDatabase SDK.
     */
    private void sendRtdbNative(double lat, double lng, long time, float accuracy, Float speed, Float heading) {
        if (databaseRef == null || busNumber == null || busNumber.isEmpty()) return;

        try {
            try {
                FirebaseDatabase.getInstance(databaseUrl).goOnline();
            } catch (Exception ignored) {}

            Map<String, Object> locationData = new HashMap<>();
            locationData.put("latitude", lat);
            locationData.put("longitude", lng);
            locationData.put("timestamp", time);
            locationData.put("driverId", driverId);
            locationData.put("driverName", driverName);
            locationData.put("busNumber", busNumber);
            locationData.put("routeId", routeId);
            locationData.put("routeName", routeName);
            locationData.put("routeState", routeState);
            locationData.put("accuracy", accuracy);

            if (speed != null) locationData.put("speed", speed);
            if (heading != null) locationData.put("heading", heading);

            if (currentStopName != null && !currentStopName.isEmpty()) {
                Map<String, Object> currentStopData = new HashMap<>();
                currentStopData.put("name", currentStopName);
                currentStopData.put("updatedAt", time);
                locationData.put("currentStop", currentStopData);
            }

            databaseRef.child("buses").child(busNumber).child("location")
                    .setValue(locationData)
                    .addOnSuccessListener(aVoid -> Log.d(TAG, "Native RTDB SDK write successful"))
                    .addOnFailureListener(e -> Log.w(TAG, "Native RTDB SDK write skipped/failed (REST handles it): " + e.getMessage()));
        } catch (Exception e) {
            Log.w(TAG, "Native RTDB write error: " + e.getMessage());
        }
    }

    /**
     * Update Firestore liveBuses document for student app and admin dashboard.
     */
    private void sendFirestoreUpdate(double lat, double lng, long time, float accuracy, Float speed, Float heading) {
        if (routeId == null || routeId.isEmpty() || busNumber == null || busNumber.isEmpty()) {
            return;
        }

        String firestoreDocId = routeId + "_" + busNumber;

        // Native Firestore SDK write
        if (firestore != null) {
            try {
                Map<String, Object> liveBusData = new HashMap<>();
                liveBusData.put("busNumber", busNumber);
                liveBusData.put("routeId", routeId);
                liveBusData.put("routeName", routeName);
                liveBusData.put("driverId", driverId);
                liveBusData.put("driverName", driverName);
                liveBusData.put("latitude", lat);
                liveBusData.put("longitude", lng);
                liveBusData.put("routeState", routeState);
                liveBusData.put("timestamp", time);
                liveBusData.put("accuracy", accuracy);
                if (speed != null) liveBusData.put("speed", speed);
                if (heading != null) liveBusData.put("heading", heading);

                firestore.collection("liveBuses").document(firestoreDocId).set(liveBusData);
            } catch (Exception e) {
                Log.w(TAG, "Native firestore set error: " + e.getMessage());
            }
        }

        // Firestore REST update (if authToken is available)
        if (authToken != null && !authToken.isEmpty() && projectId != null && !projectId.isEmpty()) {
            sendFirestoreRest(firestoreDocId, lat, lng, time, accuracy, speed, heading);
        }
    }

    private void sendFirestoreRest(String docId, double lat, double lng, long time, float accuracy, Float speed, Float heading) {
        HttpURLConnection conn = null;
        try {
            String urlStr = "https://firestore.googleapis.com/v1/projects/" + projectId +
                    "/databases/(default)/documents/liveBuses/" + docId +
                    "?updateMask.fieldPaths=busNumber&updateMask.fieldPaths=routeId&updateMask.fieldPaths=routeName" +
                    "&updateMask.fieldPaths=driverId&updateMask.fieldPaths=driverName&updateMask.fieldPaths=routeState" +
                    "&updateMask.fieldPaths=latitude&updateMask.fieldPaths=longitude&updateMask.fieldPaths=timestamp" +
                    "&updateMask.fieldPaths=accuracy";

            if (speed != null) urlStr += "&updateMask.fieldPaths=speed";
            if (heading != null) urlStr += "&updateMask.fieldPaths=heading";

            JSONObject root = new JSONObject();
            JSONObject fields = new JSONObject();

            fields.put("busNumber", new JSONObject().put("stringValue", busNumber));
            fields.put("routeId", new JSONObject().put("stringValue", routeId));
            fields.put("routeName", new JSONObject().put("stringValue", routeName));
            fields.put("driverId", new JSONObject().put("stringValue", driverId));
            fields.put("driverName", new JSONObject().put("stringValue", driverName));
            fields.put("routeState", new JSONObject().put("stringValue", routeState));
            fields.put("latitude", new JSONObject().put("doubleValue", lat));
            fields.put("longitude", new JSONObject().put("doubleValue", lng));
            fields.put("timestamp", new JSONObject().put("integerValue", time));
            fields.put("accuracy", new JSONObject().put("doubleValue", (double) accuracy));
            if (speed != null) fields.put("speed", new JSONObject().put("doubleValue", (double) speed));
            if (heading != null) fields.put("heading", new JSONObject().put("doubleValue", (double) heading));

            root.put("fields", fields);

            URL url = new URL(urlStr);
            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("PATCH");
            conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
            conn.setRequestProperty("Authorization", "Bearer " + authToken);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(root.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            if (code >= 200 && code < 300) {
                Log.d(TAG, "Firestore REST update successful for " + docId);
            }
        } catch (Exception e) {
            // Non-critical, native Firestore or Cloud Function also covers this
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    /**
     * Stop foreground service internally when route finishes or user logs out.
     */
    public void stopForegroundServiceInternal() {
        Log.d(TAG, "stopForegroundServiceInternal called");
        isServiceRunning = false;

        clearPreferences();

        if (notificationHandler != null) {
            notificationHandler.removeCallbacks(notificationRepinRunnable);
            notificationHandler = null;
        }

        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            Log.d(TAG, "Location updates stopped");
        }

        if (firestore != null && routeId != null && !routeId.isEmpty() && busNumber != null && !busNumber.isEmpty()) {
            String firestoreDocId = routeId + "_" + busNumber;
            firestore.collection("liveBuses").document(firestoreDocId).delete()
                    .addOnSuccessListener(aVoid -> Log.d(TAG, "Live bus document deleted: " + firestoreDocId))
                    .addOnFailureListener(e -> Log.w(TAG, "Failed to delete live bus document: " + e.getMessage()));
        }

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "Wake lock released");
        }

        stopForeground(true);
        stopSelf();
    }

    private void saveToPreferences() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putString(KEY_BUS_NUMBER, busNumber)
                .putString(KEY_ROUTE_ID, routeId)
                .putString(KEY_ROUTE_NAME, routeName)
                .putString(KEY_DRIVER_ID, driverId)
                .putString(KEY_DRIVER_NAME, driverName)
                .putString(KEY_ROUTE_STATE, routeState)
                .putString(KEY_CURRENT_STOP, currentStopName)
                .putString(KEY_AUTH_TOKEN, authToken)
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .putString(KEY_DATABASE_URL, databaseUrl)
                .putString(KEY_API_KEY, apiKey)
                .putString(KEY_PROJECT_ID, projectId)
                .putBoolean(KEY_IS_TRACKING, true)
                .apply();
        Log.d(TAG, "Saved tracking configuration to SharedPreferences for bus: " + busNumber);
    }

    private void loadFromPreferences() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        if (prefs.getBoolean(KEY_IS_TRACKING, false)) {
            if (busNumber.isEmpty()) busNumber = prefs.getString(KEY_BUS_NUMBER, "");
            if (routeId.isEmpty()) routeId = prefs.getString(KEY_ROUTE_ID, "");
            if (routeName.isEmpty()) routeName = prefs.getString(KEY_ROUTE_NAME, "");
            if (driverId.isEmpty()) driverId = prefs.getString(KEY_DRIVER_ID, "");
            if (driverName.isEmpty()) driverName = prefs.getString(KEY_DRIVER_NAME, "");
            if (routeState.isEmpty()) routeState = prefs.getString(KEY_ROUTE_STATE, "in_progress");
            if (currentStopName.isEmpty()) currentStopName = prefs.getString(KEY_CURRENT_STOP, "");
            if (authToken.isEmpty()) authToken = prefs.getString(KEY_AUTH_TOKEN, "");
            if (refreshToken.isEmpty()) refreshToken = prefs.getString(KEY_REFRESH_TOKEN, "");
            if (databaseUrl.isEmpty()) databaseUrl = prefs.getString(KEY_DATABASE_URL, "https://kmt-tracker-62159-default-rtdb.firebaseio.com");
            if (apiKey.isEmpty()) apiKey = prefs.getString(KEY_API_KEY, "AIzaSyBncLpnXmd5KIvE8Sq4iKi1ug4bl4hxhqk");
            if (projectId.isEmpty()) projectId = prefs.getString(KEY_PROJECT_ID, "kmt-tracker-62159");

            Log.d(TAG, "Restored tracking configuration from SharedPreferences: bus=" + busNumber + ", route=" + routeId);
        }
    }

    private void clearPreferences() {
        SharedPreferences prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        prefs.edit()
                .putBoolean(KEY_IS_TRACKING, false)
                .putString(KEY_ROUTE_STATE, "completed")
                .apply();
        Log.d(TAG, "Cleared tracking configuration from SharedPreferences");
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy called");
        isServiceRunning = false;

        if (notificationHandler != null) {
            notificationHandler.removeCallbacks(notificationRepinRunnable);
            notificationHandler = null;
        }

        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }

        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }

        if (networkExecutor != null && !networkExecutor.isShutdown()) {
            networkExecutor.shutdown();
        }

        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    public void updateRouteInfo(String driverId, String driverName, String busNumber,
            String routeId, String routeName, String routeState) {
        this.driverId = driverId;
        this.driverName = driverName;
        this.busNumber = busNumber;
        this.routeId = routeId;
        this.routeName = routeName;
        this.routeState = routeState;
        saveToPreferences();
        Log.d(TAG, "Route info updated: busNumber=" + busNumber + ", routeState=" + routeState);
    }
}

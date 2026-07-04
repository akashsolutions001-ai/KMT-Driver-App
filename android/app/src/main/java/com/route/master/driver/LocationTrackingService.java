package com.route.master.driver;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
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

import java.util.HashMap;
import java.util.Map;

public class LocationTrackingService extends Service {
    private static final String TAG = "LocationTrackingService";
    private static final String CHANNEL_ID = "trip_tracking_channel";
    private static final int NOTIFICATION_ID = 1001;
    private static final long UPDATE_INTERVAL_MS = 2000; // 2 seconds
    private static final long NOTIFICATION_REPIN_INTERVAL_MS = 30000; // 30 seconds - re-pin notification to prevent
                                                                      // dismissal

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private DatabaseReference databaseRef;
    private FirebaseFirestore firestore;
    private PowerManager.WakeLock wakeLock;
    private NotificationManager notificationManager;

    // Route/Driver info
    private String driverId = "";
    private String driverName = "";
    private String busNumber = "";
    private String routeId = "";
    private String routeName = "";
    private String routeState = "";
    private String currentStopName = "";

    private boolean isServiceRunning = false;
    private Notification notification;
    private Handler notificationHandler;

    // Runnable to periodically re-pin the foreground notification
    // This ensures the notification stays visible even if user tries to swipe it
    // away
    private final Runnable notificationRepinRunnable = new Runnable() {
        @Override
        public void run() {
            if (isServiceRunning) {
                repinForegroundNotification();
                // Schedule next re-pin
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

        // Get notification manager
        notificationManager = getSystemService(NotificationManager.class);

        // Create notification channel FIRST
        createNotificationChannel();

        // Create notification IMMEDIATELY
        notification = createNotification();

        // Initialize location client
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);

        // Initialize Firebase
        try {
            if (FirebaseApp.getApps(this).isEmpty()) {
                FirebaseApp.initializeApp(this);
                Log.d(TAG, "Firebase initialized in service");
            }

            // Get database reference with explicit URL
            FirebaseDatabase database = FirebaseDatabase
                    .getInstance("https://college-bus-tracking-903e7-default-rtdb.firebaseio.com");
            databaseRef = database.getReference();
            Log.d(TAG, "Firebase database reference obtained");

            // Initialize Firestore for liveBuses collection
            firestore = FirebaseFirestore.getInstance();
            Log.d(TAG, "Firestore instance obtained");
        } catch (Exception e) {
            Log.e(TAG, "Firebase initialization error: " + e.getMessage(), e);
        }

        // Acquire wake lock to keep CPU running
        PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
        if (powerManager != null) {
            wakeLock = powerManager.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "RouteMaster::LocationWakeLock");
            wakeLock.acquire(10 * 60 * 60 * 1000L); // 10 hours max
            Log.d(TAG, "Wake lock acquired");
        }

        // Setup location callback
        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(@NonNull LocationResult locationResult) {
                Location location = locationResult.getLastLocation();
                if (location != null) {
                    Log.d(TAG, "Location received: " + location.getLatitude() + ", " + location.getLongitude());
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

        // Extract route/driver info from intent FIRST (needed for notification)
        if (intent != null) {
            driverId = intent.getStringExtra("driverId");
            driverName = intent.getStringExtra("driverName");
            busNumber = intent.getStringExtra("busNumber");
            routeId = intent.getStringExtra("routeId");
            routeName = intent.getStringExtra("routeName");
            routeState = intent.getStringExtra("routeState");
            currentStopName = intent.getStringExtra("currentStopName");

            if (driverId == null)
                driverId = "";
            if (driverName == null)
                driverName = "";
            if (busNumber == null)
                busNumber = "unknown";
            if (routeId == null)
                routeId = "";
            if (routeName == null)
                routeName = "";
            if (routeState == null)
                routeState = "";
            if (currentStopName == null)
                currentStopName = "";

            Log.d(TAG,
                    "Service config - busNumber: " + busNumber + ", routeId: " + routeId + ", driverId: " + driverId);
        }

        // Recreate notification with updated info
        notification = createNotification();

        // CRITICAL: Start foreground IMMEDIATELY - before anything else!
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "startForeground called successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error starting foreground: " + e.getMessage(), e);
            stopSelf();
            return START_NOT_STICKY;
        }

        // Start location updates if not already running
        if (!isServiceRunning) {
            startLocationUpdates();
            isServiceRunning = true;

            // Start the notification re-pinning handler to keep notification sticky
            notificationHandler = new Handler(Looper.getMainLooper());
            notificationHandler.postDelayed(notificationRepinRunnable, NOTIFICATION_REPIN_INTERVAL_MS);
            Log.d(TAG, "Notification re-pin handler started - notification will be re-pinned every " +
                    (NOTIFICATION_REPIN_INTERVAL_MS / 1000) + " seconds");
        }

        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // CRITICAL: Delete old channel first to reset cached settings
            // Android caches channel settings, so we need to delete and recreate
            if (notificationManager != null) {
                notificationManager.deleteNotificationChannel(CHANNEL_ID);
                Log.d(TAG, "Deleted old notification channel to reset settings");
            }

            // Use IMPORTANCE_HIGH for foreground service to ensure it's truly sticky
            // IMPORTANCE_LOW and DEFAULT can be dismissed on some OEM ROMs
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "Trip Tracking - Active",
                    NotificationManager.IMPORTANCE_HIGH); // HIGH = always visible, non-dismissible
            channel.setDescription("Required for GPS tracking during trips - cannot be dismissed while active");
            channel.setShowBadge(true);
            channel.setSound(null, null); // Silent but always visible
            channel.enableVibration(false);
            channel.enableLights(true);
            channel.setLightColor(Color.parseColor("#10B981")); // Green color
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            channel.setBypassDnd(true); // Bypass Do Not Disturb

            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
                Log.d(TAG, "Notification channel created with IMPORTANCE_HIGH for sticky behavior");
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

        // Build title and content like Swiggy/Zomato
        String title = "🚌 Trip Ongoing";
        String content;

        if (!routeName.isEmpty()) {
            if (!currentStopName.isEmpty()) {
                content = "Bus " + busNumber + " • Heading to: " + currentStopName;
            } else {
                content = "Bus " + busNumber + " • " + routeName;
            }
        } else if (!busNumber.isEmpty() && !busNumber.equals("unknown")) {
            content = "Bus " + busNumber + " • GPS tracking active";
        } else {
            content = "GPS tracking active • Students can see your location";
        }

        // Add subtext for more info
        String subText = "Tap to open app";

        Notification notif = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle(title)
                .setContentText(content)
                .setSubText(subText)
                .setSmallIcon(android.R.drawable.ic_menu_mylocation)
                .setContentIntent(pendingIntent)
                .setOngoing(true) // Cannot be swiped away - CRITICAL for sticky notification
                .setSilent(true) // No sound but always visible
                .setPriority(NotificationCompat.PRIORITY_HIGH) // HIGH priority = cannot be dismissed
                .setCategory(NotificationCompat.CATEGORY_SERVICE)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC) // Show on lock screen
                .setColorized(true)
                .setColor(Color.parseColor("#10B981")) // Green color like Swiggy
                .setShowWhen(true) // Show timestamp
                .setUsesChronometer(true) // Show running time like "12:34"
                .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE) // Show immediately
                .setAutoCancel(false) // Prevent auto-cancel
                .build();

        // Add ALL flags to make notification truly non-dismissible (like
        // Swiggy/Zomato/Hotspot)
        notif.flags |= Notification.FLAG_NO_CLEAR; // Cannot be cleared by user or "Clear All"
        notif.flags |= Notification.FLAG_ONGOING_EVENT; // Ongoing event, cannot be dismissed
        notif.flags |= Notification.FLAG_FOREGROUND_SERVICE; // Foreground service notification
        notif.flags &= ~Notification.FLAG_AUTO_CANCEL; // Ensure auto-cancel is disabled

        return notif;
    }

    /**
     * Update the notification with current stop info
     * Called when driver marks a stop as reached
     * 
     * CRITICAL: Use startForeground instead of notify to keep notification truly
     * sticky
     * Using notificationManager.notify() allows dismissal on some OEM ROMs
     */
    public void updateNotification(String currentStop, String routeState) {
        this.currentStopName = currentStop != null ? currentStop : "";
        this.routeState = routeState != null ? routeState : "";

        // Recreate and update notification
        notification = createNotification();

        // CRITICAL: Use startForeground to re-pin the notification
        // This prevents users from swiping it away on OEM ROMs like Samsung, Xiaomi,
        // etc.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            } else {
                startForeground(NOTIFICATION_ID, notification);
            }
            Log.d(TAG, "Notification re-pinned via startForeground - currentStop: " + currentStop);
        } catch (Exception e) {
            // Fallback to notify if startForeground fails (shouldn't happen)
            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
            Log.e(TAG, "startForeground failed, used notify fallback: " + e.getMessage());
        }
    }

    /**
     * Re-pin the foreground notification to prevent dismissal
     * Call this periodically or when the notification might have been swiped
     */
    private void repinForegroundNotification() {
        if (isServiceRunning && notification != null) {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
                Log.d(TAG, "Foreground notification re-pinned");
            } catch (Exception e) {
                Log.e(TAG, "Failed to re-pin notification: " + e.getMessage());
            }
        }
    }

    private void startLocationUpdates() {
        Log.d(TAG, "Starting location updates...");

        try {
            LocationRequest locationRequest = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,
                    UPDATE_INTERVAL_MS)
                    .setMinUpdateIntervalMillis(UPDATE_INTERVAL_MS / 2)
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

    private void sendLocationToFirebase(Location location) {
        if (databaseRef == null) {
            Log.e(TAG, "Database reference is null, cannot send location");
            return;
        }

        if (busNumber == null || busNumber.isEmpty() || busNumber.equals("unknown")) {
            Log.w(TAG, "Bus number is not set, skipping Firebase update");
            return;
        }

        try {
            Map<String, Object> locationData = new HashMap<>();
            locationData.put("latitude", location.getLatitude());
            locationData.put("longitude", location.getLongitude());
            locationData.put("timestamp", System.currentTimeMillis());
            locationData.put("driverId", driverId);
            locationData.put("driverName", driverName);
            locationData.put("busNumber", busNumber);
            locationData.put("routeId", routeId);
            locationData.put("routeName", routeName);
            locationData.put("routeState", routeState);
            locationData.put("accuracy", location.getAccuracy());

            if (location.hasSpeed()) {
                locationData.put("speed", location.getSpeed());
            }
            if (location.hasBearing()) {
                locationData.put("heading", location.getBearing());
            }

            // Add currentStop data if available (needed for student app notifications)
            if (currentStopName != null && !currentStopName.isEmpty()) {
                Map<String, Object> currentStopData = new HashMap<>();
                currentStopData.put("name", currentStopName);
                currentStopData.put("updatedAt", System.currentTimeMillis());
                locationData.put("currentStop", currentStopData);
            }

            // 1. Write to RTDB (for real-time location on map)
            String path = "buses/" + busNumber + "/location";
            Log.d(TAG, "Sending location to Firebase RTDB path: " + path);

            databaseRef.child("buses").child(busNumber).child("location")
                    .setValue(locationData)
                    .addOnSuccessListener(aVoid -> {
                        Log.d(TAG, "Location sent to RTDB successfully: " +
                                location.getLatitude() + ", " + location.getLongitude());
                    })
                    .addOnFailureListener(e -> {
                        Log.e(TAG, "Failed to send location to RTDB: " + e.getMessage(), e);
                    });

            // 2. Write to Firestore liveBuses collection (for notifications)
            if (firestore != null && routeId != null && !routeId.isEmpty()) {
                // liveBuses document structure expected by student app
                Map<String, Object> liveBusData = new HashMap<>();
                liveBusData.put("busNumber", busNumber);
                liveBusData.put("routeId", routeId);
                liveBusData.put("routeName", routeName);
                liveBusData.put("driverId", driverId);
                liveBusData.put("driverName", driverName);
                liveBusData.put("latitude", location.getLatitude());
                liveBusData.put("longitude", location.getLongitude());
                liveBusData.put("routeState", routeState);
                liveBusData.put("timestamp", System.currentTimeMillis());
                liveBusData.put("accuracy", location.getAccuracy());

                if (location.hasSpeed()) {
                    liveBusData.put("speed", location.getSpeed());
                }
                if (location.hasBearing()) {
                    liveBusData.put("heading", location.getBearing());
                }

                // Use routeId as document ID (consistent with student app queries)
                String firestoreDocId = routeId + "_" + busNumber;

                firestore.collection("liveBuses")
                        .document(firestoreDocId)
                        .set(liveBusData)
                        .addOnSuccessListener(aVoid -> {
                            Log.d(TAG, "Live bus data sent to Firestore successfully: " + firestoreDocId);
                        })
                        .addOnFailureListener(e -> {
                            Log.e(TAG, "Failed to send live bus data to Firestore: " + e.getMessage(), e);
                        });
            } else {
                Log.w(TAG, "Firestore not initialized or routeId missing, skipping liveBuses update");
            }

        } catch (Exception e) {
            Log.e(TAG, "Error sending location to Firebase: " + e.getMessage(), e);
        }
    }

    @Override
    public void onDestroy() {
        Log.d(TAG, "onDestroy called");
        isServiceRunning = false;

        // Stop notification re-pin handler
        if (notificationHandler != null) {
            notificationHandler.removeCallbacks(notificationRepinRunnable);
            notificationHandler = null;
            Log.d(TAG, "Notification re-pin handler stopped");
        }

        // Stop location updates
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
            Log.d(TAG, "Location updates stopped");
        }

        // Clean up Firestore liveBuses document
        if (firestore != null && routeId != null && !routeId.isEmpty() && busNumber != null) {
            String firestoreDocId = routeId + "_" + busNumber;
            firestore.collection("liveBuses")
                    .document(firestoreDocId)
                    .delete()
                    .addOnSuccessListener(aVoid -> {
                        Log.d(TAG, "Live bus document deleted from Firestore: " + firestoreDocId);
                    })
                    .addOnFailureListener(e -> {
                        Log.e(TAG, "Failed to delete live bus document: " + e.getMessage(), e);
                    });
        }

        // Release wake lock
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
            Log.d(TAG, "Wake lock released");
        }

        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    // Method to update route info while service is running
    public void updateRouteInfo(String driverId, String driverName, String busNumber,
            String routeId, String routeName, String routeState) {
        this.driverId = driverId;
        this.driverName = driverName;
        this.busNumber = busNumber;
        this.routeId = routeId;
        this.routeName = routeName;
        this.routeState = routeState;
        Log.d(TAG, "Route info updated: busNumber=" + busNumber + ", routeState=" + routeState);
    }
}

# College Bus Tracking - Cloud Functions (Gen 2)

Two Cloud Functions send FCM notifications to students based on Realtime Database changes.

## Prerequisites

- Node.js 18+
- Firebase CLI: `npm install -g firebase-tools`
- Firebase project linked: `firebase use college-bus-tracking-903e7` (or your project ID)

## RTDB structure (unchanged)

- `buses/{busNumber}/location/routeId`, `routeName`, `driverName`, `routeState`
- `buses/{busNumber}/routeState` (object with `state` and `updatedAt`)
- `buses/{busNumber}/stops/{stopId}/status`
- `students/{studentId}`: `routeId`, `stopId`, `fcmToken`

## Functions

### 1. `notifyStudentsRouteStarted`

- **Trigger:** `buses/{busNumber}/routeState` updated.
- **Condition:** New value is `state === "in_progress"` (and previous was not), to avoid duplicates.
- **Action:** Reads `buses/{busNumber}/location/routeId`, finds all students with matching `routeId`, sends one FCM notification per unique valid `fcmToken` (multicast, batched).

### 2. `notifyStudentsStopReached`

- **Trigger:** `buses/{busNumber}/stops/{stopId}/status` updated.
- **Condition:** New value is `"reached"` (and previous was not), to avoid duplicates.
- **Action:** Reads `buses/{busNumber}/location/routeId`, finds students with matching `routeId` **and** `stopId`, sends FCM via multicast (batched, empty tokens skipped).

## Install and deploy

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## Region

Functions are in `us-central1`. If your Realtime Database is in another region, change `region` in `index.js` and `setGlobalOptions` to match.

## Logging

Each function logs on every run:

- **TRIGGERED** – function ran (params + before/after).
- **SKIP** – condition not met (e.g. not `in_progress` / `reached` transition).
- **No routeId** / **No FCM tokens** – can’t send; fix data (see below).
- **sent= / failed=** – FCM result.

View logs: [Firebase Console](https://console.firebase.google.com) → Project → Functions → Logs, or `firebase functions:log`.

## Troubleshooting

**No logs at all**

1. Deploy: `firebase deploy --only functions` (project must be on Blaze plan).
2. Link project: `firebase use <project-id>` (create `.firebaserc` if needed).
3. Confirm driver app writes to the **same** Realtime Database (default URL; no custom `databaseURL` in app config).
4. In Firebase Console → Realtime Database, after starting a route check that `buses/<busNumber>/routeState` and `buses/<busNumber>/location/routeId` exist.

**Logs show “No FCM tokens”**

- Students must be in RTDB: `students/<studentId>` with `routeId`, `stopId`, and `fcmToken`.
- Student app must call FCM `getToken({ vapidKey })` and write that token to `students/<studentId>/fcmToken` (and set `routeId` and `stopId` for the route/stop they use).

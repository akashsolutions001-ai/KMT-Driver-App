/**
 * College Bus Tracking - Cloud Functions (Gen 2)
 *
 * RTDB structure (unchanged):
 *   buses/{busNumber}/location/routeId, routeName, driverName, routeState
 *   buses/{busNumber}/routeState
 *   buses/{busNumber}/stops/{stopId}/status
 *   students/{studentId}: { routeId, stopId, fcmToken }
 *
 * Two functions:
 *   1. When routeState -> "in_progress": notify all students on that route.
 *   2. When stops/{stopId}/status -> "reached": notify students on that route AND that stop.
 */

const { onValueUpdated } = require("firebase-functions/v2/database");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

admin.initializeApp();

const db = admin.database();
const messaging = admin.messaging();

// Run in same region as Realtime Database (e.g. us-central1)
setGlobalOptions({ region: "us-central1" });

/** Max FCM tokens per multicast call (FCM limit 500) */
const FCM_MULTICAST_BATCH_SIZE = 500;

/**
 * Get routeId from buses/{busNumber}/location/routeId.
 * @param {string} busNumber
 * @returns {Promise<string|null>}
 */
async function getRouteIdForBus(busNumber) {
  const ref = db.ref(`buses/${busNumber}/location/routeId`);
  const snap = await ref.once("value");
  return snap.exists() ? snap.val() : null;
}

/**
 * Load all students and return those matching the given predicate.
 * @param { (studentId: string, data: { routeId?: string, stopId?: string, fcmToken?: string }) => boolean } predicate
 * @returns {Promise<Array<{ studentId: string, fcmToken: string }>>}
 */
async function getStudentsByPredicate(predicate) {
  const studentsRef = db.ref("students");
  const snap = await studentsRef.once("value");
  if (!snap.exists()) return [];

  const result = [];
  snap.forEach((child) => {
    const studentId = child.key;
    const data = child.val() || {};
    const routeId = data.routeId;
    const stopId = data.stopId;
    const fcmToken = typeof data.fcmToken === "string" ? data.fcmToken.trim() : "";
    if (predicate(studentId, { routeId, stopId, fcmToken })) {
      if (fcmToken) result.push({ studentId, fcmToken });
    }
  });
  return result;
}

/**
 * Dedupe tokens and send FCM multicast in batches. Skips empty tokens.
 * @param {string[]} tokens
 * @param {import('firebase-admin').messaging.MulticastMessage} message
 */
async function sendMulticastBatched(tokens, message) {
  const valid = [...new Set(tokens)].filter((t) => t && t.length > 0);
  if (valid.length === 0) return { successCount: 0, failureCount: 0 };

  let successCount = 0;
  let failureCount = 0;

  for (let i = 0; i < valid.length; i += FCM_MULTICAST_BATCH_SIZE) {
    const batch = valid.slice(i, i + FCM_MULTICAST_BATCH_SIZE);
    const response = await messaging.sendEachForMulticast({
      ...message,
      tokens: batch,
    });
    successCount += response.successCount;
    failureCount += response.failureCount;
  }

  return { successCount, failureCount };
}

/**
 * 1) When buses/{busNumber}/routeState changes:
 *    - If "in_progress": send FCM once (dedupe via meta/routeStartNotified).
 *    - If "completed": clear routeStartNotified and all stops/*/notified for next trip.
 */
exports.notifyStudentsRouteStarted = onValueUpdated(
  {
    ref: "buses/{busNumber}/routeState",
    region: "us-central1",
  },
  async (event) => {
    const busNumber = event.params.busNumber;
    const beforeSnap = event.data.before.val();
    const afterSnap = event.data.after.val();
    const beforeState = beforeSnap && typeof beforeSnap === "object" ? beforeSnap.state : beforeSnap;
    const afterState = afterSnap && typeof afterSnap === "object" ? afterSnap.state : afterSnap;

    console.log(
      `[notifyStudentsRouteStarted] TRIGGERED busNumber=${busNumber} before=${JSON.stringify(beforeState)} after=${JSON.stringify(afterState)}`
    );

    try {
      if (!busNumber) {
        console.warn("[notifyStudentsRouteStarted] SKIP busNumber missing");
        return;
      }

      // Route completed: clear notification flags for next trip
      if (afterState === "completed") {
        const metaRef = db.ref(`buses/${busNumber}/meta/routeStartNotified`);
        const stopsRef = db.ref(`buses/${busNumber}/stops`);
        const stopsSnap = await stopsRef.once("value");
        const updates = { [`buses/${busNumber}/meta/routeStartNotified`]: null };
        if (stopsSnap.exists() && stopsSnap.val() && typeof stopsSnap.val() === "object") {
          Object.keys(stopsSnap.val()).forEach((stopId) => {
            updates[`buses/${busNumber}/stops/${stopId}/notified`] = null;
          });
        }
        await db.ref().update(updates);
        console.log(`[notifyStudentsRouteStarted] Cleared notified flags for bus ${busNumber}`);
        return;
      }

      // Only send when transitioning to in_progress (not on repeated writes)
      if (afterState !== "in_progress") return;
      if (beforeState === "in_progress") {
        console.log(`[notifyStudentsRouteStarted] SKIP (already in_progress) busNumber=${busNumber}`);
        return;
      }

      // Dedupe: only send once per trip
      const notifiedRef = db.ref(`buses/${busNumber}/meta/routeStartNotified`);
      const notifiedSnap = await notifiedRef.once("value");
      if (notifiedSnap.val() === true) {
        console.log(`[notifyStudentsRouteStarted] SKIP (already notified) busNumber=${busNumber}`);
        return;
      }

      const routeId = await getRouteIdForBus(busNumber);
      if (!routeId) {
        console.warn(`[notifyStudentsRouteStarted] No routeId for bus ${busNumber}`);
        return;
      }

      const students = await getStudentsByPredicate((_, { routeId: r }) => r === routeId);
      const tokens = students.map((s) => s.fcmToken).filter(Boolean);

      if (tokens.length === 0) {
        console.log(
          `[notifyStudentsRouteStarted] No FCM tokens for routeId=${routeId} (students on route: ${students.length})`
        );
        return;
      }

      const message = {
        notification: {
          title: "Bus route started",
          body: `Your bus (${busNumber}) has started the route. You can track it in the app.`,
        },
        data: {
          type: "route_started",
          busNumber: String(busNumber),
          routeId: String(routeId),
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      };

      const { successCount, failureCount } = await sendMulticastBatched(tokens, message);
      await notifiedRef.set(true);
      console.log(
        `[notifyStudentsRouteStarted] busNumber=${busNumber} routeId=${routeId} sent=${successCount} failed=${failureCount}`
      );
    } catch (err) {
      console.error("[notifyStudentsRouteStarted] ERROR", err);
      throw err;
    }
  }
);

/**
 * 2) When buses/{busNumber}/stops/{stopId}/status changes to "reached":
 *    - Send FCM once per stop (dedupe via stops/{stopId}/notified).
 */
exports.notifyStudentsStopReached = onValueUpdated(
  {
    ref: "buses/{busNumber}/stops/{stopId}/status",
    region: "us-central1",
  },
  async (event) => {
    const busNumber = event.params.busNumber;
    const stopId = event.params.stopId;
    const before = event.data.before.val();
    const after = event.data.after.val();

    console.log(
      `[notifyStudentsStopReached] TRIGGERED busNumber=${busNumber} stopId=${stopId} before=${JSON.stringify(before)} after=${JSON.stringify(after)}`
    );

    try {
      if (after !== "reached") {
        console.log(
          `[notifyStudentsStopReached] SKIP (status not reached) busNumber=${busNumber} stopId=${stopId}`
        );
        return;
      }

      if (!busNumber || !stopId) {
        console.warn("[notifyStudentsStopReached] SKIP busNumber or stopId missing");
        return;
      }

      // Dedupe: only send once per stop per trip (repeated driver writes hit this)
      const notifiedRef = db.ref(`buses/${busNumber}/stops/${stopId}/notified`);
      const notifiedSnap = await notifiedRef.once("value");
      if (notifiedSnap.val() === true) {
        console.log(
          `[notifyStudentsStopReached] SKIP (already notified) busNumber=${busNumber} stopId=${stopId}`
        );
        return;
      }

      const routeId = await getRouteIdForBus(busNumber);
      if (!routeId) {
        console.warn(`[notifyStudentsStopReached] No routeId for bus ${busNumber}`);
        return;
      }

      const students = await getStudentsByPredicate(
        (_, { routeId: r, stopId: s }) => r === routeId && s === stopId
      );
      const tokens = students.map((s) => s.fcmToken).filter(Boolean);

      if (tokens.length === 0) {
        console.log(
          `[notifyStudentsStopReached] No FCM tokens for routeId=${routeId} stopId=${stopId} (matching students: ${students.length})`
        );
        await notifiedRef.set(true);
        return;
      }

      const message = {
        notification: {
          title: "Bus at your stop",
          body: `Your bus (${busNumber}) has reached your stop.`,
        },
        data: {
          type: "stop_reached",
          busNumber: String(busNumber),
          routeId: String(routeId),
          stopId: String(stopId),
        },
        android: { priority: "high" },
        apns: { payload: { aps: { sound: "default" } } },
      };

      const { successCount, failureCount } = await sendMulticastBatched(tokens, message);
      await notifiedRef.set(true);
      console.log(
        `[notifyStudentsStopReached] busNumber=${busNumber} stopId=${stopId} sent=${successCount} failed=${failureCount}`
      );
    } catch (err) {
      console.error("[notifyStudentsStopReached] ERROR", err);
      throw err;
    }
  }
);

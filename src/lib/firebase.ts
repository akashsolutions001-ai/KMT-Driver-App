// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBncLpnXmd5KIvE8Sq4iKi1ug4bl4hxhqk",
  authDomain: "kmt-tracker-62159.firebaseapp.com",
  databaseURL: "https://kmt-tracker-62159-default-rtdb.firebaseio.com",
  projectId: "kmt-tracker-62159",
  storageBucket: "kmt-tracker-62159.firebasestorage.app",
  messagingSenderId: "1093592499284",
  appId: "1:1093592499284:web:49ae5a79ab71c8c69859c1",
  measurementId: "G-67LK25WLF3",
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Analytics (only in browser environment)
let analytics;
if (typeof window !== 'undefined') {
  analytics = getAnalytics(app);
}

// Initialize Realtime Database (for GPS location tracking)
const database = getDatabase(app);
console.log('[Firebase] 🔥 RTDB initialized. Database app name:', database.app.name, '| DB type:', database.type);

// Initialize Firestore (for driver, routes, stops, bus data)
const firestore = getFirestore(app);

// Initialize Auth
const auth = getAuth(app);

/** Web Push (VAPID) public key – use in Firebase Messaging getToken({ vapidKey }) for web push */
export const FCM_VAPID_KEY =
  "BGinVDFTAtjjdew-FgbaItj_umBrX7jVLhurnQjBQojPE_mRb5jCGlqh8zlmKNs4vUTnke9bVvvM-RzfvWDXIlA";

export { app, analytics, database, firestore, auth };

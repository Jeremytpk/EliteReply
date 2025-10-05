import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence } from "firebase/auth";
import { Platform } from 'react-native';
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// --- Jey's Update: Conditional Analytics Import ---
let getAnalytics, logEvent, isSupported;

// Only import analytics in web environment
if (Platform.OS === 'web') {
  try {
    const analyticsModule = require("firebase/analytics");
    getAnalytics = analyticsModule.getAnalytics;
    logEvent = analyticsModule.logEvent;
    isSupported = analyticsModule.isSupported;
  } catch (error) {
    console.warn('Firebase Analytics not available:', error);
  }
}
// --- End Jey's Update ---

const firebaseConfig = {
  apiKey: "AIzaSyDtPtoTbl_1NjlfYo0I86jGhuwfsCqzxyk",
  authDomain: "elitereply-bd74d.firebaseapp.com",
  databaseURL: "https://elitereply-bd74d-default-rtdb.firebaseio.com",
  projectId: "elitereply-bd74d",
  storageBucket: "elitereply-bd74d.firebasestorage.app",
  messagingSenderId: "796596006633",
  appId: "1:796596006633:web:ba173771ae4ed6fe6b0a78",
  measurementId: "G-BCHDBRD26Q", // This is your GA4 Measurement ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Conditionally set persistence based on platform using dynamic import()
if (Platform.OS !== 'web') {
  (async () => { // Use an async IIFE to await the dynamic import
    try {
      // Dynamic import for React Native persistence
      const { getReactNativePersistence } = await import("firebase/auth/react-native");
      setPersistence(auth, getReactNativePersistence(ReactNativeAsyncStorage))
        .catch((error) => {
          console.error("Error setting persistence for React Native:", error);
        });
    } catch (e) {
      console.warn("Could not load firebase/auth/react-native. This is expected on web, but indicates an issue on native if 'firebase' package is not correctly set up for React Native:", e);
    }
  })(); // Immediately invoked
}

const storage = getStorage(app);
const db = getFirestore(app);

// --- Jey's Update: Initialize Analytics conditionally ---
let analytics = null;

// Only initialize analytics on web platform
if (Platform.OS === 'web' && getAnalytics && isSupported) {
  (async () => {
    try {
      const supported = await isSupported();
      if (supported) {
        analytics = getAnalytics(app);
        console.log('Firebase Analytics initialized for web');
      } else {
        console.log('Firebase Analytics not supported in this environment');
      }
    } catch (error) {
      console.warn('Error initializing Analytics:', error);
    }
  })();
} else {
  console.log('Firebase Analytics disabled for React Native');
}
// --- End Jey's Update ---


// --- Jey's Update: Create safe analytics logging function ---
const safeLogEvent = (eventName, parameters = {}) => {
  try {
    if (Platform.OS === 'web' && analytics && typeof logEvent === 'function') {
      logEvent(analytics, eventName, parameters);
    } else {
      // For React Native, just log to console (you can replace this with other analytics services)
      console.log(`Analytics Event: ${eventName}`, parameters);
    }
  } catch (error) {
    console.warn('Error logging analytics event:', error);
    console.log(`Analytics Event (fallback): ${eventName}`, parameters);
  }
};

// --- Jey's Update: Export analytics and safe logEvent ---
export { auth, storage, db, app, analytics };
export { safeLogEvent as logEvent };
// --- End Jey's Update ---
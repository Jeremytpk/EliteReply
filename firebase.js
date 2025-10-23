import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { Platform } from 'react-native';
import AsyncStorage from "@react-native-async-storage/async-storage";

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

// Initialize auth with React Native persistence on native platforms.
// This uses initializeAuth + getReactNativePersistence(AsyncStorage) which is the recommended approach
// to ensure persistence is configured before auth state is resolved.
let auth;
if (Platform.OS === 'web') {
  // Web/platforms where initializeAuth is not applicable
  auth = getAuth(app);
} else {
  // Dynamically import react-native auth helpers at runtime. If the module is not present,
  // fall back to the standard getAuth(). This avoids Metro bundler failing on a static import
  // when the package path is not resolvable in the project.
  try {
    // eslint-disable-next-line no-undef
    (async () => {
      try {
        const rnAuth = await import('firebase/auth/react-native');
        if (rnAuth && typeof rnAuth.initializeAuth === 'function' && typeof rnAuth.getReactNativePersistence === 'function') {
          auth = rnAuth.initializeAuth(app, {
            persistence: rnAuth.getReactNativePersistence(AsyncStorage),
          });
          console.log('Firebase initializeAuth with React Native persistence configured');
          return;
        }
      } catch (errImport) {
        console.warn("Could not dynamically import 'firebase/auth/react-native':", errImport);
      }

      // Fallback if dynamic import failed or helpers not available
      auth = getAuth(app);
      console.log('Fallback to getAuth() (no React Native persistence configured)');
    })();
  } catch (outerErr) {
    console.warn('Unexpected error setting up React Native auth persistence, falling back to getAuth:', outerErr);
    auth = getAuth(app);
  }
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
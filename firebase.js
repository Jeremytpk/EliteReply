import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";

// Import AsyncStorage for React Native persistence
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// Conditional imports for web-specific persistence (only if building for web)
// It's safer to only import these if you explicitly know you are on web.
// For a typical Expo mobile app, you generally don't need these.
// If you are using Expo web, ensure these are available.
let indexedDBLocalPersistence, browserLocalPersistence;
if (typeof window !== 'undefined') {
  // Only import these if we are potentially in a web environment
  // This helps prevent bundling errors or unexpected behavior on native.
  try {
    const firebaseAuthWeb = require('firebase/auth');
    indexedDBLocalPersistence = firebaseAuthWeb.indexedDBLocalPersistence;
    browserLocalPersistence = firebaseAuthWeb.browserLocalPersistence;
  } catch (e) {
    console.warn("Web persistence modules not found or not applicable:", e);
  }
}


const firebaseConfig = {
  apiKey: "AIzaSyDtPtoTbl_1NjlfYo0I86jGhuwfsCqzxyk",
  authDomain: "elitereply-bd74d.firebaseapp.com",
  databaseURL: "https://elitereply-bd74d-default-rtdb.firebaseio.com",
  projectId: "elitereply-bd74d",
  storageBucket: "elitereply-bd74d.firebasestorage.app",
  messagingSenderId: "796596006633",
  appId: "1:796596006633:web:ba173771ae4ed6fe6b0a78",
  measurementId: "G-BCHDBRD26Q",
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

let auth; // Declare auth variable

// Use Platform.OS from react-native to reliably distinguish environments
import { Platform } from 'react-native';

if (Platform.OS === 'web') {
  // We are in a web environment (e.g., using `expo start --web`)
  // Ensure that indexedDBLocalPersistence and browserLocalPersistence are properly imported
  // and available in your web build configuration.
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence]
  });
} else {
  // We are in a React Native environment (iOS or Android app)
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(ReactNativeAsyncStorage)
  });
}

// Get other Firebase services
const storage = getStorage(app);
const db = getFirestore(app);

export { auth, storage, db };
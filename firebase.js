import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
// Import getAuth and setPersistence from the main firebase/auth module
import { getAuth, setPersistence } from "firebase/auth";
import { Platform } from 'react-native'; // Import Platform from react-native

// Import AsyncStorage for React Native persistence
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

// Firebase configuration
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

// Initialize Firebase App first
const app = initializeApp(firebaseConfig);

// Get the Auth instance
const auth = getAuth(app);

// Conditionally set persistence based on platform
if (Platform.OS !== 'web') {
  // This block is only for React Native (iOS or Android app)
  // We need to dynamically import getReactNativePersistence here
  // and wrap in try-catch to avoid web bundler errors if it tries to resolve this path.
  try {
    const { getReactNativePersistence } = require("firebase/auth/react-native");
    setPersistence(auth, getReactNativePersistence(ReactNativeAsyncStorage))
      .catch((error) => {
        console.error("Error setting persistence for React Native:", error);
      });
  } catch (e) {
    console.warn("Could not load firebase/auth/react-native. This is expected on web, but indicates an issue on native if 'firebase' package is not correctly set up for React Native:", e);
  }
}
// For web, getAuth automatically uses IndexedDB or localStorage, so no explicit setPersistence is needed here.

// Get other Firebase services
const storage = getStorage(app);
const db = getFirestore(app);

export { auth, storage, db, app }; // Export app as well, it can be useful

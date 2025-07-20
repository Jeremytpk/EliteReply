import { initializeApp } from "firebase/app";
import { getStorage } from "firebase/storage";
import { getFirestore } from "firebase/firestore";
import { getAuth, setPersistence } from "firebase/auth";
import { Platform } from 'react-native';
import ReactNativeAsyncStorage from "@react-native-async-storage/async-storage";

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

export { auth, storage, db, app };
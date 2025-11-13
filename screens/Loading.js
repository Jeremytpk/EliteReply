// screens/Loading.js
import React, { useEffect, useRef } from 'react';
import {
  View,
  StyleSheet,
  Image,
  ActivityIndicator,
  Text,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

const Loading = () => {
  const navigation = useNavigation();
  const scaleAnim = useRef(new Animated.Value(0)).current;
  // Jey's Addition: Track if navigation has already occurred to prevent race conditions.
  const isNavigating = useRef(false);

  useEffect(() => {
    // Logo animation sequence
    Animated.loop(
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.8, // Scale up
          duration: 900, // Duration for scaling up
          easing: Easing.elastic(2), // A spring-like easing effect
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8, // Scale down slightly
          duration: 900, // Duration for scaling down
          easing: Easing.elastic(1),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const redirectWithUser = async (user) => {
      // Jey's Safety Check: Prevent navigating multiple times
      if (isNavigating.current) return;

      if (user) {
        try {
          // Best-effort update lastLogin; do not block navigation
          updateDoc(doc(db, 'users', user.uid), {
            lastLogin: serverTimestamp(),
          }).catch(e => console.warn('Failed updating lastLogin:', e));

          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            let routeName = 'Dashboard';

            if (userData.isITSupport) routeName = 'ITDashboard';
            if (userData.isAdmin) routeName = 'AdminScreen';
            if (userData.isPartner) routeName = 'PartnerDashboard';

            // Small delay to let the animation play a bit
            setTimeout(() => {
              isNavigating.current = true; // Set flag right before navigation
              navigation.reset({ index: 0, routes: [{ name: routeName }] });
            }, 800);
            return;
          }
        } catch (err) {
          console.error('Error resolving user doc during startup redirect:', err);
          if (err.code === 'permission-denied') {
            Alert.alert('Oops !', "Impossible d'accéder aux données utilisateur. Veuillez contacter le support.");
          }
          // Continue to fallback if user data fails to load
        }
      }

      // Fallback: no user or user data resolution failed - redirect to Dashboard as guest
      if (!isNavigating.current) {
        isNavigating.current = true; // Set flag
        // Delay slightly less to speed up redirection for logged-out users (guest mode)
        setTimeout(() => navigation.replace('Dashboard'), 400); 
      }
    };

    // Jey's Refinement: Attach listener directly. It fires immediately with the persisted state.
    const unsub = auth.onAuthStateChanged(redirectWithUser);

    return () => {
      if (unsub) unsub();
    };
  }, []);

  return (
    <View style={styles.container}>
      <Animated.Image // Use Animated.Image
        source={require('../assets/images/logoVide.png')} // Changed to logoVide.png
        style={[styles.logo, { transform: [{ scale: scaleAnim }] }]} // Apply animated style
        resizeMode="contain"
      />
      <ActivityIndicator size="large" color="#0A8FDF" style={styles.spinner} />
      <Text style={styles.loadingText}>Chargement...</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  logo: {
    width: 200,
    height: 200,
    marginBottom: 30,
  },
  spinner: {
    marginBottom: 20,
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    fontWeight: '600',
  },
});

export default Loading;
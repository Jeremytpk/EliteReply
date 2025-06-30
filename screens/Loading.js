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
  // Platform is no longer needed as location logic is removed
} from 'react-native';
import { auth, db } from '../firebase';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
// * Location import removed *

const Loading = () => {
  const navigation = useNavigation();
  const scaleAnim = useRef(new Animated.Value(0)).current;

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

    const checkUserAndRedirect = async () => {
      const user = auth.currentUser;

      if (user) {
        try {
          // Update lastLogin timestamp without location data
          await updateDoc(doc(db, 'users', user.uid), {
            lastLogin: serverTimestamp(),
          });
        } catch (updateError) {
          console.error("Error updating lastLogin:", updateError);
          // Don't block navigation if just the timestamp update fails
        }

        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            let routeName = 'Dashboard';

            if (userData.isITSupport) routeName = 'ITDashboard';
            if (userData.isAdmin) routeName = 'AdminScreen';
            if (userData.isPartner) routeName = 'PartnerDashboard';

            navigation.reset({
              index: 0,
              routes: [{ name: routeName }],
            });
          } else {
            await auth.signOut();
            Alert.alert('Erreur', 'Compte non trouvé. Veuillez vous inscrire.');
            navigation.replace('Login');
          }
        } catch (err) {
          console.error("Erreur lors de la redirection de l'utilisateur:", err);
          if (err.code === "permission-denied") {
            Alert.alert(
              'Oops !',
              "Impossible d'accéder aux données utilisateur. Veuillez contacter le support."
            );
          }
          await auth.signOut();
          navigation.replace('Login');
        }
      } else {
        navigation.replace('Login');
      }
    };

    // Add a small delay before checking/redirecting to allow animation to start
    const redirectTimeout = setTimeout(() => {
        checkUserAndRedirect();
    }, 2000); // 2-second delay to see the animation

    return () => clearTimeout(redirectTimeout); // Clear timeout if component unmounts
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
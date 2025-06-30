import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Image
} from 'react-native';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location'; // Import expo-location

const Signup = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // New state for location data
  const [locationData, setLocationData] = useState(null);

  const handleSignup = async () => {
    if (!name || !email || !password || !confirmPassword) {
      setError('Veuillez remplir tous les champs');
      return;
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Veuillez entrer un email valide');
      return;
    }

    if (password.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Request location permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Permission d\'accès à la localisation refusée.');
        setLoading(false);
        return;
      }

      // 2. Get current location
      let currentLocation = await Location.getCurrentPositionAsync({});
      console.log('User Location:', currentLocation);

      // 3. Reverse Geocode (replace with your chosen API)
      // This is a placeholder. You need to replace this with a call to a reverse geocoding API.
      // Example using a hypothetical API:
      // const response = await fetch(`YOUR_REVERSE_GEOCODING_API_ENDPOINT?lat=${currentLocation.coords.latitude}&lon=${currentLocation.coords.longitude}&apiKey=YOUR_API_KEY`);
      // const geoData = await response.json();
      //
      // For this example, let's simulate some data or use Expo's built-in reverse geocoding (less detailed)
      let geocodedAddress = await Location.reverseGeocodeAsync({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
      });

      let userCountry = '';
      let userCity = '';
      let userContinent = ''; // Most reverse geocoding APIs don't directly return continent, you might need a lookup table or another API.

      if (geocodedAddress && geocodedAddress.length > 0) {
        userCountry = geocodedAddress[0].country || '';
        userCity = geocodedAddress[0].city || geocodedAddress[0].subregion || ''; // Fallback for city
        // For continent, you would typically need a separate service or a mapping.
        // For demonstration, let's just leave it empty or add a placeholder.
        userContinent = 'Unknown'; // Placeholder
      }

      setLocationData({
        latitude: currentLocation.coords.latitude,
        longitude: currentLocation.coords.longitude,
        country: userCountry,
        city: userCity,
        continent: userContinent,
      });

      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      const userData = {
        uid: userCredential.user.uid,
        name,
        email,
        isITSupport: email.endsWith('@elitereply.com'),
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role: email.endsWith('@elitereply.com') ? 'support' : 'user',
        profileCompleted: false,
        location: { // Add location data here
          latitude: currentLocation.coords.latitude,
          longitude: currentLocation.coords.longitude,
          country: userCountry,
          city: userCity,
          continent: userContinent,
        }
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), userData);

      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' }],
      });
    } catch (error) {
      handleSignupError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignupError = (error) => {
    let errorMessage = "Erreur d'inscription";
    switch (error.code) {
      case 'auth/email-already-in-use':
        errorMessage = "Cet email est déjà utilisé";
        break;
      case 'auth/invalid-email':
        errorMessage = "Email invalide";
        break;
      case 'auth/weak-password':
        errorMessage = "Mot de passe trop faible (6 caractères minimum)";
        break;
      case 'auth/network-request-failed':
        errorMessage = "Problème de connexion. Vérifiez votre internet";
        break;
      case 'auth/operation-not-allowed':
        errorMessage = "L'inscription par email/mot de passe n'est pas activée";
        break;
      default:
        errorMessage = error.message || "Erreur inconnue";
    }
    setError(errorMessage);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <View style={styles.inner}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
        </TouchableOpacity>

        <View>
          <Image source={require('../assets/images/logoVide.png')} style={styles.logo} />
        </View>

        <Text style={styles.title}>Créer un compte</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TextInput
          style={styles.input}
          placeholder="Nom complet"
          value={name}
          onChangeText={setName}
          editable={!loading}
          autoCapitalize="words"
        />

        <TextInput
          style={styles.input}
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Mot de passe (6+ caractères)"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          editable={!loading}
        />

        <TextInput
          style={styles.input}
          placeholder="Confirmer le mot de passe"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          editable={!loading}
        />

        <TouchableOpacity
          style={[styles.button, loading && styles.buttonDisabled]}
          onPress={handleSignup}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonText}>S'inscrire</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.loginLink}
          onPress={() => navigation.navigate('Login')}
          disabled={loading}
        >
          <Text style={styles.loginText}>
            Déjà un compte? <Text style={styles.loginLinkText}>Se connecter</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    marginTop: 20
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  backButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 30,
    left: 20,
    zIndex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C2C2C',
    marginBottom: 24,
    textAlign: 'left',
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    fontSize: 16,
  },
  button: {
    backgroundColor: '#2a8fd7',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    backgroundColor: '#B0B0B0',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loginLink: {
    marginTop: 24,
    alignItems: 'center',
  },
  loginText: {
    color: '#6B7280',
    fontSize: 14,
  },
  loginLinkText: {
    color: '#2a8fd7',
    fontWeight: '600',
  },
  errorText: {
    color: '#FF3B30',
    marginBottom: 16,
    textAlign: 'center',
  },
  logo: {
    width: 150,
    height: 150,
    alignSelf: 'flex-start',
    resizeMode: 'contain',
    borderRadius: 10,
    marginBottom: 20,
    marginTop: 30
  },
});

export default Signup;
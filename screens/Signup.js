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
  Image // Import Image
} from 'react-native';
import { auth, db } from '../firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere
// import * as Location from 'expo-location'; // Removed: No location required

// --- NEW: Import your custom icons ---
const EYE_OUTLINE_ICON = require('../assets/icons/eye_outline.png'); // For open eye
const EYE_HIDE_ICON = require('../assets/icons/eye_hide.png'); // For hide eye
const BACK_CIRCLE_ICON = require('../assets/icons/back_circle.png'); // For back button
// --- END NEW IMPORTS ---

const Signup = ({ navigation }) => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // New state to toggle password visibility
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Removed: No location data needed

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
      // Only create user, no location logic
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      const userData = {
        uid: userCredential.user.uid,
        name,
        email,
        isITSupport: email.endsWith('@elitereply.com'),
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
        role: email.endsWith('@elitereply.com') ? 'support' : 'user',
        profileCompleted: false
        // Removed: location field
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
          {/* --- MODIFIED: Use custom image for back arrow --- */}
          <Image source={BACK_CIRCLE_ICON} style={styles.customBackButtonIcon} />
          {/* --- END MODIFIED --- */}
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

        {/* Password Input with Show/Hide Icon */}
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Mot de passe (6+ caractères)"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword} // Toggle based on state
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowPassword(!showPassword)} // Toggle showPassword state
          >
            {/* --- MODIFIED: Use custom image for password eye icon --- */}
            <Image
              source={showPassword ? EYE_HIDE_ICON : EYE_OUTLINE_ICON} // Change icon based on state
              style={styles.customEyeIcon}
            />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        </View>

        {/* Confirm Password Input with Show/Hide Icon */}
        <View style={styles.passwordInputContainer}>
          <TextInput
            style={styles.passwordInput}
            placeholder="Confirmer le mot de passe"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showConfirmPassword} // Toggle based on state
            editable={!loading}
          />
          <TouchableOpacity
            style={styles.eyeIcon}
            onPress={() => setShowConfirmPassword(!showConfirmPassword)} // Toggle showConfirmPassword state
          >
            {/* --- MODIFIED: Use custom image for confirm password eye icon --- */}
            <Image
              source={showConfirmPassword ? EYE_HIDE_ICON : EYE_OUTLINE_ICON} // Change icon based on state
              style={styles.customEyeIcon}
            />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        </View>

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
    backgroundColor: 'white',
    paddingTop: 40,
    paddingBottom: 25,

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
  // --- NEW STYLE for custom back button icon ---
  customBackButtonIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#2C2C2C', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
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
    marginBottom: 16, // This will still apply to other inputs
    fontSize: 16,
  },
  // New styles for password input with icon
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    marginBottom: 16,
    paddingRight: 10, // Add padding for the icon
  },
  passwordInput: {
    flex: 1, // Take up available space
    padding: 16,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 5,
  },
  // --- NEW STYLE for custom eye icons ---
  customEyeIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#6B7280', // Match original Ionicons color
  },
  // End new password styles
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
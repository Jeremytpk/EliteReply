import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Image,
  ActivityIndicator,
  ScrollView,
  Alert,
  Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase'; // Assuming 'firebase.js' is your config file
import { signInWithEmailAndPassword, onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';

// --- Jey's Addition: Import analytics and logEvent ---
import { analytics, logEvent } from '../firebase'; // Ensure these are exported from your firebase.js
// --- End Jey's Addition ---

const EYE_OUTLINE_ICON = require('../assets/icons/eye_outline.png');
const EYE_HIDE_ICON = require('../assets/icons/eye_hide.png');

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const [secureTextEntry, setSecureTextEntry] = useState(true);
  const navigation = useNavigation();

  // Check auth state on component mount
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // User is already logged in, redirect to Loading page
        navigation.reset({
          index: 0,
          routes: [{ name: 'Loading' }],
        });
        // --- Jey's Addition: Log automatic redirect on already logged in ---
        logEvent(analytics, 'auto_login_redirect', {
            user_id: user.uid,
            email: user.email // Be cautious with PII, but for internal analytics, often acceptable
        });
        // --- End Jey's Addition ---
      }
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Veuillez remplir tous les champs');
      // --- Jey's Addition: Log validation error ---
      logEvent(analytics, 'login_validation_error', {
          error_type: 'missing_fields',
          email_provided: !!email.trim(),
          password_provided: !!password.trim()
      });
      // --- End Jey's Addition ---
      return;
    }

    if (!email.includes('@')) {
      setError('Veuillez entrer une adresse email valide');
      // --- Jey's Addition: Log validation error ---
      logEvent(analytics, 'login_validation_error', {
          error_type: 'invalid_email_format',
          email_attempted: email
      });
      // --- End Jey's Addition ---
      return;
    }

    setLoading(true);
    setError('');

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      // On successful login, navigate to the Loading screen
      navigation.reset({
        index: 0,
        routes: [{ name: 'Loading' }],
      });

      // --- Jey's Addition: Log successful login event ---
      logEvent(analytics, 'login', {
          method: 'email_and_password',
          user_id: userCredential.user.uid,
          email: userCredential.user.email // Again, be cautious with PII
      });
      // --- End Jey's Addition ---

    } catch (err) {
      handleLoginError(err);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = () => {
    if (!email.trim()) {
      setError('Veuillez entrer votre adresse email pour réinitialiser le mot de passe');
      // --- Jey's Addition: Log password reset validation error ---
      logEvent(analytics, 'password_reset_validation_error', {
          error_type: 'missing_email'
      });
      // --- End Jey's Addition ---
      return;
    }

    if (!email.includes('@')) {
      setError('Veuillez entrer une adresse email valide');
      // --- Jey's Addition: Log password reset validation error ---
      logEvent(analytics, 'password_reset_validation_error', {
          error_type: 'invalid_email_format',
          email_attempted: email
      });
      // --- End Jey's Addition ---
      return;
    }

    // Navigate to PasswordReset screen, passing the email
    navigation.navigate('PasswordReset', { email: email });
  };

  const handleLoginError = (error) => {
    let errorMessage = 'Email ou mot de passe incorrect';
    let errorType = 'unknown_error'; // Default error type for analytics
    switch (error.code) {
      case 'auth/invalid-email':
        errorMessage = 'Format d\'email invalide';
        errorType = 'invalid_email';
        break;
      case 'auth/user-not-found':
        errorMessage = 'Aucun compte trouvé avec cet email';
        errorType = 'user_not_found';
        break;
      case 'auth/wrong-password':
        errorMessage = 'Mot de passe incorrect';
        errorType = 'wrong_password';
        break;
      case 'auth/too-many-requests':
        errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard';
        errorType = 'too_many_requests';
        break;
      case 'auth/network-request-failed':
        errorMessage = 'Problème de connexion internet';
        errorType = 'network_issue';
        break;
      case 'auth/user-disabled':
        errorMessage = 'Ce compte a été désactivé';
        errorType = 'user_disabled';
        break;
      default:
        errorType = error.code || 'unknown_firebase_error';
    }
    setError(errorMessage);

    // --- Jey's Addition: Log login failure event ---
    logEvent(analytics, 'login_failed', {
        method: 'email_and_password',
        error_code: error.code,
        error_type: errorType,
        error_message: errorMessage,
        email_attempted: email // Log the attempted email (be mindful of PII policies)
    });
    // --- End Jey's Addition ---
  };

  const toggleSecureEntry = () => {
    setSecureTextEntry(!secureTextEntry);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.logoContainer}>
          <Image
            source={require('../assets/images/logoVide.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.header}>
          <Text style={styles.title}>Connexion</Text>
          <Text style={styles.subtitle}>Connectez-vous à votre compte</Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Email</Text>
          <TextInput
            style={styles.input}
            placeholder="exemple@email.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading && !resetLoading}
          />
        </View>

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Mot de passe</Text>
          <View style={styles.passwordInputContainer}>
            <TextInput
              style={styles.passwordInput}
              placeholder="••••••••"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={secureTextEntry}
              editable={!loading && !resetLoading}
            />
            <TouchableOpacity
              style={styles.eyeIcon}
              onPress={toggleSecureEntry}
              disabled={loading || resetLoading}
            >
              <Image
                source={secureTextEntry ? EYE_HIDE_ICON : EYE_OUTLINE_ICON}
                style={styles.customEyeIcon}
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.forgotPasswordContainer}
          onPress={handlePasswordReset}
          disabled={loading || resetLoading}
        >
          {resetLoading ? (
            <ActivityIndicator color="#0A8FDF" size="small" />
          ) : (
            <Text style={styles.forgotPasswordText}>Mot de passe oublié?</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.loginButton, (loading || resetLoading) && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={loading || resetLoading}
        >
          {loading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.buttonText}>Se connecter</Text>
          )}
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Pas encore de compte?</Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('Signup')}
            disabled={loading || resetLoading}
          >
            <Text style={styles.signupLink}>Créer un compte</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    bottom: 10,
  },
  scrollContainer: {
    paddingHorizontal: 24,
    paddingBottom: 10,
    paddingTop: 10,

  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
    marginTop: 10,
    top: 30

  },
  logo: {
    width: 180,
    height: 180,
    borderRadius: 20,
    top: 60,
  },
  header: {
    marginBottom: 32,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
    marginTop: 70,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
  },
  errorContainer: {
    backgroundColor: '#FEE2E2',
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
  },
  errorText: {
    color: '#DC2626',
    textAlign: 'center',
    fontSize: 14,
  },
  inputContainer: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#475569',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
  },
  passwordInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
  },
  passwordInput: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: '#1E293B',
  },
  eyeIcon: {
    padding: 16,
  },
  customEyeIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#64748b',
  },
  forgotPasswordContainer: {
    alignItems: 'flex-end',
    marginBottom: 16,
    minHeight: 20,
  },
  forgotPasswordText: {
    color: '#0A8FDF',
    fontSize: 14,
    fontWeight: '500',
  },
  loginButton: {
    backgroundColor: '#0A8FDF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginTop: 16,
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#93C5FD',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 40
  },
  footerText: {
    color: '#64748B',
    marginRight: 4,
  },
  signupLink: {
    color: '#0A8FDF',
    fontWeight: '600',
  },
});

export default Login;
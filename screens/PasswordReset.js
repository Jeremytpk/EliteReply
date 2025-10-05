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
  ScrollView,
  Platform,
  Image
} from 'react-native';
import { auth } from '../firebase';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useNavigation } from '@react-navigation/native';

// --- Jey's Addition: Import analytics and logEvent ---
import { analytics, logEvent } from '../firebase';
// --- End Jey's Addition ---

const PasswordReset = ({ route }) => {
  const { email: initialEmail } = route.params || {};
  const [email, setEmail] = useState(initialEmail || '');
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState('');
  const navigation = useNavigation();

  const handleSendResetEmail = async () => {
    if (!email.trim()) {
      setError('Veuillez entrer votre adresse email');
      // --- Jey's Addition: Log validation error ---
      logEvent(analytics, 'password_reset_validation_error', {
          error_type: 'missing_email'
      });
      // --- End Jey's Addition ---
      return;
    }

    if (!email.includes('@')) {
      setError('Veuillez entrer une adresse email valide');
      // --- Jey's Addition: Log validation error ---
      logEvent(analytics, 'password_reset_validation_error', {
          error_type: 'invalid_email_format',
          email_attempted: email
      });
      // --- End Jey's Addition ---
      return;
    }

    setResetLoading(true);
    setError('');

    try {
      await sendPasswordResetEmail(auth, email);
      
      Alert.alert(
        'Email envoyé',
        `Un email de réinitialisation a été envoyé à ${email}. Vérifiez votre boîte de réception et suivez les instructions.`,
        [{ 
          text: 'OK', 
          onPress: () => navigation.goBack() 
        }]
      );

      // --- Jey's Addition: Log successful password reset request ---
      logEvent(analytics, 'password_reset_email_sent', {
          email: email
      });
      // --- End Jey's Addition ---

    } catch (err) {
      let errorMessage = 'Erreur lors de l\'envoi de l\'email de réinitialisation';
      let errorType = 'unknown_error';
      
      switch (err.code) {
        case 'auth/user-not-found':
          errorMessage = 'Aucun compte trouvé avec cet email';
          errorType = 'user_not_found';
          break;
        case 'auth/invalid-email':
          errorMessage = 'Format d\'email invalide';
          errorType = 'invalid_email';
          break;
        case 'auth/too-many-requests':
          errorMessage = 'Trop de tentatives. Veuillez réessayer plus tard';
          errorType = 'too_many_requests';
          break;
        case 'auth/network-request-failed':
          errorMessage = 'Problème de connexion internet';
          errorType = 'network_issue';
          break;
        default:
          errorType = err.code || 'unknown_firebase_error';
      }
      
      setError(errorMessage);

      // --- Jey's Addition: Log password reset failure ---
      logEvent(analytics, 'password_reset_failed', {
          error_code: err.code,
          error_type: errorType,
          error_message: errorMessage,
          email_attempted: email
      });
      // --- End Jey's Addition ---
    } finally {
      setResetLoading(false);
    }
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
          <Text style={styles.title}>Réinitialiser le mot de passe</Text>
          <Text style={styles.subtitle}>
            Entrez votre adresse email pour recevoir un lien de réinitialisation
          </Text>
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
            editable={!resetLoading}
          />
        </View>

        <TouchableOpacity
          style={[styles.resetButton, resetLoading && styles.buttonDisabled]}
          onPress={handleSendResetEmail}
          disabled={resetLoading}
        >
          {resetLoading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Text style={styles.resetButtonText}>Envoyer l'email de réinitialisation</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backContainer}
          onPress={() => navigation.goBack()}
          disabled={resetLoading}
        >
          <Text style={styles.backToLogin}>Retour à la connexion</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
    paddingHorizontal: 20,
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
    marginBottom: 30,
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
  resetButton: {
    backgroundColor: '#0A8FDF',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginBottom: 24,
  },
  buttonDisabled: {
    backgroundColor: '#93C5FD',
  },
  resetButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  backContainer: {
    alignItems: 'center',
    marginTop: 16,
  },
  backToLogin: {
    color: '#0A8FDF',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default PasswordReset;

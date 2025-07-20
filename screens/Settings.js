import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
  ScrollView,
  Modal, // Import Modal
  TextInput, // Import TextInput
  KeyboardAvoidingView, // Import KeyboardAvoidingView
  Platform // Import Platform
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { signOut, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth'; // Import updatePassword and reauthenticateWithCredential, EmailAuthProvider
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';

// --- NEW: Import your custom icons ---
const USER_ICON = require('../assets/icons/user.png');
const DISCOUNT_ICON = require('../assets/icons/discount.png');
const APPOINTMENT_ICON = require('../assets/icons/appointment.png');
const LOCK_ICON = require('../assets/icons/lock.png');
const LOGOUT_ICON = require('../assets/icons/logout.png');
// --- END NEW IMPORTS ---

const Paramètres = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  // --- NEW: States for Change Password Modal ---
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [isPasswordChanging, setIsPasswordChanging] = useState(false);
  // --- END NEW STATES ---

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserData({
              name: userDoc.data().name,
              email: user.email,
              photoURL: user.photoURL || userDoc.data().photoURL,
              role: userDoc.data().role,
              department: userDoc.data().department,
              position: userDoc.data().position
            });
          } else {
            console.warn("No user data found in Firestore for UID:", user.uid);
            setUserData(null);
          }
        } else {
          setUserData(null);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        Alert.alert("Erreur", "Impossible de charger les données utilisateur. Veuillez réessayer.");
      } finally {
        setLoading(false);
      }
    };

    if (isFocused) {
      fetchUserData();
    }
  }, [isFocused]);

  const handleLogout = async () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Oui',
          onPress: async () => {
            try {
              console.log("Attempting to sign out...");
              await signOut(auth);
              console.log("Sign out successful!");
              Alert.alert(
                'Déconnexion réussie',
                'Vous avez été déconnecté avec succès',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    }),
                  },
                ],
                { cancelable: false }
              );
            } catch (error) {
              console.error("Erreur de déconnexion:", error.code, error.message, error);
              Alert.alert(
                'Erreur de Déconnexion',
                `Une erreur est survenue lors de la déconnexion: ${error.message}`
              );
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  // --- NEW: Handle Password Change ---
  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword || !confirmNewPassword) {
      Alert.alert('Champs requis', 'Veuillez remplir tous les champs de mot de passe.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Mots de passe non identiques', 'Le nouveau mot de passe et sa confirmation ne correspondent pas.');
      return;
    }
    if (newPassword.length < 6) {
      Alert.alert('Mot de passe faible', 'Le nouveau mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    setIsPasswordChanging(true);
    const user = auth.currentUser;

    if (!user || !user.email) {
      Alert.alert('Erreur', 'Utilisateur non connecté ou email manquant.');
      setIsPasswordChanging(false);
      return;
    }

    try {
      // Re-authenticate user before changing password for security
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);
      console.log("User re-authenticated successfully.");

      await updatePassword(user, newPassword);
      Alert.alert('Succès', 'Votre mot de passe a été modifié avec succès.');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
    } catch (error) {
      console.error("Error changing password:", error);
      let errorMessage = 'Une erreur est survenue lors de la modification du mot de passe.';
      if (error.code === 'auth/wrong-password') {
        errorMessage = 'Le mot de passe actuel est incorrect.';
      } else if (error.code === 'auth/weak-password') {
        errorMessage = 'Le nouveau mot de passe est trop faible.';
      } else if (error.code === 'auth/requires-recent-login') {
        errorMessage = 'Veuillez vous reconnecter pour changer votre mot de passe (session expirée).';
        // Optionally, force re-login here
        // signOut(auth).then(() => navigation.reset({ index: 0, routes: [{ name: 'Login' }] }));
      }
      Alert.alert('Erreur', errorMessage);
    } finally {
      setIsPasswordChanging(false);
    }
  };
  // --- END NEW: Handle Password Change ---

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Enhanced Profile Section */}
      <View style={styles.profileCard}>
        {userData?.photoURL ? (
          <Image
            source={{ uri: userData.photoURL }}
            style={styles.profileImage}
          />
        ) : (
          <View style={styles.profileImagePlaceholder}>
            <Ionicons name="person" size={70} color="#E0F2F7" />
          </View>
        )}

        <View style={styles.userInfoContainer}>
          <Text style={styles.userName}>{userData?.name || 'Utilisateur Inconnu'}</Text>
          {userData?.email && <Text style={styles.userEmail}>{userData.email}</Text>}

          {(userData?.role === 'ITSupport' || userData?.role === 'Admin') && (
            <View style={styles.roleDetailsContainer}>
              {userData?.department && (
                <Text style={styles.userDetail}>
                  <Ionicons name="briefcase-outline" size={14} color="#6B7280" /> {userData.department}
                </Text>
              )}
              {userData?.position && (
                <Text style={styles.userDetail}>
                  <Ionicons name="cube-outline" size={14} color="#6B7280" /> {userData.position}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Account Settings Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Mon Compte</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('EditProfile', { userData: userData })}
        >
          <View style={styles.settingItemContent}>
            {/* --- MODIFIED: Use custom image for Modifier le profil --- */}
            <Image source={USER_ICON} style={[styles.settingIconCustom, { tintColor: '#0a8fdf' }]} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.settingText}>Modifier le profil</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>

        {/* Mes Coupons Button */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('UserCoupons')}
        >
          <View style={styles.settingItemContent}>
            {/* --- MODIFIED: Use custom image for Mes Coupons --- */}
            <Image source={DISCOUNT_ICON} style={[styles.settingIconCustom, { tintColor: '#28a745' }]} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.settingText}>Mes Coupons</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>

        {/* Mes Rendez-vous Button */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('UserRdv')}
        >
          <View style={styles.settingItemContent}>
            {/* --- MODIFIED: Use custom image for Mes Rendez-vous --- */}
            <Image source={APPOINTMENT_ICON} style={[styles.settingIconCustom, { tintColor: '#FF9500' }]} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.settingText}>Mes Rendez-vous</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>

      </View>

      {/* Security Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Sécurité</Text>

        {/* --- NEW: Changer Mot de Passe Button --- */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => setShowPasswordModal(true)}
        >
          <View style={styles.settingItemContent}>
            <Image source={LOCK_ICON} style={[styles.settingIconCustom, { tintColor: '#0a8fdf' }]} /> {/* Use tintColor matching default icon */}
            <Text style={styles.settingText}>Changer Mot de Passe</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>
        {/* --- END NEW --- */}

        <TouchableOpacity
          style={[styles.settingItem, styles.logoutButton]}
          onPress={handleLogout}
        >
          <View style={styles.settingItemContent}>
            {/* --- MODIFIED: Use custom image for Déconnexion --- */}
            <Image source={LOGOUT_ICON} style={[styles.settingIconCustom, { tintColor: '#EF4444' }]} />
            {/* --- END MODIFIED --- */}
            <Text style={[styles.settingText, styles.logoutText]}>Déconnexion</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Version 1.0.0</Text>

      {/* --- NEW: Change Password Modal --- */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={showPasswordModal}
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.passwordModalContent}>
            <Text style={styles.passwordModalTitle}>Changer Mot de Passe</Text>
            <Text style={styles.passwordModalSubtitle}>
              Veuillez entrer votre mot de passe actuel et votre nouveau mot de passe.
            </Text>

            <TextInput
              style={styles.modalTextInput}
              placeholder="Mot de passe actuel"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              editable={!isPasswordChanging}
            />
            <TextInput
              style={styles.modalTextInput}
              placeholder="Nouveau mot de passe"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              editable={!isPasswordChanging}
            />
            <TextInput
              style={styles.modalTextInput}
              placeholder="Confirmer nouveau mot de passe"
              secureTextEntry
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              editable={!isPasswordChanging}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowPasswordModal(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmNewPassword('');
                }}
                disabled={isPasswordChanging}
              >
                <Text style={styles.modalCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalSubmitButton]}
                onPress={handleChangePassword}
                disabled={isPasswordChanging}
              >
                {isPasswordChanging ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSubmitButtonText}>Changer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* --- END NEW: Change Password Modal --- */}
    </ScrollView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF3F8',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF3F8',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#64748b',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 25,
    alignItems: 'center',
    marginBottom: 35,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
  },
  profileImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#0a8fdf',
    marginBottom: 20,
  },
  profileImagePlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#0a8fdf',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  userInfoContainer: {
    alignItems: 'center',
    width: '100%',
  },
  userName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 8,
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 12,
    textAlign: 'center',
  },
  roleDetailsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    width: '80%',
    alignItems: 'center',
  },
  userDetail: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 5,
    textAlign: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDF2F7',
  },
  settingItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: { // Original Ionicons style
    marginRight: 18,
  },
  // --- NEW STYLE for Custom PNG Icons in Settings ---
  settingIconCustom: {
    width: 22, // Match Ionicons size
    height: 22, // Match Ionicons size
    resizeMode: 'contain',
    marginRight: 18,
    // tintColor is applied inline in the component to maintain specific colors
  },
  // --- END NEW STYLE ---
  settingText: {
    fontSize: 17,
    color: '#4A5568',
    fontWeight: '500',
  },
  logoutButton: {
    borderBottomWidth: 0,
    marginTop: 5,
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    color: '#A0AEC0',
    marginTop: 30,
    fontSize: 13,
    marginBottom: 20,
  },

  // --- NEW: Styles for Change Password Modal ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  passwordModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  passwordModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 10,
    textAlign: 'center',
  },
  passwordModalSubtitle: {
    fontSize: 15,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalTextInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
    color: '#333',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  modalCancelButton: {
    backgroundColor: '#E2E8F0',
  },
  modalCancelButtonText: {
    color: '#4A5568',
    fontWeight: '600',
    fontSize: 16,
  },
  modalSubmitButton: {
    backgroundColor: '#0a8fdf', // Primary blue color
  },
  modalSubmitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  // --- END NEW: Styles for Change Password Modal ---
});

export default Paramètres;
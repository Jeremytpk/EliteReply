// Jey's Refactored Component
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
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Linking
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { doc, getDoc, collection, getDocs, onSnapshot, query, where } from 'firebase/firestore';

// --- NEW: Import your custom icons ---
const USER_ICON = require('../assets/icons/user.png');
const DISCOUNT_ICON = require('../assets/icons/discount.png');
const APPOINTMENT_ICON = require('../assets/icons/appointment.png');
const LOCK_ICON = require('../assets/icons/lock.png');
const LOGOUT_ICON = require('../assets/icons/logout.png');
const RIGHT_ENTER_ICON = require('../assets/icons/right_enter.png');
// --- END NEW IMPORTS ---

// --- JEY'S NEW COMPONENT: Professional Step Tracker ---
const StepTracker = ({ status }) => {
  const steps = [
    { id: 'pending', name: 'Soumis', color: '#FF9500', icon: 'time' },
    { id: 'on_work', name: 'Évaluation', color: '#007AFF', icon: 'cube' },
    { id: 'accepted', name: 'Accepté', color: '#34C759', icon: 'checkmark-circle' },
    { id: 'rejected', name: 'Rejeté', color: '#EF4444', icon: 'close-circle' },
  ];

  const currentStatusIndex = steps.findIndex(step => step.id === status);
  
  return (
    <View style={stepTrackerStyles.trackerContainer}>
      {steps.map((step, index) => {
        let isActive = index <= currentStatusIndex;
        let isRejected = status === 'rejected' && index === 3;
        let finalColor = isRejected ? step.color : (isActive && status !== 'rejected' ? step.color : '#A0AEC0');
        let isFinalActive = isRejected || (status !== 'rejected' && index === currentStatusIndex);
        
        // Handle rejected status coloring for previous steps
        if (status === 'rejected' && index < 3) {
            finalColor = '#A0AEC0'; // Previous steps are greyed out if rejected
            isActive = false;
        }

        return (
          <View key={step.id} style={stepTrackerStyles.stepWrapper}>
            <View style={stepTrackerStyles.stepIndicator}>
              <Ionicons
                name={step.icon}
                size={22}
                color={finalColor}
              />
              {/* Line connector (excluding the last step) */}
              {index < steps.length - 1 && (
                <View style={[
                  stepTrackerStyles.connectorLine,
                  { backgroundColor: isActive && status !== 'rejected' ? step.color : '#E2E8F0' },
                  isFinalActive && stepTrackerStyles.connectorActive,
                ]} />
              )}
            </View>
            <Text style={[stepTrackerStyles.stepText, { color: finalColor, fontWeight: isFinalActive ? '700' : '500' }]}>
              {step.name}
            </Text>
          </View>
        );
      })}
    </View>
  );
};
// --- END JEY'S NEW COMPONENT ---

const Paramètres = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [applicationData, setApplicationData] = useState(null);
  const [loadingApplication, setLoadingApplication] = useState(false);
  
  // --- JEY'S NEW STATE: Toggle visibility for application details ---
  const [isApplicationSectionOpen, setIsApplicationSectionOpen] = useState(false);

  // --- States for Change Password Modal ---
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
            const firestoreData = userDoc.data();
            setUserData({
              name: firestoreData.name,
              email: user.email,
              // Jey's Fix: Prioritize the photoURL from Firestore if available.
              // If not, fall back to the auth user photoURL.
              photoURL: firestoreData.photoURL || user.photoURL || null,
              role: firestoreData.role,
              department: firestoreData.department,
              position: firestoreData.position
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

  // Real-time application listener for the current user's email (updates UI when status changes)
  useEffect(() => {
    if (!auth.currentUser || !auth.currentUser.email) return;
    const userEmail = auth.currentUser.email.toLowerCase();
    setLoadingApplication(true);

    // Listen for applications where applicantInfo.email == userEmail
    const q1 = query(collection(db, 'applications'), where('applicantInfo.email', '==', userEmail));
    const unsub1 = onSnapshot(q1, snapshot => {
      let found = null;
      snapshot.forEach(d => {
        found = { id: d.id, ...d.data() };
      });
      if (found) {
        setApplicationData(found);
        setLoadingApplication(false);
      }
    }, err => {
      console.error('Error listening to applications (nested email):', err);
    });

    // Also listen for applications where top-level email == userEmail (in case data stored differently)
    const q2 = query(collection(db, 'applications'), where('email', '==', userEmail));
    const unsub2 = onSnapshot(q2, snapshot => {
      let found = null;
      snapshot.forEach(d => {
        found = { id: d.id, ...d.data() };
      });
      if (found) {
        setApplicationData(found);
        setLoadingApplication(false);
      }
    }, err => {
      console.error('Error listening to applications (top-level email):', err);
    });

    // If neither query returns anything within a short time, clear loading flag
    const fallback = setTimeout(() => setLoadingApplication(false), 2000);

    return () => {
      unsub1();
      unsub2();
      clearTimeout(fallback);
    };
  }, [userData]);

  const formatDateShort = (d) => {
    try {
      const date = d && d.toDate ? d.toDate() : (d ? new Date(d) : null);
      if (!date) return 'N/A';
      return date.toLocaleDateString('fr-FR', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch (e) {
      return 'N/A';
    }
  };

  // --- Handle Password Change ---
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
      }
      Alert.alert('Erreur', errorMessage);
    } finally {
      setIsPasswordChanging(false);
    }
  };
  // --- END Handle Password Change ---

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  // Jey's improvement: Use a variable for the image source to simplify the JSX.
  const profileImageSource = userData?.photoURL ? { uri: userData.photoURL } : null;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Enhanced Profile Section (Refined for Professional & Friendly Look) */}
      <View style={styles.profileCardFriendly}>
        <View style={styles.avatarWrapper}>
          {profileImageSource ? (
            <Image source={profileImageSource} style={styles.profileImageSmall} />
          ) : (
            <View style={styles.profileImagePlaceholderSmall}>
              <Ionicons name="person" size={36} color="#fff" />
            </View>
          )}
        </View>

        <View style={styles.userInfoContainerRow}>
          <Text style={styles.userNameGreeting}>
            Bonjour,{' '}
            <Text style={styles.userNameFriendly}>
              {userData?.name ? userData.name.split(' ')[0] : 'Utilisateur'}
            </Text>
            ! 👋
          </Text>
          {userData?.email && <Text style={styles.userEmailRow}>{userData.email}</Text>}

          {(userData?.role === 'ITSupport' || userData?.role === 'Admin') && (
            <View style={styles.roleDetailsInline}>
              {userData?.department && (
                <Text style={styles.userDetailInline}>
                  <Ionicons name="briefcase-outline" size={14} color="#6B7280" /> {userData.department}
                </Text>
              )}
              {userData?.position && (
                <Text style={styles.userDetailInline}>
                  <Ionicons name="cube-outline" size={14} color="#6B7280" /> {userData.position}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Application Progress Section (Now Collapsible) */}
      {applicationData && (
        <View style={styles.settingsSection}>
          <TouchableOpacity
            style={styles.sectionTitleContainer}
            onPress={() => setIsApplicationSectionOpen(!isApplicationSectionOpen)}
          >
            {/* JEY'S IMPROVEMENT: More professional title and toggle icon */}
            <Text style={styles.sectionTitle}>Suivi de Candidature Partenaire</Text>
            <Ionicons
              name={isApplicationSectionOpen ? 'chevron-up-outline' : 'chevron-down-outline'}
              size={24}
              color="#2D3748"
            />
          </TouchableOpacity>

          {loadingApplication ? (
            <ActivityIndicator size="small" color="#0a8fdf" style={{ marginTop: 10 }} />
          ) : (
            <>
              {/* Professional Stepper UI visible when the section is closed (Default behavior) */}
              {!isApplicationSectionOpen && (
                <StepTracker status={applicationData.status} />
              )}
              
              {/* Detailed Card visible only when the section is open */}
              {isApplicationSectionOpen && (
                <View style={styles.applicationCard}>
                  <Text style={styles.applicationBusiness}>{applicationData.businessInfo?.businessName || applicationData.businessName || 'Mon Entreprise'}</Text>
                  <View style={styles.applicationRow}>
                    <Text style={styles.applicationLabel}>Statut Actuel:</Text>
                    <Text style={styles.applicationValue}>
                      {(applicationData.status && applicationData.status.charAt(0).toUpperCase() + applicationData.status.slice(1)) || 'Inconnu'}
                    </Text>
                  </View>
                  <View style={styles.applicationRow}>
                    <Text style={styles.applicationLabel}>Soumis le:</Text>
                    <Text style={styles.applicationValue}>{formatDateShort(applicationData.createdAt)}</Text>
                  </View>
                  <View style={styles.applicationRow}>
                    <Text style={styles.applicationLabel}>Dernière mise à jour:</Text>
                    <Text style={styles.applicationValue}>{formatDateShort(applicationData.updatedAt)}</Text>
                  </View>

                  <View style={{ marginTop: 15, borderTopWidth: 1, borderTopColor: '#E2E8F0', paddingTop: 15 }}>
                    <Text style={styles.applicationBusiness}>Progression Visuelle</Text>
                    <StepTracker status={applicationData.status} />
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      )}


      {/* Account Settings Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Mon Compte</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('EditProfile', { userData: userData })}
        >
          <View style={styles.settingItemContent}>
            <Image source={USER_ICON} style={[styles.settingIconCustom, { tintColor: '#0a8fdf' }]} />
            <Text style={styles.settingText}>Modifier le profil</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('UserCoupons')}
        >
          <View style={styles.settingItemContent}>
            <Image source={DISCOUNT_ICON} style={[styles.settingIconCustom, { tintColor: '#28a745' }]} />
            <Text style={styles.settingText}>Mes Coupons</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('UserRdv')}
        >
          <View style={styles.settingItemContent}>
            <Image source={APPOINTMENT_ICON} style={[styles.settingIconCustom, { tintColor: '#FF9500' }]} />
            <Text style={styles.settingText}>Mes Rendez-vous</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('ClientReceipts')}
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="receipt-outline" size={24} color="#28a745" style={{ marginRight: 18 }} />
            <Text style={styles.settingText}>Mes Reçus</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

      </View>

      {/* Legal & Support Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Informations Légales & Support</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => Linking.openURL('https://elitereply.info/politique.html')}
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="shield-checkmark-outline" size={24} color="#6366F1" style={{ marginRight: 18 }} />
            <Text style={styles.settingText}>Politique de Confidentialité</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => Linking.openURL('https://elitereply.info/conditions.html')}
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="document-text-outline" size={24} color="#8B5CF6" style={{ marginRight: 18 }} />
            <Text style={styles.settingText}>Conditions d'Utilisation</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => Linking.openURL('https://elitereply.info/contact.html')}
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="mail-outline" size={24} color="#10B981" style={{ marginRight: 18 }} />
            <Text style={styles.settingText}>Nous Contacter</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

      </View>

      {/* Security Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Sécurité</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => {
            if (!auth.currentUser) {
              Alert.alert(
                'Connexion requise',
                'Vous devez être connecté pour changer votre mot de passe.',
                [
                  { text: 'Annuler', style: 'cancel' },
                  { 
                    text: 'Connexion', 
                    onPress: () => navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    })
                  }
                ]
              );
              return;
            }
            setShowPasswordModal(true);
          }}
        >
          <View style={styles.settingItemContent}>
            <Image source={LOCK_ICON} style={[styles.settingIconCustom, { tintColor: '#0a8fdf' }]} />
            <Text style={styles.settingText}>Changer Mot de Passe</Text>
          </View>
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.settingItem, styles.logoutButton]}
          onPress={() => {
            if (!auth.currentUser) {
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
              return;
            }
            navigation.navigate('Deconnection');
          }}
        >
          <View style={styles.settingItemContent}>
            <Image source={LOGOUT_ICON} style={[styles.settingIconCustom, { tintColor: '#EF4444' }]} />
            <Text style={[styles.settingText, styles.logoutText]}>
              {auth.currentUser ? 'Déconnexion' : 'Connexion'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Version 1.0.0</Text>

      {/* --- Change Password Modal --- */}
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
      {/* --- END Change Password Modal --- */}
    </ScrollView>
  );
};


const stepTrackerStyles = StyleSheet.create({
  trackerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 5,
    marginTop: 15,
    marginBottom: 10,
  },
  stepWrapper: {
    flex: 1,
    alignItems: 'center',
  },
  stepIndicator: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    zIndex: 2,
    marginBottom: 8,
  },
  connectorLine: {
    position: 'absolute',
    height: 3,
    width: '100%',
    left: '50%',
    top: 10, // Center vertically based on icon size (22/2)
    zIndex: 1,
    backgroundColor: '#E2E8F0',
  },
  stepText: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 5,
    maxWidth: 60,
  },
});


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
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
  // --- JEY'S UPDATED PROFILE CARD STYLE (Friendly & Professional) ---
  profileCardFriendly: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
    backgroundColor: '#F7F9FF', 
    borderRadius: 15,
    marginBottom: 30,
    shadowColor: '#3B82F6', 
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  avatarWrapper: {
    marginRight: 15,
    borderWidth: 2,
    borderColor: '#0a8fdf', 
    borderRadius: 100, 
    padding: 2, 
  },
  profileImageSmall: {
    width: 65,
    height: 65,
    borderRadius: 100, 
    resizeMode: 'cover',
  },
  profileImagePlaceholderSmall: {
    width: 65,
    height: 65,
    borderRadius: 100,
    backgroundColor: '#0a8fdf',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInfoContainerRow: {
    flex: 1,
    justifyContent: 'center',
  },
  userNameGreeting: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    marginBottom: 2,
  },
  userNameFriendly: {
    fontSize: 20,
    fontWeight: '800',
    color: '#0F172A',
  },
  userEmailRow: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 8,
  },
  roleDetailsInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  userDetailInline: {
    fontSize: 12,
    color: '#6B7280',
    marginRight: 10,
    alignItems: 'center',
    flexDirection: 'row',
  },
  // --- END PROFILE CARD STYLES ---

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
  sectionTitleContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#2D3748',
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
  settingIconCustom: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    marginRight: 18,
  },
  customArrowIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#A0AEC0',
  },
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
    backgroundColor: '#0a8fdf',
  },
  modalSubmitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  applicationCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  applicationBusiness: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 8,
  },
  applicationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  applicationLabel: {
    color: '#6B7280',
  },
  applicationValue: {
    color: '#111827',
    fontWeight: '600',
  },
});

export default Paramètres;
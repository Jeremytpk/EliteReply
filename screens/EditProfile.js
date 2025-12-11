// Jey's Refined EditProfile Component with Firebase Storage Timeout Adjustment
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Image,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
// Jey's Fix: Import getStorage and maxUploadRetryTime
import { ref, uploadBytes, getDownloadURL, getStorage, maxUploadRetryTime } from 'firebase/storage';
import { updateProfile, deleteUser } from 'firebase/auth';

const EditProfile = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const { userData: initialUserData } = route.params;

  const [name, setName] = useState(initialUserData?.name || '');
  const [phoneNumber, setPhoneNumber] = useState(initialUserData?.phoneNumber || '');
  const [department, setDepartment] = useState(initialUserData?.department || '');
  const [position, setPosition] = useState(initialUserData?.position || '');
  const [photoURL, setPhotoURL] = useState(initialUserData?.photoURL || null);
  const [loading, setLoading] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  
  // Delete account modal states
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deleteConfirmationEmail, setDeleteConfirmationEmail] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const checkAuth = () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAuthChecked(true);
      } else {
        setIsAuthChecked(true);
      }
    };
    
    checkAuth();
  }, []);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission requise', 'Nous avons besoin des permissions pour accéder à votre galerie de photos pour changer votre photo de profil.');
        }
      }
    })();
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7, // Existing quality setting, which is good
    });

    if (!result.canceled) {
      setPhotoURL(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    if (!uri) {
      console.warn("Attempted to upload null or empty URI.");
      return null;
    }

    setLoading(true);
    try {
      // Jey's Fix: Get the storage instance and set the max retry time
      const storageInstance = getStorage();
      // Set max retry time to 2 minutes (120000 milliseconds)
      // Default is 60000ms (1 minute). Increasing it gives more time for slow networks.
      storageInstance.maxUploadRetryTime = 120000; // 2 minutes

      console.log("Attempting to upload image from URI:", uri); // Jey's Debug Log

      const response = await fetch(uri);
      const blob = await response.blob();
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Erreur', 'Aucun utilisateur connecté.');
        return null;
      }

      const storageRef = ref(storageInstance, `profile_pictures/${user.uid}`); // Use storageInstance here
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      console.log("Image uploaded, download URL:", downloadURL);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert('Erreur de téléchargement', 'Impossible de télécharger la photo de profil. Veuillez réessayer.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    const user = auth.currentUser;

    if (!user) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      setLoading(false);
      return;
    }

    try {
      let newPhotoURL = photoURL;

      if (photoURL && photoURL !== initialUserData?.photoURL) {
        const uploadedURL = await uploadImage(photoURL);
        if (uploadedURL) {
          newPhotoURL = uploadedURL;
        } else {
          newPhotoURL = initialUserData?.photoURL || null;
          Alert.alert("Avertissement", "La nouvelle photo n'a pas pu être téléchargée. L'ancienne photo sera conservée.");
        }
      } else if (photoURL === null && initialUserData?.photoURL) {
        newPhotoURL = null;
      }

      const updates = {
        name: name,
        phoneNumber: phoneNumber,
        role: initialUserData?.role,
        department: department,
        position: position,
        photoURL: newPhotoURL,
      };

      await updateProfile(user, {
        displayName: name,
        photoURL: newPhotoURL,
      });

      await updateDoc(doc(db, 'users', user.uid), updates);

      Alert.alert('Succès', 'Votre profil a été mis à jour avec succès.', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error("Error updating profile:", error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la mise à jour du profil. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    const user = auth.currentUser;
    
    if (!user) {
      Alert.alert('Erreur', 'Aucun utilisateur connecté.');
      return;
    }

    // Check if the email matches
    if (deleteConfirmationEmail.trim() !== user.email) {
      Alert.alert('Erreur', 'L\'adresse e-mail saisie ne correspond pas à votre compte.');
      return;
    }

    setDeleting(true);

    try {
      // First, delete user data from Firestore
      await deleteDoc(doc(db, 'users', user.uid));
      console.log("User document deleted from Firestore");

      // Then, delete the authentication account
      await deleteUser(user);
      console.log("User authentication account deleted");

      // Close the modal
      setDeleteModalVisible(false);

      // Show success message
      Alert.alert(
        'Compte supprimé',
        'Votre compte et toutes vos données ont été supprimés avec succès.',
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate to Login screen
              navigation.reset({
                index: 0,
                routes: [{ name: 'Login' }],
              });
            }
          }
        ]
      );
    } catch (error) {
      console.error("Error deleting account:", error);
      
      // Handle specific error cases
      if (error.code === 'auth/requires-recent-login') {
        Alert.alert(
          'Réauthentification requise',
          'Pour des raisons de sécurité, veuillez vous reconnecter et réessayer.'
        );
      } else {
        Alert.alert(
          'Erreur',
          'Une erreur est survenue lors de la suppression du compte. Veuillez réessayer.'
        );
      }
    } finally {
      setDeleting(false);
    }
  };

  if (!isAuthChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  if (!auth.currentUser) {
    return (
      <View style={styles.authRequiredContainer}>
        <View style={styles.authModalContent}>
          <Image
            source={require('../assets/images/logoFace.png')}
            style={styles.authImage}
            resizeMode="contain"
          />
          <Ionicons name="lock-closed" size={60} color="#0a8fdf" style={styles.lockIcon} />
          <Text style={styles.authTitle}>Connexion Requise</Text>
          <Text style={styles.authMessage}>
            Vous devez être connecté pour modifier votre profil.
          </Text>
          <View style={styles.authButtonsContainer}>
            <TouchableOpacity
              style={styles.authCancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.authCancelButtonText}>Retour</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.authLoginButton}
              onPress={() => navigation.navigate('Login')}
            >
              <Ionicons name="log-in" size={20} color="white" style={styles.buttonIcon} />
              <Text style={styles.authLoginButtonText}>Connexion</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={28} color="#2D3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifier le profil</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.profileImageContainer}>
          <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
            {photoURL ? (
              <Image source={{ uri: photoURL }} style={styles.profileImage} />
            ) : (
              <View style={styles.profileImagePlaceholder}>
                <Ionicons name="camera-outline" size={50} color="#E0F2F7" />
              </View>
            )}
            <View style={styles.cameraIconOverlay}>
              <Ionicons name="camera" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Informations Personnelles</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom Complet</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Entrez votre nom"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Numéro de Téléphone</Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Ex: +24324567890"
              keyboardType="phone-pad"
            />
          </View>

          {(initialUserData?.role === 'ITSupport' || initialUserData?.role === 'Admin') && (
            <>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Département</Text>
                <TextInput
                  style={styles.input}
                  value={department}
                  onChangeText={setDepartment}
                  placeholder="Votre département"
                  autoCapitalize="words"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Poste</Text>
                <TextInput
                  style={styles.input}
                  value={position}
                  onChangeText={setPosition}
                  placeholder="Votre poste"
                  autoCapitalize="words"
                />
              </View>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Enregistrer les modifications</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteAccountButton}
          onPress={() => setDeleteModalVisible(true)}
          disabled={loading}
        >
          <Ionicons name="trash-outline" size={20} color="#DC2626" style={styles.deleteIcon} />
          <Text style={styles.deleteAccountButtonText}>Supprimer le compte</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Delete Account Confirmation Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={deleteModalVisible}
        onRequestClose={() => setDeleteModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Ionicons name="warning" size={50} color="#DC2626" />
              <Text style={styles.modalTitle}>Êtes-vous sûr ?</Text>
            </View>

            <Text style={styles.modalMessage}>
              Cette action est permanente et supprimera votre compte et toutes vos données (profil, commandes, chats).
            </Text>

            <Text style={styles.modalInstruction}>
              Pour confirmer, veuillez taper votre adresse e-mail ci-dessous :
            </Text>

            <Text style={styles.emailDisplay}>
              {auth.currentUser?.email}
            </Text>

            <TextInput
              style={styles.confirmationInput}
              value={deleteConfirmationEmail}
              onChangeText={setDeleteConfirmationEmail}
              placeholder="Entrez votre adresse e-mail"
              placeholderTextColor="#9CA3AF"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setDeleteModalVisible(false);
                  setDeleteConfirmationEmail('');
                }}
                disabled={deleting}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.confirmDeleteButton,
                  (deleteConfirmationEmail.trim() !== auth.currentUser?.email || deleting) && 
                    styles.confirmDeleteButtonDisabled
                ]}
                onPress={handleDeleteAccount}
                disabled={deleteConfirmationEmail.trim() !== auth.currentUser?.email || deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.confirmDeleteButtonText}>Supprimer mon compte</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF3F8',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 25,
    marginTop: 10,
    paddingTop: Platform.OS === 'android' ? 20 : 35,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2D3748',
  },
  profileImageContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  imagePicker: {
    width: 150,
    height: 150,
    borderRadius: 75,
    backgroundColor: '#0a8fdf',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 5,
    borderColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 8,
  },
  profileImage: {
    width: '100%',
    height: '100%',
    borderRadius: 75,
  },
  profileImagePlaceholder: {
    width: '100%',
    height: '100%',
    borderRadius: 75,
    backgroundColor: '#0a8fdf',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraIconOverlay: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#0a8fdf',
    borderRadius: 20,
    padding: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  formSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 20,
    paddingBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 15,
    color: '#4A5568',
    marginBottom: 8,
    fontWeight: '600',
  },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#2D3748',
    backgroundColor: '#F7FAFC',
  },
  submitButton: {
    backgroundColor: '#0a8fdf',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  deleteAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEE2E2',
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 15,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteIcon: {
    marginRight: 8,
  },
  deleteAccountButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 25,
    width: '100%',
    maxWidth: 450,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  modalHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#DC2626',
    marginTop: 10,
  },
  modalMessage: {
    fontSize: 16,
    color: '#4B5563',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
  },
  modalInstruction: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 10,
    fontWeight: '600',
  },
  emailDisplay: {
    fontSize: 14,
    color: '#0a8fdf',
    marginBottom: 15,
    fontWeight: '700',
    textAlign: 'center',
    backgroundColor: '#EBF3F8',
    padding: 10,
    borderRadius: 8,
  },
  confirmationInput: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    marginBottom: 20,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#4B5563',
    fontSize: 16,
    fontWeight: '600',
  },
  confirmDeleteButton: {
    flex: 1,
    backgroundColor: '#DC2626',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmDeleteButtonDisabled: {
    backgroundColor: '#FCA5A5',
    opacity: 0.6,
  },
  confirmDeleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF3F8',
  },
  authRequiredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  authModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  authImage: {
    width: 120,
    height: 120,
    marginBottom: 20,
    borderRadius: 60,
  },
  lockIcon: {
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  authMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  authButtonsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  authCancelButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  authCancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  authLoginButton: {
    flex: 1,
    backgroundColor: '#0a8fdf',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  authLoginButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
});

export default EditProfile;
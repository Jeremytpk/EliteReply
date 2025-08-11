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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { auth, db, storage } from '../firebase';
import { doc, updateDoc } from 'firebase/firestore';
// Jey's Fix: Import getStorage and maxUploadRetryTime
import { ref, uploadBytes, getDownloadURL, getStorage, maxUploadRetryTime } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';

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
      </ScrollView>
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
});

export default EditProfile;
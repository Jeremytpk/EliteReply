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
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { db, storage } from '../../firebase';
import { collection, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const AddPartner = () => {
  const navigation = useNavigation();

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [ceo, setCeo] = useState(''); // Changed from founder
  const [manager, setManager] = useState(''); // Remains manager, but context changed from 'gestionnaire'
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [logoURL, setLogoURL] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission requise', 'Nous avons besoin des permissions pour accéder à votre galerie de photos pour la photo de profil du partenaire.');
        }
      }
    })();
  }, []);

  const pickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.7,
    });

    if (!result.canceled) {
      setLogoURL(result.assets[0].uri);
    }
  };

  const uploadImage = async (uri) => {
    if (!uri) return null;

    setLoading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `partner_logos/${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert('Erreur de téléchargement', 'Impossible de télécharger le logo du partenaire. Veuillez réessayer.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!businessName || !category || !email || !phoneNumber || !description) {
      Alert.alert('Champs Manquants', 'Veuillez remplir tous les champs obligatoires (Nom, Catégorie, Email, Téléphone, Description).');
      return;
    }

    setLoading(true);
    try {
      let uploadedLogoURL = null;
      if (logoURL) {
        uploadedLogoURL = await uploadImage(logoURL);
        if (!uploadedLogoURL) {
          throw new Error("Failed to upload partner logo.");
        }
      }

      const newPartnerData = {
        nom: businessName,
        adresse: address,
        categorie: category,
        email: email,
        numeroTelephone: phoneNumber,
        ceo: ceo, // Changed from fondateur to ceo
        manager: manager, // Changed from gestionnaire to manager
        siteWeb: website,
        description: description,
        logo: uploadedLogoURL,
        creeLe: new Date().toISOString(),
        estPromu: false,
        note: 0,
        nombreAvis: 0,
        assignedUserId: null,
        assignedUserName: null,
        assignedUserEmail: null,
        assignedUserPhotoURL: null,
      };

      const docRef = await addDoc(collection(db, 'partners'), newPartnerData);
      console.log("Partner added with ID: ", docRef.id);

      Alert.alert('Succès', `${businessName} a été ajouté comme nouveau partenaire !`, [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error("Error adding partner:", error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'ajout du partenaire. Veuillez réessayer.');
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
          <Text style={styles.headerTitle}>Ajouter un nouveau partenaire</Text>
          <View style={{ width: 28 }} />
        </View>

        <View style={styles.profileImageContainer}>
          <TouchableOpacity onPress={pickImage} style={styles.imagePicker}>
            {logoURL ? (
              <Image source={{ uri: logoURL }} style={styles.partnerLogo} />
            ) : (
              <View style={styles.partnerLogoPlaceholder}>
                <Ionicons name="image-outline" size={50} color="#E0F2F7" />
              </View>
            )}
            <View style={styles.cameraIconOverlay}>
              <Ionicons name="camera" size={24} color="#FFFFFF" />
            </View>
          </TouchableOpacity>
          <Text style={styles.imagePickerText}>Ajouter un logo de partenaire</Text>
        </View>

        <View style={styles.formSection}>
          <Text style={styles.sectionTitle}>Informations sur le Partenaire</Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Nom de l'entreprise <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={businessName}
              onChangeText={setBusinessName}
              placeholder="Nom complet de l'entreprise"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Adresse</Text>
            <TextInput
              style={styles.input}
              value={address}
              onChangeText={setAddress}
              placeholder="Adresse complète du partenaire"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Catégorie <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="Ex: Restaurant, Salon de beauté, Garage..."
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Email <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="Email de contact"
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Numéro de Téléphone <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="Ex: +1234567890"
              keyboardType="phone-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>PDG / CEO</Text> {/* Label change */}
            <TextInput
              style={styles.input}
              value={ceo} // State change
              onChangeText={setCeo} // Setter change
              placeholder="Nom du PDG ou CEO"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Manager</Text> {/* Label change */}
            <TextInput
              style={styles.input}
              value={manager} // State remains manager, but it's now explicitly 'Manager'
              onChangeText={setManager}
              placeholder="Nom du manager principal"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Site Web</Text>
            <TextInput
              style={styles.input}
              value={website}
              onChangeText={setWebsite}
              placeholder="URL du site web (Ex: https://exemple.com)"
              autoCapitalize="none"
              keyboardType="url"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Description <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={description}
              onChangeText={setDescription}
              placeholder="Décrivez le partenaire et ses services"
              multiline
              numberOfLines={4}
              textAlignVertical="top"
            />
          </View>
        </View>

        <TouchableOpacity
          style={styles.submitButton}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.submitButtonText}>Ajouter le Partenaire</Text>
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
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3748',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
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
  partnerLogo: {
    width: '100%',
    height: '100%',
    borderRadius: 75,
    resizeMode: 'cover',
  },
  partnerLogoPlaceholder: {
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
  imagePickerText: {
    marginTop: 10,
    fontSize: 15,
    color: '#4A5568',
    fontWeight: '500',
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
  required: {
    color: '#FF0000',
    fontWeight: 'bold',
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

export default AddPartner;
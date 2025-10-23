import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  Image, // Import Image
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Modal, // NEW: Import Modal
  FlatList, // NEW: Import FlatList for modal content
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons'; // Keep Ionicons/MaterialIcons if still used elsewhere
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import COUNTRIES, { countryCodeToFlag } from '../../components/Countries';
import { db, storage } from '../../firebase'; // Ensure storage is imported
import { collection, doc, addDoc, deleteDoc, onSnapshot } from 'firebase/firestore'; // Removed getFirestore
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage'; // Removed getStorage
import { APP_CATEGORIES } from '../../constants/APP_CATEGORIES'; // NEW: Import categories

// --- NEW: Import your custom icons ---
const ARROW_BACK_ICON = require('../../assets/icons/back_circle.png'); // For back button
const IMAGE_OUTLINE_ICON = require('../../assets/icons/business_outline.png'); // For partner logo placeholder
const CAMERA_ICON = require('../../assets/icons/camera.png'); // For camera overlay icon
const ARROW_DROP_DOWN_ICON = require('../../assets/icons/arrow_downShort.png'); // For category dropdown arrow
const CHECK_CIRCLE_ICON = require('../../assets/icons/check_full.png'); // For modal checkmark
const CLOSE_ICON = require('../../assets/icons/close_circle.png'); 
// --- Category icons (from APP_CATEGORIES) are already handled by MaterialIcons.
// If you have custom PNGs for them, you'll need to map them here and use them in the FlatList.
// For now, I'll assume MaterialIcons will continue to be used for categories within the modal.
// --- END NEW IMPORTS ---

const AddPartner = () => {
  const navigation = useNavigation();

  // Country picker state
  const [country, setCountry] = useState(''); // store ISO code, e.g. 'FR'
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');

  const [businessName, setBusinessName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState(''); // This will now hold the category ID
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [ceo, setCeo] = useState('');
  const [manager, setManager] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [logoURL, setLogoURL] = useState(null);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false); // NEW: State for modal visibility

  // Helper to find category name/icon by ID
  const getCategoryInfo = (categoryId) => {
    return APP_CATEGORIES.find(cat => cat.id === categoryId) || { name: 'Sélectionnez une catégorie', icon: 'category' };
  };

  const filteredCountries = COUNTRIES.filter(c =>
    c.name.toLowerCase().includes(countrySearch.trim().toLowerCase()) ||
    c.code.toLowerCase().includes(countrySearch.trim().toLowerCase())
  );

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
    // Validate that category is selected (not an empty string)
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
        categorie: category, // Storing the category ID
        email: email,
        numeroTelephone: phoneNumber,
        ceo: ceo,
        manager: manager,
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

  const selectedCategoryInfo = getCategoryInfo(category); // Get info for display

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            {/* --- MODIFIED: Use custom image for back arrow --- */}
            <Image source={ARROW_BACK_ICON} style={styles.customHeaderIcon} />
            {/* --- END MODIFIED --- */}
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
                {/* --- MODIFIED: Use custom image for partner logo placeholder --- */}
                <Image source={IMAGE_OUTLINE_ICON} style={styles.customPartnerLogoPlaceholderIcon} />
                {/* --- END MODIFIED --- */}
              </View>
            )}
            <View style={styles.cameraIconOverlay}>
              {/* --- MODIFIED: Use custom image for camera icon --- */}
              <Image source={CAMERA_ICON} style={styles.customCameraIcon} />
              {/* --- END MODIFIED --- */}
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

          {/* NEW: Custom Category Select Button */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Catégorie <Text style={styles.required}>*</Text></Text>
            <TouchableOpacity
              style={[styles.input, styles.categorySelectButton]}
              onPress={() => setModalVisible(true)}
            >
              <MaterialIcons name={selectedCategoryInfo.icon} size={20} color="#4A5568" style={styles.categorySelectIcon} />
              <Text style={[styles.categorySelectText, !category && styles.categorySelectPlaceholder]}>
                {selectedCategoryInfo.name}
              </Text>
              {/* --- MODIFIED: Use custom image for dropdown arrow --- */}
              <Image source={ARROW_DROP_DOWN_ICON} style={styles.customDropdownIcon} />
              {/* --- END MODIFIED --- */}
            </TouchableOpacity>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Pays</Text>
            <TouchableOpacity
              style={[styles.input, styles.categorySelectButton]}
              onPress={() => setCountryModalVisible(true)}
            >
              <Text style={{ fontSize: 18 }}>{country ? `${countryCodeToFlag(country)}  ${country}` : 'Sélectionner un pays'}</Text>
              <Image source={ARROW_DROP_DOWN_ICON} style={styles.customDropdownIcon} />
            </TouchableOpacity>
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
            <Text style={styles.inputLabel}>PDG / CEO</Text>
            <TextInput
              style={styles.input}
              value={ceo}
              onChangeText={setCeo}
              placeholder="Nom du PDG ou CEO"
              autoCapitalize="words"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Manager</Text>
            <TextInput
              style={styles.input}
              value={manager}
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

      {/* NEW: Category Selection Modal for AddPartner */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionnez une Catégorie</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                {/* --- MODIFIED: Use custom image for modal close icon --- */}
                <Image source={CLOSE_ICON} style={styles.customModalCloseIcon} />
                {/* --- END MODIFIED --- */}
              </TouchableOpacity>
            </View>
            <FlatList
              data={APP_CATEGORIES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalCategoryItem}
                  onPress={() => {
                    setCategory(item.id); // Update category state with ID
                    setModalVisible(false);
                  }}
                >
                  <MaterialIcons name={item.icon} size={24} color="#0a8fdf" style={styles.modalCategoryIcon} />
                  <Text style={styles.modalCategoryText}>{item.name}</Text>
                  {category === item.id && (
                    <Image source={CHECK_CIRCLE_ICON} style={styles.customModalCheckIcon} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>

      {/* Country selection modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={countryModalVisible}
        onRequestClose={() => setCountryModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { width: '95%', maxHeight: '85%' }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionnez un pays</Text>
              <TouchableOpacity onPress={() => setCountryModalVisible(false)}>
                <Image source={CLOSE_ICON} style={styles.customModalCloseIcon} />
              </TouchableOpacity>
            </View>
            <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
              <TextInput
                placeholder="Rechercher un pays"
                value={countrySearch}
                onChangeText={setCountrySearch}
                style={[styles.input, { marginBottom: 8 }]}
              />
            </View>
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalCategoryItem}
                  onPress={() => {
                    setCountry(item.code);
                    setCountryModalVisible(false);
                  }}
                >
                  <Text style={{ fontSize: 18, marginRight: 12 }}>{countryCodeToFlag(item.code)}</Text>
                  <Text style={styles.modalCategoryText}>{item.name}</Text>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
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
  },
  backButton: {
    padding: 5,
  },
  // --- NEW STYLE for custom header icon (back arrow) ---
  customHeaderIcon: {
    width: 28, // Match Ionicons size
    height: 28, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#2D3748', // Match Ionicons color
  },
  // --- END NEW STYLE ---
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
    overflow: 'hidden', // Ensure image is clipped to border radius
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
  // --- NEW STYLE for custom partner logo placeholder icon ---
  customPartnerLogoPlaceholderIcon: {
    width: 50, // Match Ionicons size
    height: 50, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#E0F2F7', // Match Ionicons color
  },
  // --- END NEW STYLE ---
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
  // --- NEW STYLE for custom camera icon ---
  customCameraIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#FFFFFF', // Match Ionicons color
  },
  // --- END NEW STYLE ---
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
  // NEW STYLES FOR CUSTOM CATEGORY SELECT AND MODAL (Adjusted for AddPartner's blue theme)
  categorySelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 15,
    backgroundColor: '#F7FAFC', // Consistent with other inputs
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CBD5E0',
    borderRadius: 10,
    minHeight: 50, // Ensure consistent height with other inputs
  },
  categorySelectIcon: {
    marginRight: 10,
    color: '#4A5568', // Icon color for the button
  },
  categorySelectText: {
    flex: 1,
    fontSize: 16,
    color: '#2D3748',
  },
  categorySelectPlaceholder: {
    color: '#9CA3AF',
  },
  // --- NEW STYLE for custom dropdown icon ---
  customDropdownIcon: {
    width: 24, // Match MaterialIcons size
    height: 24, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: '#6B7280', // Match MaterialIcons color
  },
  // --- END NEW STYLE ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2D3748',
  },
  // --- NEW STYLE for custom modal close icon ---
  customModalCloseIcon: {
    width: 24, // Match MaterialIcons size
    height: 24, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: '#6B7280', // Match MaterialIcons color
  },
  // --- END NEW STYLE ---
  modalCategoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalCategoryIcon: {
    marginRight: 12,
    color: '#0a8fdf', // Icon color in modal list
  },
  modalCategoryText: {
    flex: 1,
    fontSize: 16,
    color: '#2D3748',
  },
  // --- NEW STYLE for custom modal check icon ---
  customModalCheckIcon: {
    width: 20, // Match MaterialIcons size
    height: 20, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: '#0a8fdf', // Match MaterialIcons color
    marginLeft: 'auto', // Push to the right
  },
  // --- END NEW STYLE ---
  separator: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 16,
  },
  // END NEW STYLES
});

export default AddPartner;
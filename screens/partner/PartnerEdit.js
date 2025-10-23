// screens/partner/PartnerEdit.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  SafeAreaView,
  Platform,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { db, storage } from '../../firebase'; // Assuming firebase.js is in parent directory
import { doc, getDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage'; // Import deleteObject for old logo cleanup
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import COUNTRIES, { countryCodeToFlag } from '../../components/Countries';

const PartnerEdit = ({ route, navigation }) => {
  const { partnerId } = route.params;

  const [partnerData, setPartnerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [imageUri, setImageUri] = useState(null); // Local URI for selected new image
  const [currentLogoUrl, setCurrentLogoUrl] = useState(null); // URL of current logo from DB

  // Promotion states
  const [isPromoted, setIsPromoted] = useState(false);
  const [promotionDuration, setPromotionDuration] = useState(14); // Default 14 days
  const [promotionEndDate, setPromotionEndDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Form fields states (NOW INCLUDES ADRESSE AND SITEWEB)
  const [nom, setNom] = useState('');
  const [categorie, setCategorie] = useState('');
  const [ceo, setCeo] = useState('');
  const [manager, setManager] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [numeroTelephone, setNumeroTelephone] = useState('');
  const [adresse, setAdresse] = useState(''); // NEW
  const [siteWeb, setSiteWeb] = useState(''); // NEW

  // Country selection
  const [country, setCountry] = useState('');
  const [countryModalVisible, setCountryModalVisible] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');


  useEffect(() => {
    const fetchPartnerDetails = async () => {
      if (!partnerId) {
        Alert.alert("Erreur", "ID partenaire manquant.");
        navigation.goBack();
        return;
      }
      setLoading(true);
      try {
        const docRef = doc(db, 'partners', partnerId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          setPartnerData(data);
          // Populate form fields
          setNom(data.nom || '');
          setCategorie(data.categorie || '');
          setCeo(data.ceo || '');
          setManager(data.manager || '');
          setDescription(data.description || '');
          setEmail(data.email || '');
          setNumeroTelephone(data.numeroTelephone || '');
          setAdresse(data.adresse || ''); // NEW: Populate adresse
          setSiteWeb(data.siteWeb || ''); // NEW: Populate siteWeb
          setCurrentLogoUrl(data.logo || null); // Use 'logo' field
          setCountry(data.pays || data.country || '');

          // Populate promotion states
          setIsPromoted(data.estPromu || false);
          setPromotionDuration(data.promotionDuration || 14);
          if (data.promotionEndDate?.toDate) {
            setPromotionEndDate(data.promotionEndDate.toDate());
          } else {
            setPromotionEndDate(null);
          }

        } else {
          Alert.alert("Erreur", "Partenaire non trouvé.");
          navigation.goBack();
        }
      } catch (error) {
        console.error("Error fetching partner details for edit:", error);
        Alert.alert("Erreur", "Impossible de charger les détails du partenaire.");
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    fetchPartnerDetails();
  }, [partnerId, navigation]);

  const requestImagePickerPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Désolé, nous avons besoin des autorisations d\'accès à la pellicule pour que cela fonctionne !');
      return false;
    }
    return true;
  };

  const pickImage = async () => {
    const hasPermission = await requestImagePickerPermission();
    if (!hasPermission) {
      return;
    }

    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setImageUri(result.assets[0].uri); // Set local URI for preview
      } else {
        console.log("Sélecteur d'images annulé ou aucune image sélectionnée.");
      }
    } catch (error) {
      console.error("Erreur lors de l'ouverture de la galerie d'images:", error);
      Alert.alert("Erreur", "Échec de l'ouverture de la galerie d'images.");
    }
  };

  // Helper to delete old image from Firebase Storage
  const deleteOldImage = async (oldImageUrl) => {
    if (oldImageUrl && typeof oldImageUrl === 'string' && oldImageUrl.startsWith('https://firebasestorage.googleapis.com/')) {
        try {
            const oldPath = new URL(oldImageUrl).pathname.split('/o/')[1].split('?')[0];
            const decodedOldPath = decodeURIComponent(oldPath);
            const oldImageRef = ref(storage, decodedOldPath);
            await deleteObject(oldImageRef);
            console.log("Ancien logo supprimé du stockage:", decodedOldPath);
        } catch (deleteError) {
            console.warn("Erreur lors de la suppression de l'ancien logo (peut-être déjà supprimé ou chemin invalide):", deleteError);
        }
    }
  };


  const uploadImageToFirebase = async (uri) => {
    if (!uri) return null;
    setUploadingImage(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `partner_logos/${partnerId}/${Date.now()}.jpg`; // Consistent path for logos
      const storageRef = ref(storage, filename);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      // Delete old logo ONLY if a new one was successfully uploaded
      if (currentLogoUrl && currentLogoUrl !== downloadURL) {
          await deleteOldImage(currentLogoUrl);
      }
      
      return downloadURL;
    } catch (error) {
      console.error("Error uploading image:", error);
      Alert.alert("Erreur d'upload", "Impossible de télécharger l'image de profil.");
      return null;
    } finally {
      setUploadingImage(false);
    }
  };

  const handlePromotionDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setPromotionEndDate(selectedDate);
      // Calculate duration from today to selected date
      const today = new Date();
      today.setHours(0,0,0,0);
      const diffTime = selectedDate.getTime() - today.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setPromotionDuration(Math.max(0, diffDays)); // Ensure duration is not negative
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalLogoUrl = currentLogoUrl; // Start with current DB URL
      if (imageUri) { // If a new image was selected locally
        finalLogoUrl = await uploadImageToFirebase(imageUri);
        if (!finalLogoUrl) {
          throw new Error("Échec du téléchargement du nouveau logo.");
        }
      }

      const partnerRef = doc(db, 'partners', partnerId);
      const updateData = {
        nom: nom.trim(), // Use 'nom' for consistency in DB if client uses 'name'
        categorie: categorie.trim(), // Use 'categorie'
        ceo: ceo.trim(),
        manager: manager.trim(),
        description: description.trim(),
        email: email.trim(),
        numeroTelephone: numeroTelephone.trim(),
        adresse: adresse.trim(), // NEW: Include adresse
        siteWeb: siteWeb.trim(), // NEW: Include siteWeb
        logo: finalLogoUrl, // Ensure saving to 'logo' field
        updatedAt: serverTimestamp(),
        // Promotion fields
        estPromu: isPromoted,
      };
      
      // Ensure that fields like 'name' and 'category' are preserved in case the DB is using English keys
      // While the states are in French, the database keys were loaded/saved with what appears to be a mix.
      // Assuming a strict DB structure using English keys for global data:
      updateData.name = nom.trim();
      updateData.category = categorie.trim();
      
      // Handle data cleanup if values are empty after trim
      Object.keys(updateData).forEach(key => {
        if (typeof updateData[key] === 'string' && updateData[key] === '') {
          updateData[key] = deleteField();
        }
      });

      if (isPromoted) {
        // Recalculate promotion end date if duration changed or if it was null
        const calculatedEndDate = promotionEndDate || new Date(new Date().getTime() + promotionDuration * 24 * 60 * 60 * 1000);
        calculatedEndDate.setHours(23, 59, 59, 999); // Set to end of day for consistency

        updateData.promotionDuration = promotionDuration;
        updateData.promotionStartDate = serverTimestamp(); // Mark promotion start at save time
        updateData.promotionEndDate = calculatedEndDate;
      } else {
        updateData.promotionDuration = deleteField();
        updateData.promotionStartDate = deleteField();
        updateData.promotionEndDate = deleteField();
      }
      // Persist country (pays) or remove if empty
      if (country) {
        updateData.pays = country;
      } else {
        updateData.pays = deleteField();
      }
      
      await updateDoc(partnerRef, updateData);

      Alert.alert("Succès", "Informations du partenaire mises à jour !");
      navigation.goBack(); // Go back to PartnerDetails
    } catch (error) {
      console.error("Error saving partner details:", error);
      Alert.alert("Erreur", "Impossible d'enregistrer les modifications: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a6bff" />
        <Text style={styles.loadingText}>Chargement des détails du partenaire...</Text>
      </View>
    );
  }
  
  const filteredCountries = COUNTRIES.filter(c => 
    c.name.toLowerCase().includes(countrySearch.trim().toLowerCase()) || 
    c.code.toLowerCase().includes(countrySearch.trim().toLowerCase())
  );
  
  const renderCountryItem = ({ item }) => (
    <TouchableOpacity
      style={styles.countryModalItem}
      onPress={() => {
        setCountry(item.code);
        setCountryModalVisible(false);
        setCountrySearch(''); // Clear search on selection
      }}
    >
      <Text style={styles.countryFlag}>{item.flag}</Text>
      <Text style={styles.countryName}>{item.name}</Text>
      <Ionicons name={item.code === country ? "checkmark-circle" : "ellipse-outline"} size={20} color={item.code === country ? "#34C759" : "#D1D5DB"} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#2D3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Modifier Partenaire</Text>
          <View style={{ width: 24 }} /> {/* Placeholder for consistent spacing */}
        </View>
        
        {/* Country selection modal - Full Screen for better UX */}
        <Modal
          animationType="slide"
          transparent={false}
          visible={countryModalVisible}
          onRequestClose={() => {setCountryModalVisible(false); setCountrySearch('');}}
        >
          <SafeAreaView style={styles.countryModalContainer}>
            <View style={styles.countryModalHeader}>
              <TouchableOpacity onPress={() => {setCountryModalVisible(false); setCountrySearch('');}}>
                <Ionicons name="close" size={28} color="#2D3748" />
              </TouchableOpacity>
              <Text style={styles.countryModalTitle}>Sélectionnez un pays</Text>
              <View style={{ width: 28 }} />
            </View>
            
            <View style={styles.countryModalSearchBar}>
              <Ionicons name="search" size={20} color="#9CA3AF" style={{ marginRight: 10 }} />
              <TextInput
                placeholder="Rechercher par nom ou code..."
                placeholderTextColor="#9CA3AF"
                value={countrySearch}
                onChangeText={setCountrySearch}
                style={styles.countryModalSearchInput}
              />
            </View>
            
            <FlatList
              data={filteredCountries}
              keyExtractor={(item) => item.code}
              renderItem={renderCountryItem}
              ItemSeparatorComponent={() => <View style={styles.countryModalSeparator} />}
              contentContainerStyle={{ paddingHorizontal: 15 }}
            />
          </SafeAreaView>
        </Modal>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        
        <View style={styles.card}>
          <TouchableOpacity onPress={pickImage} style={styles.imagePickerContainer}>
            <Image
              source={imageUri ? { uri: imageUri } : (currentLogoUrl ? { uri: currentLogoUrl } : require('../../assets/images/Profile.png'))}
              style={styles.profileImage}
            />
            {uploadingImage ? (
              <ActivityIndicator size="small" color="#4a6bff" style={styles.imageUploadIndicator} />
            ) : (
              <MaterialIcons name="camera-alt" size={30} color="#666" style={styles.cameraIcon} />
            )}
          </TouchableOpacity>

          <TextInput style={styles.input} placeholder="Nom de l'entreprise" value={nom} onChangeText={setNom} />
          <TextInput style={styles.input} placeholder="Catégorie (ex: Hôtel, Clinique)" value={categorie} onChangeText={setCategorie} />
          <TextInput style={styles.input} placeholder="CEO / Fondateur" value={ceo} onChangeText={setCeo} />
          <TextInput style={styles.input} placeholder="Manager" value={manager} onChangeText={setManager} />
          <TextInput style={[styles.input, styles.descriptionInput]} placeholder="Description" multiline value={description} onChangeText={setDescription} />
          <TextInput style={styles.input} placeholder="Email" keyboardType="email-address" value={email} onChangeText={setEmail} />
          <TextInput style={styles.input} placeholder="Numéro de téléphone" keyboardType="phone-pad" value={numeroTelephone} onChangeText={setNumeroTelephone} />
          <TextInput style={styles.input} placeholder="Adresse" value={adresse} onChangeText={setAdresse} /> 
          <TextInput style={styles.input} placeholder="Site Web" keyboardType="url" autoCapitalize="none" value={siteWeb} onChangeText={setSiteWeb} /> 

          <View style={{ marginBottom: 15 }}>
            <Text style={styles.modalLabel}>Pays</Text>
            <TouchableOpacity style={styles.countrySelectInput} onPress={() => setCountryModalVisible(true)}>
              <Text style={styles.countrySelectText}>
                {country ? `${countryCodeToFlag(country)}  ${COUNTRIES.find(c => c.code === country)?.name || country}` : 'Sélectionner un pays'}
              </Text>
              <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
            </TouchableOpacity>
          </View>


          <Text style={styles.sectionHeading}>Statut de Promotion</Text>
          <View style={styles.promoToggleContainer}>
            <Text style={styles.promoToggleLabel}>Promouvoir ce partenaire:</Text>
            <TouchableOpacity
              style={[styles.toggleButton, isPromoted ? styles.toggleButtonActive : styles.toggleButtonInactive]}
              onPress={() => setIsPromoted(!isPromoted)}
            >
              <Text style={styles.toggleButtonText}>{isPromoted ? 'Oui' : 'Non'}</Text>
            </TouchableOpacity>
          </View>

          {isPromoted && (
            <View>
              <Text style={styles.modalLabel}>Durée de la promotion (jours):</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 14 ou 30 jours"
                keyboardType="numeric"
                value={String(promotionDuration)}
                onChangeText={(text) => setPromotionDuration(parseInt(text) || 0)}
              />

              <TouchableOpacity onPress={() => setShowDatePicker(true)} style={styles.datePickerButton}>
                <Ionicons name="calendar-outline" size={20} color="#2D3748" />
                <Text style={styles.datePickerText}>
                  {promotionEndDate ? `Fin: ${moment(promotionEndDate).format('DD/MM/YYYY')}` : 'Sélectionner une date de fin'}
                </Text>
              </TouchableOpacity>
              {showDatePicker && (
                <DateTimePicker
                  value={promotionEndDate || new Date()}
                  mode="date"
                  display="default"
                  onChange={handlePromotionDateChange}
                  minimumDate={new Date()}
                />
              )}
            </View>
          )}

          <TouchableOpacity
            style={[styles.saveButton, (saving || uploadingImage) && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving || uploadingImage}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Text style={styles.saveButtonText}>Enregistrer les modifications</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  scrollViewContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 10,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#4A5568',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: 'white', // Ensure header background is clean
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  imagePickerContainer: {
    alignSelf: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  profileImage: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: '#E0E0E0',
    borderWidth: 2,
    borderColor: '#D1D5DB',
  },
  cameraIcon: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: '#4a6bff', // Changed background color to primary
    borderRadius: 18,
    padding: 8,
    color: 'white',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: 'white',
  },
  imageUploadIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 18,
    padding: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
    color: '#333',
  },
  countrySelectInput: { // New style for the selection input
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
    color: '#333',
  },
  countrySelectText: {
    fontSize: 16,
    color: '#333',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  saveButton: {
    backgroundColor: '#4a6bff',
    paddingVertical: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
    shadowColor: '#4a6bff',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  saveButtonDisabled: {
    backgroundColor: '#A0BFFF',
    elevation: 0,
    shadowOpacity: 0,
  },
  sectionHeading: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2D3748',
    marginTop: 10,
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 5,
  },
  promoToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  promoToggleLabel: {
    fontSize: 16,
    color: '#4A5568',
    fontWeight: '600',
  },
  toggleButton: {
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 80,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#34C759',
  },
  toggleButtonInactive: {
    backgroundColor: '#FF3B30',
  },
  toggleButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 15,
  },
  modalLabel: { 
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 10,
    marginTop: 5,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  datePickerText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  
  // --- Country Modal Styles ---
  countryModalContainer: {
    flex: 1,
    backgroundColor: 'white',
  },
  countryModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  countryModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  countryModalSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 15,
    margin: 15,
  },
  countryModalSearchInput: {
    flex: 1,
    height: 45,
    fontSize: 16,
    color: '#333',
  },
  countryModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F8',
  },
  countryFlag: {
    fontSize: 24,
    marginRight: 15,
  },
  countryName: {
    flex: 1,
    fontSize: 17,
    color: '#2D3748',
  },
  countryModalSeparator: {
    height: 1,
    backgroundColor: '#F0F4F8',
    marginHorizontal: 0,
  },
});

export default PartnerEdit;
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Modal,
  ScrollView,
  Dimensions,
  Image // Import Image
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons'; // Keep Ionicons/Feather if still used elsewhere
import * as ImagePicker from 'expo-image-picker';
// --- MODIFIED: Import db and storage directly from your firebase.js ---
import { db, storage } from '../firebase'; // Assuming 'db' and 'storage' are exported from firebase.js
// --- END MODIFIED ---
import { collection, getDocs, deleteDoc, doc, query, where, writeBatch, addDoc, onSnapshot, getDoc } from 'firebase/firestore'; // Added getDoc for handleDeletePromotion
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';

// --- NEW: Import your custom icons ---
const TRASH_2_ICON = require('../assets/icons/delete.png'); // For delete promotion button
const IMAGE_EMPTY_STATE_ICON = require('../assets/icons/promos.png'); // For empty state image
const ADD_ICON_PROMO = require('../assets/icons/add_circle.png'); // For add button
const CLOSE_ICON = require('../assets/icons/close_circle.png'); // For modal close button
const IMAGE_PICKER_ICON = require('../assets/icons/image.png'); // For image picker button
import PromotionEditorModal from '../components/PromotionEditorModal'; // Import the new modal component
// --- END NEW IMPORTS ---

// --- MODIFIED: Add 'navigation' as a prop ---
const Promotions = ({ navigation }) => {
// --- END MODIFIED ---
  const [promotions, setPromotions] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [newPromotion, setNewPromotion] = useState({
    title: '',
    description: '',
    moreInformation: '', 
    image: null,
  });

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Using 'news' collection as per your previous implementation for Promotions (if promotions are stored there)
  const promotionsCollectionRef = collection(db, 'news'); 

  useEffect(() => {
    const unsubscribe = onSnapshot(promotionsCollectionRef, (snapshot) => {
      const promotionsList = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date();
        promotionsList.push({ id: doc.id, ...data, createdAt });
      });
      promotionsList.sort((a, b) => b.createdAt - a.createdAt); 
      setPromotions(promotionsList);
    });

    return () => unsubscribe();
  }, []);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to upload images');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3], 
      quality: 0.8,
    });

    if (!result.canceled) {
      setNewPromotion({...newPromotion, image: result.assets[0].uri});
    }
  };

  const uploadImage = async (uri) => {
    setUploading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `promotions_images/${Date.now()}`); 
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Upload error:', error);
      throw error;
    } finally {
      setUploading(false);
    }
  };

  const handleAddPromotion = async () => {
    if (!newPromotion.title.trim() || !newPromotion.description.trim() || !newPromotion.moreInformation.trim()) {
      Alert.alert('Required fields', 'Please fill in Title, Description, and More Information.');
      return;
    }

    setLoading(true);
    try {
      let imageUrl = '';
      if (newPromotion.image) {
        imageUrl = await uploadImage(newPromotion.image);
      }

      await addDoc(promotionsCollectionRef, {
        title: newPromotion.title,
        description: newPromotion.description,
        moreInformation: newPromotion.moreInformation, 
        imageUrl: imageUrl,
        createdAt: new Date(), 
        type: 'promotion'
      });

      setModalVisible(false);
      setNewPromotion({
        title: '',
        description: '',
        moreInformation: '',
        image: null
      });
    } catch (error) {
      console.error('Error adding promotion:', error);
      Alert.alert('Error', 'Failed to add promotion');
    } finally {
      setLoading(false);
    }
  };

  const handleDeletePromotion = async (id) => {
    Alert.alert(
      'Delete Promotion',
      'Are you sure you want to delete this promotion?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              const promoDocRef = doc(db, 'news', id);
              const promoDocSnap = await getDoc(promoDocRef);
              const promoData = promoDocSnap.data();

              await deleteDoc(promoDocRef);

              if (promoData?.imageUrl) {
                try {
                  const fileRef = ref(storage, promoData.imageUrl);
                  await deleteObject(fileRef);
                  console.log("Image deleted from Storage successfully!");
                } catch (storageError) {
                  console.warn("Could not delete image from Storage (might not exist or path mismatch):", storageError);
                }
              }
              Alert.alert('Success', 'Promotion deleted successfully');
            } catch (error) {
              console.error('Error deleting promotion:', error);
              Alert.alert('Error', 'Failed to delete promotion');
            }
          }
        }
      ]
    );
  };

  const renderPromotionItem = ({ item }) => (
    <TouchableOpacity
      style={styles.promotionCard}
      onPress={() => navigation.navigate('NewsDetail', { newsItem: item })}
      activeOpacity={0.8}
    >
      {item.imageUrl && (
        <Image 
          source={{ uri: item.imageUrl }} 
          style={styles.promotionImage}
          resizeMode="cover"
        />
      )}
      
      <View style={styles.promotionContent}>
        <Text style={styles.promotionTitle}>{item.title}</Text>
        <Text style={styles.promotionDescription}>{item.description}</Text>
        {item.moreInformation && (
          <Text style={styles.promotionMoreInformation}>
            {item.moreInformation.length > 120 
              ? `${item.moreInformation.substring(0, 117)}...`
              : item.moreInformation}
          </Text>
        )}
        
        <View style={styles.promotionFooter}>
          <Text style={styles.promotionDate}>
            {item.createdAt ? new Date(item.createdAt).toLocaleDateString('fr-FR') : 'Date inconnue'}
          </Text>
          
          <TouchableOpacity 
            onPress={() => handleDeletePromotion(item.id)}
            style={styles.deleteButton}
          >
            <Image source={TRASH_2_ICON} style={styles.customDeletePromotionIcon} />
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={promotions}
        renderItem={renderPromotionItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Image source={IMAGE_EMPTY_STATE_ICON} style={styles.customEmptyStateIcon} />
            <Text style={styles.emptyText}>No promotions available</Text>
          </View>
        }
      />

      <TouchableOpacity 
        style={styles.addButton}
        onPress={() => {
          setNewPromotion({
            title: '',
            description: '',
            moreInformation: '',
            image: null,
          });
          setModalVisible(true);
        }}
      >
        <Image source={ADD_ICON_PROMO} style={styles.customAddButtonIcon} />
      </TouchableOpacity>

      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <ScrollView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add New Promotion</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Image source={CLOSE_ICON} style={styles.customModalCloseIcon} />
            </TouchableOpacity>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter promotion title"
              value={newPromotion.title}
              onChangeText={(text) => setNewPromotion({...newPromotion, title: text})}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              placeholder="Enter brief promotion details"
              multiline
              numberOfLines={3} 
              value={newPromotion.description}
              onChangeText={(text) => setNewPromotion({...newPromotion, description: text})}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>More Information</Text>
            <TextInput
              style={[styles.input, styles.descriptionInput]} 
              placeholder="Provide detailed information about the promotion"
              multiline
              numberOfLines={6} 
              value={newPromotion.moreInformation}
              onChangeText={(text) => setNewPromotion({...newPromotion, moreInformation: text})}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Image</Text>
            <TouchableOpacity 
              style={styles.imagePickerButton}
              onPress={pickImage} 
            >
              {newPromotion.image ? (
                <Image 
                  source={{ uri: newPromotion.image }} 
                  style={styles.imagePreview}
                />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Image source={IMAGE_PICKER_ICON} style={styles.customImagePickerIcon} />
                  <Text style={styles.imagePlaceholderText}>Select an image</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.cancelButton]}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
              style={[styles.button, styles.submitButton]}
              onPress={handleAddPromotion}
              disabled={loading || uploading}
            >
              {loading || uploading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.buttonText}>Add Promotion</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  listContainer: {
    padding: 16,
  },
  promotionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  promotionImage: {
    width: '100%',
    height: 180,
  },
  promotionContent: {
    padding: 16,
  },
  promotionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  promotionDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8, 
    lineHeight: 20,
  },
  promotionMoreInformation: {
    fontSize: 13, 
    color: '#777',
    marginBottom: 12, 
    lineHeight: 18,
    fontStyle: 'italic',
  },
  promotionFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promotionDate: {
    fontSize: 12,
    color: '#999',
  },
  deleteButton: {
    padding: 6,
  },
  // --- NEW STYLE for custom delete promotion icon ---
  customDeletePromotionIcon: {
    width: 20, // Match Feather size
    height: 20, // Match Feather size
    resizeMode: 'contain',
    tintColor: '#ff4444', // Match Feather color
  },
  // --- END NEW STYLE ---
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyText: {
    marginTop: 16,
    color: '#999',
    fontSize: 16,
  },
  // --- NEW STYLE for custom empty state icon ---
  customEmptyStateIcon: {
    width: 48, // Match Feather size
    height: 48, // Match Feather size
    resizeMode: 'contain',
    tintColor: '#cccccc', // Match Feather color
  },
  // --- END NEW STYLE ---
  addButton: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    backgroundColor: '#4a6bff',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  // --- NEW STYLE for custom add button icon ---
  customAddButtonIcon: {
    width: 28, // Match Ionicons size
    height: 28, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: 'white', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
    paddingTop: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
  },
  // --- NEW STYLE for custom modal close icon ---
  customModalCloseIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#333', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: '#333',
  },
  descriptionInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  imagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholderText: {
    marginTop: 8,
    color: '#666',
  },
  // --- NEW STYLE for custom image picker icon ---
  customImagePickerIcon: {
    width: 32, // Match Feather size
    height: 32, // Match Feather size
    resizeMode: 'contain',
    tintColor: '#666', // Match Feather color
  },
  // --- END NEW STYLE ---
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 40,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 8,
  },
  cancelButton: {
    backgroundColor: '#f0f0f0',
  },
  submitButton: {
    backgroundColor: '#4a6bff',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default Promotions;
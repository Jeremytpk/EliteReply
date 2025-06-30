import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator
} from 'react-native';
import { Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getFirestore, collection, doc, addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '../firebase';

const Promotions = () => {
  const [promotions, setPromotions] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newPromotion, setNewPromotion] = useState({
    title: '',
    description: '',
    image: null
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const db = getFirestore(app);
  const storage = getStorage(app);
  const promotionsCollectionRef = collection(db, 'news');

  useEffect(() => {
    const unsubscribe = onSnapshot(promotionsCollectionRef, (snapshot) => {
      const promotionsList = [];
      snapshot.forEach(doc => {
        promotionsList.push({ id: doc.id, ...doc.data() });
      });
      // Sort by newest first
      promotionsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
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
      const storageRef = ref(storage, `promotions/${Date.now()}`);
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
    if (!newPromotion.title.trim() || !newPromotion.description.trim()) {
      Alert.alert('Required fields', 'Please fill in both title and description');
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
        imageUrl: imageUrl,
        createdAt: new Date().toISOString(),
        type: 'promotion'
      });

      setModalVisible(false);
      setNewPromotion({
        title: '',
        description: '',
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
              await deleteDoc(doc(db, 'news', id));
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
    <View style={styles.promotionCard}>
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
        
        <View style={styles.promotionFooter}>
          <Text style={styles.promotionDate}>
            {new Date(item.createdAt).toLocaleDateString()}
          </Text>
          
          <TouchableOpacity 
            onPress={() => handleDeletePromotion(item.id)}
            style={styles.deleteButton}
          >
            <Feather name="trash-2" size={20} color="#ff4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
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
            <Feather name="image" size={48} color="#cccccc" />
            <Text style={styles.emptyText}>No promotions available</Text>
          </View>
        }
      />

      <TouchableOpacity 
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <Ionicons name="add" size={28} color="white" />
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
              <Ionicons name="close" size={24} color="#333" />
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
              placeholder="Enter promotion details"
              multiline
              numberOfLines={4}
              value={newPromotion.description}
              onChangeText={(text) => setNewPromotion({...newPromotion, description: text})}
            />
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.label}>Poster Image</Text>
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
                  <Feather name="image" size={32} color="#666" />
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
    marginBottom: 12,
    lineHeight: 20,
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
  modalContainer: {
    flex: 1,
    backgroundColor: 'white',
    padding: 20,
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
  imagePreview: {
    width: '100%',
    height: '100%',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
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
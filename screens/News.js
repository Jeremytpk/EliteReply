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
  Dimensions,
  Alert
} from 'react-native';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getFirestore, collection, doc, addDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '../firebase';

const { width } = Dimensions.get('window');

const News = ({ route }) => {
  const { newsItem, isAdmin = false } = route.params || {};
  const [newsList, setNewsList] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [newNews, setNewNews] = useState({
    title: '',
    description: '',
    image: null,
    imageUrl: '',
    backgroundColor: '#f0f4ff'
  });

  const db = getFirestore(app);
  const storage = getStorage(app);
  const newsCollectionRef = collection(db, 'news');

  const formatNewsDate = (date) => {
  try {
    // If it's a Firestore Timestamp, convert to Date
    const dateObj = date?.toDate?.() || new Date(date || Date.now());
    return dateObj.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Date inconnue'; // Fallback text
  }
};

  useEffect(() => {
  const unsubscribe = onSnapshot(newsCollectionRef, (snapshot) => {
    const items = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      // Convert Firestore Timestamp to Date if needed
      const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt || Date.now());
      items.push({ 
        id: doc.id, 
        ...data,
        createdAt
      });
    });
    setNewsList(items.sort((a, b) => b.createdAt - a.createdAt));
  });

  return () => unsubscribe();
}, []);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled) {
      setNewNews({...newNews, image: result.assets[0].uri});
    }
  };

  const uploadImage = async (uri) => {
    const response = await fetch(uri);
    const blob = await response.blob();
    const storageRef = ref(storage, `news-images/${Date.now()}`);
    await uploadBytes(storageRef, blob);
    return await getDownloadURL(storageRef);
  };

  const handleAddNews = async () => {
    if (!newNews.title || !newNews.description) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    try {
      let imageUrl = newNews.imageUrl;
      if (newNews.image) {
        imageUrl = await uploadImage(newNews.image);
      }

      await addDoc(newsCollectionRef, {
        title: newNews.title,
        description: newNews.description,
        imageUrl,
        backgroundColor: newNews.backgroundColor,
        createdAt: new Date()
      });

      setModalVisible(false);
      setNewNews({
        title: '',
        description: '',
        image: null,
        imageUrl: '',
        backgroundColor: '#f0f4ff'
      });
    } catch (error) {
      console.error('Error adding news: ', error);
      Alert.alert('Error', 'Failed to add news');
    }
  };

  const handleDeleteNews = async (id) => {
    try {
      await deleteDoc(doc(db, 'news', id));
    } catch (error) {
      console.error('Error deleting news: ', error);
      Alert.alert('Error', 'Failed to delete news');
    }
  };

  const renderNewsItem = ({ item }) => (
    <View style={[styles.newsCard, { backgroundColor: item.backgroundColor || '#f0f4ff' }]}>
      {item.imageUrl && (
        <Image 
          source={{ uri: item.imageUrl }} 
          style={styles.newsImage}
          resizeMode="cover"
        />
      )}
      <View style={styles.newsContent}>
  <Text style={styles.newsTitle}>{item.title}</Text>
  <Text style={styles.newsDescription}>{item.description}</Text>
  <Text style={styles.newsDate}>
    {formatNewsDate(item.createdAt)}
  </Text>
</View>
      
      {isAdmin && (
        <TouchableOpacity 
          style={styles.deleteButton}
          onPress={() => handleDeleteNews(item.id)}
        >
          <Feather name="trash-2" size={20} color="red" />
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Single News View */}
      {newsItem ? (
        <ScrollView contentContainerStyle={styles.singleNewsContainer}>
          {renderNewsItem({ item: newsItem })}
        </ScrollView>
      ) : (
        /* News List View */
        <FlatList
          data={newsList}
          renderItem={renderNewsItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Admin Controls */}
      {isAdmin && (
        <>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => setModalVisible(true)}
          >
            <Ionicons name="add" size={28} color="white" />
          </TouchableOpacity>

          <Modal
            animationType="slide"
            transparent={true}
            visible={modalVisible}
            onRequestClose={() => setModalVisible(false)}
          >
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Add News</Text>
                
                <TextInput
                  style={styles.input}
                  placeholder="Title"
                  value={newNews.title}
                  onChangeText={(text) => setNewNews({...newNews, title: text})}
                />
                
                <TextInput
                  style={[styles.input, styles.descriptionInput]}
                  placeholder="Description"
                  multiline
                  numberOfLines={4}
                  value={newNews.description}
                  onChangeText={(text) => setNewNews({...newNews, description: text})}
                />
                
                <TouchableOpacity 
                  style={styles.imagePickerButton}
                  onPress={pickImage}
                >
                  <Text style={styles.imagePickerText}>Select Image</Text>
                </TouchableOpacity>
                
                {newNews.image && (
                  <Image 
                    source={{ uri: newNews.image }} 
                    style={styles.imagePreview} 
                    resizeMode="contain"
                  />
                )}
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setModalVisible(false)}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.submitButton]}
                    onPress={handleAddNews}
                  >
                    <Text style={styles.buttonText}>Publish</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  singleNewsContainer: {
    padding: 16,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  newsCard: {
    borderRadius: 12,
    marginBottom: 20,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  newsImage: {
    width: '100%',
    resizeMode: 'contain',
    height: width * 0.6,
  },
  newsContent: {
    padding: 20,
  },
  newsTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 10,
  },
  newsDescription: {
    fontSize: 16,
    lineHeight: 22,
    color: '#4a4a4a',
    marginBottom: 15,
  },
  newsDate: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
  },
  addButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    backgroundColor: '#0a8fdf',
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  deleteButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 8,
    borderRadius: 20,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    backgroundColor: '#f9f9f9',
  },
  descriptionInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    backgroundColor: '#f0f4ff',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 15,
  },
  imagePickerText: {
    color: '#0a8fdf',
    fontWeight: '500',
  },
  imagePreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f1f1f1',
  },
  submitButton: {
    backgroundColor: '#0a8fdf',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

export default News;
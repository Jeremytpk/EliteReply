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
  Alert,
  ActivityIndicator 
} from 'react-native';
import { MaterialCommunityIcons, Ionicons, Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { getFirestore, collection, doc, addDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore'; 
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { app } from '../firebase';
import { useNavigation } from '@react-navigation/native'; // Added useNavigation hook

const { width } = Dimensions.get('window');

const News = ({ route }) => { 
  const navigation = useNavigation();
  const { isAdmin = false } = route.params || {}; 
  const [newsList, setNewsList] = useState([]);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [newNews, setNewNews] = useState({
    title: '',
    description: '',
    moreInformation: '', 
    poster: null,         
    backgroundColor: '#f0f4ff'
  });

  const [loading, setLoading] = useState(false); 
  const [uploading, setUploading] = useState(false); 

  const db = getFirestore(app);
  const storage = getStorage(app);
  const newsCollectionRef = collection(db, 'news'); 

  const formatNewsDate = (date) => {
    try {
      const dateObj = date?.toDate?.() || new Date(date || Date.now());
      return dateObj.toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Date inconnue';
    }
  };

  useEffect(() => {
    const q = query(newsCollectionRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const createdAt = data.createdAt?.toDate?.() || new Date(data.createdAt || Date.now());
        items.push({ 
          id: doc.id, 
          title: data.title,
          description: data.description,
          moreInformation: data.moreInformation,
          imageUrl: data.imageUrl, 
          backgroundColor: data.backgroundColor,
          createdAt
        });
      });
      setNewsList(items); 
    });

    return () => unsubscribe();
  }, []);

  const pickPoster = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission required', 'We need access to your photos to select an image for the news post.');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3], 
      quality: 0.8,
    });

    if (!result.canceled) {
      setNewNews({...newNews, poster: result.assets[0].uri});
    }
  };

  const uploadPoster = async (uri) => {
    setUploading(true); 
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `news-posters/${Date.now()}`); 
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Upload error:', error);
      Alert.alert('Upload Failed', 'Could not upload image. Please try again.');
      throw error; 
    } finally {
      setUploading(false); 
    }
  };

  const handleAddNews = async () => {
    if (!newNews.title.trim() || !newNews.description.trim() || !newNews.moreInformation.trim()) {
      Alert.alert('Required fields', 'Please fill in Title, Description, and More Information.');
      return;
    }

    setLoading(true); 
    try {
      let uploadedImageUrl = ''; 
      if (newNews.poster) {
        uploadedImageUrl = await uploadPoster(newNews.poster);
      }

      await addDoc(newsCollectionRef, {
        title: newNews.title,
        description: newNews.description,
        moreInformation: newNews.moreInformation, 
        imageUrl: uploadedImageUrl, 
        backgroundColor: newNews.backgroundColor,
        createdAt: new Date(),
        type: 'news' 
      });

      setModalVisible(false);
      setNewNews({
        title: '',
        description: '',
        moreInformation: '',
        poster: null, 
        backgroundColor: '#f0f4ff'
      });
    } catch (error) {
      console.error('Error adding news: ', error);
      Alert.alert('Error', 'Failed to add news. Please check your network and try again.');
    } finally {
      setLoading(false); 
    }
  };

  const handleDeleteNews = async (id) => {
    Alert.alert(
      'Delete News Post',
      'Are you sure you want to delete this news post? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            setLoading(true); 
            try {
              await deleteDoc(doc(db, 'news', id));
            } catch (error) {
              console.error('Error deleting news: ', error);
              Alert.alert('Error', 'Failed to delete news post.');
            } finally {
              setLoading(false); 
            }
          }
        }
      ]
    );
  };

  const renderNewsItem = ({ item }) => (
    <TouchableOpacity 
      style={[styles.newsCard, { backgroundColor: item.backgroundColor || '#f0f4ff' }]}
      onPress={() => navigation.navigate('NewsDetail', { newsItem: item, isAdmin })} // Pass the full item object
    >
      {item.imageUrl ? ( 
        <Image 
          source={{ uri: item.imageUrl }} 
          style={styles.newsImage}
          resizeMode="cover"
        />
      ) : (
        <View style={styles.newsImagePlaceholder}>
          <Feather name="image" size={50} color="#ccc" />
          <Text style={styles.newsImagePlaceholderText}>No Image</Text>
        </View>
      )}
      <View style={styles.newsContent}>
        <Text style={styles.newsTitle}>{item.title}</Text>
        <Text style={styles.newsDescription}>{item.description}</Text>
        {item.moreInformation && (
            <Text style={styles.newsMoreInfo}>
                {item.moreInformation.length > 100 
                 ? `${item.moreInformation.substring(0, 97)}...`
                 : item.moreInformation}
            </Text>
        )}
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
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={newsList}
        renderItem={renderNewsItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Feather name="info" size={48} color="#cccccc" />
            <Text style={styles.emptyText}>No news articles available yet.</Text>
            {isAdmin && <Text style={styles.emptyText}>Tap the '+' button to add one!</Text>}
          </View>
        }
      />

      {isAdmin && ( 
        <>
          <TouchableOpacity 
            style={styles.addButton}
            onPress={() => {
                setNewNews({ 
                    title: '',
                    description: '',
                    moreInformation: '',
                    poster: null, 
                    backgroundColor: '#f0f4ff'
                });
                setModalVisible(true);
            }}
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
              <ScrollView contentContainerStyle={styles.modalContent}> 
                <Text style={styles.modalTitle}>Add New News Article</Text> 
                
                <TextInput
                  style={styles.input}
                  placeholder="Title"
                  placeholderTextColor="#999"
                  value={newNews.title}
                  onChangeText={(text) => setNewNews({...newNews, title: text})}
                />
                
                <TextInput
                  style={[styles.input, styles.descriptionInput]}
                  placeholder="Short Description"
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={3} 
                  value={newNews.description}
                  onChangeText={(text) => setNewNews({...newNews, description: text})}
                />

                <TextInput
                  style={[styles.input, styles.moreInfoInput]} 
                  placeholder="Detailed Information (Blog Content)"
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={8} 
                  value={newNews.moreInformation}
                  onChangeText={(text) => setNewNews({...newNews, moreInformation: text})}
                />
                
                <TouchableOpacity 
                  style={styles.imagePickerButton}
                  onPress={pickPoster} 
                  disabled={uploading} 
                >
                  {newNews.poster ? ( 
                    <Image 
                      source={{ uri: newNews.poster }} 
                      style={styles.imagePreviewInButton} 
                      resizeMode="cover"
                    />
                  ) : (
                    uploading ? (
                      <ActivityIndicator size="small" color="#0a8fdf" />
                    ) : (
                      <Text style={styles.imagePickerText}>Select Poster Image</Text> 
                    )
                  )}
                </TouchableOpacity>
                
                <View style={styles.modalButtons}>
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setModalVisible(false)}
                    disabled={loading || uploading}
                  >
                    <Text style={styles.buttonText}>Cancel</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.modalButton, styles.submitButton]}
                    onPress={handleAddNews}
                    disabled={loading || uploading} 
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text style={styles.buttonText}>Publish Article</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </ScrollView>
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
    height: width * 0.6,
  },
  newsImagePlaceholder: {
    width: '100%',
    height: width * 0.6,
    backgroundColor: '#e0e0e0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  newsImagePlaceholderText: {
    marginTop: 10,
    color: '#888',
    fontSize: 14,
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
    marginBottom: 10, 
  },
  newsMoreInfo: { 
    fontSize: 14,
    color: '#6a6a6a',
    marginBottom: 15,
    fontStyle: 'italic',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  deleteButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    backgroundColor: 'rgba(255,255,255,0.8)',
    padding: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.22,
    shadowRadius: 2.22,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)', 
  },
  modalContent: {
    width: '90%',
    maxHeight: '90%', 
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 25, 
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 5.46,
  },
  modalTitle: {
    fontSize: 24, 
    fontWeight: 'bold',
    marginBottom: 25, 
    textAlign: 'center',
    color: '#333',
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0', 
    borderRadius: 8,
    padding: 14, 
    marginBottom: 18, 
    fontSize: 16,
    backgroundColor: '#fefefe',
    color: '#333',
  },
  descriptionInput: {
    minHeight: 100, 
    textAlignVertical: 'top',
  },
  moreInfoInput: { 
    minHeight: 150, 
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    backgroundColor: '#e6f2ff', 
    padding: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#cce5ff',
    justifyContent: 'center', 
    height: 150, 
    overflow: 'hidden', 
  },
  imagePickerText: {
    color: '#0a8fdf',
    fontWeight: '600',
    fontSize: 16,
  },
  imagePreviewInButton: { 
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    padding: 16, 
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 8,
    elevation: 2,
  },
  cancelButton: {
    backgroundColor: '#e9ecef',
  },
  submitButton: {
    backgroundColor: '#0a8fdf',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '700', 
    fontSize: 16,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50, 
  },
  emptyText: {
    marginTop: 15,
    fontSize: 18,
    color: '#a0a0a0',
    textAlign: 'center',
    lineHeight: 24,
  },
});

export default News;
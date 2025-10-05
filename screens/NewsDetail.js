import React from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  Dimensions,
  ActivityIndicator,
  Platform,
  TouchableOpacity,
  SafeAreaView
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import { useRoute, useNavigation } from '@react-navigation/native'; // Add useNavigation for back button

const { width } = Dimensions.get('window');

const NewsDetail = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { newsItem } = route.params || {};

  // Basic validation to ensure newsItem exists
  if (!newsItem) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="alert-triangle" size={40} color="#ef4444" />
        <Text style={styles.errorText}>Actualité non trouvée !</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Function to format date
  const formatNewsDate = (date) => {
    try {
      const dateObj = date?.toDate?.() || (date instanceof Date ? date : new Date(date || Date.now()));
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

  // Improved logic to handle both single imageUrl and imageUrls array
  const imageUrls = Array.isArray(newsItem.imageUrls) ? newsItem.imageUrls : (newsItem.imageUrl ? [newsItem.imageUrl] : []);
  const mainImageUrl = imageUrls.length > 0 ? imageUrls[0] : null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backIconContainer}>
            <Ionicons name="arrow-back" size={28} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1} ellipsizeMode='tail'>
            Actualité
          </Text>
          <View style={styles.placeholderIcon} />
        </View>

        <View style={[styles.newsCardFull, { backgroundColor: newsItem.backgroundColor || 'white' }]}>
          {mainImageUrl ? (
            <Image
              source={{ uri: mainImageUrl }}
              style={styles.newsImageFull}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.newsImagePlaceholderFull}>
              <Feather name="image" size={60} color="#ccc" />
              <Text style={styles.newsImagePlaceholderTextFull}>Pas d'image</Text>
            </View>
          )}
          <View style={styles.newsContentFull}>
            <Text style={styles.newsTitleFull}>{newsItem.title}</Text>
            <Text style={styles.newsDescriptionFull}>{newsItem.description}</Text>

            {newsItem.moreInformation && (
                <Text style={styles.newsMoreInfoFull}>{newsItem.moreInformation}</Text>
            )}

            {/* Render a gallery if there are multiple images */}
            {imageUrls.length > 1 && (
              <View style={styles.galleryContainer}>
                <Text style={styles.galleryTitle}>Galerie</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {imageUrls.map((url, index) => (
                    <Image key={index} source={{ uri: url }} style={styles.galleryImage} />
                  ))}
                </ScrollView>
              </View>
            )}

            <Text style={styles.newsDateFull}>{formatNewsDate(newsItem.createdAt)}</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'android' ? 35 : 0,
  },
  backIconContainer: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  placeholderIcon: {
    width: 28 + 10,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  errorText: {
    marginTop: 10,
    fontSize: 18,
    color: '#ef4444',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 20,
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  newsCardFull: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'white',
    margin: 16,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  newsImageFull: {
    width: '100%',
    height: width * 0.75,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  newsImagePlaceholderFull: {
    width: '100%',
    height: width * 0.75,
    backgroundColor: '#d0d0d0',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  newsImagePlaceholderTextFull: {
    marginTop: 15,
    color: '#777',
    fontSize: 16,
    fontWeight: '500',
  },
  newsContentFull: {
    padding: 25,
  },
  newsTitleFull: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1a1a1a',
    marginBottom: 15,
    textAlign: 'left',
  },
  newsDescriptionFull: {
    fontSize: 18,
    lineHeight: 26,
    color: '#3a3a3a',
    marginBottom: 15,
    fontWeight: '500',
  },
  newsMoreInfoFull: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4a4a4a',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  galleryContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  galleryTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  galleryImage: {
    width: 120, // Adjust size as needed
    height: 90,  // Adjust size as needed
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#e0e0e0', // Placeholder for loading
  },
  newsDateFull: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 20,
  },
});

export default NewsDetail;
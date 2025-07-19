import React from 'react';
import { 
  View, 
  Text, 
  Image, 
  ScrollView, 
  StyleSheet,
  Dimensions,
  ActivityIndicator, // In case you want a loading state within detail
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons'; // Assuming these are needed for placeholders/icons
import { useRoute } from '@react-navigation/native'; // Hook to access route params

const { width } = Dimensions.get('window');

const NewsDetail = () => {
  const route = useRoute();
  // The newsItem object passed from the previous screen (NewsList.js or Dashboard)
  const { newsItem } = route.params || {}; 

  // Basic validation to ensure newsItem exists
  if (!newsItem) {
    return (
      <View style={styles.errorContainer}>
        <Feather name="alert-triangle" size={40} color="#ef4444" />
        <Text style={styles.errorText}>News article not found!</Text>
      </View>
    );
  }

  // Function to format date (copied from your News.js for consistency)
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

  return (
    <ScrollView style={styles.container}>
      <View style={[styles.newsCardFull, { backgroundColor: newsItem.backgroundColor || '#f0f4ff' }]}>
        {newsItem.imageUrl ? ( 
          <Image 
            source={{ uri: newsItem.imageUrl }} 
            style={styles.newsImageFull}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.newsImagePlaceholderFull}>
            <Feather name="image" size={60} color="#ccc" />
            <Text style={styles.newsImagePlaceholderTextFull}>No Image</Text>
          </View>
        )}
        <View style={styles.newsContentFull}>
          <Text style={styles.newsTitleFull}>{newsItem.title}</Text>
          <Text style={styles.newsDescriptionFull}>{newsItem.description}</Text>
          
          {/* This is the full moreInformation display */}
          {newsItem.moreInformation && ( 
              <Text style={styles.newsMoreInfoFull}>{newsItem.moreInformation}</Text>
          )}
          
          <Text style={styles.newsDateFull}>{formatNewsDate(newsItem.createdAt)}</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  errorText: {
    marginTop: 10,
    fontSize: 18,
    color: '#ef4444',
  },
  newsCardFull: { 
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: 'white', 
    margin: 16, // Add margin to the full card
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
  newsDateFull: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
    textAlign: 'right',
    marginTop: 20,
  },
});

export default NewsDetail;
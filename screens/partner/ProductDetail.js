import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  SafeAreaView,
  Modal, // Import Modal from React Native
  FlatList, // For swiping images
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase'; // Assuming your firebase.js is in the parent directory
import { Ionicons } from '@expo/vector-icons';
// import RNModal from 'react-native-modal'; // If using react-native-modal library for more features

const DEFAULT_PRODUCT_PLACEHOLDER = require('../../assets/icons/product_placeholder.png'); // Adjust path as needed

const { width, height } = Dimensions.get('window');

const ProductDetail = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { productId, partnerName, productName: initialProductName } = route.params;

  const [product, setProduct] = useState(null);
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isImageViewerVisible, setIsImageViewerVisible] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const flatListRef = useRef(null); // Ref for FlatList to scroll to initial image

  const fetchProductDetails = useCallback(async () => {
    setLoading(true);
    setError(null);
    setProduct(null);
    setPartner(null);

    if (!partnerName || !productId) {
      setError("Informations produit/partenaire manquantes pour le chargement.");
      setLoading(false);
      return;
    }

    let actualPartnerId = null;

    try {
      const partnersQuery = query(collection(db, 'partners'), where('nom', '==', partnerName));
      const partnersSnapshot = await getDocs(partnersQuery);

      if (partnersSnapshot.empty) {
        setError(`Partenaire "${partnerName}" non trouvé.`);
        setLoading(false);
        return;
      }

      const partnerDoc = partnersSnapshot.docs[0];
      actualPartnerId = partnerDoc.id;
      setPartner({ id: partnerDoc.id, ...partnerDoc.data() });

      const productDocRef = doc(db, 'partners', actualPartnerId, 'products', productId);
      const productDocSnap = await getDoc(productDocRef);

      if (productDocSnap.exists()) {
        const fetchedProductData = productDocSnap.data();
        setProduct({ id: productDocSnap.id, ...fetchedProductData });

        if (!fetchedProductData.imageUrls) {
            console.warn(`Product ${productId} has no 'imageUrls' field.`);
        }

      } else {
        setError("Produit non trouvé dans la collection du partenaire.");
      }

    } catch (err) {
      console.error("Error fetching product details in ProductDetail:", err);
      setError("Impossible de charger les détails du produit. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  }, [productId, partnerName]);

  useEffect(() => {
    fetchProductDetails();
  }, [fetchProductDetails]);

  // Function to open the image viewer
  const openImageViewer = (index) => {
    setCurrentImageIndex(index);
    setIsImageViewerVisible(true);
  };

  // Function to close the image viewer
  const closeImageViewer = () => {
    setIsImageViewerVisible(false);
  };

  // Scroll to the current image when the modal opens
  useEffect(() => {
    if (isImageViewerVisible && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index: currentImageIndex, animated: false });
    }
  }, [isImageViewerVisible, currentImageIndex]);


  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Chargement des détails du produit...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="alert-circle-outline" size={40} color="#FF3B30" />
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchProductDetails}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!product) {
    return (
      <View style={styles.errorContainer}>
        <Ionicons name="sad-outline" size={40} color="#666" />
        <Text style={styles.errorText}>Produit introuvable ou données incomplètes.</Text>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Main product image - now clickable */}
        <TouchableOpacity onPress={() => openImageViewer(0)}>
          <Image
            source={product.imageUrls && product.imageUrls.length > 0
              ? { uri: product.imageUrls[0] }
              : DEFAULT_PRODUCT_PLACEHOLDER
            }
            style={styles.productImage}
          />
        </TouchableOpacity>

        <View style={styles.detailsContainer}>
          <Text style={styles.productName}>{product.name}</Text>
          {partner && (
            <View style={styles.partnerInfo}>
              {partner.logo ? (
                <Image source={{ uri: partner.logo }} style={styles.partnerLogoSmall} />
              ) : (
                <Ionicons name="storefront-outline" size={24} color="#666" />
              )}
              <Text style={styles.partnerName}>{partner.nom}</Text>
              <Text style={styles.partnerCategory}>({partner.categorie})</Text>
            </View>
          )}

          <View style={styles.priceContainer}>
            <Text style={styles.productPrice}>
              {product.price?.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' }) || 'N/A'}
            </Text>
          </View>

          {product.description && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Description</Text>
              <Text style={styles.descriptionText}>{product.description}</Text>
            </View>
          )}

          {product.imageUrls && product.imageUrls.length > 1 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Galerie d'images</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.imageGallery}>
                {product.imageUrls.map((url, index) => (
                  <TouchableOpacity key={index} onPress={() => openImageViewer(index)}>
                    <Image source={{ uri: url }} style={styles.galleryImage} />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

        </View>
      </ScrollView>

      {/* Image Viewer Modal */}
      <Modal
        visible={isImageViewerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={closeImageViewer} // Handles Android back button
      >
        <TouchableOpacity
          style={styles.imageViewerOverlay}
          activeOpacity={1}
          onPress={closeImageViewer} // Close when clicking anywhere on the overlay
        >
          <View style={styles.imageViewerContent}>
            <FlatList
              ref={flatListRef}
              data={product.imageUrls}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              keyExtractor={(item, index) => index.toString()}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={styles.fullScreenImage} resizeMode="contain" />
              )}
              onMomentumScrollEnd={(event) => {
                const newIndex = Math.round(event.nativeEvent.contentOffset.x / width);
                setCurrentImageIndex(newIndex);
              }}
            />
            <TouchableOpacity style={styles.closeButton} onPress={closeImageViewer}>
              <Ionicons name="close-circle" size={40} color="white" />
            </TouchableOpacity>
             <Text style={styles.imageCounter}>
              {`${currentImageIndex + 1} / ${product.imageUrls?.length || 0}`}
            </Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* "Contacter le Partenaire" button has been removed */}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  scrollContent: {
    paddingBottom: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    margin: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  errorText: {
    fontSize: 16,
    color: '#FF3B30',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginTop: 10,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#6C757D',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 25,
    marginTop: 10,
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  productImage: {
    width: '100%',
    height: width * 0.8,
    resizeMode: 'cover',
    marginBottom: 15,
    backgroundColor: '#e0e0e0',
  },
  detailsContainer: {
    paddingHorizontal: 20,
  },
  productName: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  partnerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  partnerLogoSmall: {
    width: 30,
    height: 30,
    borderRadius: 15,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  partnerName: {
    fontSize: 18,
    color: '#555',
    fontWeight: '600',
    marginRight: 5,
  },
  partnerCategory: {
    fontSize: 16,
    color: '#888',
    fontStyle: 'italic',
  },
  priceContainer: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 15,
    marginBottom: 20,
    alignItems: 'center',
  },
  productPrice: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0a8fdf',
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  descriptionText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
  },
  imageGallery: {
    flexDirection: 'row',
  },
  galleryImage: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: '#e0e0e0',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  // --- Image Viewer Styles ---
  imageViewerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)', // Dark overlay
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageViewerContent: {
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullScreenImage: {
    width: width, // Full width of the screen for swiping
    height: height * 0.7, // Take up most of the screen height
    resizeMode: 'contain', // Ensure the whole image is visible
  },
  closeButton: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 30, // Adjust for notch/status bar
    right: 20,
    zIndex: 1, // Ensure it's above the image
    padding: 5,
  },
  imageCounter: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 60 : 30,
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
  },
  // --- Removed "Contacter le Partenaire" button styles ---
  // contactButton: { ... }
  // contactButtonText: { ... }
});

export default ProductDetail;
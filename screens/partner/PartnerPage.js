import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  Dimensions,
  FlatList,
  RefreshControl,
  Platform
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp, deleteDoc, updateDoc, orderBy } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage, auth } from '../../firebase';
import * as ImagePicker from 'expo-image-picker';
import { v4 as uuidv4 } from 'uuid';
import { Ionicons } from '@expo/vector-icons';

// Custom icons
const ADD_CIRCLE_OUTLINE_ICON = require('../../assets/icons/add_circle.png');
const CAMERA_ICON = require('../../assets/icons/camera.png');
const TRASH_ICON_BLACK = require('../../assets/icons/trash.png');
const CLOSE_CIRCLE_OUTLINE_ICON = require('../../assets/icons/close_circle.png');
const DEFAULT_PRODUCT_PLACEHOLDER = require('../../assets/icons/product_placeholder.png');

const { width } = Dimensions.get('window');
const PRODUCT_ITEM_SIZE = (width - 60) / 2;

// Helper to render star rating
const renderStarRating = (rating) => {
  if (typeof rating !== 'number' || rating < 0 || rating > 5) {
    return null;
  }
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

  const stars = [];
  for (let i = 0; i < fullStars; i++) {
    stars.push(<Ionicons key={`full-${i}`} name="star" size={16} color="#FFD700" />);
  }
  if (halfStar) {
    stars.push(<Ionicons key="half" name="star-half" size={16} color="#FFD700" />);
  }
  for (let i = 0; i < emptyStars; i++) {
    stars.push(<Ionicons key={`empty-${i}`} name="star-outline" size={16} color="#B0B0B0" />);
  }
  return <View style={{ flexDirection: 'row' }}>{stars}</View>;
};


const PartnerPage = ({ route }) => {
  const { partnerId } = route.params;
  const navigation = useNavigation();
  const [partner, setPartner] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isProductModalVisible, setIsProductModalVisible] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductDescription, setNewProductDescription] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductImages, setNewProductImages] = useState([]);
  const [productUploading, setProductUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isCurrentUserPartner, setIsCurrentUserPartner] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [partnerRating, setPartnerRating] = useState(null);

  const [isReviewsModalVisible, setIsReviewsModalVisible] = useState(false);
  const [partnerReviews, setPartnerReviews] = useState([]);
  const [fetchingReviews, setFetchingReviews] = useState(false);


  const fetchUserData = useCallback(async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setIsCurrentUserPartner(userData.isPartner || false);
          setIsAdmin(userData.isAdmin || false);
        } else {
          setIsCurrentUserPartner(false);
          setIsAdmin(false);
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        setIsCurrentUserPartner(false);
        setIsAdmin(false);
      }
    } else {
      setIsCurrentUserPartner(false);
      setIsAdmin(false);
    }
  }, []);

  const fetchPartnerAndProducts = useCallback(async () => {
    setLoading(true);
    try {
      const partnerDocRef = doc(db, 'partners', partnerId);
      const partnerDocSnap = await getDoc(partnerDocRef);

      if (partnerDocSnap.exists()) {
        setPartner({ id: partnerDocSnap.id, ...partnerDocSnap.data() });
      } else {
        Alert.alert("Erreur", "Partenaire non trouvé.");
        navigation.goBack();
        return;
      }

      const ratingsQuery = query(collection(db, 'partnerRatings'), where('partnerId', '==', partnerId));
      const ratingsSnapshot = await getDocs(ratingsQuery);
      let totalRating = 0;
      let numberOfRatings = 0;

      if (!ratingsSnapshot.empty) {
        ratingsSnapshot.docs.forEach(doc => {
          totalRating += doc.data().rating;
          numberOfRatings++;
        });
        setPartnerRating((totalRating / numberOfRatings).toFixed(1));
      } else {
        setPartnerRating(null);
      }

      let productsQueryRef;
      if (isAdmin) {
        productsQueryRef = collection(db, 'partners', partnerId, 'products');
      } else {
        productsQueryRef = query(
          collection(db, 'partners', partnerId, 'products'),
          where('isApproved', '==', true)
        );
      }

      const productsSnapshot = await getDocs(productsQueryRef);
      let fetchedProducts = productsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      fetchedProducts.sort((a, b) => {
        if (a.isApproved === b.isApproved) return 0;
        return a.isApproved ? 1 : -1;
      });

      setProducts(fetchedProducts);

    } catch (error) {
      console.error("Error fetching partner page data:", error);
      Alert.alert("Erreur", "Impossible de charger la page du partenaire.");
      navigation.goBack();
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [partnerId, navigation, isAdmin]);

  const fetchReviews = useCallback(async () => {
    setFetchingReviews(true);
    try {
      const reviewsQuery = query(
        collection(db, 'partnerRatings'),
        where('partnerId', '==', partnerId)
      );
      const reviewsSnapshot = await getDocs(reviewsQuery);
      let fetchedReviews = reviewsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      fetchedReviews.sort((a, b) => {
        const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return dateB - dateA;
      });

      setPartnerReviews(fetchedReviews);
    } catch (error) {
      console.error("Error fetching reviews:", error);
      Alert.alert("Erreur", "Impossible de charger les avis. Veuillez réessayer.");
    } finally {
      setFetchingReviews(false);
    }
  }, [partnerId]);

  const handleOpenReviewsModal = () => {
    fetchReviews();
    setIsReviewsModalVisible(true);
  };


  useFocusEffect(
    useCallback(() => {
      fetchUserData();
      fetchPartnerAndProducts();
    }, [fetchUserData, fetchPartnerAndProducts])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserData();
    fetchPartnerAndProducts();
  }, [fetchUserData, fetchPartnerAndProducts]);

  const requestMediaLibraryPermission = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Veuillez accorder la permission d\'accéder à la galerie de photos pour sélectionner des images.');
      return false;
    }
    return true;
  };

  const requestCameraPermission = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Veuillez accorder la permission d\'accéder à la caméra pour prendre des photos.');
      return false;
    }
    return true;
  };

  // UPDATED: pickImage function for both web and mobile
  const pickImage = async () => {
    if (newProductImages.length >= 5) {
      Alert.alert("Limite de photos", "Vous ne pouvez ajouter qu'un maximum de 5 photos par produit.");
      return;
    }

    if (Platform.OS === 'web') {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.multiple = true;
        input.onchange = (event) => {
          const files = event.target.files;
          if (files) {
            const newImages = [];
            for (let i = 0; i < files.length && i + newProductImages.length < 5; i++) {
              const file = files[i];
              newImages.push({ uri: URL.createObjectURL(file), file });
            }
            setNewProductImages(prevImages => [...prevImages, ...newImages]);
          }
        };
        input.click();
      } catch (error) {
        console.error("Error picking image on web:", error);
        Alert.alert("Erreur", "Impossible de sélectionner des images sur le web. Veuillez réessayer.");
      }
      return;
    }

    Alert.alert(
      "Sélectionner une photo",
      "Voulez-vous prendre une photo ou en choisir une dans la galerie ?",
      [
        {
          text: "Prendre une photo",
          onPress: async () => {
            const hasPermission = await requestCameraPermission();
            if (!hasPermission) return;

            let result = await ImagePicker.launchCameraAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.7,
              base64: false,
            });

            if (!result.canceled) {
              const selectedImages = result.assets ? result.assets.map(asset => ({ uri: asset.uri })) : [{ uri: result.uri }];
              setNewProductImages(prevImages => [...prevImages, ...selectedImages].slice(0, 5));
            }
          },
        },
        {
          text: "Choisir dans la galerie",
          onPress: async () => {
            const hasPermission = await requestMediaLibraryPermission();
            if (!hasPermission) return;

            let result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ImagePicker.MediaTypeOptions.Images,
              allowsEditing: true,
              aspect: [4, 3],
              quality: 0.7,
              selectionLimit: 5 - newProductImages.length,
              base64: false,
            });

            if (!result.canceled) {
              const selectedImages = result.assets ? result.assets.map(asset => ({ uri: asset.uri })) : [{ uri: result.uri }];
              setNewProductImages(prevImages => [...prevImages, ...selectedImages].slice(0, 5));
            }
          },
        },
        {
          text: "Annuler",
          style: "cancel",
        },
      ],
      { cancelable: true }
    );
  };
  
  // UPDATED: uploadImage function for both web and mobile
  const uploadImage = async (imageObject) => {
    let blob;

    if (Platform.OS === 'web') {
      // Use the file object directly for web
      blob = imageObject.file;
    } else {
      // Fetch the blob from the local URI for native
      const response = await fetch(imageObject.uri);
      blob = await response.blob();
    }

    const filename = `products/${partnerId}/${uuidv4()}`;
    const storageRef = ref(storage, filename);
    await uploadBytes(storageRef, blob);
    const downloadURL = await getDownloadURL(storageRef);
    return downloadURL;
  };
  

  const handleAddProduct = async () => {
    if (!newProductName || !newProductDescription || !newProductPrice) {
      Alert.alert("Champs manquants", "Veuillez remplir tous les champs du produit.");
      return;
    }
    if (isNaN(parseFloat(newProductPrice))) {
      Alert.alert("Prix invalide", "Veuillez entrer un prix numérique valide.");
      return;
    }

    setProductUploading(true);
    try {
      const imageUrls = [];
      for (const imageObject of newProductImages) {
        const url = await uploadImage(imageObject);
        imageUrls.push(url);
      }

      const productData = {
        name: newProductName,
        description: newProductDescription,
        price: parseFloat(newProductPrice),
        imageUrls: imageUrls,
        createdAt: serverTimestamp(),
        partnerId: partnerId,
        isApproved: false,
      };

      await addDoc(collection(db, 'partners', partnerId, 'products'), productData);
      Alert.alert("Succès", "Produit ajouté avec succès et en attente d'approbation !");
      setIsProductModalVisible(false);
      setNewProductName('');
      setNewProductDescription('');
      setNewProductPrice('');
      setNewProductImages([]);
      fetchPartnerAndProducts();

    } catch (error) {
      console.error("Error adding product:", error);
      Alert.alert("Erreur", "Échec de l'ajout du produit: " + error.message);
    } finally {
      setProductUploading(false);
    }
  };
  
  // UPDATED: handleDeleteProduct function for both web and mobile
  const handleDeleteProduct = async (productId, imageUrls) => {
    Alert.alert(
      "Supprimer le produit",
      "Êtes-vous sûr de vouloir supprimer ce produit? Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          onPress: async () => {
            setProductUploading(true);
            try {
              for (const url of imageUrls) {
                if (url && url.startsWith('https://firebasestorage.googleapis.com/')) {
                  try {
                    const decodedPath = decodeURIComponent(url.split('?')[0].split('o/')[1]);
                    const imageRef = ref(storage, decodedPath);
                    await deleteObject(imageRef);
                    console.log("Image deleted from storage:", decodedPath);
                  } catch (deleteError) {
                    console.warn("Error deleting product image from storage:", deleteError);
                  }
                }
              }

              await deleteDoc(doc(db, 'partners', partnerId, 'products', productId));
              Alert.alert("Succès", "Produit supprimé avec succès.");
              fetchPartnerAndProducts();
            } catch (error) {
              console.error("Error deleting product:", error);
              Alert.alert("Erreur", "Échec de la suppression du produit: " + error.message);
            } finally {
              setProductUploading(false);
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  const handleApproveProduct = async (productId) => {
    Alert.alert(
      "Approuver le produit",
      "Êtes-vous sûr de vouloir approuver ce produit ? Il sera visible par tous les utilisateurs.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Approuver",
          onPress: async () => {
            try {
              const productRef = doc(db, 'partners', partnerId, 'products', productId);
              await updateDoc(productRef, {
                isApproved: true,
              });
              Alert.alert("Succès", "Produit approuvé avec succès !");
              fetchPartnerAndProducts();
            } catch (error) {
              console.error("Error approving product:", error);
              Alert.alert("Erreur", "Échec de l'approbation du produit: " + error.message);
            }
          },
        },
      ]
    );
  };

  const handleRejectProduct = async (productId, imageUrls) => {
    Alert.alert(
      "Rejeter le produit",
      "Êtes-vous sûr de vouloir rejeter ce produit ? Il sera définitivement supprimé.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Rejeter",
          onPress: async () => {
            await handleDeleteProduct(productId, imageUrls);
          },
          style: "destructive",
        },
      ]
    );
  };

  const removeSelectedImage = (indexToRemove) => {
    setNewProductImages(prevImages => prevImages.filter((_, index) => index !== indexToRemove));
  };

  if (loading || !partner) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>Chargement de la page partenaire...</Text>
      </View>
    );
  }

  const renderProductItem = ({ item }) => (
    <TouchableOpacity
      style={styles.productCard}
      onPress={() => {
        if (item.isApproved || isCurrentUserPartner || isAdmin) {
          navigation.navigate('ProductDetail', { productId: item.id, partnerName: partner.nom, productName: item.name });
        } else {
          Alert.alert("Produit Inactif", "Ce produit n'est pas encore approuvé par l'administrateur.");
        }
      }}
      disabled={!item.isApproved && !isCurrentUserPartner && !isAdmin}
    >
      <Image
        source={item.imageUrls && item.imageUrls.length > 0 ? { uri: item.imageUrls[0] } : DEFAULT_PRODUCT_PLACEHOLDER}
        style={styles.productImage}
      />
      <Text style={styles.productName}>{item.name}</Text>
      <Text style={styles.productPrice}>{item.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}</Text>

      {/* Inactivated status and Admin approval/rejection icons */}
      {!item.isApproved && (
        <View style={styles.inactivatedOverlay}>
          <Text style={styles.inactivatedText}>Inactif</Text>
          {isAdmin && (
            <View style={styles.adminActionButtons}>
              <TouchableOpacity
                style={[styles.adminActionButton, { backgroundColor: '#28a745' }]}
                onPress={() => handleApproveProduct(item.id)}
              >
                <Ionicons name="checkmark-circle" size={24} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.adminActionButton, { backgroundColor: '#dc3545', marginLeft: 10 }]}
                onPress={() => handleRejectProduct(item.id, item.imageUrls)}
              >
                <Ionicons name="close-circle" size={24} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* UPDATED: Delete button now visible for partners OR admins */}
      {(isCurrentUserPartner || isAdmin) && (
        <TouchableOpacity
          style={styles.deleteProductButton}
          onPress={() => handleDeleteProduct(item.id, item.imageUrls)}
        >
          <Image source={TRASH_ICON_BLACK} style={styles.deleteProductIcon} />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  const renderReviewItem = ({ item }) => (
    <View style={styles.reviewItem}>
      <View style={styles.reviewHeader}>
        <Text style={styles.reviewUserName}>{item.nomUtilisateur || 'Utilisateur Anonyme'}</Text>
        {renderStarRating(item.rating)}
      </View>
      <Text style={styles.reviewComment}>{item.comment}</Text>
      <Text style={styles.reviewDate}>{item.createdAt?.toDate ? new Date(item.createdAt.toDate()).toLocaleDateString('fr-FR') : 'N/A'}</Text>
    </View>
  );


  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.scrollContent}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <Image source={{ uri: partner.logo }} style={styles.partnerLogo} />
        <Text style={styles.partnerName}>{partner.nom}</Text>
        <Text style={styles.partnerCategory}>{partner.categorie}</Text>
        {partnerRating !== null ? (
          <TouchableOpacity onPress={handleOpenReviewsModal} style={styles.ratingContainer}>
            <Ionicons name="star" size={20} color="#FFD700" />
            <Text style={styles.ratingText}>{partnerRating} / 5</Text>
            <Ionicons name="chevron-forward" size={18} color="#007AFF" style={styles.ratingChevron} />
          </TouchableOpacity>
        ) : (
          <Text style={styles.noRatingText}>Pas encore d'évaluations</Text>
        )}
        {partner.promotion && (
          <View style={styles.partnerPromotionContainer}>
            <Text style={styles.partnerPromotionLabel}>Promotion:</Text>
            <Text style={styles.partnerPromotionText}>{partner.promotion}</Text>
          </View>
        )}
        {partner.description && (
          <View style={styles.partnerDescriptionContainer}>
            <Text style={styles.partnerDescriptionLabel}>À propos de nous:</Text>
            <Text style={styles.partnerDescriptionText}>{partner.description}</Text>
          </View>
        )}
      </View>

      <View style={styles.productsSection}>
        <View style={styles.productsHeader}>
          <Text style={styles.sectionTitle}>Nos Produits</Text>
          {isCurrentUserPartner && (
            <TouchableOpacity style={styles.addProductButton} onPress={() => setIsProductModalVisible(true)}>
              <Image source={ADD_CIRCLE_OUTLINE_ICON} style={styles.addProductIcon} />
              <Text style={styles.addProductButtonText}>Ajouter Produit</Text>
            </TouchableOpacity>
          )}
        </View>

        {products.length === 0 ? (
          <Text style={styles.noProductsText}>Aucun produit disponible pour ce partenaire.</Text>
        ) : (
          <FlatList
            data={products}
            renderItem={renderProductItem}
            keyExtractor={item => item.id}
            numColumns={2}
            columnWrapperStyle={styles.productGridRow}
            contentContainerStyle={styles.productsGrid}
            scrollEnabled={false}
          />
        )}
      </View>

      <Modal
        visible={isProductModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setIsProductModalVisible(false);
          setNewProductName('');
          setNewProductDescription('');
          setNewProductPrice('');
          setNewProductImages([]);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setIsProductModalVisible(false);
                setNewProductName('');
                setNewProductDescription('');
                setNewProductPrice('');
                setNewProductImages([]);
              }}
            >
              <Image source={CLOSE_CIRCLE_OUTLINE_ICON} style={styles.customModalCloseIcon} />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Ajouter un Nouveau Produit</Text>

            <TextInput
              style={styles.input}
              placeholder="Nom du produit"
              value={newProductName}
              onChangeText={setNewProductName}
            />
            <TextInput
              style={[styles.input, styles.multilineInput]}
              placeholder="Description du produit"
              multiline
              numberOfLines={4}
              value={newProductDescription}
              onChangeText={setNewProductDescription}
            />
            <TextInput
              style={styles.input}
              placeholder="Prix (ex: 99.99)"
              keyboardType="numeric"
              value={newProductPrice}
              onChangeText={setNewProductPrice}
            />

            <TouchableOpacity style={styles.imagePickerButton} onPress={pickImage}>
              <Image source={CAMERA_ICON} style={styles.imagePickerIcon} />
              <Text style={styles.imagePickerButtonText}>Sélectionner des photos ({newProductImages.length}/5)</Text>
            </TouchableOpacity>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.selectedImagesContainer}>
              {newProductImages.map((imageObject, index) => (
                <View key={index} style={styles.selectedImageWrapper}>
                  <Image source={{ uri: imageObject.uri }} style={styles.selectedImage} />
                  <TouchableOpacity style={styles.removeImageButton} onPress={() => removeSelectedImage(index)}>
                    <Ionicons name="close-circle" size={24} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.saveProductButton}
              onPress={handleAddProduct}
              disabled={productUploading}
            >
              {productUploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.saveProductButtonText}>Enregistrer le Produit</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Reviews Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isReviewsModalVisible}
        onRequestClose={() => setIsReviewsModalVisible(false)}
      >
        <View style={styles.reviewsModalOverlay}>
          <View style={styles.reviewsModalContent}>
            <View style={styles.reviewsModalHeader}>
              <Text style={styles.reviewsModalTitle}>Avis sur {partner?.nom}</Text>
              <TouchableOpacity onPress={() => setIsReviewsModalVisible(false)} style={styles.reviewsModalCloseButton}>
                <Ionicons name="close" size={30} color="#333" />
              </TouchableOpacity>
            </View>

            {fetchingReviews ? (
              <View style={styles.loadingReviewsContainer}>
                <ActivityIndicator size="large" color="#0a8fdf" />
                <Text style={styles.loadingReviewsText}>Chargement des avis...</Text>
              </View>
            ) : partnerReviews.length === 0 ? (
              <View style={styles.noReviewsContainer}>
                <Ionicons name="star-outline" size={50} color="#B0B0B0" />
                <Text style={styles.noReviewsText}>Soyez le premier à laisser un avis !</Text>
              </View>
            ) : (
              <FlatList
                data={partnerReviews}
                renderItem={renderReviewItem}
                keyExtractor={item => item.id}
                contentContainerStyle={styles.reviewsListContent}
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
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
  },
  header: {
    backgroundColor: '#fff',
    padding: 20,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  partnerLogo: {
    width: 100,
    height: 100,
    borderRadius: 50,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  partnerName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  partnerCategory: {
    fontSize: 16,
    color: '#666',
    marginBottom: 10,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    marginBottom: 10,
    backgroundColor: '#e6f7ff',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#91d5ff',
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 5,
  },
  ratingChevron: {
    marginLeft: 10,
  },
  noRatingText: {
    fontSize: 15,
    color: '#888',
    marginTop: 5,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  partnerPromotionContainer: {
    backgroundColor: '#e6f7ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#91d5ff',
    padding: 8,
    marginTop: 10,
    width: '90%',
    alignItems: 'center',
  },
  partnerPromotionLabel: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0a8fdf',
    marginBottom: 3,
  },
  partnerPromotionText: {
    fontSize: 15,
    color: '#333',
    textAlign: 'center',
  },
  partnerDescriptionContainer: {
    marginTop: 15,
    width: '90%',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
    alignItems: 'center',
  },
  partnerDescriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  partnerDescriptionText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    textAlign: 'center',
  },
  productsSection: {
    padding: 20,
  },
  productsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  addProductButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  addProductIcon: {
    width: 20,
    height: 20,
    tintColor: '#fff',
    marginRight: 5,
  },
  addProductButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  noProductsText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#777',
    marginTop: 30,
    marginBottom: 50,
  },
  productsGrid: {
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  productGridRow: {
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    width: PRODUCT_ITEM_SIZE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    position: 'relative',
    marginHorizontal: 5,
  },
  productImage: {
    width: '100%',
    height: PRODUCT_ITEM_SIZE * 0.8,
    resizeMode: 'cover',
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    paddingHorizontal: 10,
    marginTop: 8,
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#0a8fdf',
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  deleteProductButton: {
    position: 'absolute',
    top: 5,
    right: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 15,
    padding: 5,
  },
  deleteProductIcon: {
    width: 20,
    height: 20,
    tintColor: '#dc3545',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
  customModalCloseIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    tintColor: '#EF4444',
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    color: '#333',
  },
  multilineInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  imagePickerButton: {
    flexDirection: 'row',
    backgroundColor: '#0a8fdf',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  imagePickerIcon: {
    width: 20,
    height: 20,
    tintColor: '#fff',
    marginRight: 10,
  },
  imagePickerButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  selectedImagesContainer: {
    flexDirection: 'row',
    marginBottom: 15,
  },
  selectedImageWrapper: {
    position: 'relative',
    marginRight: 10,
  },
  selectedImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    resizeMode: 'cover',
    borderWidth: 1,
    borderColor: '#eee',
  },
  removeImageButton: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 1,
  },
  saveProductButton: {
    backgroundColor: '#28a745',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveProductButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  // NEW: Reviews Modal Styles
  reviewsModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  reviewsModalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  reviewsModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  reviewsModalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 20, // To center title when close button is present
  },
  reviewsModalCloseButton: {
    padding: 5,
  },
  reviewsListContent: {
    paddingBottom: 10,
  },
  reviewItem: {
    backgroundColor: '#f9f9f9',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#eee',
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  reviewUserName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
  },
  reviewComment: {
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
  },
  loadingReviewsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 150, // Ensure it has some height for the indicator
  },
  loadingReviewsText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  noReviewsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 150,
  },
  noReviewsText: {
    marginTop: 10,
    fontSize: 16,
    color: '#888',
    fontStyle: 'italic',
  },
  // NEW: Admin approval styles
  inactivatedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)', // Dark overlay
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10, // Match card border radius
  },
  inactivatedText: {
    color: '#FFD700', // Gold color for attention
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  adminActionButtons: {
    flexDirection: 'row',
    marginTop: 10,
  },
  adminActionButton: {
    padding: 8,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
});

export default PartnerPage;
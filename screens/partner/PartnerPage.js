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
import AppointmentFormModal from '../../components/AppointmentFormModal';
import COUNTRIES, { countryCodeToFlag } from '../../components/Countries';

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

  // Cart state
  const [cartItemCount, setCartItemCount] = useState(0);

  // Appointment booking states
  const [showAppointmentFormModal, setShowAppointmentFormModal] = useState(false);
  const [allPartners, setAllPartners] = useState([]);
  const [selectedPartnerForBooking, setSelectedPartnerForBooking] = useState(null);

  // Quick Payment states
  const [showQuickPaymentModal, setShowQuickPaymentModal] = useState(false);
  const [paymentDescription, setPaymentDescription] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDeliveryAddress, setPaymentDeliveryAddress] = useState('');
  const [paymentItems, setPaymentItems] = useState([]);
  const [newItemName, setNewItemName] = useState('');
  const [newItemPrice, setNewItemPrice] = useState('');
  const [paymentProcessing, setPaymentProcessing] = useState(false);

  // Scroll state for sticky header
  const [scrollY, setScrollY] = useState(0);
  const [isHeaderCollapsed, setIsHeaderCollapsed] = useState(false);

  // State for "À propos" section visibility
  const [isDescriptionVisible, setIsDescriptionVisible] = useState(false);
  
  // State for header expansion/collapse
  const [isHeaderExpanded, setIsHeaderExpanded] = useState(false);

  // Auth modal state
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMessage, setAuthModalMessage] = useState('');

  // Return a display string for partner country (flag + name) or null
  const getCountryDisplay = (partner) => {
    if (!partner) return null;
    const raw = (partner.pays || partner.country || '').toString().trim();
    if (!raw) return null;

    const maybeCode = raw.length <= 3 ? raw.toUpperCase() : null;
    if (maybeCode) {
      const found = COUNTRIES.find(c => c.code === maybeCode);
      if (found) return `${found.flag} ${found.name}`;
      return `${countryCodeToFlag(maybeCode)} ${maybeCode}`;
    }

    const foundByName = COUNTRIES.find(c => c.name.toLowerCase() === raw.toLowerCase());
    if (foundByName) return `${foundByName.flag} ${foundByName.name}`;

    return raw;
  };


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

  const fetchCartCount = useCallback(async () => {
    const user = auth.currentUser;
    if (user) {
      try {
        const cartQuery = query(
          collection(db, 'clientCart'),
          where('userId', '==', user.uid)
        );
        const cartSnapshot = await getDocs(cartQuery);
        let totalCount = 0;
        cartSnapshot.docs.forEach(doc => {
          const data = doc.data();
          totalCount += data.quantity || 1;
        });
        setCartItemCount(totalCount);
      } catch (error) {
        console.error("Error fetching cart count:", error);
        setCartItemCount(0);
      }
    } else {
      setCartItemCount(0);
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

  // Handle appointment booking success
  const handleAppointmentBookingSuccess = useCallback(async (newOrUpdatedAppointment) => {
    console.log("PartnerPage: Appointment booking success:", newOrUpdatedAppointment);
    
    let clientNamesString = 'un client';
    if (Array.isArray(newOrUpdatedAppointment.clientNames)) {
      clientNamesString = newOrUpdatedAppointment.clientNames.map(client => {
        return typeof client === 'object' && client !== null && client.name ? client.name : client;
      }).filter(name => name).join(', ');
    } else if (typeof newOrUpdatedAppointment.clientNames === 'string') {
      clientNamesString = newOrUpdatedAppointment.clientNames;
    }

    setShowAppointmentFormModal(false);
    setSelectedPartnerForBooking(null);
    
    Alert.alert(
      "Rendez-vous confirmé !",
      `Votre rendez-vous avec ${newOrUpdatedAppointment.partnerNom || partner?.nom || 'le partenaire'} pour ${clientNamesString} a été enregistré. Vous pouvez le retrouver dans "Paramètres > Mes Rendez-vous".`,
      [{ text: "OK" }]
    );
  }, [partner]);

  // Handle book appointment button press
  const handleBookAppointment = () => {
    if (!auth.currentUser) {
      setAuthModalMessage('Vous devez être connecté pour prendre rendez-vous.');
      setShowAuthModal(true);
      return;
    }

    const partnerForBooking = {
      id: partnerId,
      nom: partner?.nom || 'Partenaire',
      categorie: partner?.categorie || 'Non spécifiée',
      ...partner
    };
    
    setSelectedPartnerForBooking(partnerForBooking);
    setAllPartners([partnerForBooking]); // Set this partner as the only option
    setShowAppointmentFormModal(true);
  };

  // Handle quick payment
  const handleQuickPayment = () => {
    if (!auth.currentUser) {
      setAuthModalMessage('Vous devez être connecté pour effectuer un paiement.');
      setShowAuthModal(true);
      return;
    }

    setShowQuickPaymentModal(true);
  };

  // Add item to payment
  const addPaymentItem = () => {
    if (!newItemName.trim() || !newItemPrice.trim()) {
      Alert.alert('Champs requis', 'Veuillez saisir le nom et le prix de l\'article.');
      return;
    }

    const price = parseFloat(newItemPrice);
    if (isNaN(price) || price <= 0) {
      Alert.alert('Prix invalide', 'Veuillez saisir un prix valide.');
      return;
    }

    const newItem = {
      id: Date.now().toString(),
      name: newItemName.trim(),
      price: price
    };

    setPaymentItems([...paymentItems, newItem]);
    setNewItemName('');
    setNewItemPrice('');
  };

  // Remove item from payment
  const removePaymentItem = (itemId) => {
    setPaymentItems(paymentItems.filter(item => item.id !== itemId));
  };

  // Calculate total payment amount
  const getTotalPaymentAmount = () => {
    const itemsTotal = paymentItems.reduce((sum, item) => sum + item.price, 0);
    const manualAmount = parseFloat(paymentAmount) || 0;
    return itemsTotal + manualAmount;
  };

  // Process quick payment
  const processQuickPayment = async () => {
    const total = getTotalPaymentAmount();
    
    if (total <= 0) {
      Alert.alert('Montant invalide', 'Veuillez saisir un montant ou ajouter des articles.');
      return;
    }

    if (!paymentDescription.trim()) {
      Alert.alert('Description requise', 'Veuillez décrire le motif du paiement.');
      return;
    }

    setPaymentProcessing(true);
    try {
      // Navigate to payment processing with partner payment data
      const paymentData = {
        partnerId: partnerId,
        partnerName: partner.nom,
        partnerLogo: partner.logo,
        description: paymentDescription.trim(),
        deliveryAddress: paymentDeliveryAddress.trim(),
        items: paymentItems,
        manualAmount: parseFloat(paymentAmount) || 0,
        total: total,
        paymentType: 'partner_direct'
      };

      navigation.navigate('PartnerPayment', paymentData);
      
      // Reset form
      setShowQuickPaymentModal(false);
      setPaymentDescription('');
      setPaymentAmount('');
      setPaymentDeliveryAddress('');
      setPaymentItems([]);
      setNewItemName('');
      setNewItemPrice('');
      
    } catch (error) {
      console.error('Error processing quick payment:', error);
      Alert.alert('Erreur', 'Impossible de traiter le paiement. Veuillez réessayer.');
    } finally {
      setPaymentProcessing(false);
    }
  };

  // Handle scroll for sticky header
  const handleScroll = (event) => {
    const currentScrollY = event.nativeEvent.contentOffset.y;
    setScrollY(currentScrollY);
    setIsHeaderCollapsed(currentScrollY > 120);
  };


  useFocusEffect(
    useCallback(() => {
      fetchUserData();
      fetchPartnerAndProducts();
      fetchCartCount();
    }, [fetchUserData, fetchPartnerAndProducts, fetchCartCount])
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchUserData();
    fetchPartnerAndProducts();
    fetchCartCount();
  }, [fetchUserData, fetchPartnerAndProducts, fetchCartCount]);

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

  const addToCart = async (product) => {
    if (!auth.currentUser) {
      setAuthModalMessage('Vous devez être connecté pour ajouter des produits au panier.');
      setShowAuthModal(true);
      return;
    }

    try {
      await addDoc(collection(db, 'clientCart'), {
        userId: auth.currentUser.uid,
        productId: product.id,
        productName: product.name,
        productPrice: product.price,
        productImage: product.imageUrls && product.imageUrls.length > 0 ? product.imageUrls[0] : null,
        partnerId: partnerId,
        partnerName: partner.nom,
        quantity: 1,
        createdAt: serverTimestamp()
      });

      // Refresh cart count after adding item
      fetchCartCount();

      Alert.alert(
        'Ajouté au panier !',
        `${product.name} a été ajouté à votre panier.`,
        [
          { text: 'Continuer', style: 'cancel' },
          { 
            text: 'Voir le panier', 
            onPress: () => navigation.navigate('ClientCart')
          }
        ]
      );
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert('Erreur', 'Impossible d\'ajouter le produit au panier.');
    }
  };

  const renderProductItem = ({ item }) => (
    <View style={styles.productCard}>
      <TouchableOpacity
        style={styles.productContent}
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
        <View style={styles.productInfo}>
          <Text style={styles.productName}>{item.name}</Text>
          <Text style={styles.productPrice}>{item.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}</Text>
        </View>
      </TouchableOpacity>

      {/* Add to Cart Button - Only show for approved products and non-partners */}
      {item.isApproved && !isCurrentUserPartner && !isAdmin && (
        <TouchableOpacity 
          style={styles.addToCartButton}
          onPress={() => addToCart(item)}
        >
          <Ionicons name="bag-add-outline" size={20} color="#fff" />
        </TouchableOpacity>
      )}

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
    </View>
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
    <View style={styles.container}>
      {/* Sticky Header */}
      <View style={[styles.stickyHeader, isHeaderCollapsed && styles.stickyHeaderCollapsed]}>
        <View style={styles.stickyHeaderContent}>
          {/* Logo and basic info section */}
          <View style={styles.stickyLogoSection}>
            <View style={styles.logoContainer}>
              <Image
                source={
                  partner?.logo ? { uri: partner.logo } :
                  partner?.profileImage ? { uri: partner.profileImage } :
                  require('../../assets/images/Profile.png')
                }
                style={[styles.stickyPartnerLogo, isHeaderCollapsed && styles.stickyPartnerLogoSmall]}
              />
              {!isHeaderCollapsed && (
                <View style={styles.verifiedBadge}>
                  <Ionicons name="checkmark-circle" size={16} color="#28a745" />
                </View>
              )}
            </View>
            
            <View style={styles.stickyPartnerInfo}>
              <View style={styles.partnerNameRow}>
                <Text style={[styles.stickyPartnerName, isHeaderCollapsed && styles.stickyPartnerNameSmall]}>
                  {partner.nom}
                </Text>
                {!isHeaderCollapsed && (
                  <TouchableOpacity 
                    style={styles.toggleButton}
                    onPress={() => setIsHeaderExpanded(!isHeaderExpanded)}
                    activeOpacity={0.7}
                  >
                    <Ionicons 
                      name={isHeaderExpanded ? "chevron-up" : "chevron-down"} 
                      size={24} 
                      color="#0a8fdf" 
                    />
                  </TouchableOpacity>
                )}
              </View>
              {/* Country display: show only the country value right under the business name */}
              {(partner?.pays || partner?.country) && (
                <View style={styles.headerCountryRow}>
                  <Text style={styles.headerCountryValue}>{getCountryDisplay(partner)}</Text>
                </View>
              )}
              
              {!isHeaderCollapsed && isHeaderExpanded && (
                <>
                  <View style={styles.categoryContainer}>
                    <Ionicons name="business-outline" size={16} color="#666" />
                    <Text style={styles.stickyPartnerCategory}>{partner.categorie}</Text>
                  </View>
                  
                  {/* Rating section */}
                  {partnerRating !== null ? (
                    <TouchableOpacity onPress={handleOpenReviewsModal} style={styles.ratingContainer}>
                      <View style={styles.starsContainer}>
                        {renderStarRating(parseFloat(partnerRating))}
                      </View>
                      <Text style={styles.ratingText}>{partnerRating}</Text>
                      <Text style={styles.ratingSubtext}>({partnerReviews.length} avis)</Text>
                      <Ionicons name="chevron-forward" size={14} color="#007AFF" style={styles.ratingChevron} />
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity onPress={handleOpenReviewsModal} style={styles.noRatingContainer}>
                      <Ionicons name="star-outline" size={16} color="#999" />
                      <Text style={styles.noRatingText}>Soyez le premier à évaluer</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          </View>
          
          {/* Expandable content section */}
          {!isHeaderCollapsed && isHeaderExpanded && (
            <>
              {/* Description section - collapsible */}
              {partner.description && (
                <View style={styles.descriptionSection}>
                  <TouchableOpacity 
                    style={styles.descriptionHeader}
                    onPress={() => setIsDescriptionVisible(!isDescriptionVisible)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.descriptionLabel}>À propos</Text>
                    <Ionicons 
                      name={isDescriptionVisible ? "chevron-up" : "chevron-down"} 
                      size={20} 
                      color="#666" 
                    />
                  </TouchableOpacity>
                  {isDescriptionVisible && (
                    <Text style={styles.descriptionText}>{partner.description}</Text>
                  )}
                </View>
              )}
            </>
          )}

          {/* Action buttons - always visible when header not collapsed */}
          {!isHeaderCollapsed && (
            <>
              <View style={styles.mainActionButtonsContainer}>
                <TouchableOpacity 
                  style={styles.bookAppointmentButton} 
                  onPress={handleBookAppointment}
                  activeOpacity={0.8}
                >
                  <View style={styles.buttonIconContainer}>
                    <Ionicons name="calendar" size={20} color="#fff" />
                  </View>
                  <Text style={styles.bookAppointmentButtonText}>Prendre Rendez-vous</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.contactButton}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (!auth.currentUser) {
                      setAuthModalMessage('Vous devez être connecté pour contacter le partenaire.');
                      setShowAuthModal(true);
                      return;
                    }
                    navigation.navigate('ClientPartnerChat', {
                      partnerId: partnerId,
                      partnerName: partner.nom,
                      partnerLogo: partner.logo || partner.profileImage || null
                    });
                  }}
                >
                  <Ionicons name="chatbubble-outline" size={18} color="#0a8fdf" />
                  <Text style={styles.contactButtonText}>Contacter</Text>
                </TouchableOpacity>
              </View>

              {/* Quick Payment button - separated below */}
              <TouchableOpacity 
                style={styles.quickPaymentStandaloneButton}
                activeOpacity={0.8}
                onPress={handleQuickPayment}
              >
                <Ionicons name="card" size={20} color="#fff" />
                <Text style={styles.quickPaymentStandaloneButtonText}>Paiement Rapide</Text>
              </TouchableOpacity>
            </>
          )}
          
          {isHeaderCollapsed && (
            <View style={[styles.stickyActionButtons, styles.stickyActionButtonsSmall]}>
              <TouchableOpacity 
                style={[styles.stickyButton, styles.stickyAppointmentButton, styles.stickyButtonSmall]}
                onPress={handleBookAppointment}
              >
                <Ionicons name="calendar" size={16} color="#fff" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.stickyButton, styles.stickyContactButton, styles.stickyButtonSmall]}
                onPress={() => {
                  if (!auth.currentUser) {
                    setAuthModalMessage('Vous devez être connecté pour contacter le partenaire.');
                    setShowAuthModal(true);
                    return;
                  }
                  navigation.navigate('ClientPartnerChat', {
                    partnerId: partnerId,
                    partnerName: partner.nom,
                    partnerLogo: partner.logo || partner.profileImage || null
                  });
                }}
              >
                <Ionicons name="chatbubble-outline" size={16} color="#0a8fdf" />
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.stickyButton, styles.stickyPaymentButton, styles.stickyButtonSmall]}
                onPress={handleQuickPayment}
              >
                <Ionicons name="card" size={16} color="#fff" />
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: isHeaderCollapsed ? 80 : (isHeaderExpanded ? 360 : 220) }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {/* Full header content - only visible when not collapsed */}
        {!isHeaderCollapsed && isHeaderExpanded && (
          <View style={styles.fullHeaderContent}>
            {/* Promotion banner */}
            {partner.promotion && (
              <View style={styles.promotionBanner}>
                <View style={styles.promotionIcon}>
                  <Ionicons name="pricetag" size={16} color="#ff6b35" />
                </View>
                <View style={styles.promotionContent}>
                  <Text style={styles.promotionLabel}>🎉 Offre Spéciale</Text>
                  <Text style={styles.promotionText}>{partner.promotion}</Text>
                </View>
              </View>
            )}
          </View>
        )}

      <View style={styles.productsSection}>
        <View style={styles.productsHeader}>
          <Text style={styles.sectionTitle}>Nos Produits</Text>
          <View style={styles.headerActions}>
            {!isCurrentUserPartner && !isAdmin && (
              <TouchableOpacity 
                style={styles.cartButton} 
                onPress={() => navigation.navigate('ClientCart')}
              >
                <Ionicons name="bag-outline" size={24} color="#0a8fdf" />
                {cartItemCount > 0 && (
                  <View style={styles.cartBadge}>
                    <Text style={styles.cartBadgeText}>
                      {cartItemCount > 99 ? '99+' : cartItemCount}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            {isCurrentUserPartner && (
              <TouchableOpacity style={styles.addProductButton} onPress={() => setIsProductModalVisible(true)}>
                <Image source={ADD_CIRCLE_OUTLINE_ICON} style={styles.addProductIcon} />
                <Text style={styles.addProductButtonText}>Ajouter Produit</Text>
              </TouchableOpacity>
            )}
          </View>
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

      {/* Appointment Booking Modal */}
      <AppointmentFormModal
        isVisible={showAppointmentFormModal}
        onClose={() => {
          setShowAppointmentFormModal(false);
          setSelectedPartnerForBooking(null);
        }}
        onBookingSuccess={handleAppointmentBookingSuccess}
        ticketId={null} // No ticket ID for direct partner booking
        allPartners={allPartners}
        editingAppointment={null} // Always null for new appointments from partner page
        isAgentMode={false} // Always false for client-initiated bookings
        ticketClientInfo={null} // Will use current user info
        preSelectedPartnerId={partnerId} // Pre-select the current partner
      />

      {/* Auth Required Modal */}
      <Modal
        visible={showAuthModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowAuthModal(false)}
      >
        <View style={styles.authModalOverlay}>
          <View style={styles.authModalContent}>
            <Ionicons name="lock-closed" size={80} color="#0a8fdf" style={styles.lockIcon} />
            <Text style={styles.authTitle}>Connexion requise</Text>
            <Text style={styles.authMessage}>
              {authModalMessage}
            </Text>
            <View style={styles.authButtonsContainer}>
              <TouchableOpacity
                style={styles.authCancelButton}
                onPress={() => setShowAuthModal(false)}
              >
                <Ionicons name="close" size={20} color="#64748B" style={styles.buttonIcon} />
                <Text style={styles.authCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.authLoginButton}
                onPress={() => {
                  setShowAuthModal(false);
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'Login' }],
                  });
                }}
              >
                <Ionicons name="log-in-outline" size={20} color="#FFF" style={styles.buttonIcon} />
                <Text style={styles.authLoginButtonText}>Connexion</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Quick Payment Modal */}
      <Modal
        visible={showQuickPaymentModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowQuickPaymentModal(false)}
      >
        <View style={styles.quickPaymentModalOverlay}>
          <View style={styles.quickPaymentModalContent}>
            <View style={styles.quickPaymentModalHeader}>
              <Text style={styles.quickPaymentModalTitle}>Paiement Rapide</Text>
              <TouchableOpacity 
                onPress={() => setShowQuickPaymentModal(false)}
                style={styles.quickPaymentModalCloseButton}
              >
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.quickPaymentModalScroll}>
              <Text style={styles.quickPaymentPartnerName}>À: {partner.nom}</Text>

              {/* Payment Description */}
              <View style={styles.quickPaymentInputGroup}>
                <Text style={styles.quickPaymentLabel}>Description du paiement *</Text>
                <TextInput
                  style={styles.quickPaymentInput}
                  placeholder="Ex: Prestation de service, Produit personnalisé..."
                  value={paymentDescription}
                  onChangeText={setPaymentDescription}
                  multiline
                  numberOfLines={3}
                />
              </View>

              {/* Manual Amount */}

              {/* Add Items Section */}
              <View style={styles.quickPaymentInputGroup}>
                <Text style={styles.quickPaymentLabel}>Ajouter des articles</Text>
                <View style={styles.addItemContainer}>
                  <TextInput
                    style={[styles.quickPaymentInput, styles.itemNameInput]}
                    placeholder="Nom de l'article"
                    value={newItemName}
                    onChangeText={setNewItemName}
                  />
                  <TextInput
                    style={[styles.quickPaymentInput, styles.itemPriceInput]}
                    placeholder="Prix"
                    value={newItemPrice}
                    onChangeText={setNewItemPrice}
                    keyboardType="numeric"
                  />
                  <TouchableOpacity 
                    style={styles.addItemButton}
                    onPress={addPaymentItem}
                  >
                    <Ionicons name="add" size={20} color="#fff" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Items List */}
              {paymentItems.length > 0 && (
                <View style={styles.quickPaymentInputGroup}>
                  <Text style={styles.quickPaymentLabel}>Articles ajoutés</Text>
                  {paymentItems.map((item) => (
                    <View key={item.id} style={styles.paymentItemRow}>
                      <View style={styles.paymentItemInfo}>
                        <Text style={styles.paymentItemName}>{item.name}</Text>
                        <Text style={styles.paymentItemPrice}>
                          {item.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                        </Text>
                      </View>
                      <TouchableOpacity 
                        onPress={() => removePaymentItem(item.id)}
                        style={styles.removeItemButton}
                      >
                        <Ionicons name="trash-outline" size={16} color="#dc3545" />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}

              {/* Delivery Address */}
              <View style={styles.quickPaymentInputGroup}>
                <Text style={styles.quickPaymentLabel}>Adresse de livraison (optionnel)</Text>
                <TextInput
                  style={styles.quickPaymentInput}
                  placeholder="Adresse complète de livraison"
                  value={paymentDeliveryAddress}
                  onChangeText={setPaymentDeliveryAddress}
                  multiline
                  numberOfLines={2}
                />
              </View>

              {/* Total */}
              <View style={styles.quickPaymentTotal}>
                <Text style={styles.quickPaymentTotalText}>
                  Total: {getTotalPaymentAmount().toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                </Text>
              </View>

              {/* Payment Button */}
              <TouchableOpacity 
                style={[styles.quickPaymentButton, paymentProcessing && styles.quickPaymentButtonDisabled]}
                onPress={processQuickPayment}
                disabled={paymentProcessing}
              >
                {paymentProcessing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.quickPaymentButtonText}>Procéder au paiement</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
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
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  headerBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
    backgroundColor: 'linear-gradient(135deg, #0a8fdf 0%, #1ba3f7 100%)',
    opacity: 0.05,
  },
  headerContent: {
    padding: 24,
    paddingTop: 32,
  },
  logoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  logoContainer: {
    position: 'relative',
    marginRight: 16,
  },
  partnerLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  verifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  partnerInfo: {
    flex: 1,
    paddingTop: 4,
  },
  partnerName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  categoryContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  partnerCategory: {
    fontSize: 16,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  headerCountryRow: {
    alignItems: 'center',
    //marginTop: 6,
    right: 50,
    bottom: 10,
  },
  headerCountryLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  headerCountryValue: {
    fontSize: 14,
    color: '#0b3b6f',
    fontWeight: '700',
    marginTop: 2,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: 6,
  },
  ratingText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginRight: 4,
  },
  ratingSubtext: {
    fontSize: 13,
    color: '#666',
    marginRight: 4,
  },
  ratingChevron: {
    marginLeft: 2,
  },
  noRatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  noRatingText: {
    fontSize: 14,
    color: '#999',
    marginLeft: 6,
    fontStyle: 'italic',
  },
  promotionBanner: {
    flexDirection: 'row',
    backgroundColor: '#fff5f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#ff6b35',
    shadowColor: '#ff6b35',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  promotionIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  promotionContent: {
    flex: 1,
  },
  promotionLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#ff6b35',
    marginBottom: 4,
  },
  promotionText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  descriptionSection: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  descriptionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  descriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  descriptionText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  bookAppointmentButton: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a8fdf',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  buttonIconContainer: {
    marginRight: 6,
  },
  bookAppointmentButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  contactButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#0a8fdf',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  contactButtonText: {
    color: '#0a8fdf',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  productsSection: {
    padding: 20,
    marginTop: 30,
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartButton: {
    padding: 8,
    backgroundColor: '#f0f8ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a8fdf',
    marginRight: 8,
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
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
    borderRadius: 12,
    width: PRODUCT_ITEM_SIZE,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
    position: 'relative',
    marginHorizontal: 5,
  },
  productContent: {
    flex: 1,
  },
  productImage: {
    width: '100%',
    height: PRODUCT_ITEM_SIZE * 0.65,
    resizeMode: 'cover',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  productInfo: {
    padding: 12,
    paddingBottom: 8,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6,
    numberOfLines: 2,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a8fdf',
  },
  addToCartButton: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: '#28a745',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
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
  // Sticky Header Styles
  stickyHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 24,
    paddingBottom: 20,
    zIndex: 1000,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
  },
  stickyHeaderCollapsed: {
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  stickyHeaderContent: {
    flex: 1,
  },
  stickyLogoSection: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  stickyPartnerLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  stickyPartnerLogoSmall: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 0,
    shadowOpacity: 0,
    elevation: 0,
  },
  stickyPartnerInfo: {
    flex: 1,
    marginLeft: 16,
    paddingTop: 4,
  },
  partnerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  toggleButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#f0f8ff',
    borderWidth: 1,
    borderColor: '#0a8fdf',
  },
  stickyPartnerName: {
    fontSize: 26,
    fontWeight: '700',
    color: '#1a1a1a',
    marginBottom: 8,
    letterSpacing: -0.5,
  },
  stickyPartnerNameSmall: {
    fontSize: 16,
    marginBottom: 0,
    letterSpacing: 0,
  },
  stickyPartnerCategory: {
    fontSize: 16,
    color: '#666',
    marginLeft: 6,
    fontWeight: '500',
  },
  stickyActionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  stickyActionButtonsSmall: {
    gap: 6,
  },
  stickyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
  },
  stickyButtonSmall: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  stickyAppointmentButton: {
    backgroundColor: '#0a8fdf',
  },
  stickyContactButton: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#0a8fdf',
  },
  stickyPaymentButton: {
    backgroundColor: '#28a745',
  },
  stickyButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  stickyContactButtonText: {
    color: '#0a8fdf',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  scrollView: {
    flex: 1,
  },
  fullHeaderContent: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingBottom: 20,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  scrollableHeaderContent: {
    backgroundColor: '#fff',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderRadius: 20,
    marginHorizontal: 16,
  },
  scrollablePartnerSection: {
    padding: 24,
  },
  fullActionButtonsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  mainActionButtonsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  quickPaymentHeaderButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  quickPaymentHeaderButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 4,
  },
  quickPaymentStandaloneButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
    marginBottom: 8,
  },
  quickPaymentStandaloneButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // Quick Payment Modal Styles
  quickPaymentModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  quickPaymentModalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 34 : 20,
  },
  quickPaymentModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  quickPaymentModalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  quickPaymentModalCloseButton: {
    padding: 4,
  },
  quickPaymentModalScroll: {
    paddingHorizontal: 20,
  },
  quickPaymentPartnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0a8fdf',
    marginVertical: 16,
    textAlign: 'center',
  },
  quickPaymentInputGroup: {
    marginBottom: 20,
  },
  quickPaymentLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  quickPaymentInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  addItemContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  itemNameInput: {
    flex: 2,
  },
  itemPriceInput: {
    flex: 1,
  },
  addItemButton: {
    backgroundColor: '#0a8fdf',
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paymentItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 8,
  },
  paymentItemInfo: {
    flex: 1,
  },
  paymentItemName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  paymentItemPrice: {
    fontSize: 14,
    color: '#0a8fdf',
    fontWeight: '600',
  },
  removeItemButton: {
    padding: 8,
  },
  quickPaymentTotal: {
    backgroundColor: '#f0f8ff',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#0a8fdf',
  },
  quickPaymentTotalText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0a8fdf',
    textAlign: 'center',
  },
  quickPaymentButton: {
    backgroundColor: '#28a745',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  quickPaymentButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  quickPaymentButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },

  // Auth Required Modal Styles
  authModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  authModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  lockIcon: {
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 12,
    textAlign: 'center',
  },
  authMessage: {
    fontSize: 16,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  authButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  authCancelButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  authCancelButtonText: {
    color: '#64748B',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  authLoginButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a8fdf',
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  authLoginButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 6,
  },
  buttonIcon: {
    marginRight: 2,
  },
});

export default PartnerPage;
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  Platform,
  Dimensions
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  addDoc, 
  deleteDoc,
  doc,
  updateDoc,
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Ionicons } from '@expo/vector-icons';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import StripeService from '../services/stripeService';

const { width } = Dimensions.get('window');

const ClientCart = () => {
  const navigation = useNavigation();
  const [cartItems, setCartItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [total, setTotal] = useState(0);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('card');


  const handleCartPaymentSuccess = async (paymentResult) => {
    try {
      // Save payment record to Firestore
      const paymentRecord = {
        userId: auth.currentUser.uid,
        amount: total,
        currency: 'USD',
        description: `Commande de ${cartItems.length} article(s)`,
        deliveryAddress: deliveryAddress || null,
        items: cartItems,
        paymentType: 'cart_purchase',
        paymentMethod: 'card',
        stripePaymentIntentId: paymentResult.paymentIntentId || paymentResult.paymentIntent?.id,
        cardLast4: paymentResult.cardLast4,
        cardType: paymentResult.cardType,
        status: 'completed',
        createdAt: serverTimestamp(),
        processedAt: paymentResult.processedAt || new Date().toISOString()
      };

      await addDoc(collection(db, 'payments'), paymentRecord);

      // Clear cart items
      const cartQuery = query(
        collection(db, 'clientCart'),
        where('userId', '==', auth.currentUser.uid)
      );
      const cartSnapshot = await getDocs(cartQuery);
      const deletePromises = cartSnapshot.docs.map(doc => deleteDoc(doc.ref));
      await Promise.all(deletePromises);

      Alert.alert(
        'Commande confirmée !', 
        `Votre commande de ${total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })} a été traitée avec succès.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.navigate('Dashboard')
          }
        ]
      );

    } catch (error) {
      console.error('Error processing cart payment:', error);
      Alert.alert('Paiement traité', 'Le paiement a été effectué mais impossible de finaliser la commande.');
    }
  };

  const fetchCartItems = useCallback(async () => {
    if (!auth.currentUser) return;

    setLoading(true);
    try {
      const cartQuery = query(
        collection(db, 'clientCart'),
        where('userId', '==', auth.currentUser.uid)
      );
      
      const cartSnapshot = await getDocs(cartQuery);
      const items = cartSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      setCartItems(items);
      
      // Calculate total
      const totalAmount = items.reduce((sum, item) => 
        sum + (item.productPrice * item.quantity), 0
      );
      setTotal(totalAmount);

    } catch (error) {
      console.error('Error fetching cart items:', error);
      Alert.alert('Erreur', 'Impossible de charger le panier.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchCartItems();
    }, [fetchCartItems])
  );

  const updateQuantity = async (cartItemId, newQuantity) => {
    if (newQuantity < 1) {
      removeFromCart(cartItemId);
      return;
    }

    try {
      await updateDoc(doc(db, 'clientCart', cartItemId), {
        quantity: newQuantity
      });
      fetchCartItems();
    } catch (error) {
      console.error('Error updating quantity:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour la quantité.');
    }
  };

  const removeFromCart = async (cartItemId) => {
    Alert.alert(
      'Supprimer du panier',
      'Êtes-vous sûr de vouloir supprimer cet article du panier ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'clientCart', cartItemId));
              fetchCartItems();
            } catch (error) {
              console.error('Error removing from cart:', error);
              Alert.alert('Erreur', 'Impossible de supprimer l\'article.');
            }
          }
        }
      ]
    );
  };

  const processPayment = async () => {
    if (cartItems.length === 0) {
      Alert.alert('Panier vide', 'Votre panier est vide.');
      return;
    }

    if (!deliveryAddress.trim()) {
      Alert.alert('Adresse requise', 'Veuillez saisir une adresse de livraison.');
      return;
    }

    // Validate card information if payment method is card
    if (paymentMethod === 'card' && (!cardData || !isCardValid)) {
      Alert.alert('Carte invalide', 'Veuillez vérifier les informations de votre carte.');
      return;
    }

    setProcessing(true);
    try {
      let paymentStatus = 'pending';
      let paymentInfo = {};

      // Process Stripe payment if method is card
      if (paymentMethod === 'card' && cardData) {
        try {
          const orderInfo = {
            orderId: `order_${Date.now()}`,
            userId: auth.currentUser.uid,
            items: cartItems.length,
            deliveryAddress: deliveryAddress.trim()
          };

          const paymentResult = await StripeService.processCardPayment(
            cardData, 
            total, 
            orderInfo
          );

          if (paymentResult.success) {
            paymentStatus = 'paid';
            paymentInfo = {
              paymentIntentId: paymentResult.paymentIntentId,
              chargeId: paymentResult.chargeId,
              cardLast4: paymentResult.cardLast4,
              cardType: paymentResult.cardType,
              cardholderName: cardData.cardholderName,
              paymentProcessedAt: paymentResult.processedAt,
              receiptUrl: paymentResult.receiptUrl,
              amount: paymentResult.amount,
              currency: paymentResult.currency
            };
          } else {
            throw new Error('Payment failed');
          }
        } catch (stripeError) {
          console.error('Stripe payment error:', stripeError);
          const errorMessage = StripeService.formatPaymentError(stripeError);
          Alert.alert('Erreur de paiement', errorMessage);
          setProcessing(false);
          return;
        }
      }

      // Create order in Firestore
      const orderData = {
        userId: auth.currentUser.uid,
        items: cartItems.map(item => ({
          productId: item.productId,
          productName: item.productName,
          productPrice: item.productPrice,
          quantity: item.quantity,
          partnerId: item.partnerId,
          partnerName: item.partnerName
        })),
        total: total,
        deliveryAddress: deliveryAddress.trim(),
        paymentMethod: paymentMethod,
        paymentStatus: paymentStatus,
        paymentInfo: paymentInfo,
        status: 'confirmed',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'orders'), orderData);

      // Clear cart
      for (const item of cartItems) {
        await deleteDoc(doc(db, 'clientCart', item.id));
      }

      Alert.alert(
        'Commande confirmée !',
        'Votre commande a été passée avec succès. Vous recevrez une confirmation par email.',
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error) {
      console.error('Error processing payment:', error);
      Alert.alert('Erreur', 'Impossible de traiter le paiement. Veuillez réessayer.');
    } finally {
      setProcessing(false);
    }
  };

  const renderCartItem = ({ item }) => (
    <View style={styles.cartItem}>
      <Image 
        source={{ uri: item.productImage || 'https://via.placeholder.com/80' }}
        style={styles.productImage}
      />
      
      <View style={styles.itemInfo}>
        <Text style={styles.productName}>{item.productName}</Text>
        <Text style={styles.partnerName}>Par {item.partnerName}</Text>
        <Text style={styles.productPrice}>
          {item.productPrice.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
        </Text>
      </View>

      <View style={styles.quantityContainer}>
        <TouchableOpacity 
          style={styles.quantityButton}
          onPress={() => updateQuantity(item.id, item.quantity - 1)}
        >
          <Ionicons name="remove" size={20} color="#0a8fdf" />
        </TouchableOpacity>
        
        <Text style={styles.quantityText}>{item.quantity}</Text>
        
        <TouchableOpacity 
          style={styles.quantityButton}
          onPress={() => updateQuantity(item.id, item.quantity + 1)}
        >
          <Ionicons name="add" size={20} color="#0a8fdf" />
        </TouchableOpacity>
      </View>

      <TouchableOpacity 
        style={styles.removeButton}
        onPress={() => removeFromCart(item.id)}
      >
        <Ionicons name="trash-outline" size={20} color="#dc3545" />
      </TouchableOpacity>
    </View>
  );

  const renderEmptyCart = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="bag-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>Votre panier est vide</Text>
      <Text style={styles.emptySubtitle}>Découvrez nos partenaires et leurs produits</Text>
      <TouchableOpacity 
        style={styles.shopButton}
        onPress={() => navigation.navigate('Dashboard')}
      >
        <Text style={styles.shopButtonText}>Commencer les achats</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement du panier...</Text>
      </View>
    );
  }

  if (cartItems.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mon Panier</Text>
          <View style={styles.headerRight} />
        </View>
        {renderEmptyCart()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mon Panier ({cartItems.length})</Text>
        <View style={styles.headerRight} />
      </View>

      <ScrollView style={styles.content}>
        {/* Cart Items */}
        <View style={styles.cartSection}>
          <Text style={styles.sectionTitle}>Articles</Text>
          <FlatList
            data={cartItems}
            renderItem={renderCartItem}
            keyExtractor={item => item.id}
            scrollEnabled={false}
          />
        </View>

        {/* Delivery Address */}
        <View style={styles.addressSection}>
          <Text style={styles.sectionTitle}>Adresse de livraison</Text>
          <TextInput
            style={styles.addressInput}
            placeholder="Saisissez votre adresse complète"
            value={deliveryAddress}
            onChangeText={setDeliveryAddress}
            multiline
            numberOfLines={3}
          />
        </View>

        {/* Payment Method Selector */}
        <View style={styles.paymentSection}>
          <PaymentMethodSelector
            amount={total}
            currency="USD"
            description={`Commande de ${cartItems.length} article(s)`}
            orderInfo={{
              description: `Commande de ${cartItems.length} article(s)`,
              items: cartItems,
              deliveryAddress: deliveryAddress,
              paymentType: 'cart_purchase',
              userId: auth.currentUser?.uid
            }}
            onPaymentSuccess={handleCartPaymentSuccess}
            onPaymentError={(error) => {
              console.error('Cart payment error:', error);
              Alert.alert('Erreur de paiement', error.message || 'Une erreur est survenue lors du paiement');
            }}
            onPaymentCancel={() => {
              console.log('Cart payment cancelled by user');
            }}
          />
        </View>

        {/* Order Summary */}
        <View style={styles.summarySection}>
          <Text style={styles.sectionTitle}>Résumé de la commande</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Sous-total</Text>
            <Text style={styles.summaryValue}>
              {total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
            </Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Livraison</Text>
            <Text style={styles.summaryValue}>Gratuite</Text>
          </View>
          <View style={[styles.summaryRow, styles.totalRow]}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Checkout Button */}
      <View style={styles.checkoutContainer}>
        <TouchableOpacity 
          style={[styles.checkoutButton, processing && styles.checkoutButtonDisabled]}
          onPress={processPayment}
          disabled={processing}
        >
          {processing ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Text style={styles.checkoutButtonText}>
                {paymentMethod === 'card' ? 'Payer et commander' : 'Passer la commande'}
              </Text>
              <Text style={styles.checkoutTotal}>
                {total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
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
  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 50 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    paddingBottom: 40
  },
  backButton: {
    padding: 8,
    top: 25
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    top: 25
  },
  headerRight: {
    width: 40,
  },
  content: {
    flex: 1,
  },
  cartSection: {
    backgroundColor: '#fff',
    margin: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  cartItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  productImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    marginRight: 12,
  },
  itemInfo: {
    flex: 1,
  },
  productName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  partnerName: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0a8fdf',
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 12,
  },
  quantityButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f0f8ff',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#0a8fdf',
  },
  quantityText: {
    marginHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  removeButton: {
    padding: 8,
  },
  addressSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  addressInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  paymentSection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 12,
  },
  paymentOptionSelected: {
    borderColor: '#0a8fdf',
    backgroundColor: '#f0f8ff',
  },
  paymentText: {
    fontSize: 16,
    color: '#666',
    marginLeft: 12,
  },
  paymentTextSelected: {
    color: '#0a8fdf',
    fontWeight: '600',
  },
  summarySection: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 16,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 16,
    color: '#666',
  },
  summaryValue: {
    fontSize: 16,
    color: '#333',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    marginTop: 8,
    paddingTop: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0a8fdf',
  },
  checkoutContainer: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 30 : 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    marginBottom: 28,
    bottom: 20
  },
  checkoutButton: {
    backgroundColor: '#0a8fdf',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  checkoutButtonDisabled: {
    backgroundColor: '#ccc',
  },
  checkoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
  },
  checkoutTotal: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 30,
  },
  shopButton: {
    backgroundColor: '#0a8fdf',
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 25,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  shopButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default ClientCart;

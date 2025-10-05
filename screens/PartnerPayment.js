import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Platform
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Ionicons } from '@expo/vector-icons';
import PaymentMethodSelector from '../components/PaymentMethodSelector';
import StripeService from '../services/stripeService';

const PartnerPayment = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const {
    partnerId,
    partnerName,
    partnerLogo,
    description,
    deliveryAddress,
    items,
    manualAmount,
    total,
    paymentType
  } = route.params;

  const [processing, setProcessing] = useState(false);

  const handlePaymentSuccess = async (paymentResult) => {
    try {
      // Save payment record to Firestore
      const paymentRecord = {
        userId: auth.currentUser.uid,
        partnerId: partnerId,
        partnerName: partnerName,
        amount: total,
        currency: 'USD',
        description: description,
        deliveryAddress: deliveryAddress || null,
        items: items || [],
        manualAmount: manualAmount || 0,
        paymentType: paymentType,
        paymentMethod: paymentResult.paymentMethod || 'card',
        stripePaymentIntentId: paymentResult.paymentIntentId || paymentResult.paymentIntent?.id,
        paypalPaymentId: paymentResult.paymentId || null,
        paypalPayerId: paymentResult.payerId || null,
        cardLast4: paymentResult.cardLast4 || null,
        cardType: paymentResult.cardType || null,
        status: 'completed',
        createdAt: serverTimestamp(),
        processedAt: paymentResult.processedAt || new Date().toISOString()
      };

      await addDoc(collection(db, 'payments'), paymentRecord);

      Alert.alert(
        'Paiement réussi !', 
        `Votre paiement de ${total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })} à ${partnerName} a été traité avec succès.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error) {
      console.error('Error saving payment record:', error);
      Alert.alert('Paiement traité', 'Le paiement a été effectué mais impossible de sauvegarder le reçu.');
    }
  };

  const processPayment = async () => {
    if (!auth.currentUser) {
      Alert.alert('Erreur', 'Veuillez vous connecter pour effectuer un paiement.');
      return;
    }

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
            orderId: `partner_payment_${Date.now()}`,
            userId: auth.currentUser.uid,
            partnerId,
            partnerName,
            paymentType: 'partner_direct'
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

      // Create payment record in Firestore
      const paymentData = {
        userId: auth.currentUser.uid,
        partnerId: partnerId,
        partnerName: partnerName,
        description: description,
        deliveryAddress: deliveryAddress || null,
        items: items,
        manualAmount: manualAmount,
        total: total,
        paymentMethod: paymentMethod,
        paymentStatus: paymentStatus,
        paymentInfo: paymentInfo,
        paymentType: paymentType,
        status: 'confirmed',
        createdAt: serverTimestamp()
      };

      await addDoc(collection(db, 'partnerPayments'), paymentData);

      Alert.alert(
        'Paiement confirmé !',
        `Votre paiement de ${total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })} à ${partnerName} a été traité avec succès.`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );

    } catch (error) {
      console.error('Error processing partner payment:', error);
      Alert.alert('Erreur', 'Impossible de traiter le paiement. Veuillez réessayer.');
    } finally {
      setProcessing(false);
    }
  };

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
        <Text style={styles.headerTitle}>Paiement</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Partner Info */}
        <View style={styles.partnerSection}>
          <View style={styles.partnerHeader}>
            <Image source={{ uri: partnerLogo }} style={styles.partnerLogo} />
            <View style={styles.partnerInfo}>
              <Text style={styles.partnerName}>{partnerName}</Text>
              <Text style={styles.paymentTypeText}>Paiement direct</Text>
            </View>
          </View>
        </View>

        {/* Payment Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Détails du paiement</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description:</Text>
            <Text style={styles.detailValue}>{description}</Text>
          </View>
          
          {deliveryAddress && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Livraison:</Text>
              <Text style={styles.detailValue}>{deliveryAddress}</Text>
            </View>
          )}
          
          {items.length > 0 && (
            <View style={styles.itemsSection}>
              <Text style={styles.detailLabel}>Articles:</Text>
              {items.map((item) => (
                <View key={item.id} style={styles.itemRow}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  <Text style={styles.itemPrice}>
                    {item.price.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                  </Text>
                </View>
              ))}
            </View>
          )}
          
          {manualAmount > 0 && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Montant manuel:</Text>
              <Text style={styles.detailValue}>
                {manualAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
              </Text>
            </View>
          )}
        </View>

        {/* Payment Method Selector */}
        <View style={styles.section}>
          <PaymentMethodSelector
            amount={total}
            currency="USD"
            description={description}
            orderInfo={{
              description: description,
              partnerId: partnerId,
              partnerName: partnerName,
              deliveryAddress: deliveryAddress,
              items: items,
              paymentType: paymentType,
              userId: auth.currentUser?.uid
            }}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentError={(error) => {
              console.error('Payment error:', error);
              Alert.alert('Erreur de paiement', error.message || 'Une erreur est survenue lors du paiement');
            }}
            onPaymentCancel={() => {
              console.log('Payment cancelled by user');
            }}
          />
        </View>

        {/* Total */}
        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total à payer</Text>
            <Text style={styles.totalAmount}>
              {total.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
            </Text>
          </View>
        </View>
      </ScrollView>


    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingBottom: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  partnerSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  partnerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  partnerLogo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  paymentTypeText: {
    fontSize: 14,
    color: '#0a8fdf',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
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
    marginBottom: 12,
  },
  detailRow: {
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 16,
    color: '#333',
  },
  itemsSection: {
    marginTop: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemName: {
    fontSize: 15,
    color: '#333',
    flex: 1,
  },
  itemPrice: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0a8fdf',
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#fafafa',
  },
  paymentOptionSelected: {
    borderColor: '#0a8fdf',
    backgroundColor: '#f0f8ff',
  },
  paymentText: {
    fontSize: 16,
    color: '#666',
    flex: 1,
    marginLeft: 12,
  },
  paymentTextSelected: {
    color: '#0a8fdf',
    fontWeight: '500',
  },
  totalSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 2,
    borderColor: '#0a8fdf',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  totalAmount: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0a8fdf',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#28a745',
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  payButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  payButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default PartnerPayment;

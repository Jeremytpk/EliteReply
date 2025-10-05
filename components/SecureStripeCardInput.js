import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { Ionicons } from '@expo/vector-icons';
import { createPaymentIntent } from '../config/stripe';

const SecureStripeCardInput = ({ onPaymentSuccess, loading, amount, orderInfo, userId, partnerId }) => {
  const [cardDetails, setCardDetails] = useState();
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardFieldError, setCardFieldError] = useState(null);
  const { createPaymentMethod, confirmPayment } = useStripe();

  const handleCardDetailsChange = (cardDetails) => {
    try {
      console.log('🔄 Card details changed:', {
        complete: cardDetails.complete,
        last4: cardDetails.last4,
        brand: cardDetails.brand,
        validNumber: cardDetails.validNumber,
        validExpiryDate: cardDetails.validExpiryDate,
        validCVC: cardDetails.validCVC
      });
      setCardDetails(cardDetails);
      setCardFieldError(null); // Clear any previous errors
    } catch (error) {
      console.error('❌ Error handling card details change:', error);
      setCardFieldError(error.message);
    }
  };

  const processPayment = async () => {
    console.log('🔍 Card details validation:', cardDetails);
    
    // Check if basic card validation passes
    const isBasicValid = cardDetails?.validNumber && 
                        cardDetails?.validExpiryDate && 
                        cardDetails?.validCVC;
    
    if (!cardDetails?.complete && !isBasicValid) {
      console.warn('❌ Card details validation failed:', {
        complete: cardDetails?.complete,
        validNumber: cardDetails?.validNumber,
        validExpiryDate: cardDetails?.validExpiryDate,
        validCVC: cardDetails?.validCVC
      });
      Alert.alert('Erreur', 'Veuillez remplir tous les champs de la carte correctement');
      return;
    }
    
    // Log successful validation
    console.log('✅ Card validation passed:', {
      complete: cardDetails?.complete,
      basicValid: isBasicValid
    });

    setIsProcessing(true);

    try {
      console.log('🔄 Starting secure payment process...');

      // STEP 1: Create payment method securely using Stripe CardField
      const { paymentMethod, error: paymentMethodError } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: 'Cardholder', // You can add a name field if needed
          },
        },
      });

      if (paymentMethodError) {
        console.error('❌ Payment method creation error:', paymentMethodError);
        throw new Error(paymentMethodError.message);
      }

      console.log('✅ Payment method created:', paymentMethod.id);

      // STEP 2: Create payment intent on server with secure payment method ID
      const paymentIntentResult = await createPaymentIntent(
        amount,
        'USD',
        'EliteReply Payment',
        userId || 'user123',
        orderInfo,
        partnerId
      );

      console.log('✅ Payment intent created:', paymentIntentResult.id);

      // STEP 3: Confirm payment with the client secret
      const { error: confirmError, paymentIntent } = await confirmPayment(
        paymentIntentResult.client_secret,
        {
          paymentMethodType: 'Card',
          paymentMethodData: {
            paymentMethodId: paymentMethod.id,
          },
        }
      );

      if (confirmError) {
        console.error('❌ Payment confirmation error:', confirmError);
        throw new Error(confirmError.message);
      }

      console.log('✅ Payment confirmed successfully:', paymentIntent.status);

      // Payment successful
      if (onPaymentSuccess) {
        onPaymentSuccess({
          paymentIntentId: paymentIntent.id,
          status: paymentIntent.status,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency
        });
      }

      Alert.alert('Succès', 'Paiement effectué avec succès!');

    } catch (error) {
      console.error('❌ Payment processing error:', error);
      Alert.alert(
        'Erreur de paiement',
        error.message || 'Une erreur est survenue lors du traitement du paiement.'
      );
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Informations de paiement</Text>
      
      <View style={styles.cardFieldContainer}>
        {cardFieldError ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>
              Erreur du composant de carte. Veuillez redémarrer l'application.
            </Text>
            <TouchableOpacity 
              style={styles.retryButton}
              onPress={() => setCardFieldError(null)}
            >
              <Text style={styles.retryButtonText}>Réessayer</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <CardField
            postalCodeEnabled={false}
            placeholders={{
              number: '4242 4242 4242 4242',
              expiration: 'MM/YY',
              cvc: 'CVC',
            }}
            cardStyle={{
              backgroundColor: '#FFFFFF',
              textColor: '#000000',
              fontSize: 16,
              placeholderColor: '#999999',
            }}
            style={styles.cardFieldInput}
            onCardChange={handleCardDetailsChange}
            onFocus={() => console.log('CardField focused')}
            onBlur={() => console.log('CardField blurred')}
          />
        )}
        
        {/* Debug info - remove in production */}
        {__DEV__ && cardDetails && (
          <View style={styles.debugInfo}>
            <Text style={styles.debugText}>
              Debug: Complete={cardDetails.complete ? '✅' : '❌'} | 
              Number={cardDetails.validNumber ? '✅' : '❌'} | 
              Expiry={cardDetails.validExpiryDate ? '✅' : '❌'} | 
              CVC={cardDetails.validCVC ? '✅' : '❌'}
            </Text>
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[
          styles.payButton,
          ((!cardDetails?.complete && !(cardDetails?.validNumber && cardDetails?.validExpiryDate && cardDetails?.validCVC)) || isProcessing || loading) && styles.payButtonDisabled
        ]}
        onPress={processPayment}
        disabled={(!cardDetails?.complete && !(cardDetails?.validNumber && cardDetails?.validExpiryDate && cardDetails?.validCVC)) || isProcessing || loading}
      >
        {(isProcessing || loading) ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <View style={styles.payButtonContent}>
            <Ionicons name="card" size={20} color="#fff" />
            <Text style={styles.payButtonText}>
              Payer {amount ? `$${amount.toFixed(2)}` : ''}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <View style={styles.securityInfo}>
        <Ionicons name="shield-checkmark" size={16} color="#28a745" />
        <Text style={styles.securityText}>
          Paiement sécurisé par Stripe
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginVertical: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
  },
  cardFieldContainer: {
    marginBottom: 20,
  },
  cardFieldInput: {
    width: '100%',
    height: 50,
    marginVertical: 10,
  },
  payButton: {
    backgroundColor: '#007bff',
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 15,
  },
  payButtonDisabled: {
    backgroundColor: '#ccc',
  },
  payButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  payButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    marginLeft: 8,
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  securityText: {
    marginLeft: 5,
    fontSize: 12,
    color: '#28a745',
  },
  debugInfo: {
    marginTop: 10,
    padding: 8,
    backgroundColor: '#f8f9fa',
    borderRadius: 4,
  },
  debugText: {
    fontSize: 10,
    color: '#666',
    fontFamily: 'monospace',
  },
  errorContainer: {
    backgroundColor: '#fee',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    color: '#d63384',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 10,
  },
  retryButton: {
    backgroundColor: '#007bff',
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 4,
  },
  retryButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default SecureStripeCardInput;

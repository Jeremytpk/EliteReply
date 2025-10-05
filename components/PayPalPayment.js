import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  Platform
} from 'react-native';
import { PayPal } from 'react-native-paypal-wrapper';
import { Ionicons } from '@expo/vector-icons';
import { auth } from '../firebase';
import { PayPalService } from '../services/paypalService';
import { PAYPAL_CONFIG } from '../config/paypal';

const PayPalPayment = ({ 
  amount, 
  currency = 'USD', 
  description = 'EliteReply Payment',
  onPaymentSuccess, 
  onPaymentError,
  onPaymentCancel,
  style 
}) => {
  const [processing, setProcessing] = useState(false);

  // PayPal configuration from config file
  const paypalConfig = {
    clientId: PAYPAL_CONFIG.CLIENT_ID,
    environment: PAYPAL_CONFIG.ENVIRONMENT,
    ...PAYPAL_CONFIG.SDK_CONFIG
  };

  const handlePayPalPayment = async () => {
    if (!auth.currentUser) {
      Alert.alert('Erreur', 'Vous devez être connecté pour effectuer un paiement');
      return;
    }

    setProcessing(true);

    try {
      // Initialize PayPal SDK
      await PayPal.initialize(paypalConfig);
      console.log('PayPal SDK initialized successfully');
      // Create payment request
      const paymentRequest = {
        amount: amount.toString(),
        currency: currency,
        shortDescription: description,
        ...PAYPAL_CONFIG.PAYMENT_CONFIG
      };

      console.log('🔄 Processing PayPal payment...', paymentRequest);

      // Process PayPal payment
      const result = await PayPal.paymentRequest(paymentRequest);

      console.log('✅ PayPal payment result:', result);

      if (result.nonce && result.nonce !== '') {
        // Process payment via backend
        const backendResponse = await PayPalService.processPayPalPayment({
          paymentId: result.nonce,
          payerId: result.payerId || 'unknown',
          amount: amount,
          currency: currency,
          description: description,
          userId: auth.currentUser.uid,
          orderData: {
            paypalTransactionData: result
          }
        });

        // Payment successful
        const paymentResult = {
          success: true,
          paymentMethod: 'paypal',
          paymentId: result.nonce,
          payerId: result.payerId || null,
          amount: amount,
          currency: currency,
          status: 'completed',
          processedAt: new Date().toISOString(),
          paypalResponse: result,
          backendResponse: backendResponse
        };

        if (onPaymentSuccess) {
          await onPaymentSuccess(paymentResult);
        }

        Alert.alert(
          'Paiement réussi !',
          `Votre paiement de ${amount.toLocaleString('fr-FR', { style: 'currency', currency: currency })} via PayPal a été traité avec succès.`
        );

      } else {
        throw new Error('Aucun nonce de paiement reçu de PayPal');
      }

    } catch (error) {
      console.error('❌ PayPal payment error:', error);
      
      if (error.message === 'User cancelled') {
        if (onPaymentCancel) {
          onPaymentCancel();
        }
        // Don't show alert for user cancellation
      } else {
        const errorMessage = error.message || 'Erreur lors du traitement du paiement PayPal';
        
        if (onPaymentError) {
          onPaymentError(error);
        }
        
        Alert.alert('Erreur PayPal', errorMessage);
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.paypalButton, style]}
      onPress={handlePayPalPayment}
      disabled={processing}
    >
      {processing ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <>
          <Ionicons name="logo-paypal" size={24} color="#fff" />
          <Text style={styles.paypalButtonText}>
            Payer avec PayPal
          </Text>
        </>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  paypalButton: {
    backgroundColor: '#0070ba',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginVertical: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  paypalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
});

export default PayPalPayment;

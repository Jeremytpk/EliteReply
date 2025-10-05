import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStripe, useConfirmPayment } from '@stripe/stripe-react-native';

const StripeCardInput = ({ onPaymentMethodReady, onPaymentSuccess, loading, amount, orderInfo }) => {
  const [cardNumber, setCardNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [cvv, setCvv] = useState('');
  const [cardholderName, setCardholderName] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [showCvvModal, setShowCvvModal] = useState(false);
  const [tempCvv, setTempCvv] = useState('');
  
  const { createPaymentMethod } = useStripe();
  const { confirmPayment } = useConfirmPayment();

  // Format card number with spaces
  const formatCardNumber = (text) => {
    const cleaned = text.replace(/\s+/g, '').replace(/[^0-9]/gi, '');
    const parts = [];

    for (let i = 0, len = cleaned.length; i < len; i += 4) {
      parts.push(cleaned.substring(i, i + 4));
    }

    if (parts.length) {
      return parts.join(' ');
    } else {
      return cleaned;
    }
  };

  // Format expiry date as MM/YY
  const formatExpiryDate = (text) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return `${cleaned.substring(0, 2)}/${cleaned.substring(2, 4)}`;
    }
    return cleaned;
  };

  // Validate card number using Luhn algorithm
  const validateCardNumber = (number) => {
    const cleaned = number.replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(cleaned)) return false;

    let sum = 0;
    let shouldDouble = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned.charAt(i), 10);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  };

  // Validate expiry date
  const validateExpiryDate = (expiry) => {
    const [month, year] = expiry.split('/');
    if (!month || !year || month.length !== 2 || year.length !== 2) return false;

    const monthNum = parseInt(month, 10);
    const yearNum = parseInt(year, 10) + 2000;
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    if (monthNum < 1 || monthNum > 12) return false;
    if (yearNum < currentYear || (yearNum === currentYear && monthNum < currentMonth)) return false;

    return true;
  };

  // Validate CVV - starts counting from 1
  const validateCVV = (cvv) => {
    if (!cvv) return false;
    const cleanCvv = String(cvv).trim();
    // CVV must be exactly 3 or 4 digits
    const isValid = (cleanCvv.length === 3 || cleanCvv.length === 4) && /^\d+$/.test(cleanCvv);
    return isValid;
  };

  // Check if all fields are valid
  const checkValidity = () => {
    const isCardValid = validateCardNumber(cardNumber);
    const isExpiryValid = validateExpiryDate(expiryDate);
    const isCvvValid = validateCVV(cvv);
    const isNameValid = cardholderName.trim().length >= 1; // Start counting from 1

    const valid = isCardValid && isExpiryValid && isCvvValid && isNameValid;
    setIsValid(valid);

    if (valid && onPaymentMethodReady) {
      const [month, year] = expiryDate.split('/');
      onPaymentMethodReady({
        cardNumber: cardNumber.replace(/\s+/g, ''),
        expiryMonth: month,
        expiryYear: `20${year}`,
        cvv,
        cardholderName: cardholderName.trim()
      });
    }

    return valid;
  };

  const handleCardNumberChange = (text) => {
    const formatted = formatCardNumber(text);
    if (formatted.replace(/\s+/g, '').length <= 19) {
      setCardNumber(formatted);
      setTimeout(checkValidity, 100);
    }
  };

  const handleExpiryChange = (text) => {
    const formatted = formatExpiryDate(text);
    if (formatted.length <= 5) {
      setExpiryDate(formatted);
      setTimeout(checkValidity, 100);
    }
  };

  const handleNameChange = (text) => {
    setCardholderName(text);
    setTimeout(checkValidity, 100);
  };

  // CVV Modal Functions
  const openCvvModal = () => {
    setTempCvv(cvv);
    setShowCvvModal(true);
  };

  const confirmCvv = () => {
    const cleanCvv = tempCvv.trim();
    if ((cleanCvv.length === 3 || cleanCvv.length === 4) && /^\d+$/.test(cleanCvv)) {
      setCvv(cleanCvv);
      setShowCvvModal(false);
      setTimeout(checkValidity, 200); // Give more time for state update
    } else {
      Alert.alert('Erreur', 'Le CVV doit contenir exactement 3 ou 4 chiffres');
    }
  };

  const cancelCvv = () => {
    setTempCvv(cvv);
    setShowCvvModal(false);
  };

  // Real Stripe payment processing
  const processRealPayment = async () => {
    if (!isValid) {
      Alert.alert('Erreur', 'Veuillez vérifier les informations de votre carte.');
      return;
    }

    setIsProcessing(true);

    try {
      // Validate all required fields before processing
      if (!cardNumber || !expiryDate || !cvv || !cardholderName.trim()) {
        throw new Error('Tous les champs sont requis');
      }

      // Format card data for Stripe React Native
      const [month, year] = expiryDate.split('/');
      if (!month || !year || month.length !== 2 || year.length !== 2) {
        throw new Error('Format de date d\'expiration invalide');
      }

      const cardDetails = {
        number: cardNumber.replace(/\s+/g, ''),
        expiryMonth: parseInt(month, 10),
        expiryYear: parseInt(`20${year}`, 10),
        cvc: cvv,
      };

      // Validate formatted data
      if (cardDetails.number.length < 13 || cardDetails.number.length > 19) {
        throw new Error('Numéro de carte invalide');
      }
      if (cardDetails.expiryMonth < 1 || cardDetails.expiryMonth > 12) {
        throw new Error('Mois d\'expiration invalide');
      }
      if (cardDetails.expiryYear < new Date().getFullYear()) {
        throw new Error('Année d\'expiration invalide');
      }

      console.log('Creating secure payment method with Stripe React Native SDK');

      // STEP 1: Create payment method securely on client-side using Stripe SDK
      const { paymentMethod, error: paymentMethodError } = await createPaymentMethod({
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: cardholderName.trim(),
          },
        },
      });

      if (paymentMethodError) {
        console.error('Payment method creation error:', paymentMethodError);
        throw new Error(paymentMethodError.message || 'Failed to create payment method');
      }

      if (!paymentMethod) {
        throw new Error('No payment method created');
      }

      console.log('Payment method created successfully:', paymentMethod.id);

      // STEP 2: Send only the secure payment method ID to server
      const response = await fetch('https://createpaymentintent-kjypry55ca-uc.a.run.app', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100), // Convert to cents
          currency: 'usd',
          userId: 'user123', // Replace with actual user ID
          description: 'EliteReply Payment',
          orderData: orderInfo,
          // Send only the secure payment method ID (no raw card data)
          paymentMethodId: paymentMethod.id,
        }),
      });

      const backendResult = await response.json();
      
      if (!response.ok || backendResult.error) {
        throw new Error(backendResult.error || 'Failed to process payment');
      }

      // Payment was processed successfully on the backend
      console.log('Payment processed successfully:', backendResult);

      // Payment successful
      console.log('Payment confirmed successfully');
      
      const paymentResult = {
        success: true,
        clientSecret: clientSecret,
        amount: amount,
        currency: 'usd',
        cardLast4: cardNumber.slice(-4),
        processedAt: new Date().toISOString()
      };

      if (onPaymentSuccess) {
        await onPaymentSuccess(paymentResult);
      } else if (onPaymentMethodReady) {
        onPaymentMethodReady(paymentResult);
      }

      Alert.alert('Succès', 'Paiement effectué avec succès!');

    } catch (error) {
      console.error('Payment processing error:', error);
      Alert.alert('Erreur', 'Erreur lors du traitement du paiement. Veuillez réessayer.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getCardType = (number) => {
    const cleaned = number.replace(/\s+/g, '');
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    return 'generic';
  };

  const getCardIcon = () => {
    const type = getCardType(cardNumber);
    switch (type) {
      case 'visa':
        return 'card';
      case 'mastercard':
        return 'card';
      case 'amex':
        return 'card';
      default:
        return 'card-outline';
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Informations de carte</Text>
      
      {/* Cardholder Name */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Nom du porteur</Text>
        <TextInput
          style={styles.input}
          placeholder="Nom complet"
          value={cardholderName}
          onChangeText={handleNameChange}
          autoCapitalize="words"
        />
      </View>

      {/* Card Number */}
      <View style={styles.inputContainer}>
        <Text style={styles.label}>Numéro de carte</Text>
        <View style={styles.cardInputWrapper}>
          <TextInput
            style={[styles.input, styles.cardInput]}
            placeholder="1234 5678 9012 3456"
            value={cardNumber}
            onChangeText={handleCardNumberChange}
            keyboardType="numeric"
            maxLength={19}
          />
          <Ionicons 
            name={getCardIcon()} 
            size={24} 
            color={validateCardNumber(cardNumber) ? '#28a745' : '#666'} 
            style={styles.cardIcon}
          />
        </View>
      </View>

      {/* Expiry and CVV */}
      <View style={styles.row}>
        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Text style={styles.label}>Date d'expiration</Text>
          <TextInput
            style={styles.input}
            placeholder="MM/AA"
            value={expiryDate}
            onChangeText={handleExpiryChange}
            keyboardType="numeric"
            maxLength={5}
          />
        </View>

        <View style={[styles.inputContainer, styles.halfWidth]}>
          <Text style={styles.label}>CVV</Text>
          <TouchableOpacity 
            style={[styles.input, styles.cvvButton, validateCVV(cvv) && styles.cvvValid]}
            onPress={openCvvModal}
          >
            <Text style={[styles.cvvButtonText, cvv ? {} : {color: '#999'}]}>
              {cvv ? '•••' : '123'}
            </Text>
            <View style={styles.cvvRightSection}>
              {validateCVV(cvv) && <Text style={styles.cvvValidIcon}>✓</Text>}
              <Text style={styles.cvvHint}>Appuyer</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      {/* Security Info */}
      <View style={styles.securityInfo}>
        <Ionicons name="shield-checkmark" size={16} color="#28a745" />
        <Text style={styles.securityText}>
          Vos informations sont sécurisées et cryptées
        </Text>
      </View>

      {/* Validation Status */}
      {cardNumber && (
        <View style={styles.validationStatus}>
          <Ionicons 
            name={isValid ? "checkmark-circle" : "alert-circle"} 
            size={16} 
            color={isValid ? "#28a745" : "#dc3545"} 
          />
          <Text style={[styles.validationText, { color: isValid ? "#28a745" : "#dc3545" }]}>
            {isValid ? "Informations valides" : "Veuillez vérifier les informations saisies"}
          </Text>
        </View>
      )}

      {/* Payment Button */}
      <TouchableOpacity 
        style={[
          styles.paymentButton, 
          (!isValid || isProcessing) && styles.paymentButtonDisabled
        ]}
        onPress={processRealPayment}
        disabled={!isValid || isProcessing}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : (
          <>
            <Ionicons name="card" size={20} color="#fff" style={styles.buttonIcon} />
            <Text style={styles.paymentButtonText}>
              {amount ? `Payer ${amount.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}` : 'Payer'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {(loading || isProcessing) && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="small" color="#0a8fdf" />
          <Text style={styles.loadingText}>
            {isProcessing ? 'Traitement du paiement...' : 'Traitement en cours...'}
          </Text>
        </View>
      )}

      {/* CVV Modal */}
      <Modal
        visible={showCvvModal}
        transparent={true}
        animationType="fade"
        onRequestClose={cancelCvv}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Code CVV</Text>
            <Text style={styles.modalSubtitle}>
              Entrez le code à 3 ou 4 chiffres au dos de votre carte
            </Text>
            
            <TextInput
              style={styles.modalInput}
              placeholder="123"
              value={tempCvv}
              onChangeText={(text) => {
                const cleaned = text.replace(/\D/g, '');
                if (cleaned.length <= 4) {
                  setTempCvv(cleaned);
                }
              }}
              keyboardType="numeric"
              maxLength={4}
              autoFocus={true}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]} 
                onPress={cancelCvv}
              >
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.confirmButton]} 
                onPress={confirmCvv}
              >
                <Text style={styles.confirmButtonText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    marginVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#555',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    backgroundColor: '#fafafa',
  },
  cardInputWrapper: {
    position: 'relative',
  },
  cardInput: {
    paddingRight: 50,
  },
  cardIcon: {
    position: 'absolute',
    right: 16,
    top: 12,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  halfWidth: {
    width: '48%',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  securityText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  validationStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  validationText: {
    fontSize: 14,
    marginLeft: 8,
    fontWeight: '500',
  },
  paymentButton: {
    backgroundColor: '#28a745',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 8,
    marginTop: 20,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  paymentButtonDisabled: {
    backgroundColor: '#ccc',
    shadowOpacity: 0,
    elevation: 0,
  },
  paymentButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 15,
  },
  loadingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 8,
  },
  // CVV Button Styles
  cvvButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 15,
  },
  cvvButtonText: {
    fontSize: 16,
    color: '#000',
  },
  cvvRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cvvHint: {
    fontSize: 12,
    color: '#007AFF',
    fontWeight: '500',
  },
  cvvValid: {
    borderColor: '#28a745',
  },
  cvvValidIcon: {
    fontSize: 16,
    color: '#28a745',
    marginRight: 5,
    fontWeight: 'bold',
  },
  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    maxWidth: 300,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 15,
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
    letterSpacing: 2,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  confirmButton: {
    backgroundColor: '#007AFF',
  },
  cancelButtonText: {
    textAlign: 'center',
    color: '#666',
    fontWeight: '500',
  },
  confirmButtonText: {
    textAlign: 'center',
    color: 'white',
    fontWeight: '500',
  },
});

export default StripeCardInput;

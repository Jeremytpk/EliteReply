import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SecureStripeCardInput from './SecureStripeCardInput';
import PayPalPayment from './PayPalPayment';

const PaymentMethodSelector = ({
  amount,
  currency = 'USD',
  description,
  orderInfo,
  onPaymentSuccess,
  onPaymentError,
  onPaymentCancel,
  style
}) => {
  const [selectedMethod, setSelectedMethod] = useState('card');
  const [cardData, setCardData] = useState(null);
  const [isCardValid, setIsCardValid] = useState(false);

  const paymentMethods = [
    {
      id: 'card',
      name: 'Carte bancaire',
      icon: 'card-outline',
      color: '#6366f1'
    },
    {
      id: 'paypal',
      name: 'PayPal',
      icon: 'logo-paypal',
      color: '#0070ba'
    },
    {
      id: 'cash',
      name: 'Paiement en espèces',
      icon: 'cash-outline',
      color: '#16a34a'
    }
  ];

  const handlePaymentMethodSelect = (methodId) => {
    setSelectedMethod(methodId);
  };

  const handleStripePaymentSuccess = async (paymentResult) => {
    if (onPaymentSuccess) {
      await onPaymentSuccess({
        ...paymentResult,
        paymentMethod: 'stripe'
      });
    }
  };

  const handlePayPalPaymentSuccess = async (paymentResult) => {
    if (onPaymentSuccess) {
      await onPaymentSuccess({
        ...paymentResult,
        paymentMethod: 'paypal'
      });
    }
  };

  const renderPaymentMethodSelector = () => (
    <View style={styles.methodSelectorContainer}>
      <Text style={styles.sectionTitle}>Choisir un mode de paiement</Text>
      <View style={styles.methodsContainer}>
        {paymentMethods.map((method) => (
          <TouchableOpacity
            key={method.id}
            style={[
              styles.methodButton,
              selectedMethod === method.id && styles.methodButtonSelected,
              { borderColor: method.color }
            ]}
            onPress={() => handlePaymentMethodSelect(method.id)}
          >
            <Ionicons 
              name={method.icon} 
              size={24} 
              color={selectedMethod === method.id ? method.color : '#666'} 
            />
            <Text style={[
              styles.methodButtonText,
              selectedMethod === method.id && { color: method.color }
            ]}>
              {method.name}
            </Text>
            {selectedMethod === method.id && (
              <Ionicons name="checkmark-circle" size={20} color={method.color} />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderPaymentInterface = () => {
    switch (selectedMethod) {
      case 'card':
        return (
          <View style={styles.paymentInterfaceContainer}>
            <Text style={styles.sectionTitle}>Informations de carte</Text>
            <SecureStripeCardInput
              amount={amount}
              orderInfo={orderInfo}
              userId="current_user_id" // You should pass the actual user ID
              onPaymentSuccess={handleStripePaymentSuccess}
              loading={false}
            />
          </View>
        );
      
      case 'paypal':
        return (
          <View style={styles.paymentInterfaceContainer}>
            <Text style={styles.sectionTitle}>Paiement PayPal</Text>
            <Text style={styles.paypalDescription}>
              Vous serez redirigé vers PayPal pour finaliser votre paiement de{' '}
              <Text style={styles.amountText}>
                {amount.toLocaleString('en-US', { style: 'currency', currency: currency })}
              </Text>
            </Text>
            <PayPalPayment
              amount={amount}
              currency={currency}
              description={description}
              onPaymentSuccess={handlePayPalPaymentSuccess}
              onPaymentError={onPaymentError}
              onPaymentCancel={onPaymentCancel}
            />
          </View>
        );

      case 'cash':
        return (
          <View style={styles.paymentInterfaceContainer}>
            <Text style={styles.sectionTitle}>Paiement en espèces</Text>
            <View style={styles.cashInfoContainer}>
              <Ionicons name="information-circle-outline" size={24} color="#16a34a" />
              <Text style={styles.cashDescription}>
                Vous avez choisi de payer en espèces. Le montant de{' '}
                <Text style={styles.amountText}>
                  {amount.toLocaleString('en-US', { style: 'currency', currency: currency })}
                </Text>
                {' '}sera à régler directement au moment de la livraison ou de la prestation.
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cashConfirmButton}
              onPress={async () => {
                const cashPaymentResult = {
                  success: true,
                  paymentMethod: 'cash',
                  amount: amount,
                  currency: currency,
                  status: 'pending',
                  processedAt: new Date().toISOString()
                };
                
                if (onPaymentSuccess) {
                  await onPaymentSuccess(cashPaymentResult);
                }
              }}
            >
              <Ionicons name="checkmark-circle" size={20} color="#fff" />
              <Text style={styles.cashConfirmButtonText}>
                Confirmer le paiement en espèces
              </Text>
            </TouchableOpacity>
          </View>
        );
      
      default:
        return null;
    }
  };

  return (
    <ScrollView style={[styles.container, style]} showsVerticalScrollIndicator={false}>
      {renderPaymentMethodSelector()}
      {renderPaymentInterface()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  methodSelectorContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  methodsContainer: {
    flexDirection: 'column',
    gap: 12,
  },
  methodButton: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 2,
    borderColor: '#e1e5e9',
    borderRadius: 12,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  methodButtonSelected: {
    backgroundColor: '#f8fafc',
    borderWidth: 2,
  },
  methodButtonText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
    marginLeft: 12,
  },
  paymentInterfaceContainer: {
    marginTop: 8,
  },
  paypalDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20,
    textAlign: 'center',
  },
  amountText: {
    fontWeight: '600',
    color: '#0070ba',
  },
  cashInfoContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0fdf4',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 16,
  },
  cashDescription: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
    marginLeft: 12,
    lineHeight: 20,
  },
  cashConfirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16a34a',
    paddingVertical: 15,
    paddingHorizontal: 20,
    borderRadius: 8,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cashConfirmButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});

export default PaymentMethodSelector;

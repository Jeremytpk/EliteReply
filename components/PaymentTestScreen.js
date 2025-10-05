import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { StripeProvider } from '@stripe/stripe-react-native';
import SecureStripeCardInput from './SecureStripeCardInput';
import { STRIPE_PUBLISHABLE_KEY } from '../config/stripe';

const PaymentTestScreen = () => {
  const handlePaymentSuccess = (result) => {
    console.log('🎉 Payment successful!', result);
    alert(`Payment successful! ID: ${result.paymentIntentId}`);
  };

  return (
    <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Test de Paiement</Text>
        <Text style={styles.subtitle}>
          Utilisez une carte de test Stripe pour tester le paiement
        </Text>
        
        <View style={styles.testCards}>
          <Text style={styles.testCardTitle}>Cartes de test:</Text>
          <Text style={styles.testCard}>4242 4242 4242 4242 - Visa (Success)</Text>
          <Text style={styles.testCard}>4000 0000 0000 0002 - Visa (Declined)</Text>
          <Text style={styles.testCard}>5555 5555 5555 4444 - Mastercard (Success)</Text>
          <Text style={styles.testCardNote}>
            Utilisez n'importe quelle date future (ex: 12/25) et n'importe quel CVC (ex: 123)
          </Text>
        </View>

        <SecureStripeCardInput
          amount={10.50}
          userId="test_user_123"
          orderInfo={{ test: true, orderId: 'test_001' }}
          onPaymentSuccess={handlePaymentSuccess}
          loading={false}
        />
      </ScrollView>
    </StripeProvider>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#333',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  testCards: {
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  testCardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  testCard: {
    fontSize: 14,
    fontFamily: 'monospace',
    marginBottom: 5,
    color: '#007bff',
  },
  testCardNote: {
    fontSize: 12,
    color: '#666',
    marginTop: 10,
    fontStyle: 'italic',
  },
});

export default PaymentTestScreen;

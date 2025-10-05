import React from 'react';
import { Platform } from 'react-native';

// Platform-specific Stripe imports
let StripeProvider;
let useStripe;
let useConfirmPayment;
let CardField;

if (Platform.OS === 'web') {
  // Web fallback - create mock components
  StripeProvider = ({ children, publishableKey }) => children;
  useStripe = () => ({
    createPaymentMethod: () => Promise.resolve({ error: { message: 'Stripe not available on web' } }),
    confirmPayment: () => Promise.resolve({ error: { message: 'Stripe not available on web' } }),
  });
  useConfirmPayment = () => ({
    confirmPayment: () => Promise.resolve({ error: { message: 'Stripe not available on web' } }),
  });
  CardField = ({ style, ...props }) => null; // Return null for web
} else {
  // Native imports
  try {
    const stripe = require('@stripe/stripe-react-native');
    StripeProvider = stripe.StripeProvider;
    useStripe = stripe.useStripe;
    useConfirmPayment = stripe.useConfirmPayment;
    CardField = stripe.CardField;
  } catch (error) {
    console.warn('Stripe React Native not available:', error);
    // Fallback to mock implementations
    StripeProvider = ({ children }) => children;
    useStripe = () => ({
      createPaymentMethod: () => Promise.resolve({ error: { message: 'Stripe not available' } }),
      confirmPayment: () => Promise.resolve({ error: { message: 'Stripe not available' } }),
    });
    useConfirmPayment = () => ({
      confirmPayment: () => Promise.resolve({ error: { message: 'Stripe not available' } }),
    });
    CardField = () => null;
  }
}

export {
  StripeProvider,
  useStripe,
  useConfirmPayment,
  CardField,
};

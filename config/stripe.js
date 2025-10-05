// Stripe Configuration
// Stripe keys configured

// For development - use test keys from environment variables
export const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || 'PLACEHOLDER_PUBLISHABLE_KEY_publishable_key_here';
export const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'PLACEHOLDER_SECRET_KEY';

// Firebase Functions endpoints
// Replace with your actual Firebase project ID
export const FIREBASE_PROJECT_ID = 'elitereply-bd74d';
export const FIREBASE_REGION = 'us-central1'; // Default region

// Configuration for different environments
export const getStripeConfig = () => {
  // Force production Firebase Functions since we deployed them (no local emulator)
  const isDevelopment = false; // Changed to false to use production functions
  return {
    publishableKey: STRIPE_PUBLISHABLE_KEY,  // Using live key from env
    secretKey: STRIPE_SECRET_KEY,  // Secret key (keep secure)
    
    backendUrl: isDevelopment
      ? `http://127.0.0.1:5001/${FIREBASE_PROJECT_ID}/${FIREBASE_REGION}`  // Firebase emulator
      : `https://${FIREBASE_REGION}-${FIREBASE_PROJECT_ID}.cloudfunctions.net`,  // Production Firebase Functions
      
    currency: 'usd',
    country: 'US'
  };
};

// Payment methods configuration
export const PAYMENT_METHODS = {
  card: {
    displayName: 'Carte bancaire',
    icon: 'card-outline',
    enabled: true
  },
  cash: {
    displayName: 'Paiement à la livraison',
    icon: 'cash-outline',
    enabled: true
  }
};

// Firebase Functions API endpoints
const getApiBaseUrl = () => {
  const config = getStripeConfig();
  return config.backendUrl;
};

// Create Payment Intent - Firebase Functions Version
export const createPaymentIntent = async (amount, currency = 'USD', description, userId, orderData, partnerId = null) => {
  console.log('🔄 Creating payment intent...', { amount, currency, description, userId });
  
  // Validate input parameters
  if (!amount || isNaN(amount) || amount <= 0) {
    throw new Error('Invalid amount. Amount must be a positive number.');
  }
  
  if (!userId || typeof userId !== 'string') {
    throw new Error('Valid User ID is required.');
  }
  
  if (amount < 0.50) {
    throw new Error('Amount must be at least $0.50');
  }
  
  try {
    const API_BASE_URL = getApiBaseUrl();
    const url = `${API_BASE_URL}/createPaymentIntent`;
    
    console.log('🔗 API URL:', url);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: Math.round(amount * 100), // Convert to cents
        currency: currency.toLowerCase(),
        description: description || 'EliteReply Payment',
        userId: userId,
        orderData: orderData,
        partnerId: partnerId
      }),
    });

    console.log('📡 Response status:', response.status);

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.details || errorMessage;
        console.error('📛 Server error response:', errorData);
      } catch (parseError) {
        console.error('📛 Failed to parse error response:', parseError);
      }
      throw new Error(errorMessage);
    }

    const data = await response.json();
    console.log('✅ Payment intent created:', data.paymentIntentId);
    
    if (!data.clientSecret) {
      throw new Error('Invalid response: missing client secret');
    }
    
    return {
      client_secret: data.clientSecret,
      id: data.paymentIntentId,
      amount: amount * 100,
      currency: currency.toLowerCase(),
      status: 'requires_payment_method'
    };
    
  } catch (error) {
    console.error('❌ Error creating payment intent:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    
    // Handle specific error types
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw new Error('Network error: Unable to connect to payment service. Please check your internet connection.');
    }
    
    if (error.message.includes('CORS')) {
      throw new Error('Configuration error: Cross-origin request blocked. Please contact support.');
    }
    
    throw new Error(`Failed to create payment intent: ${error.message}`);
  }
};

// Confirm Payment Intent - Firebase Functions Version
export const confirmPayment = async (paymentIntentId, userId) => {
  console.log('🔄 Confirming payment...', { paymentIntentId, userId });
  
  try {
    const API_BASE_URL = getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/confirmPayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentIntentId,
        userId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ Payment confirmed:', data);
    
    return data;
    
  } catch (error) {
    console.error('❌ Error confirming payment:', error);
    throw new Error(`Failed to confirm payment: ${error.message}`);
  }
};

// Process PayPal Payment - Firebase Functions Version
export const processPayPalPayment = async (paymentId, payerId, amount, currency, description, userId, orderData) => {
  console.log('🔄 Processing PayPal payment...', { paymentId, payerId, amount, currency, userId });
  
  try {
    const API_BASE_URL = getApiBaseUrl();
    const response = await fetch(`${API_BASE_URL}/processPayPalPayment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        paymentId,
        payerId,
        amount,
        currency: currency || 'USD',
        description: description || 'EliteReply PayPal Payment',
        userId,
        orderData
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    console.log('✅ PayPal payment processed:', data);
    
    return data;
    
  } catch (error) {
    console.error('❌ Error processing PayPal payment:', error);
    throw new Error(`Failed to process PayPal payment: ${error.message}`);
  }
};

export default {
  STRIPE_PUBLISHABLE_KEY,
  FIREBASE_PROJECT_ID,
  FIREBASE_REGION,
  getStripeConfig,
  PAYMENT_METHODS,
  createPaymentIntent,
  confirmPayment,
  processPayPalPayment
};

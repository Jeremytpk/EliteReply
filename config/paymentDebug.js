// Payment Debug Utilities
// This file helps debug payment processing issues

import { getStripeConfig } from './stripe';

export const debugPaymentConfiguration = () => {
  console.log('🔍 Payment Configuration Debug:');
  
  const config = getStripeConfig();
  
  console.log('📋 Configuration:');
  console.log('- Publishable Key:', config.publishableKey ? 'Set' : 'Missing');
  console.log('- Secret Key:', config.secretKey ? 'Set' : 'Missing');
  console.log('- Backend URL:', config.backendUrl);
  console.log('- Currency:', config.currency);
  console.log('- Country:', config.country);
  
  console.log('🌐 Environment:');
  console.log('- Development Mode:', __DEV__);
  console.log('- Platform:', Platform.OS);
  
  return config;
};

export const testNetworkConnectivity = async () => {
  console.log('🔗 Testing network connectivity...');
  
  const config = getStripeConfig();
  const testUrl = `${config.backendUrl}/health`;
  
  try {
    const response = await fetch(testUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    console.log('✅ Network test response:', response.status);
    
    if (response.ok) {
      const data = await response.json();
      console.log('📊 Health check data:', data);
      return { success: true, data };
    } else {
      console.log('⚠️ Server responded with error:', response.status);
      return { success: false, error: `HTTP ${response.status}` };
    }
  } catch (error) {
    console.error('❌ Network connectivity test failed:', error);
    return { success: false, error: error.message };
  }
};

export const validatePaymentData = (amount, currency, userId, orderData) => {
  console.log('🔍 Validating payment data...');
  
  const errors = [];
  
  if (!amount || isNaN(amount) || amount <= 0) {
    errors.push('Invalid amount');
  }
  
  if (amount < 0.50) {
    errors.push('Amount below minimum ($0.50)');
  }
  
  if (!userId || typeof userId !== 'string') {
    errors.push('Invalid user ID');
  }
  
  if (!currency || typeof currency !== 'string') {
    errors.push('Invalid currency');
  }
  
  const supportedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud'];
  if (currency && !supportedCurrencies.includes(currency.toLowerCase())) {
    errors.push(`Unsupported currency: ${currency}`);
  }
  
  if (errors.length > 0) {
    console.error('❌ Validation errors:', errors);
    return { valid: false, errors };
  }
  
  console.log('✅ Payment data validation passed');
  return { valid: true, errors: [] };
};

export const logPaymentAttempt = (paymentData, result) => {
  const timestamp = new Date().toISOString();
  
  console.log(`📝 Payment Attempt Log [${timestamp}]:`, {
    input: {
      amount: paymentData.amount,
      currency: paymentData.currency,
      userId: paymentData.userId,
      hasOrderData: !!paymentData.orderData
    },
    result: {
      success: result.success,
      error: result.error,
      paymentIntentId: result.paymentIntentId
    }
  });
  
  // You could also store this in AsyncStorage for persistence
  // AsyncStorage.setItem(`payment_log_${timestamp}`, JSON.stringify(logData));
};

export default {
  debugPaymentConfiguration,
  testNetworkConnectivity,
  validatePaymentData,
  logPaymentAttempt
};

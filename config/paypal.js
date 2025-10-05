// PayPal Configuration
export const PAYPAL_CONFIG = {
  // PayPal Client ID (Sandbox for development, Live for production)
  CLIENT_ID: __DEV__ 
    ? 'AZ8E5WvNYIIoqV_5SvQKhD_8YMwLLr_WO4g7EtdFtO7HfGwGtT2xX6mO8VYJqGfFE3j6C7d0HJR8F2g7' // Sandbox Client ID
    : 'YOUR_LIVE_PAYPAL_CLIENT_ID', // Replace with your live PayPal Client ID

  // PayPal Environment
  ENVIRONMENT: __DEV__ ? 'sandbox' : 'live',

  // PayPal SDK Configuration
  SDK_CONFIG: {
    acceptCreditCards: true,
    payPalShippingAddressOption: 1, // No shipping address
    rememberUser: true,
    
    // Localization
    locale: 'fr_FR', // French locale
    
    // Merchant configuration
    merchantName: 'EliteReply',
    merchantPrivacyPolicyURL: 'https://elitereply.com/privacy',
    merchantUserAgreementURL: 'https://elitereply.com/terms',
  },

  // Payment configuration
  PAYMENT_CONFIG: {
    intent: 'sale', // 'sale' for immediate payment, 'authorize' for authorization only
    userAction: 'commit', // 'commit' to complete payment, 'continue' to review payment
    bnCode: 'rp-rn-sdk', // PayPal attribution code
  }
};

// PayPal Sandbox Test Accounts (for development only)
export const PAYPAL_TEST_ACCOUNTS = {
  buyer: {
    email: 'buyer@example.com',
    password: 'testpassword123'
  },
  // Note: Use PayPal's test accounts from your developer dashboard
};

export default PAYPAL_CONFIG;

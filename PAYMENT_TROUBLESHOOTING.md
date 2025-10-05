# Payment Processing Error - Troubleshooting Guide

## Error: "Failed to create payment intent"

This error typically occurs when there's an issue with the Stripe payment configuration or API communication. Here are the steps to resolve it:

## 1. Check Environment Variables

### Firebase Functions Environment Variables
Make sure these environment variables are set in your Firebase Functions:

```bash
# Set Stripe secret key
firebase functions:config:set stripe.secret_key="PLACEHOLDER_TEST_KEY_secret_key_here"

# Set webhook secret (if using webhooks)
firebase functions:config:set stripe.webhook_secret="whsec_your_webhook_secret_here"

# Check current config
firebase functions:config:get
```

### Backend Server Environment Variables
Create a `.env` file in your `backend/` directory:

```bash
STRIPE_SECRET_KEY=PLACEHOLDER_TEST_KEY_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY_PATH=./path-to-service-account.json
PORT=3000
NODE_ENV=development
```

## 2. Validate Stripe Keys

### Test Your Stripe Keys
```javascript
// Test if your keys are valid
const stripe = require('stripe')('PLACEHOLDER_TEST_KEY_secret_key_here');
stripe.paymentIntents.create({
  amount: 2000,
  currency: 'usd',
}).then(paymentIntent => {
  console.log('✅ Stripe keys are valid');
}).catch(error => {
  console.error('❌ Stripe key error:', error.message);
});
```

### Check Key Format
- Publishable keys start with `PLACEHOLDER_PUBLISHABLE_KEY` or `PLACEHOLDER_PUBLISHABLE_KEY`
- Secret keys start with `PLACEHOLDER_TEST_KEY` or `PLACEHOLDER_LIVE_KEY`
- Make sure you're using matching test/live keys

## 3. Network and Connectivity Issues

### Test Firebase Functions Connectivity
```javascript
import { testNetworkConnectivity } from './config/paymentDebug';

const testConnection = async () => {
  const result = await testNetworkConnectivity();
  console.log('Connection test:', result);
};
```

### Check CORS Configuration
Ensure your Firebase Functions allow requests from your app's domain:

```javascript
// In functions/index.js
exports.createPaymentIntent = onRequest({
  cors: {
    origin: [
      'http://localhost:19000',
      'http://localhost:8081',
      /https:\/\/.*\.web\.app$/,
      /https:\/\/.*\.firebaseapp\.com$/
    ],
    methods: ['POST', 'OPTIONS']
  }
}, async (request, response) => {
  // Function implementation
});
```

## 4. Input Validation Issues

### Common Input Problems
- Amount must be in cents (e.g., $10.00 = 1000)
- Amount must be at least 50 cents
- Currency must be a supported 3-letter code (usd, eur, etc.)
- User ID must be a valid string

### Debug Payment Data
```javascript
import { validatePaymentData, debugPaymentConfiguration } from './config/paymentDebug';

const debugPayment = (amount, currency, userId, orderData) => {
  // Check configuration
  debugPaymentConfiguration();
  
  // Validate payment data
  const validation = validatePaymentData(amount, currency, userId, orderData);
  console.log('Validation result:', validation);
};
```

## 5. Firebase Functions Deployment

### Redeploy Functions
```bash
# Navigate to your project root
cd /path/to/your/project

# Deploy functions
firebase deploy --only functions

# Check deployment status
firebase functions:log
```

### Check Function Logs
```bash
# View recent logs
firebase functions:log

# Stream logs in real-time
firebase functions:log --follow
```

## 6. Common Solutions

### Solution 1: Environment Variables Not Set
```bash
# Set Stripe configuration in Firebase
firebase functions:config:set stripe.secret_key="PLACEHOLDER_TEST_KEY..."
firebase functions:config:set stripe.webhook_secret="whsec_..."

# Redeploy
firebase deploy --only functions
```

### Solution 2: Key Mismatch
- Ensure client-side publishable key matches server-side secret key
- Both should be either test keys or live keys, not mixed

### Solution 3: Network Issues
- Check if Firebase Functions are properly deployed
- Verify CORS settings allow your app's domain
- Test with a REST client like Postman

### Solution 4: Amount Formatting
```javascript
// Correct: Convert dollars to cents
const amount = 10.50; // $10.50
const amountInCents = Math.round(amount * 100); // 1050

// Incorrect: Using dollar amount directly
const amount = 10.50; // This will be treated as $0.1050
```

## 7. Testing Your Fix

### Use the Debug Utilities
```javascript
import PaymentDebug from './config/paymentDebug';

const testPayment = async () => {
  // Debug configuration
  PaymentDebug.debugPaymentConfiguration();
  
  // Test network
  const networkTest = await PaymentDebug.testNetworkConnectivity();
  
  // Validate payment data
  const validation = PaymentDebug.validatePaymentData(10.50, 'usd', 'user123', {});
  
  console.log('Network test:', networkTest);
  console.log('Validation:', validation);
};
```

### Test Payment Creation
```javascript
import { createPaymentIntent } from './config/stripe';

const testCreatePayment = async () => {
  try {
    const result = await createPaymentIntent(
      10.50,    // $10.50
      'USD',    // Currency
      'Test payment', // Description
      'user123', // User ID
      { item: 'test' } // Order data
    );
    
    console.log('✅ Payment intent created:', result);
  } catch (error) {
    console.error('❌ Payment creation failed:', error.message);
  }
};
```

## 8. Still Having Issues?

If you're still experiencing problems:

1. Check the console logs for more specific error messages
2. Test with curl or Postman to isolate the issue
3. Verify your Stripe dashboard for any account issues
4. Check Firebase Functions logs for server-side errors
5. Ensure your Firebase project has the necessary permissions

## Quick Fix Commands

```bash
# 1. Check Firebase configuration
firebase functions:config:get

# 2. Set Stripe key (replace with your actual key)
firebase functions:config:set stripe.secret_key="PLACEHOLDER_TEST_KEY_key_here"

# 3. Redeploy functions
firebase deploy --only functions

# 4. Check logs
firebase functions:log --limit 50
```

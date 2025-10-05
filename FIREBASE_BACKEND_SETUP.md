# Firebase Backend Setup for EliteReply

This document explains how to use Firebase Functions as your backend server instead of the Express server.

## 🚀 Quick Start

### 1. Start Firebase Functions Locally

```bash
# Option 1: Use the setup script
./setup-firebase-backend.sh

# Option 2: Manual start
firebase emulators:start --only functions
```

### 2. Available Endpoints

When running locally, your Firebase Functions will be available at:

- **Create Payment Intent**: `http://127.0.0.1:5001/elitereply-bd74d/us-central1/createPaymentIntent`
- **Confirm Payment**: `http://127.0.0.1:5001/elitereply-bd74d/us-central1/confirmPayment`
- **Stripe Webhook**: `http://127.0.0.1:5001/elitereply-bd74d/us-central1/stripeWebhook`
- **PayPal Payment**: `http://127.0.0.1:5001/elitereply-bd74d/us-central1/processPayPalPayment`

## 📱 Frontend Configuration

Your app is now configured to automatically use Firebase Functions:

- **Development**: Uses Firebase Emulator (`http://127.0.0.1:5001/...`)
- **Production**: Uses Firebase Functions (`https://us-central1-elitereply-bd74d.cloudfunctions.net/...`)

## 🔧 Environment Setup

### Development Environment Variables (`functions/.env`)

```env
# Stripe Keys - Development (use test keys)
STRIPE_SECRET_KEY=PLACEHOLDER_TEST_KEY_TEST_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstuvwxyz
NODE_ENV=development
```

### Production Environment Variables

For production, set environment variables using Firebase CLI:

```bash
# Set Stripe secret key
firebase functions:config:set stripe.secret_key="PLACEHOLDER_LIVE_KEY_LIVE_SECRET_KEY"

# Set webhook secret
firebase functions:config:set stripe.webhook_secret="whsec_YOUR_WEBHOOK_SECRET"

# Set environment
firebase functions:config:set app.env="production"
```

## 🛠 Development Workflow

### 1. Local Development

```bash
# Start Firebase Functions emulator
firebase emulators:start --only functions

# In another terminal, start your React Native app
npm start
# or
npx expo start
```

### 2. Testing Payments

Use these test card numbers with Firebase Functions:

- **Success**: `4242424242424242`
- **Requires Authentication**: `4000002500003155`
- **Declined**: `4000000000009995`

### 3. Deploy to Production

```bash
# Deploy all functions
firebase deploy --only functions

# Deploy specific function
firebase deploy --only functions:createPaymentIntent
```

## 📊 Available Functions

### 1. `createPaymentIntent`

Creates a Stripe Payment Intent for processing payments.

**Request:**
```json
{
  "amount": 1000,
  "currency": "usd",
  "userId": "user123",
  "description": "Product purchase",
  "orderData": {
    "productId": "prod_123",
    "quantity": 1
  }
}
```

**Response:**
```json
{
  "clientSecret": "pi_xxx_secret_xxx",
  "paymentIntentId": "pi_xxx"
}
```

### 2. `confirmPayment`

Confirms a payment after client-side processing.

**Request:**
```json
{
  "paymentIntentId": "pi_xxx",
  "userId": "user123"
}
```

### 3. `stripeWebhook`

Handles Stripe webhooks for payment status updates.

### 4. `processPayPalPayment`

Processes PayPal payments and stores them in Firestore.

## 🔒 Security Features

- ✅ CORS configured for development and production
- ✅ Request validation and sanitization  
- ✅ User authentication checks
- ✅ Firestore integration for payment logging
- ✅ Error handling and logging
- ✅ Environment variable protection

## 🎯 Benefits of Firebase Functions

### vs Express Server:

- **Scalability**: Auto-scaling with no server management
- **Cost**: Pay only for execution time
- **Integration**: Native Firebase/Firestore integration
- **Security**: Built-in security features
- **Deployment**: Simple deployment with Firebase CLI
- **Monitoring**: Built-in logging and monitoring

## 🚨 Migration Notes

Your app has been updated to use Firebase Functions instead of the Express server:

1. **Frontend Config**: Updated `config/stripe.js` to use Firebase Functions URLs
2. **Payment Service**: `services/stripeService.js` now calls Firebase Functions
3. **Environment**: Separate environment configs for dev/prod
4. **Backward Compatibility**: Old Express server still available in `backend/` folder

## 📝 Troubleshooting

### Function Not Found Error
- Ensure Firebase emulator is running
- Check function names match exactly
- Verify Firebase project ID in config

### CORS Errors
- Ensure your domain is in the CORS allowlist
- For development, localhost ports are already configured

### Payment Failures
- Check Stripe test keys are configured correctly
- Verify webhook secrets match
- Check Firebase Functions logs for errors

### Logs and Debugging

```bash
# View function logs locally
firebase emulators:start --only functions --inspect-functions

# View production logs
firebase functions:log

# View specific function logs
firebase functions:log --only createPaymentIntent
```

## 🔄 Next Steps

1. **Test locally** with Firebase emulator
2. **Update webhook URLs** in Stripe Dashboard to point to Firebase Functions
3. **Deploy to production** when ready
4. **Monitor** function performance and costs
5. **Set up alerts** for payment failures

---

For more information, see:
- [Firebase Functions Documentation](https://firebase.google.com/docs/functions)
- [Stripe Documentation](https://stripe.com/docs)

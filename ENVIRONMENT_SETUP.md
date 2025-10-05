# EliteReply - Environment Setup Guide

## 🔧 Required Environment Variables

Create a `.env.local` file in your project root with the following variables:

```bash
# Stripe Configuration (Get from your Stripe Dashboard)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=PLACEHOLDER_PUBLISHABLE_KEY_PUBLISHABLE_KEY
STRIPE_SECRET_KEY=PLACEHOLDER_TEST_KEY_SECRET_KEY
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET

# OpenAI Configuration
OPENAI_API_KEY=PLACEHOLDER_OPENAI_KEY

# Firebase Configuration
FIREBASE_PROJECT_ID=your-project-id

# Development Server
PORT=3000
NODE_ENV=development
```

## 🔐 Firebase Functions Configuration

Set environment variables for Firebase Functions:

```bash
# Navigate to your project directory
cd your-project-path

# Set Stripe configuration
firebase functions:config:set stripe.secret_key="YOUR_STRIPE_SECRET_KEY"
firebase functions:config:set stripe.webhook_secret="YOUR_WEBHOOK_SECRET"

# Set OpenAI configuration
firebase functions:config:set openai.apikey="YOUR_OPENAI_API_KEY"

# Deploy functions with new configuration
firebase deploy --only functions
```

## 📱 Mobile App Configuration

1. Install required dependencies:
```bash
npm install @stripe/stripe-react-native
```

2. Configure Stripe in your app root:
```javascript
// App.js
import { StripeProvider } from '@stripe/stripe-react-native';

export default function App() {
  return (
    <StripeProvider publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY}>
      {/* Your app components */}
    </StripeProvider>
  );
}
```

## 🔒 Security Notes

- Never commit actual API keys to version control
- Use different keys for development and production
- Enable Stripe webhook endpoints in your Stripe dashboard
- Test payments using Stripe's test card numbers

## 📋 Test Cards for Development

```
Visa Success: 4242 4242 4242 4242
Visa Declined: 4000 0000 0000 0002
Visa Insufficient Funds: 4000 0000 0000 9995
Mastercard Success: 5555 5555 5555 4444
```

Any expiry date in the future and any 3-digit CVC will work for test cards.

## 🚀 Getting Started

1. Copy this file's environment variables to `.env.local`
2. Replace placeholder values with your actual API keys
3. Run `firebase functions:config:set` commands with your keys
4. Deploy Firebase Functions: `firebase deploy --only functions`
5. Start your development server: `npm start`

For more detailed setup instructions, check the project's main README.md file.

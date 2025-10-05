#!/bin/bash

# Setup Firebase Backend for EliteReply
# This script helps setup Firebase Functions as the backend

echo "🔥 Setting up Firebase Backend for EliteReply..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Installing..."
    npm install -g firebase-tools
fi

# Navigate to project directory
cd "$(dirname "$0")"

echo "📦 Installing Firebase Functions dependencies..."
cd functions
npm install

echo "🔧 Setting up environment variables..."
if [ ! -f .env ]; then
    echo "Creating .env file..."
    cat > .env << EOF
# Stripe Keys - Development (use test keys)
STRIPE_SECRET_KEY=PLACEHOLDER_TEST_KEY_test_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_1234567890abcdefghijklmnopqrstuvwxyz

# Environment
NODE_ENV=development
EOF
fi

cd ..

echo "🚀 Starting Firebase Emulator..."
echo "Your Firebase Functions will be available at:"
echo "- createPaymentIntent: http://127.0.0.1:5001/elitereply-bd74d/us-central1/createPaymentIntent"
echo "- confirmPayment: http://127.0.0.1:5001/elitereply-bd74d/us-central1/confirmPayment"  
echo "- stripeWebhook: http://127.0.0.1:5001/elitereply-bd74d/us-central1/stripeWebhook"
echo "- processPayPalPayment: http://127.0.0.1:5001/elitereply-bd74d/us-central1/processPayPalPayment"
echo ""
echo "✨ To start the emulator manually, run: firebase emulators:start --only functions"
echo "🌐 To deploy to production, run: firebase deploy --only functions"
echo ""
echo "🎯 Your app is now configured to use Firebase Functions instead of Express server!"

# Start the emulator
firebase emulators:start --only functions

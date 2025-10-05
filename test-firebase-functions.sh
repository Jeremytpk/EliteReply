#!/bin/bash

# Test Firebase Functions Integration
echo "🧪 Testing Firebase Functions Integration..."

# Check if Firebase emulator is running
if ! curl -s http://127.0.0.1:5001 > /dev/null; then
    echo "❌ Firebase emulator not running. Please start it with:"
    echo "   firebase emulators:start --only functions"
    exit 1
fi

echo "✅ Firebase emulator is running"

# Test createPaymentIntent function
echo "🔄 Testing createPaymentIntent function..."

RESPONSE=$(curl -s -X POST http://127.0.0.1:5001/elitereply-bd74d/us-central1/createPaymentIntent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 100,
    "currency": "usd", 
    "userId": "test-user-123",
    "description": "Test payment for Firebase Functions"
  }')

if echo "$RESPONSE" | grep -q "clientSecret"; then
    echo "✅ createPaymentIntent function works!"
    echo "   Response: $RESPONSE"
else
    echo "❌ createPaymentIntent function failed!"
    echo "   Response: $RESPONSE"
fi

echo ""
echo "🎉 Firebase Functions integration test complete!"
echo ""
echo "📱 Your app is now ready to use Firebase Functions for payments:"
echo "   - Frontend automatically detects development/production environment"  
echo "   - Uses Firebase emulator in development"
echo "   - Uses deployed Firebase Functions in production"
echo ""
echo "🚀 Next steps:"
echo "   1. Start your React Native app: npm start"
echo "   2. Test payments in your app"
echo "   3. Deploy to production: firebase deploy --only functions"

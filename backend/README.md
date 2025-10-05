# EliteReply Backend Setup Guide

## 🚀 Production Backend Setup

### Prerequisites
- Node.js 16+ installed
- Your Stripe Live Secret Key
- Firebase Admin SDK credentials
- A server/hosting platform (Railway, Heroku, DigitalOcean, etc.)

### 1. Local Development Setup

```bash
# Navigate to backend directory
cd backend

# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your actual values
nano .env
```

### 2. Environment Variables (.env)

```env
NODE_ENV=production
PORT=3000

# Stripe Keys (LIVE) - CRITICAL: Get these from your Stripe Dashboard
STRIPE_SECRET_KEY=PLACEHOLDER_LIVE_KEY_ACTUAL_LIVE_SECRET_KEY_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Firebase Admin SDK
FIREBASE_PROJECT_ID=elitereply-bd74d
FIREBASE_PRIVATE_KEY_PATH=./elitereply-bd74d-firebase-adminsdk-fbsvc-2225bcc7f7.json

# CORS origins (your app domains)
ALLOWED_ORIGINS=http://localhost:19000,https://your-app-domain.com

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 3. Copy Firebase Admin Key
```bash
# Copy your Firebase Admin SDK key to backend folder
cp ../elitereply-bd74d-firebase-adminsdk-fbsvc-2225bcc7f7.json ./
```

### 4. Test Locally
```bash
# Start development server
npm run dev

# Test health endpoint
curl http://localhost:3000/health
```

## 🌐 Deployment Options

### Option A: Railway (Recommended - Easy)

1. Sign up at [Railway.app](https://railway.app)
2. Connect your GitHub repository
3. Deploy the `backend` folder
4. Add environment variables in Railway dashboard
5. Get your deployment URL

### Option B: Heroku

1. Install Heroku CLI
2. Create Heroku app:
```bash
heroku create elitereply-backend
```
3. Set environment variables:
```bash
heroku config:set STRIPE_SECRET_KEY=PLACEHOLDER_LIVE_KEY_key
heroku config:set FIREBASE_PROJECT_ID=elitereply-bd74d
# ... add all other variables
```
4. Deploy:
```bash
git subtree push --prefix backend heroku main
```

### Option C: DigitalOcean App Platform

1. Connect GitHub repository
2. Select `backend` folder as source
3. Configure environment variables
4. Deploy

## 🔧 Update Your React Native App

### Update config/stripe.js

Replace `https://your-backend-domain.com` with your actual backend URL:

```javascript
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3000/api' 
  : 'https://elitereply-backend.railway.app/api'; // Your actual backend URL
```

## 🪝 Stripe Webhooks Setup

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Endpoint URL: `https://your-backend-domain.com/api/webhooks/stripe`
4. Events to send:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
5. Copy the webhook secret to your `.env` file

## 🔒 Security Checklist

- ✅ Never expose secret keys in client-side code
- ✅ Use HTTPS in production
- ✅ Configure CORS properly
- ✅ Set up rate limiting
- ✅ Enable webhook signature verification
- ✅ Validate all inputs
- ✅ Use Firebase Admin SDK for secure database access

## 🧪 Testing Your Setup

### Test Payment Intent Creation
```bash
curl -X POST https://your-backend-domain.com/api/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{
    "amount": 1000,
    "currency": "usd",
    "description": "Test payment",
    "userId": "test-user-id"
  }'
```

### Test Health Check
```bash
curl https://your-backend-domain.com/health
```

## 📱 Final Steps

1. Deploy your backend
2. Update `API_BASE_URL` in your React Native app
3. Test with small amounts first
4. Monitor logs and webhook events
5. Set up proper error handling

## 🆘 Troubleshooting

### Common Issues:
- **CORS errors**: Check `ALLOWED_ORIGINS` includes your app domain
- **Webhook failures**: Verify webhook secret and endpoint URL
- **Firebase errors**: Ensure admin SDK file path is correct
- **Stripe errors**: Verify you're using live keys correctly

### Logs:
```bash
# Check server logs
tail -f logs/server.log

# Check Stripe webhook logs in dashboard
# Check Firebase console for database updates
```

## 💰 Cost Considerations

- **Stripe fees**: 2.9% + 30¢ per successful charge
- **Server hosting**: $5-20/month depending on provider
- **Firebase**: Pay-as-you-go (likely minimal cost)

Your backend is now production-ready for real Stripe payments! 🎉

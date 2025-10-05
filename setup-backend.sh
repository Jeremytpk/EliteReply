#!/bin/bash

echo "🚀 EliteReply Backend Setup Script"
echo "=================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

echo "✅ Node.js version: $(node --version)"

# Navigate to backend directory
cd backend

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Copy environment template
if [ ! -f .env ]; then
    echo "📝 Creating .env file..."
    cp .env.example .env
    echo "⚠️  IMPORTANT: Edit .env file with your actual Stripe keys!"
else
    echo "✅ .env file already exists"
fi

# Copy Firebase Admin SDK file
if [ -f ../elitereply-bd74d-firebase-adminsdk-fbsvc-2225bcc7f7.json ]; then
    echo "📋 Copying Firebase Admin SDK file..."
    cp ../elitereply-bd74d-firebase-adminsdk-fbsvc-2225bcc7f7.json ./
    echo "✅ Firebase Admin SDK file copied"
else
    echo "⚠️  Firebase Admin SDK file not found. Make sure it's in the project root."
fi

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit backend/.env with your actual Stripe live secret key"
echo "2. Update ALLOWED_ORIGINS in .env with your app domain"
echo "3. Get your Stripe webhook secret from Stripe Dashboard"
echo "4. Run 'npm run dev' to start development server"
echo "5. Deploy to production (Railway, Heroku, etc.)"
echo ""
echo "📖 See backend/README.md for detailed instructions"

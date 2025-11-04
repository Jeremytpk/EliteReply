#!/bin/bash

# EliteReply CI/CD Quick Start Script
# This script helps you set up and test the CI/CD APK build process

set -e

echo "🚀 EliteReply CI/CD Setup & Test"
echo "================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "app.json" ] || [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: Please run this script from the EliteReply project root directory${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Checking project setup...${NC}"

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo -e "${GREEN}✅ Node.js: $NODE_VERSION${NC}"
else
    echo -e "${RED}❌ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo -e "${GREEN}✅ npm: $NPM_VERSION${NC}"
else
    echo -e "${RED}❌ npm not found${NC}"
    exit 1
fi

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  Dependencies not installed. Installing...${NC}"
    npm install
fi

# Check for required files
echo ""
echo -e "${BLUE}📁 Checking required files...${NC}"

if [ -f "google-services.json" ]; then
    echo -e "${GREEN}✅ google-services.json found${NC}"
else
    echo -e "${YELLOW}⚠️  google-services.json not found (you'll need to add it as GitHub secret)${NC}"
fi

if [ -f "credentials.json" ]; then
    echo -e "${GREEN}✅ credentials.json found${NC}"
else
    echo -e "${YELLOW}⚠️  credentials.json not found (you'll need to add it as GitHub secret)${NC}"
fi

if [ -f "eas.json" ]; then
    echo -e "${GREEN}✅ eas.json found${NC}"
    echo "   Available build profiles:"
    if command -v jq &> /dev/null; then
        cat eas.json | jq -r '.build | keys | .[]' | sed 's/^/   - /'
    else
        echo "   (install jq to see profiles)"
    fi
else
    echo -e "${RED}❌ eas.json not found${NC}"
fi

# Check EAS CLI
echo ""
echo -e "${BLUE}🔧 Checking EAS CLI...${NC}"

if command -v eas &> /dev/null; then
    EAS_VERSION=$(eas --version)
    echo -e "${GREEN}✅ EAS CLI: $EAS_VERSION${NC}"
else
    echo -e "${YELLOW}⚠️  EAS CLI not found. Installing...${NC}"
    npm install -g @expo/eas-cli
fi

# Test EAS authentication
echo ""
echo -e "${BLUE}🔐 Testing EAS authentication...${NC}"

if eas whoami &> /dev/null; then
    EAS_USER=$(eas whoami)
    echo -e "${GREEN}✅ Authenticated as: $EAS_USER${NC}"
else
    echo -e "${YELLOW}⚠️  Not authenticated with EAS. Run 'eas login' to authenticate${NC}"
fi

# Check workflows
echo ""
echo -e "${BLUE}📄 Checking GitHub workflows...${NC}"

if [ -d ".github/workflows" ]; then
    echo -e "${GREEN}✅ Workflows directory found${NC}"
    echo "   Available workflows:"
    ls .github/workflows/*.yml | sed 's/^/   - /' | sed 's/.github\/workflows\///' | sed 's/.yml$//'
else
    echo -e "${RED}❌ No workflows directory found${NC}"
fi

# Offer to test local build
echo ""
echo -e "${BLUE}🔨 Test Options${NC}"
echo "==============="
echo ""
echo "1. Test local preview build: npm run build:android:preview:local"
echo "2. Test cloud preview build: npm run build:android:preview"
echo "3. View available scripts: npm run"
echo ""

read -p "Would you like to test a local build now? (y/n): " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo -e "${BLUE}🚀 Starting local preview build...${NC}"
    echo "This will take several minutes..."
    echo ""
    
    # Run local build
    npm run build:android:preview:local
    
    echo ""
    echo -e "${GREEN}🎉 Build completed!${NC}"
    echo "Check the output above for the APK location."
else
    echo ""
    echo -e "${BLUE}ℹ️  Skipping local build test${NC}"
fi

echo ""
echo -e "${GREEN}🎯 Setup Complete!${NC}"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Set up GitHub secrets (see CI_CD_APK_SETUP.md)"
echo "2. Go to GitHub Actions and run 'Test CI Setup' workflow"
echo "3. Run 'Build Preview APK' workflows to build APKs"
echo ""
echo "For detailed instructions, see: CI_CD_APK_SETUP.md"
echo ""
echo -e "${GREEN}✨ Happy building! ✨${NC}"
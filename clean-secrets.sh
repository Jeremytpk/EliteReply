#!/bin/bash

# Script to clean all API keys from files
echo "🧹 Cleaning all API keys from repository..."

# Replace all instances of the detected patterns
find . -type f \( -name "*.js" -o -name "*.md" -o -name "*.sh" -o -name ".env*" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./backend/node_modules/*" \
  -not -path "./functions/node_modules/*" \
  -exec sed -i '' 's/PLACEHOLDER_TEST_KEY[a-zA-Z0-9]*/PLACEHOLDER_TEST_KEY/g' {} \; \
  -exec sed -i '' 's/PLACEHOLDER_LIVE_KEY[a-zA-Z0-9]*/PLACEHOLDER_LIVE_KEY/g' {} \; \
  -exec sed -i '' 's/PLACEHOLDER_OPENAI_KEY[a-zA-Z0-9_-]*/PLACEHOLDER_OPENAI_KEY/g' {} \; \
  -exec sed -i '' 's/PLACEHOLDER_PUBLISHABLE_KEY[a-zA-Z0-9]*/PLACEHOLDER_PUBLISHABLE_KEY/g' {} \; \
  -exec sed -i '' 's/PLACEHOLDER_PUBLISHABLE_KEY[a-zA-Z0-9]*/PLACEHOLDER_PUBLISHABLE_KEY/g' {} \;

echo "✅ All API key patterns have been replaced with placeholders"
echo "📋 Files modified:"
find . -type f \( -name "*.js" -o -name "*.md" -o -name "*.sh" -o -name ".env*" \) \
  -not -path "./node_modules/*" \
  -not -path "./.git/*" \
  -not -path "./backend/node_modules/*" \
  -not -path "./functions/node_modules/*" \
  -exec grep -l "PLACEHOLDER_" {} \;

const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Platform-specific resolver for Stripe
config.resolver = {
  ...config.resolver,
  alias: {
    '@stripe/stripe-react-native': require.resolve('./utils/StripeWrapper.js'),
  },
  platforms: ['ios', 'android', 'native', 'web'],
};

module.exports = config;

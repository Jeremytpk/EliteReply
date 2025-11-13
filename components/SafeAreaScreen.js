import React from 'react';
import { Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Simple wrapper that provides safe area padding
// The header will handle top padding, so we only need edges for bottom/left/right
const SafeAreaScreen = ({ children, style }) => {
  return (
    <SafeAreaView 
      style={[{ flex: 1 }, style]}
      edges={['bottom', 'left', 'right']}
    >
      {children}
    </SafeAreaView>
  );
};

export default SafeAreaScreen;

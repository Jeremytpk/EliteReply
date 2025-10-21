import React from 'react';
import { View, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

// Simple wrapper that provides safe area padding on iOS and status bar padding on Android
const SafeAreaScreen = ({ children, style }) => {
  const androidPaddingTop = Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 0;
  return (
    <SafeAreaView style={[{ flex: 1, paddingTop: androidPaddingTop }, style]}>
      {children}
    </SafeAreaView>
  );
};

export default SafeAreaScreen;

import React from 'react';
import SafeAreaScreen from './SafeAreaScreen';

// Higher-order component that wraps a component with SafeAreaScreen
export default function withSafeArea(WrappedComponent) {
  function WithSafeArea(props) {
    return (
      <SafeAreaScreen>
        <WrappedComponent {...props} />
      </SafeAreaScreen>
    );
  }

  // Preserve display name for better devtools
  const wrappedName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  WithSafeArea.displayName = `withSafeArea(${wrappedName})`;

  return WithSafeArea;
}

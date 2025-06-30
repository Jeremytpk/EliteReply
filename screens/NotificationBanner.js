import React, { useState, useEffect, useRef } from 'react';
import {
  Animated,
  View,
  Text,
  StyleSheet,
  PanResponder,
  Dimensions,
  Image,
  TouchableOpacity,
} from 'react-native';
import PropTypes from 'prop-types';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');
const TOP_OFFSET = -120; // Start position (off-screen top)
const VISIBLE_POSITION = 0; // End position (at the top of the screen)
const HIDE_THRESHOLD = 50; // Pixels to swipe up to dismiss

const NotificationBanner = ({
  isVisible,
  title,
  message,
  onClose, // Prop to signal parent to hide the notification
  onPress, // NEW: Prop to handle what happens when the banner is pressed
  appLogoSource,
  type, // 'message' or 'survey' for icon and text formatting
  // senderName, // REMOVED: Sender's name is no longer used
}) => {
  const animatedValue = useRef(new Animated.Value(TOP_OFFSET)).current;
  const pan = useRef(new Animated.ValueXY()).current; // For PanResponder

  // Helper to truncate message to ~10 words
  const getTruncatedMessage = (text, wordLimit = 10) => {
    if (!text) return '';
    const words = text.split(' ');
    if (words.length > wordLimit) {
      return words.slice(0, wordLimit).join(' ') + '...';
    }
    return text;
  };

  useEffect(() => {
    if (isVisible) {
      // Reset pan position when showing
      pan.setValue({ x: 0, y: 0 });
      Animated.timing(animatedValue, {
        toValue: VISIBLE_POSITION,
        duration: 300,
        useNativeDriver: false, // Position animations require false
      }).start();
    } else {
      Animated.timing(animatedValue, {
        toValue: TOP_OFFSET,
        duration: 300,
        useNativeDriver: false,
      }).start(() => {
        // Callback after animation completes (when hiding)
        pan.setValue({ x: 0, y: 0 }); // Reset for next show
      });
    }
  }, [isVisible, animatedValue, pan]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderMove: (evt, gestureState) => {
        // Only allow upward vertical movement (negative deltaY)
        if (gestureState.dy < 0) {
          pan.setValue({ x: 0, y: gestureState.dy });
        }
      },
      onPanResponderRelease: (evt, gestureState) => {
        if (gestureState.dy < -HIDE_THRESHOLD) {
          // Swiped up enough to dismiss
          Animated.timing(animatedValue, {
            toValue: TOP_OFFSET,
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            onClose(); // Notify parent to hide
            pan.setValue({ x: 0, y: 0 }); // Reset pan state
          });
        } else {
          // Not swiped enough, snap back
          Animated.spring(pan, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: false,
          }).start();
        }
      },
    })
  ).current;

  // Render only if visible to optimize
  if (!isVisible && animatedValue.__getValue() === TOP_OFFSET) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.bannerContainer,
        { top: animatedValue },
        { transform: [{ translateY: pan.y }] }, // Apply swipe translation
      ]}
      {...panResponder.panHandlers}
    >
      <TouchableOpacity
        activeOpacity={0.9} // Provides feedback on press
        style={styles.bannerContent}
        onPress={() => {
          onClose(); // Hide the banner on tap
          if (onPress) {
            onPress(); // Execute the action provided by the parent
          }
        }}
      >
        {appLogoSource && (
          <Image source={appLogoSource} style={styles.appLogo} resizeMode="contain" />
        )}
        <View style={styles.textContainer}>
          <Text style={styles.titleText}>
            <Ionicons
              name={type === 'message' ? 'chatbubble-ellipses' : 'gift'}
              size={18}
              color="#FFF"
              style={styles.iconStyle}
            />
            {type === 'message' ? ` Nouveau Message!` : " Nouveau Sondage!"}
          </Text>
          <Text style={styles.messageText} numberOfLines={1}>
            {getTruncatedMessage(message)}
          </Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  bannerContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#0a8fdf', // A strong blue for visibility
    paddingTop: Dimensions.get('window').height > 800 ? 50 : 35, // Adjust for notch devices
    paddingHorizontal: 15,
    paddingBottom: 15,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    zIndex: 1000, // Ensure it's on top of other content
  },
  bannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appLogo: {
    width: 40,
    height: 40,
    borderRadius: 20, // Optional: for circular logos
    marginRight: 10,
  },
  textContainer: {
    flex: 1,
  },
  titleText: {
    fontSize: 17,
    fontWeight: 'bold',
    color: 'white',
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  iconStyle: {
    marginRight: 5,
  },
  messageText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
  },
});

NotificationBanner.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  title: PropTypes.string.isRequired,
  message: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onPress: PropTypes.func, // onPress is optional
  appLogoSource: PropTypes.number,
  type: PropTypes.oneOf(['message', 'survey']).isRequired,
  // senderName: PropTypes.string, // REMOVED: senderName is no longer expected
};

export default NotificationBanner;
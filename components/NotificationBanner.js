import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Platform,
  Dimensions,
  SafeAreaView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';

const { width } = Dimensions.get('window');

const NotificationBanner = ({ notification, onPress, onDismiss, duration = 5000 }) => {
  const [visible, setVisible] = useState(false);
  const slideAnim = useRef(new Animated.Value(-200)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef(null);

  useEffect(() => {
    if (notification) {
      setVisible(true);
      showBanner();
      playNotificationSound();
      
      // Auto dismiss after duration
      const timer = setTimeout(() => {
        hideBanner();
      }, duration);
      
      return () => {
        clearTimeout(timer);
        if (soundRef.current) {
          soundRef.current.unloadAsync();
        }
      };
    }
  }, [notification]);

  const playNotificationSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../assets/sounds/er_notification.mp3'),
        { shouldPlay: true, volume: 0.8 }
      );
      soundRef.current = sound;
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  };

  const showBanner = () => {
    Animated.parallel([
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 100,
        friction: 8,
      }),
      Animated.timing(opacityAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const hideBanner = () => {
    Animated.parallel([
      Animated.timing(slideAnim, {
        toValue: -200,
        duration: 250,
        useNativeDriver: true,
      }),
      Animated.timing(opacityAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      if (onDismiss) onDismiss();
    });
  };

  const handlePress = () => {
    hideBanner();
    if (onPress) onPress(notification);
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'ticket':
        return 'help-circle';
      case 'message':
        return 'chatbubble';
      case 'appointment':
        return 'calendar';
      case 'payment':
        return 'card';
      case 'system':
        return 'settings';
      case 'partner':
        return 'business';
      case 'ITSupport':
        return 'construct';
      case 'admin_partner_chat':
        return 'business-outline';
      case 'admin_pending_payment':
        return 'card-outline';
      case 'partner_payment_update':
        return 'trending-up';
      case 'admin_new_users':
        return 'people-outline';
      default:
        return 'notifications';
    }
  };

  const getNotificationColors = (type) => {
    switch (type) {
      case 'ticket':
        return ['#ef4444', '#dc2626'];
      case 'message':
        return ['#3b82f6', '#1d4ed8'];
      case 'appointment':
        return ['#10b981', '#059669'];
      case 'payment':
        return ['#f59e0b', '#d97706'];
      case 'system':
        return ['#6b7280', '#4b5563'];
      case 'partner':
        return ['#8b5cf6', '#7c3aed'];
      case 'ITSupport':
        return ['#06b6d4', '#0891b2'];
      case 'admin_partner_chat':
        return ['#8b5cf6', '#7c3aed'];
      case 'admin_pending_payment':
        return ['#f59e0b', '#d97706'];
      case 'partner_payment_update':
        return ['#10b981', '#059669'];
      case 'admin_new_users':
        return ['#3b82f6', '#1d4ed8'];
      default:
        return ['#3b82f6', '#1d4ed8'];
    }
  };

  if (!visible || !notification) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <SafeAreaView style={styles.safeArea}>
        <TouchableOpacity
          style={styles.banner}
          onPress={handlePress}
          activeOpacity={0.9}
        >
          <LinearGradient
            colors={getNotificationColors(notification.data?.type)}
            style={styles.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.content}>
              <View style={styles.iconContainer}>
                <Ionicons
                  name={getNotificationIcon(notification.data?.type)}
                  size={24}
                  color="#fff"
                />
              </View>
              
              <View style={styles.textContainer}>
                <Text style={styles.title} numberOfLines={1}>
                  {notification.title}
                </Text>
                <Text style={styles.body} numberOfLines={2}>
                  {notification.body}
                </Text>
              </View>
              
              <TouchableOpacity
                style={styles.closeButton}
                onPress={hideBanner}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={20} color="#fff" />
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </SafeAreaView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  safeArea: {
    backgroundColor: 'transparent',
  },
  banner: {
    marginHorizontal: 12,
    marginTop: Platform.OS === 'ios' ? 8 : 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  gradient: {
    borderRadius: 12,
    padding: 16,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconContainer: {
    marginRight: 12,
    marginTop: 2,
  },
  textContainer: {
    flex: 1,
    marginRight: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 4,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  body: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  closeButton: {
    padding: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
});

export default NotificationBanner;

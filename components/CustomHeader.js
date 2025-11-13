import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

const CustomHeader = ({ navigation, route, options, back }) => {
  const insets = useSafeAreaInsets();
  
  // Determine title: prefer options.headerTitle, then options.title, then route.name
  const title = options.headerTitle ?? options.title ?? route?.name ?? '';

  const isPartnerClientChat = route?.name === 'PartnerClientChat';
  const avatarUri = route?.params?.clientAvatar || route?.params?.partnerAvatar || null;
  const displayName = route?.params?.clientName || route?.params?.partnerName || title;

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerContent}>
        <View style={styles.left}>
          {back ? (
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color="#0a8fdf" />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.center} pointerEvents="none">
          {isPartnerClientChat ? (
            <View style={styles.chatHeaderContent}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.chatAvatar} />
              ) : null}
              <View style={styles.chatText}>
                <Text numberOfLines={1} style={styles.title}>{displayName}</Text>
                <Text numberOfLines={1} style={styles.subtitle}>Client</Text>
              </View>
            </View>
          ) : (
            <Text numberOfLines={1} style={styles.title}>{title}</Text>
          )}
        </View>

        <View style={styles.right} />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6edf3',
  },
  headerContent: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  left: {
    width: 70,
    paddingLeft: 8,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  right: {
    width: 70,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  chatHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  chatAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  chatText: {
    flexDirection: 'column',
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
  },
});

export default CustomHeader;

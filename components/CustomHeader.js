import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const CustomHeader = ({ navigation, route, options, back }) => {
  // Determine title: prefer options.headerTitle, then options.title, then route.name
  const title = options.headerTitle ?? options.title ?? route?.name ?? '';

  const isPartnerClientChat = route?.name === 'PartnerClientChat';
  const avatarUri = route?.params?.clientAvatar || route?.params?.partnerAvatar || null;
  const displayName = route?.params?.clientName || route?.params?.partnerName || title;

  return (
    <View style={styles.container}>
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
  );
};

const styles = StyleSheet.create({
  container: {
    height: Platform.OS === 'ios' ? 48 : 40,
    paddingTop: Platform.OS === 'ios' ? 10 : 0,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e6edf3',
    backgroundColor: '#fff'
  },
  left: {
    width: 70,
    paddingLeft: 12,
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
    padding: 6,
    borderRadius: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
});

export default CustomHeader;

import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { isUpdateAvailable, downloadAndApplyUpdate, reloadApp } from '../services/updateService';

const UpdateBanner = () => {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [slideAnim] = useState(new Animated.Value(-100));

  useEffect(() => {
    checkForUpdate();
  }, []);

  const checkForUpdate = async () => {
    const { isAvailable } = await isUpdateAvailable();
    if (isAvailable) {
      setUpdateAvailable(true);
      // Slide down animation
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 50,
        friction: 8,
      }).start();
    }
  };

  const handleUpdate = async () => {
    setDownloading(true);
    const result = await downloadAndApplyUpdate();
    
    if (result.success && result.isNew) {
      // Update downloaded, reload app
      await reloadApp();
    } else {
      setDownloading(false);
      setUpdateAvailable(false);
    }
  };

  const dismissBanner = () => {
    Animated.timing(slideAnim, {
      toValue: -100,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setUpdateAvailable(false);
    });
  };

  if (!updateAvailable) return null;

  return (
    <Animated.View 
      style={[
        styles.container,
        { transform: [{ translateY: slideAnim }] }
      ]}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-download" size={24} color="#fff" />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.title}>Mise à jour disponible !</Text>
          <Text style={styles.subtitle}>
            Une nouvelle version est prête à être installée
          </Text>
        </View>
      </View>
      
      <View style={styles.actions}>
        <TouchableOpacity 
          style={styles.dismissButton}
          onPress={dismissBanner}
          disabled={downloading}
        >
          <Text style={styles.dismissText}>Plus tard</Text>
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.updateButton}
          onPress={handleUpdate}
          disabled={downloading}
        >
          {downloading ? (
            <Text style={styles.updateText}>Téléchargement...</Text>
          ) : (
            <>
              <Ionicons name="arrow-down-circle" size={18} color="#fff" />
              <Text style={styles.updateText}>Mettre à jour</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#667eea',
    marginHorizontal: 15,
    marginVertical: 10,
    borderRadius: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconContainer: {
    width: 45,
    height: 45,
    borderRadius: 22.5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 3,
  },
  subtitle: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  dismissButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    marginRight: 10,
  },
  dismissText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  updateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  updateText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
    marginLeft: 6,
  },
});

export default UpdateBanner;

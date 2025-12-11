import * as Updates from 'expo-updates';
import { Alert, Platform } from 'react-native';

/**
 * OTA Update Service
 * Handles checking, fetching, and applying updates via Expo Updates
 */

// Check if updates are available and enabled
export const isUpdateAvailable = async () => {
  try {
    // In development mode, updates are not available
    if (__DEV__) {
      console.log('Update check skipped: Running in development mode');
      return { isAvailable: false, manifest: null };
    }

    const update = await Updates.checkForUpdateAsync();
    
    if (update.isAvailable) {
      console.log('✅ Update available:', update.manifest);
      return { isAvailable: true, manifest: update.manifest };
    } else {
      console.log('✅ App is up to date');
      return { isAvailable: false, manifest: null };
    }
  } catch (error) {
    console.error('Error checking for updates:', error);
    return { isAvailable: false, manifest: null, error };
  }
};

// Download and apply the update
export const downloadAndApplyUpdate = async () => {
  try {
    if (__DEV__) {
      console.log('Update download skipped: Running in development mode');
      return { success: false, reason: 'development' };
    }

    console.log('📥 Downloading update...');
    const fetchResult = await Updates.fetchUpdateAsync();
    
    if (fetchResult.isNew) {
      console.log('✅ Update downloaded successfully');
      return { success: true, isNew: true };
    } else {
      console.log('ℹ️ No new update to download');
      return { success: true, isNew: false };
    }
  } catch (error) {
    console.error('Error downloading update:', error);
    return { success: false, error };
  }
};

// Reload the app to apply the update
export const reloadApp = async () => {
  try {
    console.log('🔄 Reloading app to apply update...');
    await Updates.reloadAsync();
  } catch (error) {
    console.error('Error reloading app:', error);
    throw error;
  }
};

// Check for updates automatically on app launch
export const checkForUpdatesOnLaunch = async () => {
  try {
    if (__DEV__) {
      console.log('Auto-update check skipped: Running in development mode');
      return;
    }

    console.log('🔍 Checking for updates on launch...');
    const { isAvailable } = await isUpdateAvailable();
    
    if (isAvailable) {
      console.log('📥 Auto-downloading update...');
      const downloadResult = await downloadAndApplyUpdate();
      
      if (downloadResult.success && downloadResult.isNew) {
        console.log('✅ Update ready - will apply on next app restart');
        // The update will be applied on the next app launch
        // We don't automatically reload to avoid disrupting the user
      }
    }
  } catch (error) {
    console.error('Error in auto-update check:', error);
    // Don't show error to user for silent background updates
  }
};

// Manual update check with user interaction
export const checkForUpdatesManually = async (showNoUpdateAlert = true) => {
  try {
    if (__DEV__) {
      Alert.alert(
        'Mode Développement',
        'Les mises à jour OTA ne sont pas disponibles en mode développement.',
        [{ text: 'OK' }]
      );
      return { success: false, reason: 'development' };
    }

    // Show checking message
    console.log('🔍 Manual update check initiated...');
    
    const { isAvailable, error } = await isUpdateAvailable();
    
    if (error) {
      Alert.alert(
        'Erreur',
        'Impossible de vérifier les mises à jour. Veuillez réessayer plus tard.',
        [{ text: 'OK' }]
      );
      return { success: false, error };
    }
    
    if (isAvailable) {
      return new Promise((resolve) => {
        Alert.alert(
          'Mise à jour disponible',
          'Une nouvelle version de l\'application est disponible. Voulez-vous la télécharger maintenant ?',
          [
            {
              text: 'Plus tard',
              style: 'cancel',
              onPress: () => resolve({ success: false, cancelled: true })
            },
            {
              text: 'Mettre à jour',
              onPress: async () => {
                const downloadResult = await downloadAndApplyUpdate();
                
                if (downloadResult.success && downloadResult.isNew) {
                  Alert.alert(
                    'Mise à jour téléchargée',
                    'La mise à jour a été téléchargée. L\'application va redémarrer pour l\'appliquer.',
                    [
                      {
                        text: 'Redémarrer maintenant',
                        onPress: async () => {
                          await reloadApp();
                          resolve({ success: true, reloaded: true });
                        }
                      }
                    ]
                  );
                } else if (downloadResult.error) {
                  Alert.alert(
                    'Erreur',
                    'Impossible de télécharger la mise à jour. Veuillez réessayer plus tard.',
                    [{ text: 'OK' }]
                  );
                  resolve({ success: false, error: downloadResult.error });
                } else {
                  resolve({ success: true, isNew: false });
                }
              }
            }
          ]
        );
      });
    } else {
      if (showNoUpdateAlert) {
        Alert.alert(
          'Application mise à jour !',
          'Vous utilisez déjà la dernière version de l\'application.',
          [{ text: 'OK' }]
        );
      }
      return { success: true, upToDate: true };
    }
  } catch (error) {
    console.error('Error in manual update check:', error);
    Alert.alert(
      'Erreur',
      'Une erreur est survenue lors de la vérification des mises à jour.',
      [{ text: 'OK' }]
    );
    return { success: false, error };
  }
};

// Get current update info
export const getCurrentUpdateInfo = () => {
  try {
    return {
      updateId: Updates.updateId,
      channel: Updates.channel,
      runtimeVersion: Updates.runtimeVersion,
      isEmbeddedLaunch: Updates.isEmbeddedLaunch,
      isEmergencyLaunch: Updates.isEmergencyLaunch,
    };
  } catch (error) {
    console.error('Error getting update info:', error);
    return null;
  }
};

export default {
  isUpdateAvailable,
  downloadAndApplyUpdate,
  reloadApp,
  checkForUpdatesOnLaunch,
  checkForUpdatesManually,
  getCurrentUpdateInfo,
};

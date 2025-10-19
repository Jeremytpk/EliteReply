import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import { collection, query, getDocs, where, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

// In-app notification handler - stores active listeners
let notificationListeners = new Set();

// Add a listener for in-app notifications
export const addInAppNotificationListener = (callback) => {
  notificationListeners.add(callback);
  return () => notificationListeners.delete(callback);
};

// Trigger in-app notifications to all active listeners
const triggerInAppNotifications = (notification) => {
  notificationListeners.forEach(callback => {
    try {
      callback(notification);
    } catch (error) {
      console.error('Error in notification listener:', error);
    }
  });
};

// Enhanced push notification function with better error handling and retry logic
export const sendPushNotification = async (expoPushToken, title, body, data = {}, retries = 3) => {
  if (!expoPushToken) {
    console.warn('No push token provided, skipping push notification');
    return;
  }

  const message = {
    to: expoPushToken,
    sound: 'er_notification',
    title,
    body,
    data: {
      ...data,
      timestamp: Date.now(),
      notificationId: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    },
    priority: 'high',
    channelId: 'er_notification_channel',
  };

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      const result = await response.json();
      
      if (response.ok && result.data && result.data.status === 'ok') {
        console.log('Push notification sent successfully!');
        
        // Store notification in Firestore for history
        await storeNotificationHistory(expoPushToken, title, body, data);
        return true;
      } else {
        console.error('Push notification failed:', result);
        if (attempt < retries - 1) continue;
      }
    } catch (error) {
      console.error(`Push notification attempt ${attempt + 1} failed:`, error);
      if (attempt < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1))); // Exponential backoff
        continue;
      }
    }
  }
  
  return false;
};

// Store notification history in Firestore
const storeNotificationHistory = async (expoPushToken, title, body, data) => {
  try {
    await addDoc(collection(db, 'notificationHistory'), {
      expoPushToken,
      title,
      body,
      data,
      sentAt: serverTimestamp(),
      platform: Platform.OS,
    });
  } catch (error) {
    console.error('Error storing notification history:', error);
  }
};

// Send notification to multiple users by role or condition
export const sendNotificationToUsersByRole = async (role, title, body, data = {}) => {
  try {
    const usersQuery = query(
      collection(db, 'users'),
      where('role', '==', role)
    );
    
    const querySnapshot = await getDocs(usersQuery);
    const notificationPromises = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.expoPushToken) {
        notificationPromises.push(
          sendPushNotification(userData.expoPushToken, title, body, {
            ...data,
            userId: doc.id,
            userRole: role,
          })
        );
      }
    });
    
    const results = await Promise.allSettled(notificationPromises);
    const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
    
    console.log(`Sent notifications to ${successful}/${results.length} ${role} users`);
    return { successful, total: results.length };
  } catch (error) {
    console.error('Error sending notifications to users by role:', error);
    return { successful: 0, total: 0 };
  }
};

// Send notification to IT Support agents
export const sendNotificationToITSupport = async (title, body, data = {}) => {
  try {
    const itSupportQuery = query(
      collection(db, 'users'),
      where('isITSupport', '==', true)
    );
    
    const querySnapshot = await getDocs(itSupportQuery);
    const notificationPromises = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.expoPushToken) {
        notificationPromises.push(
          sendPushNotification(userData.expoPushToken, title, body, {
            ...data,
            userId: doc.id,
            userRole: 'ITSupport',
          })
        );
      }
    });
    
    const results = await Promise.allSettled(notificationPromises);
    const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
    
    console.log(`Sent notifications to ${successful}/${results.length} IT Support agents`);
    
    // Also trigger in-app notifications
    triggerInAppNotifications({
      title,
      body,
      data: { ...data, type: 'ITSupport' },
      timestamp: Date.now(),
    });
    
    return { successful, total: results.length };
  } catch (error) {
    console.error('Error sending notifications to IT Support:', error);
    return { successful: 0, total: 0 };
  }
};

// Send notification to specific user
export const sendNotificationToUser = async (userId, title, body, data = {}) => {
  try {
    const userDoc = await getDocs(query(collection(db, 'users'), where('__name__', '==', userId)));
    
    if (!userDoc.empty) {
      const userData = userDoc.docs[0].data();
      if (userData.expoPushToken) {
        const success = await sendPushNotification(userData.expoPushToken, title, body, {
          ...data,
          userId,
        });
        
        // Also trigger in-app notifications
        triggerInAppNotifications({
          title,
          body,
          data: { ...data, userId, type: 'direct' },
          timestamp: Date.now(),
        });
        
        return success;
      }
    }
    return false;
  } catch (error) {
    console.error('Error sending notification to user:', error);
    return false;
  }
};

// Send notification to specific partner
export const sendNotificationToPartner = async (partnerId, title, body, data = {}) => {
  try {
    const partnerDoc = await getDocs(query(collection(db, 'partners'), where('__name__', '==', partnerId)));
    
    if (!partnerDoc.empty) {
      const partnerData = partnerDoc.docs[0].data();
      if (partnerData.expoPushToken) {
        const success = await sendPushNotification(partnerData.expoPushToken, title, body, {
          ...data,
          partnerId,
        });
        
        // Also trigger in-app notifications
        triggerInAppNotifications({
          title,
          body,
          data: { ...data, partnerId, type: 'partner' },
          timestamp: Date.now(),
        });
        
        return success;
      }
    }
    return false;
  } catch (error) {
    console.error('Error sending notification to partner:', error);
    return false;
  }
};

// Send notification to all partners
export const sendNotificationToAllPartners = async (title, body, data = {}) => {
  try {
    const partnersQuery = query(collection(db, 'partners'));
    const querySnapshot = await getDocs(partnersQuery);
    const notificationPromises = [];
    
    querySnapshot.forEach((doc) => {
      const partnerData = doc.data();
      if (partnerData.expoPushToken) {
        notificationPromises.push(
          sendPushNotification(partnerData.expoPushToken, title, body, {
            ...data,
            partnerId: doc.id,
            userRole: 'Partner',
          })
        );
      }
    });
    
    const results = await Promise.allSettled(notificationPromises);
    const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
    
    console.log(`Sent notifications to ${successful}/${results.length} partners`);
    return { successful, total: results.length };
  } catch (error) {
    console.error('Error sending notifications to all partners:', error);
    return { successful: 0, total: 0 };
  }
};

// Send notification to all users
export const sendNotificationToAllUsers = async (title, body, data = {}) => {
  try {
    const usersQuery = query(collection(db, 'users'));
    const querySnapshot = await getDocs(usersQuery);
    const notificationPromises = [];
    
    querySnapshot.forEach((doc) => {
      const userData = doc.data();
      if (userData.expoPushToken) {
        notificationPromises.push(
          sendPushNotification(userData.expoPushToken, title, body, {
            ...data,
            userId: doc.id,
          })
        );
      }
    });
    
    const results = await Promise.allSettled(notificationPromises);
    const successful = results.filter(result => result.status === 'fulfilled' && result.value).length;
    
    console.log(`Sent notifications to ${successful}/${results.length} users`);
    
    // Also trigger in-app notifications
    triggerInAppNotifications({
      title,
      body,
      data: { ...data, type: 'broadcast' },
      timestamp: Date.now(),
    });
    
    return { successful, total: results.length };
  } catch (error) {
    console.error('Error sending notifications to all users:', error);
    return { successful: 0, total: 0 };
  }
};

// Schedule a local notification (works when app is closed)
export const scheduleLocalNotification = async (title, body, data = {}, delaySeconds = 0) => {
  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: 'er_notification',
        priority: Notifications.AndroidImportance.HIGH,
      },
      trigger: delaySeconds > 0 ? { seconds: delaySeconds } : null,
    });
    
    console.log('Local notification scheduled with ID:', notificationId);
    return notificationId;
  } catch (error) {
    console.error('Error scheduling local notification:', error);
    return null;
  }
};

// Cancel a scheduled local notification
export const cancelLocalNotification = async (notificationId) => {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
    console.log('Local notification cancelled:', notificationId);
  } catch (error) {
    console.error('Error cancelling local notification:', error);
  }
};

// Show immediate in-app notification
export const showInAppNotification = (title, body, data = {}) => {
  triggerInAppNotifications({
    title,
    body,
    data: { ...data, type: 'inApp' },
    timestamp: Date.now(),
  });
};
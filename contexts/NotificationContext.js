import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';
import { auth } from '../firebase';
import { addInAppNotificationListener } from '../services/notifications';
import NotificationBanner from '../components/NotificationBanner';

const NotificationContext = createContext();

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider = ({ children, navigation }) => {
  const [currentNotification, setCurrentNotification] = useState(null);
  const [notificationQueue, setNotificationQueue] = useState([]);
  const appState = useRef(AppState.currentState);
  const notificationListener = useRef();
  const responseListener = useRef();

  useEffect(() => {
    // Listen for in-app notifications
    const removeInAppListener = addInAppNotificationListener((notification) => {
      if (AppState.currentState === 'active') {
        showNotification(notification);
      }
    });

    // Listen for push notifications when app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Foreground notification received:', notification);
      
      if (AppState.currentState === 'active') {
        // Show in-app banner for foreground notifications
        showNotification({
          title: notification.request.content.title,
          body: notification.request.content.body,
          data: notification.request.content.data,
        });
      }
    });

    // Listen for notification interactions (user taps notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification interaction:', response);
      handleNotificationInteraction(response.notification.request.content);
    });

    // Listen for app state changes
    const appStateSubscription = AppState.addEventListener('change', (nextAppState) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        console.log('App has come to the foreground');
        // Process any queued notifications
        processNotificationQueue();
      }
      appState.current = nextAppState;
    });

    return () => {
      removeInAppListener();
      if (notificationListener.current && typeof notificationListener.current.remove === 'function') {
        notificationListener.current.remove();
      }
      if (responseListener.current && typeof responseListener.current.remove === 'function') {
        responseListener.current.remove();
      }
      appStateSubscription?.remove();
    };
  }, []);

  const showNotification = (notification) => {
    // Filter notifications based on user role and notification type
    if (shouldFilterNotification(notification)) {
      console.log('🚫 Notification filtered for current user role:', notification.data?.type);
      return;
    }

    if (currentNotification) {
      // Queue the notification if one is already showing
      setNotificationQueue(prev => [...prev, notification]);
    } else {
      setCurrentNotification(notification);
    }
  };

  const shouldFilterNotification = (notification) => {
    const notificationType = notification.data?.type;
    const currentUser = auth.currentUser;
    
    if (!currentUser || !notificationType) return false;

    // Primary filter: Don't show notifications to the sender
    if (notification.data?.senderId === currentUser.uid) {
      console.log('🚫 Filtering notification from self:', notificationType);
      return true; // Filter out self-notifications
    }

    return false; // Show all other notifications
  };

  const processNotificationQueue = () => {
    if (notificationQueue.length > 0 && !currentNotification) {
      const nextNotification = notificationQueue[0];
      setCurrentNotification(nextNotification);
      setNotificationQueue(prev => prev.slice(1));
    }
  };

  const dismissCurrentNotification = () => {
    setCurrentNotification(null);
    // Process next notification in queue after a short delay
    setTimeout(processNotificationQueue, 500);
  };

  const handleNotificationInteraction = (content) => {
    const { data } = content;
    
    console.log('🔔 Notification interaction:', {
      type: data?.type,
      partnerId: data?.partnerId,
      partnerName: data?.partnerName,
      data: data
    });
    
    try {
      // Handle different notification types
      switch (data.type) {
        case 'ticket':
          if (data.ticketId && navigation) {
            navigation.navigate('TicketInfo', { ticketId: data.ticketId });
          }
          break;
          
        case 'message':
          if (data.conversationId && navigation) {
            navigation.navigate('Conversation', { conversationId: data.conversationId });
          }
          break;
          
        case 'appointment':
          if (data.appointmentId && navigation) {
            navigation.navigate('Appointments', { appointmentId: data.appointmentId });
          }
          break;
          
        case 'payment':
          if (navigation) {
            navigation.navigate('Payments');
          }
          break;
          
        case 'partner':
          if (data.partnerId && navigation) {
            navigation.navigate('PartnerDetails', { partnerId: data.partnerId });
          }
          break;
          
        case 'admin_partner_chat':
          console.log('📱 Admin partner chat notification - navigating to PartnerAdminChat', {
            partnerId: data.partnerId,
            partnerName: data.partnerName,
            hasNavigation: !!navigation
          });
          if (data.partnerId && navigation) {
            try {
              // Navigate to partner-admin chat for admin
              navigation.navigate('PartnerAdminChat', { 
                partnerId: data.partnerId,
                partnerName: data.partnerName,
                userType: 'admin'
              });
              console.log('✅ Successfully navigated to PartnerAdminChat');
            } catch (navError) {
              console.error('❌ Navigation failed:', navError);
              // Fallback to AdminScreen if partner chat navigation fails
              navigation.navigate('AdminScreen');
            }
          } else {
            console.warn('⚠️ Missing partnerId or navigation for admin partner chat');
          }
          break;
          
        case 'partner_admin_chat':
          console.log('📱 Partner admin chat notification - navigating to PartnerAdminChat', {
            partnerId: data.partnerId,
            partnerName: data.partnerName,
            hasNavigation: !!navigation
          });
          if (data.partnerId && navigation) {
            try {
              // Navigate to partner-admin chat for partner
              navigation.navigate('PartnerAdminChat', { 
                partnerId: data.partnerId,
                partnerName: data.partnerName,
                userType: 'partner'
              });
              console.log('✅ Successfully navigated to PartnerAdminChat');
            } catch (navError) {
              console.error('❌ Navigation failed:', navError);
              // Fallback to PartnerDashboard if partner chat navigation fails
              navigation.navigate('PartnerDashboard');
            }
          } else {
            console.warn('⚠️ Missing partnerId or navigation for partner admin chat');
          }
          break;
          
        case 'admin_pending_payment':
          if (navigation) {
            // Navigate to payments screen for pending payment notifications
            navigation.navigate('Payments');
          }
          break;
          
        case 'partner_payment_update':
          if (navigation) {
            // Navigate to payments screen for financial updates
            navigation.navigate('Payments');
          }
          break;
          
        case 'admin_new_users':
          if (navigation) {
            // Navigate to admin dashboard for new users notification
            navigation.navigate('AdminScreen');
          }
          break;
          
        case 'ITSupport':
          if (navigation) {
            // Navigate to IT Dashboard if user has IT support role
            const user = auth.currentUser;
            if (user) {
              navigation.navigate('ITDashboard');
            }
          }
          break;
          
        case 'system':
        case 'broadcast':
          if (navigation) {
            navigation.navigate('News');
          }
          break;
          
        default:
          // Default action - go to main dashboard
          if (navigation) {
            navigation.navigate('Dashboard');
          }
          break;
      }
    } catch (error) {
      console.error('Error handling notification interaction:', error);
    }
  };

  const handleNotificationPress = (notification) => {
    handleNotificationInteraction({
      title: notification.title,
      body: notification.body,
      data: notification.data,
    });
  };

  const contextValue = {
    showNotification,
    currentNotification,
    notificationQueue: notificationQueue.length,
    dismissCurrentNotification,
  };

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
      {currentNotification && (
        <NotificationBanner
          notification={currentNotification}
          onPress={handleNotificationPress}
          onDismiss={dismissCurrentNotification}
          duration={6000}
        />
      )}
    </NotificationContext.Provider>
  );
};

export default NotificationProvider;

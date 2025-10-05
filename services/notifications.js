// No specific React Native imports needed here for 'fetch' call.
// If you used Expo Notifications API directly (e.g., Notifications.scheduleNotificationAsync),
// you would import 'expo-notifications' here.
// However, your function is directly calling exp.host API, which is fine.

export const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
  const message = {
    to: expoPushToken,
    sound: 'er_notification', // Ensure 'er_notification' is a valid sound name/path if needed
    title,
    body,
    data,
  };

  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });
    console.log('Push notification sent successfully!'); // Removed (PartnerDashboard)
  } catch (error) {
    console.error('Failed to send push notification:', error); // Removed (PartnerDashboard)
  }
};
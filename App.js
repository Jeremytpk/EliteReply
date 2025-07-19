import React, { useEffect, useRef, useState } from 'react';
import { NavigationContainer, StackActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform, Linking, Alert, PermissionsAndroid } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Audio } from 'expo-av';
import Constants from 'expo-constants'; // Import Constants to access app.json config

import { db, auth } from './firebase';

// Import your screens
import Login from './screens/Login';
import Signup from './screens/Signup';
import Dashboard from './screens/Dashboard';
import ITDashboard from './screens/ITDashboard';
import AdminScreen from './screens/AdminScreen';
import Settings from './screens/Settings';
import EditProfile from './screens/EditProfile';
import About from './screens/About';
import FAQ from './screens/FAQ';
import RateApp from './screens/RateApp';
import News from './screens/News';
import Conversation from './screens/Conversation';
import ConversationList from './screens/ConversationList';
import UserRequest from './screens/UserRequest';
import Users from './screens/Users';
import Partners from './screens/partner/Partners';
import tickets from './screens/tickets';
import PartnerDetails from './screens/partner/PartnerDetails';
import AddPartner from './screens/partner/AddPartner';
import Products from './screens/Products';
import TicketInfo from './screens/TicketInfo'
import Promotions from './screens/Promotions';
import PartnerDashboard from './screens/partner/PartnerDashboard';
import ListeDemandes from './screens/partner/ListeDemandes';
import Confirm from './screens/partner/Confirm';
import Commission from './screens/partner/Commission';
import Rdv from './screens/partner/Rdv';
import Revenus from './screens/partner/Revenus';
import DetailsUser from './screens/DetailsUser';
import SurveyScreen from './screens/survey/Survey';
import CreateSurveyScreen from './screens/CreateSurvey';
import PaymentsScreen from './screens/Payments';
import SurveyDetails from './screens/survey/SurveyDetails';
import PartnerChat from './screens/partner/PartnerChat';
import PartnerMsg from './screens/partner/PartnerMsg';
import Loading from './screens/Loading';
import SupportChat from './screens/partner/SupportChat';
import Datas from './screens/Datas';
import Graphic from './screens/Graphic';
import UsersDashboard from './screens/UsersDashboard';
import AnswerSurveyScreen from './screens/survey/SurveyResponses';
import PartnerSurvey from './screens/partner/PartnerSurvey';
import PartnerSurveyDetail from './screens/partner/PartnerSurveyDetail';
import ViewSurveyResultScreen from './screens/survey/ViewSurveyResult';
import UserCoupons from './screens/survey/userCoupons';
import UserRdv from './screens/UserRdv';
import AppointmentManager from './screens/AppointmentManager';
import Appointments from './screens/Appointments';
import PartnerRdvDetail from './screens/partner/PartnerRdvDetail';
import PartnerDoc from './screens/partner/PartnerDoc';
import RdvConfirm from './screens/partner/RdvConfirm';
import PartnerEdit from './screens/partner/PartnerEdit';
import AppointmentFormModal from './components/AppointmentFormModal';
import AppointmentListScreen from './screens/AppointmentListScreen';
import NewsDetail from './screens/NewsDetail';


const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

// --- EXPO NOTIFICATIONS CONFIGURATION ---
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true, // Crucial for playing sound
    shouldSetBadge: true,
  }),
});

// Define Android Channel ID consistently
// It's good practice to get this from Constants if you define it in app.json
const ANDROID_NOTIFICATION_CHANNEL_ID = Constants.expoConfig?.notification?.android?.channel?.id || "er_notification_channel";
const CUSTOM_SOUND_NAME = "er_notification"; // Matches the Cloud Function

// Global sound object for the custom notification
const customNotificationSound = new Audio.Sound();

// Flags to ensure the sound is loaded only once and manage its loading state
let isSoundLoaded = false;
let isSoundLoading = false;


// Function to load the custom sound, with checks to prevent re-loading
async function loadCustomSound() {
  if (isSoundLoaded || isSoundLoading) {
    console.log('Sound already loaded or loading, skipping load attempt.');
    return;
  }
  isSoundLoading = true; // Set loading flag
  try {
    // IMPORTANT: Adjust this path to your actual sound file.
    // Ensure the file 'er_notification.wav' exists in this path.
    await customNotificationSound.loadAsync(require('./assets/sounds/er_notification.mp3'));
    console.log('ER Notification sound loaded!');
    isSoundLoaded = true; // Mark as loaded on success
  } catch (error) {
    console.error('Error loading custom notification sound:', error);
    isSoundLoaded = false; // Reset if loading failed
  } finally {
    isSoundLoading = false; // Always reset loading flag
  }
}

// Function to play the custom sound explicitly (e.g., for in-app alerts)
async function playCustomSound() {
  try {
    if (customNotificationSound._loaded) { // Check if sound is loaded before playing
      await customNotificationSound.replayAsync();
    } else {
      console.warn("Custom sound not loaded, cannot play.");
    }
  } catch (error) {
    console.error('Error playing custom notification sound:', error);
  }
}

// Function to create Android Notification Channel
async function createAndroidNotificationChannel() {
  if (Platform.OS === 'android') {
    try {
      const existingChannels = await Notifications.getNotificationChannelsAsync();
      const channelExists = existingChannels.some(channel => channel.id === ANDROID_NOTIFICATION_CHANNEL_ID);

      if (!channelExists) {
        await Notifications.setNotificationChannelAsync(ANDROID_NOTIFICATION_CHANNEL_ID, {
          name: 'EliteReply Notifications',
          importance: Notifications.AndroidImportance.MAX, // High importance ensures sound plays
          sound: CUSTOM_SOUND_NAME, // This refers to the sound asset name (without extension)
          vibrationPattern: [0, 250, 250, 250], // Optional: Custom vibration
          lightColor: '#FF231F7C', // Optional: Custom light
        });
        console.log('Android notification channel created:', ANDROID_NOTIFICATION_CHANNEL_ID);
      } else {
        console.log('Android notification channel already exists:', ANDROID_NOTIFICATION_CHANNEL_ID);
      }
    } catch (error) {
      console.error('Error creating Android notification channel:', error);
    }
  }
}
// --- END CUSTOM NOTIFICATION SOUND SETUP ---


async function registerForPushNotificationsAsync(userId) {
  let token;
  console.log('--- Register Push Notification: Start ---');
  console.log('Attempting to register for userId:', userId);

  if (Device.isDevice) {
    // Request POST_NOTIFICATIONS permission for Android 13+
    if (Platform.OS === 'android' && Platform.Version >= 33) {
      try {
        console.log('Android 13+: Requesting POST_NOTIFICATIONS permission...');
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
          {
            title: "Permission de Notification",
            message: "EliteReply a besoin de votre permission pour vous envoyer des notifications importantes.",
            buttonNeutral: "Demander Plus Tard",
            buttonNegative: "Annuler",
            buttonPositive: "Autoriser"
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('Android 13+: POST_NOTIFICATIONS permission granted.');
        } else {
          console.log('Android 13+: POST_NOTIFICATIONS permission denied.');
          // Optionally, alert user that notifications might not work
          // You might want to update UI or state based on this denial
        }
      } catch (err) {
        console.warn('Android 13+: Error requesting POST_NOTIFICATIONS permission:', err);
      }
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    console.log('Existing general notification permission status:', existingStatus);

    if (existingStatus !== 'granted') {
      console.log('Requesting general notification permission...');
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
      console.log('Final general notification permission status after request:', finalStatus);
    }

    if (finalStatus !== 'granted') {
      console.log('Failed to get push token: finalStatus not granted.');
      Alert.alert(
        'Permission requise',
        'Veuillez activer les notifications dans les paramètres de votre appareil pour recevoir des mises à jour importantes.',
        [{ text: 'OK' }]
      );
      console.log('--- Register Push Notification: Failed (Permissions) ---');
      return;
    }

    try {
      // Corrected Constants.expoConfig.extra.eas.projectId to Constants.expoConfig.projectId
      token = (await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig.projectId // Ensure this matches your project ID from app.json
      })).data;
      console.log('Expo Push Token obtained:', token);

      // Save token to Firestore for the current user
      if (userId && token) {
        console.log('Saving token to Firestore for user:', userId);
        await updateDoc(doc(db, 'users', userId), {
          expoPushToken: token,
        });
        console.log('Expo Push Token successfully saved in Firestore.');
      } else {
        console.log('Skipping token save: userId or token is missing.', { userId, token });
      }
    } catch (error) {
      console.error('Error getting or saving Expo Push Token:', error);
      Alert.alert('Erreur', 'Impossible de configurer les notifications push.');
    }

  } else {
    Alert.alert(
      'Notifications Push',
      'Les notifications push doivent être testées sur un appareil physique.',
      [{ text: 'OK' }]
    );
    console.log('Not on physical device, skipping token registration.');
  }
  console.log('--- Register Push Notification: End ---');
  return token;
}


// Main App Tabs Navigator - This will be for regular users, IT Support, and Admin
function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          let iconComponent = Ionicons; // Default to Ionicons

          if (route.name === 'Dashboard') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'ITDashboard') {
            iconName = focused ? 'desktop' : 'desktop-outline';
          } else if (route.name === 'AdminScreen') {
            iconName = focused ? 'shield' : 'shield-outline';
          } else if (route.name === 'PartnerDashboard') {
            iconName = focused ? 'handshake' : 'handshake-outline';
            // Assuming PartnerDashboard is a Tab.Screen, if not, this section might be redundant.
            // If PartnerDashboard is meant to be a direct screen, not a tab, remove this whole block.
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#0a8fdf',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          paddingBottom: 5,
          height: 60,
          display: 'flex'
        },
        headerShown: false,
      })}
    >
      <Tab.Screen name="Dashboard" component={Dashboard} />
      <Tab.Screen name="ITDashboard" component={ITDashboard} />
      <Tab.Screen name="AdminScreen" component={AdminScreen} />
      {/* Assuming PartnerDashboard is a tab. If not, remove this line. */}
      {/* <Tab.Screen name="PartnerDashboard" component={PartnerDashboard} /> */}
    </Tab.Navigator>
  );
}

export default function App() {
  const notificationListener = useRef();
  const responseListener = useRef();
  const [currentUserId, setCurrentUserId] = useState(null);
  const navigationRef = useRef(); // Global navigation ref

  useEffect(() => {
    // 1. Load custom sound and create Android channel
    // Only attempt to load sound if it hasn't been loaded yet.
    // createAndroidNotificationChannel() is idempotent, so it's safe to call.
    if (!isSoundLoaded && !isSoundLoading) {
      loadCustomSound();
    }
    createAndroidNotificationChannel();


    // 2. Auth state observer
    const unsubscribeAuth = auth.onAuthStateChanged(user => {
      if (user) {
        setCurrentUserId(user.uid);
        registerForPushNotificationsAsync(user.uid);
      } else {
        setCurrentUserId(null);
        console.log('User logged out. Clearing currentUserId.');
      }
    });

    // 3. Notification received listener (app in foreground)
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received (foreground):', notification);
      // Since Notifications.setNotificationHandler already sets shouldPlaySound: true,
      // the system should handle playing the custom sound if the channel is set correctly.
      // Explicitly playing here might cause double sound or interference.
    });

    // 4. Notification response listener (user taps notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped/interacted with:', response.notification.request.content.data);

      const { link, type, ticketId, surveyId, appointmentId } = response.notification.request.content.data;

      // Update lastSeenMessages immediately upon tapping a message notification
      if (type === 'message' && currentUserId) {
        updateDoc(doc(db, 'users', currentUserId), {
            lastSeenMessages: serverTimestamp()
        }).catch(e => console.error("Error updating lastSeenMessages after notification tap:", e));
      }

      if (link) {
        // Attempt to open deep link using Linking module
        Linking.openURL(link)
          .then(() => console.log('Opened deep link:', link))
          .catch(err => {
            console.error('Failed to open deep link:', link, err);
            Alert.alert('Erreur', 'Impossible d\'ouvrir le lien. Veuillez réessayer.');
            // Fallback to in-app navigation if deep linking fails
            handleInAppNavigation(type, ticketId, surveyId, appointmentId);
          });
      } else {
        console.warn('Notification received without a deep link. Attempting in-app navigation.');
        handleInAppNavigation(type, ticketId, surveyId, appointmentId);
      }
    });

    return () => {
      // Clean up subscriptions and unload sound on unmount
      unsubscribeAuth();
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
      // Only unload if it was successfully loaded.
      if (customNotificationSound._loaded) {
        customNotificationSound.unloadAsync();
        console.log('ER Notification sound unloaded.');
        isSoundLoaded = false; // Reset the flag for potential future mounts/reloads
      }
    };
  }, [currentUserId]); // currentUserId as dependency for the useEffect

  // Helper function for in-app navigation
  const handleInAppNavigation = (type, ticketId, surveyId, appointmentId) => {
    if (navigationRef.current) {
      if (type === 'message' && ticketId) {
        // Use StackActions.replace to clear previous screens if you want a clean stack
        navigationRef.current.dispatch(StackActions.replace('Conversation', { ticketId }));
      } else if (type === 'survey' && surveyId) {
        // Assuming SurveyResponses is the correct screen to navigate to for a survey notification
        navigationRef.current.dispatch(StackActions.replace('SurveyResponses', { surveyId }));
      } else if (type === 'appointment_client_confirmed' || type === 'appointment_partner_new') {
        // Refined navigation for appointments:
        // Navigate to a specific detail screen or a relevant list screen.
        // Assuming PartnerRdvDetail or UserRdv could benefit from appointmentId.
        if (appointmentId) {
            if (type === 'appointment_client_confirmed') {
                // If you have a UserRdvDetail screen that takes appointmentId, use that
                navigationRef.current.dispatch(StackActions.replace('UserRdv', { appointmentId }));
            } else if (type === 'appointment_partner_new') {
                // If you have a PartnerRdvDetail screen that takes appointmentId, use that
                navigationRef.current.dispatch(StackActions.replace('PartnerRdvDetail', { appointmentId }));
            }
        } else {
            // Fallback to general list if no specific ID or detail screen exists
            if (type === 'appointment_client_confirmed') {
                navigationRef.current.dispatch(StackActions.replace('UserRdv'));
            } else if (type === 'appointment_partner_new') {
                navigationRef.current.dispatch(StackActions.replace('Rdv'));
            }
        }
      } else if (type === 'new_ticket_agent_alert' || type === 'ticket_escalated_by_jey') {
          // Navigate agents directly to the TicketInfo screen (or Conversation if that's preferred)
          if (ticketId) {
            navigationRef.current.dispatch(StackActions.replace('TicketInfo', { ticketId }));
          }
      }
      // Add more navigation logic for other types if needed
    } else {
      console.warn('Navigation ref not ready for in-app navigation fallback.');
    }
  };

  // --- DEEP LINKING CONFIGURATION FOR NAVIGATIONCONTAINER ---
  const linking = {
    prefixes: ['elitereply://app', 'https://elitereply.page.link'], // Add your Firebase Dynamic Link prefix if you use it
    config: {
      screens: {
        Conversation: {
          path: 'conversation/:ticketId',
          parse: {
            ticketId: (ticketId) => ticketId,
          },
        },
        SurveyResponses: {
          path: 'survey/:surveyId',
          parse: {
            surveyId: (surveyId) => surveyId,
          },
        },
        // Added deep linking for ticket details for agents
        TicketInfo: {
          path: 'ticket/:ticketId',
          parse: {
            ticketId: (ticketId) => ticketId,
          },
        },
        // Add deep linking for appointments if needed, e.g.:
        UserRdv: 'appointments/user', // Generic link to user's appointments list
        Rdv: 'appointments/partner', // Generic link to partner's appointments list
        PartnerRdvDetail: {
          path: 'appointment/partner/:appointmentId',
          parse: {
            appointmentId: (appointmentId) => appointmentId,
          },
        },
        // If you have a UserRdvDetail, add it here:
        // UserRdvDetail: {
        //   path: 'appointment/user/:appointmentId',
        //   parse: {
        //     appointmentId: (appointmentId) => appointmentId,
        //   },
        // },
        Dashboard: 'dashboard',
        ConversationList: 'conversations',
        PartnerChat: 'partnerChat/:partnerId',
        PartnerMsg: 'partnerMsg/:partnerId',
        // Ensure all screens you might deep link to are listed
      },
    },
    // Optional: getInitialURL and subscribe for custom handling outside of default behavior
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      linking={linking}
      onReady={() => {
        console.log('Navigation container is ready!');
      }}
    >
      <Stack.Navigator initialRouteName="Loading">
        <Stack.Screen
          name="Loading"
          component={Loading}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Login"
          component={Login}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Signup"
          component={Signup}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="MainApp"
          component={MainTabs}
          options={{ headerShown: false }}
        />
        {/*
          IMPORTANT: These screens are also part of MainTabs, but are listed here
          again so they can be navigated to directly from a notification or deep link,
          bypassing the tabs if desired. Ensure consistent naming.
        */}
        <Stack.Screen
          name="Dashboard"
          component={Dashboard}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="AdminScreen"
          component={AdminScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ITDashboard"
          component={ITDashboard}
          options={{ headerShown: false }}
        />

        {/* Partners Screens */}
        <Stack.Screen
          name="PartnerDashboard"
          component={PartnerDashboard}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="ListeDemandes"
          component={ListeDemandes}
          options={{ headerShown: true, title: "Demandes", headerTitleAlign:'center' }}
        />
        <Stack.Screen
          name="Confirm"
          component={Confirm}
          options={{ headerShown: true, title: "Confirmées", headerTitleAlign:'center' }}
        />
        <Stack.Screen
          name="Commission"
          component={Commission}
          options={{ headerShown: true, title: "Commission", headerTitleAlign:'center' }}
        />
        <Stack.Screen
          name="Rdv"
          component={Rdv}
          options={{ headerShown: true, title: "Rendez-vous", headerTitleAlign:'center' }}
        />
        <Stack.Screen
          name="Revenus"
          component={Revenus}
          options={{ headerShown: true, title: "Revenus", headerTitleAlign:'center' }}
        />
        <Stack.Screen
          name="SupportChat"
          component={SupportChat}
          options={{ headerShown: false, title: "Message", headerTitleAlign:'center' }}
        />

        {/* Regular screens */}
        <Stack.Screen name="UserRequest"
        component={UserRequest}
        options={{ headerShown: true, title: "Assistance", headerTitleAlign: 'center' }}  />
        <Stack.Screen
          name="Conversation"
          component={Conversation}
          options={{ headerShown: false }} // Keep this as false if Conversation handles its own header
        />
        <Stack.Screen name="ConversationList"
        component={ConversationList}
        options={{ headerShown: true, title: "Mes Conversations", headerTitleAlign: 'center' }}  />

        <Stack.Screen
          name="FAQ"
          component={FAQ}
          options={{ headerShown: true, title: '' ,headerTitleAlign: 'center', }}
        />
        <Stack.Screen
          name="News"
          component={News}
          options={{ headerShown: true, title: 'Promos du Moment' ,headerTitleAlign: 'center', }}
        />
        <Stack.Screen
          name="NewsDetail"
          component={NewsDetail}
          options={{ headerShown: true, title: '' ,headerTitleAlign: 'center', }}
        />
        <Stack.Screen
          name="About"
          component={About}
          options={{ headerShown: true, title: 'A Propos', headerTitleAlign: 'center' }}
        />
        <Stack.Screen
          name="RateApp"
          component={RateApp}
          options={{ headerShown: true, title: 'Votre avis sur EliteReply' ,headerTitleAlign: 'center', }}
        />
        <Stack.Screen
          name="Settings"
          component={Settings}
          options={{ headerShown: true, title: 'Parametres', headerTitleAlign: 'center' }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfile}
          options={{ headerShown: false, title: 'Modifier Profil', headerTitleAlign: 'center' }}
        />
        <Stack.Screen
          name="UserRdv"
          component={UserRdv}
          options={{ headerShown: false, title: 'Vos Rendez-vous', headerTitleAlign: 'center' }}
        />
        <Stack.Screen
          name="AppointmentManager"
          component={AppointmentManager}
          options={{ headerShown: false, title: 'Gestion RDV', headerTitleAlign: 'center' }}
        />
        <Stack.Screen
          name="Appointments"
          component={Appointments}
          options={{ headerShown: false, title: 'Rendez-vous Partenaire', headerTitleAlign: 'center' }}
        />
        <Stack.Screen
          name="AppointmentListScreen"
          component={AppointmentListScreen}
          options={{ headerShown: false, title: 'Rendez-vous Partenaire', headerTitleAlign: 'center' }}
        />

        {/* Admin Screen specific routes */}
        <Stack.Screen
          name="AddPartner"
          component={AddPartner}
          options={{ headerShown: false, title: "Ajout Partenaire", headerTitleAlign: 'center' }}
        />

        {/* For Admin Only (and potentially IT Support) */}
        <Stack.Screen
          name="Users"
          component={Users}
          options={{ headerShown: true }}
        />
        <Stack.Screen
          name="DetailsUser"
          component={DetailsUser}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="UsersDashboard"
          component={UsersDashboard}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Partners"
          component={Partners}
          options={{ headerShown: true, title: 'Partner List', headerTitleAlign: 'center'}}
        />
        <Stack.Screen
          name="PartnerDoc"
          component={PartnerDoc}
          options={{ headerShown: false, title: 'Partner List', headerTitleAlign: 'center'}}
        />
        <Stack.Screen
          name="RdvConfirm"
          component={RdvConfirm}
          options={{ headerShown: false, title: 'Partner List', headerTitleAlign: 'center'}}
        />
        <Stack.Screen
          name="PartnerDetails"
          component={PartnerDetails}
          options={{ headerShown: true, title: 'Partner Details', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="PartnerEdit"
          component={PartnerEdit}
          options={{ headerShown: false, title: 'Partner Details', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="PartnerChat"
          component={PartnerChat}
          options={{ headerShown: true, title: 'Chat Partenaire', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="PartnerMsg"
          component={PartnerMsg}
          options={{ headerShown: true, title: 'Chat Partenaire', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="PartnerSurvey"
          component={PartnerSurvey}
          options={{ headerShown: true, title: 'Enquêtes Partenaires', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="PartnerRdvDetail"
          component={PartnerRdvDetail}
          options={{ headerShown: false, title: 'Détail RDV', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="PartnerSurveyDetail"
          component={PartnerSurveyDetail}
          options={{ headerShown: false, title: 'Détail Enquête', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="Payments"
          component={PaymentsScreen}
          options={{ headerShown: true, title: 'Paiements', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="Survey"
          component={SurveyScreen}
          options={{ headerShown: true, title: 'Gestion des Enquêtes' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="CreateSurvey"
          component={CreateSurveyScreen}
          options={{ headerShown: true, title: 'Nouvelle Enquête'}}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="SurveyDetails"
          component={SurveyDetails}
          options={{ headerShown: false, title: 'Détail Enquête', headerTitleAlign: 'center'}}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="SurveyResponses"
          component={AnswerSurveyScreen}
          options={{ headerShown: true, title: 'Répondez et Gagnez !', headerTitleAlign: 'center'}}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="UserCoupons"
          component={UserCoupons}
          options={{ headerShown: false, title: 'Vos Coupons !', headerTitleAlign: 'center'}}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="ViewSurveyResult"
          component={ViewSurveyResultScreen}
          options={{ headerShown: true, title: 'Résultat Enquête', headerTitleAlign: 'center'}}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="Promotions"
          component={Promotions}
          options={{ headerShown: true, title: 'Promotions', headerTitleAlign: 'center' }}
          initialParams={{ partnerId: '' }}
        />
        <Stack.Screen
          name="Products"
          component={Products}
          options={{ headerShown: true, title: 'Produits Partenaire', headerTitleAlign: 'center'}}
        />
        <Stack.Screen
          name="tickets"
          component={tickets}
          options={{ headerShown: true }}
        />
        <Stack.Screen
          name="TicketInfo"
          component={TicketInfo}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Datas"
          component={Datas}
          options={{ headerShown: true }}
        />
        <Stack.Screen
          name="Graphic"
          component={Graphic}
          options={{ headerShown: true }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
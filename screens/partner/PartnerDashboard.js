// Helper to fetch payment count for a partner
const usePaymentCount = (partnerId) => {
  const [count, setCount] = useState(null);
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const db = getFirestore(firebaseApp);
        const paymentsRef = collection(db, 'payments');
        let querySnapshot;
        if (partnerId) {
          const q = query(paymentsRef, where('partnerId', '==', partnerId));
          querySnapshot = await getDocs(q);
        } else {
          querySnapshot = await getDocs(paymentsRef);
        }
        setCount(querySnapshot.size);
      } catch (e) {
        setCount(0);
      }
    };
    fetchCount();
  }, [partnerId]);
  return count;
};
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
  StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  Ionicons,
  MaterialIcons,
  FontAwesome,
  MaterialCommunityIcons
} from '@expo/vector-icons';
import { db, auth } from '../../firebase';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  getDoc,
  orderBy,
  limit,
  deleteDoc,
  onSnapshot
} from 'firebase/firestore';

// --- NEW: Import your custom icons ---
const DOC_ICON = require('../../assets/icons/doc.png');
const CHECKED_APT_ICON = require('../../assets/icons/checked_apt.png');
const HOLD_APT_ICON = require('../../assets/icons/hold_apt.png');
const MONEY_BILL_ICON = require('../../assets/icons/money_bill.png');
const MONEY_COMMISSION_ICON = require('../../assets/icons/money_commission.png');
const SUPPORT_ER_ICON = require('../../assets/icons/support_er.png');

const DASHBOARD_ICON = require('../../assets/icons/dashboard.png');
const CREDIT_CARD_ICON = require('../../assets/icons/credit_card.png');
const RATE_HALF_ICON_NAV = require('../../assets/icons/rate_half.png');
const RIGHT_ENTER_ICON_PARTNER = require('../../assets/icons/right_enter.png');
const RATE_FULL_ICON = require('../../assets/icons/rate_full.png');
const RATE_ICON_EMPTY = require('../../assets/icons/rate.png');
const REVIEW_ANIM_GIF = require('../../assets/gif/review_anim.gif');

const INFOS_ICON = require('../../assets/icons/infos.png');
const CLOSE_CIRCLE_OUTLINE_ICON = require('../../assets/icons/infos.png');
const TIME_OUTLINE_ICON = require('../../assets/icons/sablier.png');
const CHECKMARK_CIRCLE_OUTLINE_ICON = require('../../assets/icons/check_full.png');

const ARROW_RIGHT_SHORT_ICON = require('../../assets/icons/arrow_rightShort.png');

// --- ADDED NEW ICON IMPORT ---
const STORE_ICON = require('../../assets/icons/store.png');
// --- END NEW IMPORTS ---

import { sendPushNotification } from '../../services/notifications';
import { formatAmount } from '../../utils/currency';

// Responsive design helper function
const getResponsiveValues = () => {
  const { width: screenWidth } = Dimensions.get('window');
  const isTablet = screenWidth >= 768;
  const isLargePhone = screenWidth >= 414;
  
  return {
    statCardWidth: isTablet ? 200 : (isLargePhone ? 160 : 140),
    headerPadding: isTablet ? 30 : 20,
    fontSize: {
      title: isTablet ? 28 : 24,
      subtitle: isTablet ? 18 : 16,
      body: isTablet ? 16 : 14,
      small: isTablet ? 14 : 12,
    },
    spacing: {
      small: isTablet ? 12 : 8,
      medium: isTablet ? 20 : 15,
      large: isTablet ? 30 : 25,
    }
  };
};

// Custom Progress Bar Component
const ProgressBar = ({ progress, color }) => {
  return (
    <View style={styles.progressBarContainer}>
      <View
        style={[
          styles.progressBar,
          {
            width: `${progress * 100}%`,
            backgroundColor: color
          }
        ]}
      />
    </View>
  );
};

const PartnerDashboard = ({ navigation }) => {
  const [paymentsCount, setPaymentsCount] = useState(0);
  const paymentCount = usePaymentCount(partnerData?.id);
  useEffect(() => {
    setPaymentsCount(paymentCount);
  }, [paymentCount]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));
  const [partnerData, setPartnerData] = useState(null);
  const [loggedInUserBusinessName, setLoggedInUserBusinessName] = useState('');
  const [reviews, setReviews] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    documentsCount: 0,
    confirmedBookings: 0,
    pendingBookings: 0,
    totalAppointments: 0,
    revenueGenerated: 0,
    commissionEarned: 0,
    partnerRating: 0, // This will be updated from partnerRatings
    unpaidCommissions: 0,
    couponsCount: 0,
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const notifiedMessages = useRef(new Set());
  const notifiedAppointments = useRef(new Set());
  const notifiedSurveys = useRef(new Set());
  const notifiedDocuments = useRef(new Set());

  // Responsive design helper
  const getResponsiveValues = () => {
    const { width, height } = screenDimensions;
    const isSmallScreen = width < 375;
    const isMediumScreen = width >= 375 && width < 414;
    const isLargeScreen = width >= 414;
    
    return {
      padding: isSmallScreen ? 12 : isMediumScreen ? 16 : 20,
      cardPadding: isSmallScreen ? 12 : isMediumScreen ? 16 : 20,
      fontSize: {
        small: isSmallScreen ? 12 : 14,
        medium: isSmallScreen ? 14 : 16,
        large: isSmallScreen ? 18 : 20,
        xlarge: isSmallScreen ? 22 : 24,
      },
      iconSize: isSmallScreen ? 20 : 24,
      statIconSize: isSmallScreen ? 40 : 50,
      actionIconSize: isSmallScreen ? 50 : 60,
    };
  };
  
  // Chat states
  const [unreadChatsCount, setUnreadChatsCount] = useState(0);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const chatPulseAnim = useRef(new Animated.Value(1)).current;

  const getPromotionColor = () => {
    if (!partnerData?.estPromu || !partnerData.promotionEndDate) return '#34C759';

    const daysLeft = getPromotionDaysLeft();

    if (daysLeft <= 0) return '#999999'; // Gray for expired
    if (daysLeft <= 1) return '#FF0000'; // Red
    if (daysLeft <= 2) return '#FF3B30'; // Dark red
    if (daysLeft <= 5) return '#FF5E3A'; // Orange-red
    if (daysLeft <= 7) return '#FF9500'; // Orange
    return '#25c15b'; // Green
  };

  const getPromotionDaysLeft = () => {
    if (!partnerData?.estPromu || !partnerData.promotionEndDate) return 0;

    try {
      let endDate;
      
      // Handle different date formats
      if (partnerData.promotionEndDate.toDate) {
        // Firestore Timestamp
        endDate = partnerData.promotionEndDate.toDate();
      } else if (typeof partnerData.promotionEndDate === 'string') {
        // String date
        endDate = new Date(partnerData.promotionEndDate);
      } else if (partnerData.promotionEndDate instanceof Date) {
        // Already a Date object
        endDate = partnerData.promotionEndDate;
      } else {
        // Fallback
        endDate = new Date(partnerData.promotionEndDate);
      }

      // Validate the date
      if (isNaN(endDate.getTime())) {
        console.warn('Invalid promotion end date:', partnerData.promotionEndDate);
        return 0;
      }

      const today = new Date();
      const diffTime = endDate.getTime() - today.getTime();
      const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      // Return 0 if promotion has expired, otherwise return days left
      return Math.max(0, daysLeft);
    } catch (error) {
      console.error('Error calculating promotion days left:', error);
      return 0;
    }
  };

  const getPromotionIcon = () => {
    const daysLeft = getPromotionDaysLeft();

    if (daysLeft <= 1) return INFOS_ICON;
    if (daysLeft <= 3) return CLOSE_CIRCLE_OUTLINE_ICON;
    if (daysLeft <= 7) return TIME_OUTLINE_ICON;
    return CHECKMARK_CIRCLE_OUTLINE_ICON;
  };

  useEffect(() => {
    const daysLeft = getPromotionDaysLeft();

    if (daysLeft > 0 && daysLeft <= 7) {
      const pulseDuration = daysLeft <= 1 ? 800 :
                          daysLeft <= 3 ? 1200 :
                          1500;

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: pulseDuration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: pulseDuration,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
      pulseAnim.setValue(1);
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [partnerData?.promotionEndDate, partnerData?.estPromu, pulseAnim]);

  // --- MODIFIED fetchReviews function ---
  const fetchReviews = useCallback(async (partnerId) => {
    console.log("Jey: Fetching reviews from 'partnerRatings' for partnerId:", partnerId);
    try {
      if (!partnerId) {
        setReviews([]);
        return;
      }

      const partnerRatingsQuery = query(
        collection(db, 'partnerRatings'),
        where("partnerId", "==", partnerId)
        // Removed: orderBy("dateCreation", "desc") // <-- REMOVE THIS LINE
      );
      const partnerRatingsSnapshot = await getDocs(partnerRatingsQuery);

      const fetchedReviews = partnerRatingsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          nomUtilisateur: data.userName || data.nomUtilisateur,
          rating: data.rating || data.note,
          commentaire: data.comment || data.commentaire,
          dateCreation: data.dateCreation?.toDate() || data.createdAt?.toDate() || new Date(data.timestamp),
        };
      });

      // If you still need to sort, you would do it in JavaScript AFTER fetching all data
      fetchedReviews.sort((a, b) => (b.dateCreation?.getTime() || 0) - (a.dateCreation?.getTime() || 0));


      const totalRating = fetchedReviews.reduce((sum, review) => sum + (review.rating || 0), 0);
      const averageRating = fetchedReviews.length > 0 ? totalRating / fetchedReviews.length : 0;

      setReviews(fetchedReviews);
      setDashboardData(prev => ({ ...prev, partnerRating: averageRating }));

      console.log(`Jey: Found ${fetchedReviews.length} reviews for partner ${partnerId}. Average rating: ${averageRating.toFixed(1)}`);

    } catch (error) {
      console.error("Jey: Error fetching reviews from 'partnerRatings':", error);
      Alert.alert("Erreur", "Problème de chargement des avis.");
      setReviews([]);
      setDashboardData(prev => ({ ...prev, partnerRating: 0 }));
    }
  }, []);

  
  const fetchPartnerData = useCallback(async (userId) => {
    console.log("Jey: fetchPartnerData called for userId:", userId);
    try {
      setLoading(true);
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        console.warn("Jey: User document not found for userId:", userId);
        Alert.alert("Erreur", "Document utilisateur non trouvé");
        setPartnerData(null);
        setLoggedInUserBusinessName('');
        return;
      }

      const userData = userSnap.data();
      console.log("Jey: User data from Firestore:", userData);
      setLoggedInUserBusinessName(userData.partnerName || 'Mon Entreprise');
      setIsAdmin(userData.isAdmin || false);

      const partnerId = userData.partnerId;
      console.log("Jey: Retrieved partnerId from user document:", partnerId);

      if (!partnerId) {
        console.warn("Jey: No partnerId found for this user in user document.");
        Alert.alert("Erreur", "Aucun ID partenaire trouvé pour cet utilisateur. Assurez-vous que votre compte est lié à un partenaire.");
        setPartnerData(null);
        return;
      }

      const partnerRef = doc(db, 'partners', partnerId);
      const partnerSnap = await getDoc(partnerRef);

      if (partnerSnap.exists()) {
        const data = { id: partnerSnap.id, ...partnerSnap.data() };
        console.log("Jey: Partner document data:", data);
        
        // Debug promotion data
        if (data.estPromu) {
          console.log("Jey: Promotion data:", {
            estPromu: data.estPromu,
            promotionEndDate: data.promotionEndDate,
            promotionEndDateType: typeof data.promotionEndDate,
            promotionEndDateValue: data.promotionEndDate?.toString?.() || 'no toString method'
          });
        }
        
        setPartnerData(data);
        // Note: partnerRating is now set within fetchReviews for consistency
      } else {
        console.warn("Jey: Partner document not found for ID:", partnerId);
        Alert.alert("Erreur", "Document partenaire non trouvé pour l'ID: " + partnerId);
        setPartnerData(null);
        return;
      }

      // Call fetchReviews HERE after partnerId is confirmed
      await fetchReviews(partnerId); // <-- This now fetches from 'partnerRatings' and updates dashboardData.partnerRating

      const allRdvsQuery = query(
        collection(db, 'appointments'),
        where('partnerId', '==', partnerId)
      );
      const allRdvQuerySnapshot = await getDocs(allRdvsQuery);

      let totalAppointments = 0;
      let confirmedBookings = 0;
      let pendingBookings = 0;

      console.log("Jey: Processing appointments for partnerId:", partnerId);
      allRdvQuerySnapshot.forEach(doc => {
          const rdvData = doc.data();
          console.log(`Jey: Appointment ID: ${doc.id}, Status: ${rdvData.status}`);
          totalAppointments++;
          if (rdvData.status === 'confirmed' || rdvData.status === 'completed') {
              confirmedBookings++;
          } else if (rdvData.status === 'scheduled' || rdvData.status === 'pending' || rdvData.status === 'en attente' || !rdvData.status) {
              pendingBookings++;
          }
      });
      console.log("Jey: Calculated confirmedBookings:", confirmedBookings);

      const documentsQuery = query(
          collection(db, 'documents'),
          where('partnerId', '==', partnerId)
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documentsCount = documentsSnapshot.size;

      // Build revenue from partner appointments (sum of "Votre Total" displayed in RdvConfirm)
      // This avoids relying solely on partner-specific revenue transaction subcollection
      // and ensures the dashboard 'Revenus' reflects (paymentAmount - commissionCalculated)
      let revenueGenerated = 0;
      let commissionEarned = 0;

      // Query appointments for this partner and compute totals client-side
      try {
        const partnerApptsQuery = query(
          collection(db, 'appointments'),
          where('partnerId', '==', partnerId)
        );
        const partnerApptsSnapshot = await getDocs(partnerApptsQuery);

        partnerApptsSnapshot.forEach(aDoc => {
          const appt = aDoc.data();
          // Consider only completed appointments with a recorded payment
          const isCompleted = appt.status === 'completed' || appt.paymentRecorded === true;
          const paymentAmount = typeof appt.paymentAmount === 'number' ? appt.paymentAmount : (appt.amountReceived && typeof appt.amountReceived === 'number' ? appt.amountReceived : null);
          const commission = typeof appt.commissionCalculated === 'number' ? appt.commissionCalculated : (typeof appt.commissionAmount === 'number' ? appt.commissionAmount : 0);

          if (isCompleted && paymentAmount !== null && !Number.isNaN(paymentAmount)) {
            const partnerTotal = paymentAmount - (commission || 0);
            revenueGenerated += partnerTotal;
            commissionEarned += (commission || 0);
          }
        });
      } catch (apptError) {
        console.warn('Unable to compute revenue from appointments:', apptError);
      }

      setDashboardData(prevData => ({
        ...prevData,
        totalAppointments: totalAppointments,
        confirmedBookings: confirmedBookings,
        pendingBookings: pendingBookings,
        documentsCount: documentsCount,
        revenueGenerated: revenueGenerated,
        commissionEarned: commissionEarned,
        requestsReceived: documentsCount,
        // partnerRating is now managed by fetchReviews
      }));

    } catch (error) {
      console.error("Jey: Erreur lors de la récupération des données:", error);
      Alert.alert("Erreur", "Échec du chargement des données du partenaire: " + error.message);
      setPartnerData(null);
      setLoggedInUserBusinessName('');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetchReviews]); // Ensure fetchReviews is a dependency since it's called here

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    if (currentUser) {
      fetchPartnerData(currentUser.uid);
    } else {
      setRefreshing(false);
    }
  }, [currentUser, fetchPartnerData]);

  // Chat pulse animation effect
  useEffect(() => {
    if (hasNewMessages) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(chatPulseAnim, {
            toValue: 1.2,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          }),
          Animated.timing(chatPulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      chatPulseAnim.stopAnimation();
      chatPulseAnim.setValue(1);
    }

    return () => {
      chatPulseAnim.stopAnimation();
    };
  }, [hasNewMessages, chatPulseAnim]);

  useEffect(() => {
    let unsubscribes = [];

    const setupPartnerNotifications = async () => {
      const user = auth.currentUser;
      if (!user) {
        console.warn("Jey: No authenticated user for PartnerDashboard notifications.");
        return;
      }

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        console.warn("Jey: Partner user document not found for notifications.");
        return;
      }
      const partnerId = userDocSnap.data().partnerId;
      const partnerExpoPushToken = userDocSnap.data().expoPushToken;
      const currentUserName = userDocSnap.data().name || user.displayName || 'Partenaire';

      console.log("Jey: Notifications setup - partnerId:", partnerId, "token:", partnerExpoPushToken);


      if (!partnerId || !partnerExpoPushToken) {
        console.warn("Jey: Partner ID or ExpoPushToken missing for notifications. Skipping notification setup.");
        return;
      }

      // Monitor client-partner chats for unread messages
      const clientChatsQuery = query(
        collection(db, 'clientPartnerChats'),
        where('receiverId', '==', partnerId),
        where('read', '==', false)
      );
      
      const unsubscribeClientChats = onSnapshot(clientChatsQuery, (snapshot) => {
        const unreadMessages = snapshot.docs.filter(doc => {
          const data = doc.data();
          return data.receiverType === 'partner' && !data.read;
        });
        
        setUnreadChatsCount(unreadMessages.length);
        setHasNewMessages(unreadMessages.length > 0);
        
        console.log(`Jey: [PartnerDashboard] Unread client messages: ${unreadMessages.length}`);
      }, (error) => console.error("Jey: Error listening to client chats:", error));
      
      unsubscribes.push(unsubscribeClientChats);

      // Monitor partner-admin chats for unread messages from admin/support
      const adminChatRef = doc(db, 'partnerAdminChats', partnerId);
      const unsubscribeAdminChat = onSnapshot(adminChatRef, (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          const hasUnreadFromAdmin = data.partnerUnread === true;
          
          setHasNewMessages(hasUnreadFromAdmin);
          
          if (hasUnreadFromAdmin) {
            console.log(`Jey: [PartnerDashboard] Unread admin message detected`);
          } else {
            console.log(`Jey: [PartnerDashboard] Admin messages marked as read`);
          }
        } else {
          // No chat document exists yet, so no unread messages
          setHasNewMessages(false);
        }
      }, (error) => console.error("Jey: Error listening to admin chat:", error));
      
      unsubscribes.push(unsubscribeAdminChat);

      const partnerConvoQuery = query(collection(db, 'partnerConversations'), where('id', '==', partnerId));
      const unsubscribeConvo = onSnapshot(partnerConvoQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              const convoData = change.doc.data();
              const convoId = change.doc.id;
              if ((change.type === 'added' || change.type === 'modified') &&
                  convoData.lastMessageSender !== partnerId &&
                  convoData.unreadByPartner === true &&
                  !notifiedMessages.current.has(convoId)) {

                  console.log(`Jey: [PartnerDashboard] NEW UNREAD MESSAGE for Partner: ${convoData.lastMessage}`);
                  sendPushNotification(
                      partnerExpoPushToken,
                      `Nouveau message de ${convoData.lastMessageSenderName || 'Support EliteReply'}!`,
                      convoData.lastMessage,
                      { type: 'partner_chat_message', partnerId: convoId }
                  );
                  notifiedMessages.current.add(convoId);
              } else if (change.type === 'modified' && convoData.unreadByPartner === false) {
                  notifiedMessages.current.delete(convoId);
              }
          });
      }, (error) => console.error("Jey: Error listening to partner conversations for notifications:", error));
      unsubscribes.push(unsubscribeConvo);


      const appointmentsQuery = query(collection(db, 'appointments'), where('partnerId', '==', partnerId));
      const unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              const apptData = change.doc.data();
              const apptId = change.doc.id;
              const apptStatus = apptData.status;

              const notificationIdentifier = `${apptId}-${apptStatus}`;

              if ((change.type === 'added' && apptStatus === 'scheduled') ||
                  (change.type === 'modified' && (apptStatus === 'rescheduled' || apptStatus === 'cancelled'))) {

                  if (!notifiedAppointments.current.has(notificationIdentifier)) {
                      let title = "";
                      let body = "";
                      let apptType = "";

                      if (change.type === 'added') {
                          title = "Nouveau Rendez-vous!";
                          body = `Un nouveau rendez-vous avec ${apptData.clientNames?.join(', ') || 'un client'} est en attente de votre confirmation.`;
                          apptType = 'new_scheduled';
                      } else if (change.type === 'modified') {
                          if (apptStatus === 'rescheduled') {
                              title = "Rendez-vous Reporté!";
                              body = `Le rendez-vous avec ${apptData.clientNames?.join(', ') || 'un client'} a été reporté. Vérifiez les détails!`;
                              apptType = 'rescheduled';
                          } else if (apptStatus === 'cancelled') {
                              title = "Rendez-vous Annulé!";
                              body = `Le rendez-vous avec ${apptData.clientNames?.join(', ') || 'un client'} a été annulé.`;
                              apptType = 'cancelled';
                          }
                      }

                      console.log(`Jey: [PartnerDashboard] Notifying for Appointment: ${apptId}, Status: ${apptStatus}`);
                      sendPushNotification(
                          partnerExpoPushToken,
                          title,
                          body,
                          { type: 'partner_appointment', apptId: apptId, apptType: apptType }
                      );
                      notifiedAppointments.current.add(notificationIdentifier);
                  }
              } else if (change.type === 'modified' && (apptStatus === 'confirmed' || apptStatus === 'completed')) {
                  notifiedAppointments.current.delete(`${apptId}-scheduled`);
                  notifiedAppointments.current.delete(`${apptId}-rescheduled`);
              } else if (change.type === 'removed') {
                  notifiedAppointments.current.delete(notificationIdentifier);
              }
          });
      }, (error) => console.error("Jey: Error listening to appointments for notifications:", error));
      unsubscribes.push(unsubscribeAppointments);


      const surveysQuery = query(collection(db, 'surveys'), where('couponDetails.sponsor', '==', partnerId));
      const unsubscribeSurveys = onSnapshot(surveysQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                  const surveyData = change.doc.data();
                  const surveyId = change.doc.id;
                  if (!notifiedSurveys.current.has(surveyId)) {
                      console.log(`Jey: [PartnerDashboard] NEW SURVEY for Partner: ${surveyData.title}`);
                      sendPushNotification(
                          partnerExpoPushToken,
                          "Nouvelle Enquête!",
                          `Une nouvelle enquête "${surveyData.title}" sponsorisée par vous est disponible.`,
                          { type: 'partner_survey', surveyId: surveyId }
                      );
                      notifiedSurveys.current.add(surveyId);
                  }
              }
          });
      }, (error) => console.error("Jey: Error listening to surveys for notifications:", error));
      unsubscribes.push(unsubscribeSurveys);


      const documentsQuery = query(collection(db, 'documents'), where('partnerId', '==', partnerId));
      const unsubscribeDocuments = onSnapshot(documentsQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') {
                  const docData = change.doc.data();
                  const docId = change.doc.id;
                  if (!docData.receiptURL && !notifiedDocuments.current.has(docId)) {
                      console.log(`Jey: [PartnerDashboard] NEW DOCUMENT for Partner: ${docData.title}`);
                      sendPushNotification(
                          partnerExpoPushToken,
                          "Nouveau Document!",
                          `Un nouveau document "${docData.title}" a été ajouté pour votre entreprise.`,
                          { type: 'partner_document', documentId: docId }
                      );
                      notifiedDocuments.current.add(docId);
                  }
              }
          });
      }, (error) => console.error("Jey: Error listening to documents for notifications:", error));
      unsubscribes.push(unsubscribeDocuments);

    };

    const user = auth.currentUser;
    setCurrentUser(user);
    if (user) {
      console.log("Jey: Authenticated user found, UID:", user.uid);
      fetchPartnerData(user.uid);
      setupPartnerNotifications();
    } else {
      console.log("Jey: No authenticated user found on component mount.");
      setLoading(false);
    }

    return () => {
      console.log("Jey: Unsubscribing all Firestore listeners.");
      unsubscribes.forEach(unsub => unsub());
    };
  }, [fetchPartnerData]);

  const renderReviewItem = ({ item }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
        {/* Uses item.nomUtilisateur (or item.userName if normalized) */}
        <Text style={styles.reviewerName}>{item.nomUtilisateur || "Anonyme"}</Text>
      </View>
      <View style={styles.ratingContainer}>
        {[...Array(5)].map((_, i) => (
          <Image
            key={i}
            source={i < Math.floor(item.rating || item.note) ? RATE_FULL_ICON : RATE_ICON_EMPTY}
            style={[styles.customReviewStarIcon, { tintColor: '#FFD700' }]}
          />
        ))}
        {/* Uses item.rating (or item.note if normalized) */}
        <Text style={styles.ratingText}>{(item.rating || item.note)?.toFixed(1)}</Text>
      </View>
      {/* Uses item.commentaire (or item.comment if normalized) */}
      <Text style={styles.reviewText}>{item.commentaire || item.comment}</Text>
      {/* Uses item.dateCreation (or item.createdAt/timestamp if normalized) */}
      <Text style={styles.reviewDate}>
        {(item.dateCreation)?.toLocaleDateString('fr-FR')} 
      </Text>
    </View>
  );

  const statsCards = [
    {
      icon: <Image source={DOC_ICON} style={[styles.customStatIcon, { tintColor: '#fff' }]} />,
      title: "Documents",
      value: dashboardData.documentsCount,
      color: "#4a6bff",
      onPress: () => navigation.navigate('PartnerDoc', { partnerId: partnerData?.id, partnerName: loggedInUserBusinessName, isAdmin: isAdmin })
    },
    {
      icon: <Image source={CHECKED_APT_ICON} style={[styles.customStatIcon, { tintColor: '#fff' }]} />,
      title: "Confirmées",
      value: dashboardData.confirmedBookings,
      color: "#34C759",
      onPress: () => navigation.navigate('RdvConfirm')
    },
    {
      icon: <Image source={HOLD_APT_ICON} style={[styles.customStatIcon, { tintColor: '#fff' }]} />,
      title: "En Attente",
      value: dashboardData.pendingBookings,
      color: "#FF7043",
      onPress: () => navigation.navigate('PartnerSurvey')
    },
    {
      icon: <Image source={MONEY_BILL_ICON} style={[styles.customStatIcon, { tintColor: '#fff' }]} />,
      title: "Revenus",
      // Ensure we always display a formatted amount string
      value: formatAmount(dashboardData.revenueGenerated, { symbol: '$' }),
      color: "#FBBC05",
      onPress: () => navigation.navigate('RdvConfirm')
    },

    {
      icon: <Image source={CREDIT_CARD_ICON} style={[styles.customStatIcon, { tintColor: '#fff' }]} />,
      title: "Paiements",
      //value: paymentsCount,
      color: "#9C27B0",
      onPress: () => navigation.navigate('ClientPayments', { partnerId: partnerData?.id })
    },
    {
      icon: <Image source={SUPPORT_ER_ICON} style={[styles.customStatIcon, { tintColor: '#fff' }]} />,
      title: "Support ER",
      value: hasNewMessages ? "Nouveau!" : "24/7",
      color: hasNewMessages ? "#FF3B30" : "#EA4335", // Red when new messages
      hasNewMessages: hasNewMessages,
      onPress: () => {
        if (partnerData?.id && loggedInUserBusinessName) {
          navigation.navigate('PartnerAdminChat', {
            partnerId: partnerData.id,
            partnerName: loggedInUserBusinessName,
            userType: 'partner'
          });
        } else {
          Alert.alert("Info", "Chargement des données du partenaire en cours ou non disponibles pour le chat.");
        }
      }
    },
  ];

  const promotionColor = getPromotionColor();
  const daysLeft = getPromotionDaysLeft();
  const promotionIcon = getPromotionIcon();
  const uri = partnerData?.profileImage ? String(partnerData.profileImage) : undefined;

  // Handle floating chat button press
  const handleChatPress = () => {
    if (partnerData?.id) {
      navigation.navigate('PartnerChatList', {
        partnerId: partnerData.id,
        partnerName: loggedInUserBusinessName
      });
    } else {
      Alert.alert("Info", "Chargement des données du partenaire en cours...");
    }
  };

  const responsiveValues = getResponsiveValues();

  if (loading) {
    return (
      <LinearGradient
        colors={['#4facfe', '#00f2fe']}
        style={styles.loadingContainer}
      >
        <StatusBar barStyle="light-content" backgroundColor="#4facfe" />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Chargement du tableau de bord...</Text>
      </LinearGradient>
    );
  }

  if (!partnerData && !loading && !refreshing) {
    return (
      <View style={styles.emptyContainer}>
        <MaterialIcons name="error-outline" size={40} color="#EA4335" />
        <Text style={styles.emptyText}>Erreur: Impossible de charger les données du partenaire.</Text>
        <Text style={styles.emptyText}>Veuillez vous assurer que votre compte utilisateur est lié à un partenaire.</Text>
        <TouchableOpacity onPress={onRefresh} style={{ marginTop: 20, padding: 10, backgroundColor: '#4a6bff', borderRadius: 8 }}>
          <Text style={{ color: 'white', fontWeight: 'bold' }}>Réessayer</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#4facfe" />
      
      {/* Professional Partner Header */}
      <LinearGradient
        colors={['#4facfe', '#00f2fe']}
        style={styles.headerGradient}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.profileSection}
            onPress={() => navigation.navigate('Settings')}
          >
            <View style={styles.profileImageContainer}>
              <Image
                source={partnerData?.assignedUserPhotoURL
                  ? { uri: partnerData.assignedUserPhotoURL }
                  : (partnerData?.profileImage ? { uri: partnerData.profileImage } : require('../../assets/images/Profile.png'))
                }
                style={styles.profilePicture}
              />
              <View style={styles.onlineIndicator} />
            </View>
            <View style={styles.userInfo}>
              <Text style={styles.partnerName}>{loggedInUserBusinessName || 'Mon Entreprise'}</Text>
              <Text style={styles.partnerRole}>
                {partnerData?.isPromoted ? 'Partenaire Premium' : 'Partenaire'}
              </Text>
              <View style={styles.ratingContainer}>
                <Text style={styles.ratingText}>★ {dashboardData.partnerRating.toFixed(1)}</Text>
                <Text style={styles.reviewsCount}>({reviews.length} avis)</Text>
              </View>
            </View>
          </TouchableOpacity>
          
          <View style={styles.headerActions}>
            {partnerData?.id && (
              <TouchableOpacity
                style={styles.storeButton}
                onPress={() => navigation.navigate('PartnerPage', { partnerId: partnerData.id })}
              >
                <Image source={STORE_ICON} style={styles.storeButtonIcon} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={24} color="rgba(255, 255, 255, 0.9)" />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Quick Stats Overview */}
        <View style={styles.quickStatsContainer}>
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatNumber}>{dashboardData.totalAppointments}</Text>
            <Text style={styles.quickStatLabel}>RDV Total</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatNumber}>{dashboardData.confirmedBookings}</Text>
            <Text style={styles.quickStatLabel}>Confirmés</Text>
          </View>
          <View style={styles.quickStatDivider} />
          <View style={styles.quickStatItem}>
            <Text style={styles.quickStatNumber}>{formatAmount(dashboardData.revenueGenerated, { symbol: '$' })}</Text>
            <Text style={styles.quickStatLabel}>Revenus</Text>
          </View>
        </View>
      </LinearGradient>

      {/* Promotion Banner */}
      {partnerData?.estPromu && activeTab !== 'chat' && activeTab !== 'reviews' && (
        <Animated.View
          style={[
            styles.promotionBanner,
            {
              backgroundColor: `${promotionColor}20`,
              borderLeftColor: promotionColor,
              transform: [{ scale: pulseAnim }]
            }
          ]}
        >
          <View style={styles.promotionBannerContent}>
            <Image
              source={promotionIcon}
              style={[styles.customPromotionStatusIcon, { tintColor: promotionColor }]}
            />
            <View style={styles.promotionTextContainer}>
              <Text style={[styles.promotionBannerText, { color: promotionColor }]}>
                {daysLeft <= 0 ?
                  'PROMOTION EXPIRÉE' :
                  daysLeft === 1 ?
                  'DERNIER JOUR DE PROMOTION!' :
                  `Promotion active • ${daysLeft} jour${daysLeft > 1 ? 's' : ''} restant${daysLeft > 1 ? 's' : ''}`
                }
              </Text>
              {daysLeft > 0 && daysLeft <= 7 && (
                <ProgressBar
                  progress={daysLeft / 7}
                  color={promotionColor}
                />
              )}
            </View>
          </View>
        </Animated.View>
      )}

      {/* Main Content Area */}
      <View style={styles.mainContent}>

        {activeTab === 'dashboard' && (
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#4facfe']}
                tintColor="#4facfe"
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {/* Modern Statistics Grid */}
            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>📊 Activités Principales</Text>
              <View style={styles.statsGrid}>
                {statsCards.map((card, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.gridStatCard}
                    onPress={card.onPress}
                  >
                    <LinearGradient
                      colors={[card.color, `${card.color}CC`]}
                      style={styles.gridStatCardGradient}
                    >
                      <View style={styles.gridStatCardIcon}>
                        {card.icon}
                        {card.hasNewMessages && (
                          <View style={styles.messageBadge}>
                            <Text style={styles.messageBadgeText}>!</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[
                        styles.gridStatNumber,
                        card.hasNewMessages && styles.gridStatNumberHighlighted
                      ]}>
                        {card.value}
                      </Text>
                      <Text style={[
                        styles.gridStatLabel,
                        card.hasNewMessages && styles.gridStatLabelHighlighted
                      ]}>
                        {card.title}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Professional Action Cards */}
            <View style={styles.actionsSection}>
              <Text style={styles.sectionTitle}>⚡ Gestion Rapide</Text>
              
              <TouchableOpacity
                style={styles.primaryActionCard}
                onPress={() => navigation.navigate('PartnerSurvey')}
              >
                <LinearGradient
                  colors={['#667eea', '#764ba2']}
                  style={styles.actionCardGradient}
                >
                  <View style={styles.actionCardContent}>
                    <View style={styles.actionCardIcon}>
                      <Image source={CHECKED_APT_ICON} style={[styles.actionIcon, { tintColor: '#fff' }]} />
                    </View>
                    <View style={styles.actionCardText}>
                      <Text style={styles.actionCardTitle}>Rendez-vous & Vérifications</Text>
                      <Text style={styles.actionCardSubtitle}>Gérez vos RDV et promotions client</Text>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={24} color="#fff" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.primaryActionCard}
                onPress={() => navigation.navigate('PartnerDoc', { partnerId: partnerData?.id, partnerName: loggedInUserBusinessName, isAdmin: isAdmin })}
              >
                <LinearGradient
                  colors={['#f093fb', '#f5576c']}
                  style={styles.actionCardGradient}
                >
                  <View style={styles.actionCardContent}>
                    <View style={styles.actionCardIcon}>
                      <Image source={DOC_ICON} style={[styles.actionIcon, { tintColor: '#fff' }]} />
                    </View>
                    <View style={styles.actionCardText}>
                      <Text style={styles.actionCardTitle}>Documents</Text>
                      <Text style={styles.actionCardSubtitle}>Consultez vos documents importants</Text>
                    </View>
                    <Ionicons name="chevron-forward-outline" size={24} color="#fff" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {activeTab === 'payments' && (
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#4facfe']}
                tintColor="#4facfe"
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>💰 Historique des Paiements</Text>
            
            {/* Payment Summary Cards */}
            <View style={styles.paymentSummaryContainer}>
              <View style={styles.paymentSummaryCard}>
                <LinearGradient
                  colors={['#4ecdc4', '#44a08d']}
                  style={styles.paymentCardGradient}
                >
                  <Text style={styles.paymentSummaryLabel}>Revenus Nets</Text>
                  <Text style={styles.paymentSummaryValue}>
                    {formatAmount(dashboardData.revenueGenerated, { symbol: '$' })}
                  </Text>
                </LinearGradient>
              </View>

              <View style={styles.paymentSummaryCard}>
                <LinearGradient
                  colors={['#1976d2', '#64b5f6']}
                  style={styles.paymentCardGradient}
                >
                  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
                    <Image source={CREDIT_CARD_ICON} style={[styles.actionIcon, { tintColor: '#fff' }]} />
                    <Text style={styles.paymentSummaryLabel}>Paiements</Text>
                  </View>
                  <Text style={styles.paymentSummaryValue}>{/* {paymentsCount} */}</Text>
                </LinearGradient>
              </View>

              <View style={styles.paymentSummaryCard}>
                <LinearGradient
                  colors={['#9C27B0', '#8E24AA']}
                  style={styles.paymentCardGradient}
                >
                  <Text style={styles.paymentSummaryLabel}>Avis</Text>
                  <Text style={styles.paymentSummaryValue}>
                    {reviews?.length || 0}
                  </Text>
                </LinearGradient>
              </View>
            </View>

            {/* Payment Management Action */}
            <TouchableOpacity
              style={styles.primaryActionCard}
              onPress={() => navigation.navigate('RdvConfirm')}
            >
              <LinearGradient
                colors={['#16a085', '#1abc9c']}
                style={styles.actionCardGradient}
              >
                <View style={styles.actionCardContent}>
                  <View style={styles.actionCardIcon}>
                    <Image source={MONEY_BILL_ICON} style={[styles.actionIcon, { tintColor: '#fff' }]} />
                  </View>
                  <View style={styles.actionCardText}>
                    <Text style={styles.actionCardTitle}>Gérer les Paiements</Text>
                    <Text style={styles.actionCardSubtitle}>Enregistrez et consultez l'historique</Text>
                  </View>
                  <Ionicons name="chevron-forward-outline" size={24} color="#fff" />
                </View>
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        )}

        {activeTab === 'reviews' && (
          <ScrollView
            style={styles.scrollContainer}
            contentContainerStyle={styles.scrollContent}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                colors={['#4facfe']}
                tintColor="#4facfe"
              />
            }
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sectionTitle}>⭐ Gestion des Avis</Text>
            
            {/* Overall Rating Summary */}
            <View style={styles.ratingOverviewCard}>
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.ratingOverviewGradient}
              >
                <View style={styles.ratingOverviewContent}>
                  <Text style={styles.overallRatingValue}>
                    {dashboardData.partnerRating.toFixed(1)}
                  </Text>
                  <View style={styles.starsContainer}>
                    {[...Array(5)].map((_, i) => (
                      <Ionicons
                        key={`avg_star_${i}`}
                        name={i < Math.floor(dashboardData.partnerRating) ? "star" : "star-outline"}
                        size={20}
                        color="#FFD700"
                      />
                    ))}
                  </View>
                  <Text style={styles.reviewCountText}>
                    Basé sur {reviews.length} avis
                  </Text>
                </View>
              </LinearGradient>
            </View>

            {/* Reviews List or Empty State */}
            {reviews.length > 0 ? (
              <View style={styles.reviewsList}>
                {reviews.slice(0, 3).map((review) => (
                  <View key={review.id} style={styles.reviewCard}>
                    <LinearGradient
                      colors={['#ffffff', '#f8f9fa']}
                      style={styles.reviewCardGradient}
                    >
                      <View style={styles.reviewHeader}>
                        <Text style={styles.reviewerName}>{review.userName || 'Client'}</Text>
                        <View style={styles.reviewRating}>
                          {[...Array(5)].map((_, i) => (
                            <Ionicons
                              key={`review_star_${i}`}
                              name={i < review.rating ? "star" : "star-outline"}
                              size={16}
                              color="#FFD700"
                            />
                          ))}
                        </View>
                      </View>
                      {review.comment && (
                        <Text style={styles.reviewComment}>{review.comment}</Text>
                      )}
                      <Text style={styles.reviewDate}>
                        {new Date(review.date?.toDate()).toLocaleDateString('fr-FR')}
                      </Text>
                    </LinearGradient>
                  </View>
                ))}
                
                {reviews.length > 3 && (
                  <TouchableOpacity
                    style={styles.viewAllReviewsButton}
                    onPress={() => navigation.navigate('PartnerReviews')}
                  >
                    <Text style={styles.viewAllReviewsText}>
                      Voir tous les {reviews.length} avis
                    </Text>
                    <Ionicons name="chevron-forward-outline" size={20} color="#4facfe" />
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.emptyReviewsState}>
                <LinearGradient
                  colors={['#f8f9fa', '#e9ecef']}
                  style={styles.emptyStateGradient}
                >
                  <Ionicons name="star-outline" size={48} color="#6c757d" />
                  <Text style={styles.emptyStateTitle}>Aucun avis pour le moment</Text>
                  <Text style={styles.emptyStateSubtitle}>
                    Vos premiers avis clients apparaîtront ici
                  </Text>
                </LinearGradient>
              </View>
            )}
          </ScrollView>
        )}
        </View>



        {/* Bottom Navigation */}
        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setActiveTab('dashboard')}
          >
            <Ionicons 
              name={activeTab === 'dashboard' ? 'grid' : 'grid-outline'} 
              size={22} 
              color={activeTab === 'dashboard' ? '#4facfe' : '#6c757d'} 
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'dashboard' ? '#4facfe' : '#6c757d' }
            ]}>
              Tableau
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setActiveTab('payments')}
          >
            <Ionicons 
              name={activeTab === 'payments' ? 'card' : 'card-outline'} 
              size={22} 
              color={activeTab === 'payments' ? '#4facfe' : '#6c757d'} 
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'payments' ? '#4facfe' : '#6c757d' }
            ]}>
              Paiements
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setActiveTab('reviews')}
          >
            <Ionicons 
              name={activeTab === 'reviews' ? 'star' : 'star-outline'} 
              size={22} 
              color={activeTab === 'reviews' ? '#4facfe' : '#6c757d'} 
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'reviews' ? '#4facfe' : '#6c757d' }
            ]}>
              Avis
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => {
              if (partnerData?.id && loggedInUserBusinessName) {
                navigation.navigate('PartnerAdminChat', {
                  partnerId: partnerData.id,
                  partnerName: loggedInUserBusinessName,
                  userType: 'partner'
                });
              } else {
                Alert.alert("Info", "Chargement des données du partenaire en cours ou non disponibles pour le chat.");
              }
            }}
          >
            <Ionicons 
              name="help-circle-outline" 
              size={22} 
              color="#6c757d" 
            />
            <Text style={[
              styles.navButtonText,
              { color: '#6c757d' }
            ]}>
              Support
            </Text>
          </TouchableOpacity>
        </View>

        {/* Floating Chat Button */}
        {partnerData?.id && (
          <Animated.View 
            style={[
              styles.floatingChatButton,
              {
                transform: [{ scale: chatPulseAnim }]
              }
            ]}
          >
            <TouchableOpacity
              style={styles.chatButton}
              onPress={handleChatPress}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons 
                name="chat" 
                size={28} 
                color="#fff" 
              />
              {unreadChatsCount > 0 && (
                <View style={styles.chatBadge}>
                  <Text style={styles.chatBadgeText}>
                    {unreadChatsCount > 99 ? '99+' : unreadChatsCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
      </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 23,
    borderRadius: 20,
    padding: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  userRole: {
    fontSize: 14,
    color: '#666',
  },
  // --- NEW STYLES ---
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  storeIconContainer: {
    marginRight: 15, // Space between store icon and logo
    padding: 5, // Make it easier to tap
  },
  storeIcon: {
    width: 28, // Adjust size as needed
    height: 28, // Adjust size as needed
    resizeMode: 'contain',
    tintColor: '#4a6bff', // Example tint color
  },
  // --- END NEW STYLES ---
  logo: {
    width: 70,
    height: 50,
    resizeMode: 'contain',
  },
  promotionBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  promotionBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  promotionTextContainer: {
    marginLeft: 8,
    flex: 1,
  },
  promotionBannerText: {
    fontSize: 14,
    fontWeight: '500',
  },
  progressBarContainer: {
    height: 4,
    width: '100%',
    backgroundColor: '#e0e0e0',
    borderRadius: 2,
    marginTop: 8,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
  contentContainer: {
    paddingBottom: 80,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginVertical: 16,
    marginHorizontal: 16,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
  },
  statCard: {
    width: '48%',
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statIcon: {
    marginBottom: 8,
  },
  customStatIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  actionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginHorizontal: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 5,
    borderLeftWidth: 6,
    borderColor: '#4a6bff',
  },
  actionCardTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 10,
    textAlign: 'center',
  },
  actionCardText: {
    fontSize: 15,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  actionButton: {
    backgroundColor: '#4a6bff',
    paddingVertical: 14,
    paddingHorizontal: 25,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4a6bff',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  actionButtonText: {
    color: 'white',
    fontWeight: '700',
    fontSize: 16,
    textTransform: 'uppercase',
  },
  customActionArrowIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    tintColor: 'white',
    marginLeft: 8,
  },
  paymentSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  paymentSummaryItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    width: '48%',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  paymentSummaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  paymentSummaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  paymentCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  paymentDate: {
    fontSize: 14,
    color: '#333',
  },
  paymentStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  paymentStatusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  paymentAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  paymentDescription: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  reviewCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
    alignItems: 'center',
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  customReviewStarIcon: {
    width: 16,
    height: 16,
    resizeMode: 'contain',
    marginHorizontal: 1,
  },
  ratingText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 4,
  },
  reviewDate: {
    fontSize: 12,
    color: '#999',
    marginLeft: 8,
  },
  reviewText: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
  },
  reviewsHeader: {
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  overallRatingContainer: {
    alignItems: 'center',
    marginBottom: 16,
  },
  overallRatingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  ratingStars: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  reviewCount: {
    fontSize: 14,
    color: '#666',
  },
  bottomNav: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 12,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  navButton: {
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  customNavIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
  navButtonText: {
    fontSize: 12,
    marginTop: 4,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 4,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  submitButton: {
    backgroundColor: '#4a6bff',
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
  },
  boostOption: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    position: 'relative',
  },
  premiumOption: {
    borderWidth: 2,
    borderColor: '#4a6bff',
  },
  premiumBadge: {
    position: 'absolute',
    top: -10,
    right: 16,
    backgroundColor: '#4a6bff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  premiumBadgeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  boostOptionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  boostOptionPrice: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4a6bff',
    marginBottom: 8,
  },
  boostOptionDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginBottom: 8,
  },
  boostBenefits: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  boostBenefit: {
    backgroundColor: '#E6F4EA',
    color: '#34A853',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    fontSize: 12,
    fontWeight: '500',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    marginHorizontal: 16,
    backgroundColor: 'white',
    borderRadius: 8,
    minHeight: 200,
  },
  customEmptyReviewsGif: {
    width: 100,
    height: 100,
    resizeMode: 'contain',
    marginBottom: 10,
  },
  emptyText: {
    marginTop: 16,
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  customPromotionStatusIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
  },
  floatingChatButton: {
    position: 'absolute',
    bottom: 100, // Above the bottom navigation
    right: 20,
    zIndex: 1000,
  },
  chatButton: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#25D366', // WhatsApp green color
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    position: 'relative',
  },
  chatBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF3B30',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  chatBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  // Professional UI Styles
  mainContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  mainContent: {
    flex: 1,
  },
  statsSection: {
    marginBottom: 25,
  },
  statsScrollView: {
    paddingHorizontal: 5,
  },
  statsScrollContent: {
    paddingHorizontal: 10,
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modernStatLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 10,
    fontWeight: '600',
  },
  modernStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
  },
  actionsSection: {
    marginBottom: 25,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  gridStatCard: {
    width: '48%',
    marginBottom: 15,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  gridStatCardGradient: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  gridStatCardIcon: {
    marginBottom: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridStatNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  gridStatLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontWeight: '600',
  },
  customStatIcon: {
    width: 32,
    height: 32,
    resizeMode: 'contain',
  },
  customReviewStarIcon: {
    width: 16,
    height: 16,
    marginHorizontal: 1,
  },
  customPromotionStatusIcon: {
    width: 20,
    height: 20,
    marginRight: 8,
  },
  headerGradient: {
    paddingTop: 45,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileImageContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.3)',
    overflow: 'hidden',
    position: 'relative',
  },
  profileImage: {
    width: '100%',
    height: '100%',
  },
  profilePicture: {
    width: '100%',
    height: '100%',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: '#fff',
  },
  userInfo: {
    flex: 1,
  },
  partnerRole: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 4,
  },
  reviewsCount: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.7)',
    marginLeft: 5,
  },
  storeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  storeButtonIcon: {
    width: 20,
    height: 20,
    tintColor: '#fff',
  },
  quickStatsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 15,
    padding: 15,
    marginTop: 15,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  quickStatItem: {
    alignItems: 'center',
    flex: 1,
  },
  quickStatNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  quickStatDivider: {
    width: 1,
    height: 30,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 10,
  },
  profileInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 2,
  },
  partnerCategory: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 4,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginLeft: 5,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickStatsBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 15,
    padding: 15,
    marginTop: 15,
  },
  quickStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  quickStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  quickStatLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 20,
  },
  statisticsContainer: {
    marginBottom: 25,
  },
  statisticsScrollView: {
    paddingHorizontal: 5,
  },
  modernStatCard: {
    width: getResponsiveValues().statCardWidth,
    marginRight: 15,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  statCardGradient: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 120,
  },
  statValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 18,
  },
  actionsContainer: {
    marginBottom: 25,
  },
  primaryActionCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 15,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  actionCardGradient: {
    padding: 20,
  },
  actionCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionCardIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  actionIcon: {
    width: 28,
    height: 28,
  },
  actionCardText: {
    flex: 1,
  },
  actionCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 4,
  },
  actionCardSubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  paymentSummaryContainer: {
    flexDirection: 'row',
    marginBottom: 25,
  },
  paymentSummaryCard: {
    flex: 1,
    marginRight: 10,
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  paymentCardGradient: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 100,
  },
  paymentSummaryLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginBottom: 8,
    textAlign: 'center',
  },
  paymentSummaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#fff',
    textAlign: 'center',
  },
  ratingOverviewCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 25,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  ratingOverviewGradient: {
    padding: 25,
    alignItems: 'center',
  },
  ratingOverviewContent: {
    alignItems: 'center',
  },
  overallRatingValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  reviewCountText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
  },
  reviewsList: {
    marginBottom: 20,
  },
  reviewCard: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  reviewCardGradient: {
    padding: 15,
  },
  reviewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reviewerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2c3e50',
  },
  reviewRating: {
    flexDirection: 'row',
  },
  reviewComment: {
    fontSize: 14,
    color: '#5a6c7d',
    lineHeight: 20,
    marginBottom: 8,
  },
  reviewDate: {
    fontSize: 12,
    color: '#95a5a6',
  },
  viewAllReviewsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#4facfe',
  },
  viewAllReviewsText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#4facfe',
    marginRight: 8,
  },
  emptyReviewsState: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  emptyStateGradient: {
    padding: 40,
    alignItems: 'center',
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#495057',
    marginTop: 15,
    marginBottom: 8,
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#6c757d',
    textAlign: 'center',
  },
  bottomNav: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
  },
  navButtonText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 4,
  },
  messageBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  messageBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  gridStatNumberHighlighted: {
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  gridStatLabelHighlighted: {
    color: '#fff',
    fontWeight: 'bold',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  CREDIT_CARD_ICON: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
  },
});

export default PartnerDashboard;
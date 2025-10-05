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
  ScrollView
} from 'react-native';
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [loggedInUserBusinessName, setLoggedInUserBusinessName] = useState('');
  const [reviews, setReviews] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    documentsCount: 0,
    confirmedBookings: 0,
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

      console.log("Jey: Processing appointments for partnerId:", partnerId);
      allRdvQuerySnapshot.forEach(doc => {
          const rdvData = doc.data();
          console.log(`Jey: Appointment ID: ${doc.id}, Status: ${rdvData.status}`);
          totalAppointments++;
          if (rdvData.status === 'confirmed' || rdvData.status === 'completed') {
              confirmedBookings++;
          }
      });
      console.log("Jey: Calculated confirmedBookings:", confirmedBookings);

      const documentsQuery = query(
          collection(db, 'documents'),
          where('partnerId', '==', partnerId)
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documentsCount = documentsSnapshot.size;

      let revenueGenerated = 0;
      let commissionEarned = 0;
      const revenueTransactionsQuery = query(
          collection(db, 'partners', partnerId, 'revenue_transactions')
      );
      const revenueTransactionsSnapshot = await getDocs(revenueTransactionsQuery);

      revenueTransactionsSnapshot.forEach(doc => {
          const transaction = doc.data();
          if (typeof transaction.amountReceived === 'number' && typeof transaction.commissionAmount === 'number') {
              revenueGenerated += (transaction.amountReceived - transaction.commissionAmount);
              commissionEarned += transaction.commissionAmount;
          } else if (typeof transaction.amountReceived === 'number') {
              revenueGenerated += transaction.amountReceived;
          }
      });

      setDashboardData(prevData => ({
        ...prevData,
        totalAppointments: totalAppointments,
        confirmedBookings: confirmedBookings,
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
      icon: <Image source={DOC_ICON} style={[styles.customStatIcon, { tintColor: '#4a6bff' }]} />,
      title: "Documents",
      value: dashboardData.documentsCount,
      color: "#4a6bff",
      onPress: () => navigation.navigate('PartnerDoc', { partnerId: partnerData?.id, partnerName: loggedInUserBusinessName, isAdmin: isAdmin })
    },
    {
      icon: <Image source={CHECKED_APT_ICON} style={[styles.customStatIcon, { tintColor: '#34C759' }]} />,
      title: "Confirmées",
      value: dashboardData.confirmedBookings,
      color: "#34C759",
      onPress: () => navigation.navigate('RdvConfirm')
    },
    {
      icon: <Image source={HOLD_APT_ICON} style={[styles.customStatIcon, { tintColor: '#FF7043' }]} />,
      title: "Rendez-vous",
      value: dashboardData.totalAppointments,
      color: "#FF7043",
      onPress: () => navigation.navigate('PartnerSurvey')
    },
    {
      icon: <Image source={MONEY_BILL_ICON} style={[styles.customStatIcon, { tintColor: '#FBBC05' }]} />,
      title: "Revenus",
      value: `${dashboardData.revenueGenerated.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}`,
      color: "#FBBC05",
      onPress: () => navigation.navigate('RdvConfirm')
    },
    {
      icon: <Image source={MONEY_COMMISSION_ICON} style={[styles.customStatIcon, { tintColor: '#9C27B0' }]} />,
      title: "Commission",
      value: `${dashboardData.commissionEarned.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}`,
      color: "#9C27B0",
      onPress: () => navigation.navigate('RdvConfirm')
    },
    {
      icon: <Image source={SUPPORT_ER_ICON} style={[styles.customStatIcon, { tintColor: '#EA4335' }]} />,
      title: "Support ER",
      value: "",
      color: "#EA4335",
      onPress: () => {
        if (partnerData?.id && loggedInUserBusinessName) {
          navigation.navigate('SupportChat', {
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

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a6bff" />
        <Text style={{ marginTop: 10, color: '#666' }}>Chargement du tableau de bord...</Text>
      </View>
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
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.profileContainer}
            onPress={() => navigation.navigate('Settings')}
          >
            <Image
              source={partnerData?.assignedUserPhotoURL
                ? { uri: partnerData.assignedUserPhotoURL }
                : (partnerData?.profileImage ? { uri: partnerData.profileImage } : require('../../assets/images/Profile.png'))
              }
              style={styles.profileImage}
            />
            <View>
              <Text style={styles.userName}>{loggedInUserBusinessName || 'Mon Entreprise'}</Text>
              {partnerData?.isPromoted && (
                <Text style={styles.userRole}>Partenaire Premium</Text>
              )}
            </View>
          </TouchableOpacity>
          {/* --- NEW: Store Icon and Logo Container --- */}
          <View style={styles.headerRight}>
            {partnerData?.id && ( // Only show if partnerData is loaded
              <TouchableOpacity
                style={styles.storeIconContainer}
                onPress={() => navigation.navigate('PartnerPage', { partnerId: partnerData.id })}
              >
                <Image source={STORE_ICON} style={styles.storeIcon} />
              </TouchableOpacity>
            )}
            <Image
              source={require('../../assets/images/logoVide.png')}
              style={styles.logo}
            />
          </View>
          {/* --- END NEW --- */}
        </View>

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

        <View style={{ flex: 1 }}>
          {activeTab === 'dashboard' && (
            <FlatList
              data={[]}
              renderItem={null}
              ListHeaderComponent={
                <>
                  <Text style={styles.sectionTitle}>Résumé des Activités</Text>
                  <View style={styles.statsContainer}>
                    {statsCards.map((card, index) => (
                      <TouchableOpacity
                        key={index}
                        style={[styles.statCard, { borderLeftColor: card.color }]}
                        onPress={card.onPress}
                      >
                        <View style={styles.statIcon}>
                          {card.icon}
                        </View>
                        <Text style={styles.statValue}>{card.value}</Text>
                        <Text style={styles.statLabel}>{card.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.actionCard}>
                    <Text style={styles.actionCardTitle}>Gérez vos Rendez-vous & Vérifications</Text>
                    <Text style={styles.actionCardText}>
                      Consultez et confirmez vos rendez-vous, et gérez vos promotions client.
                    </Text>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => navigation.navigate('PartnerSurvey')}
                    >
                      <Text style={styles.actionButtonText}>Accéder aux Rendez-vous & Vérifications</Text>
                      <Image source={ARROW_RIGHT_SHORT_ICON} style={styles.customActionArrowIcon} />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.actionCard}>
                    <Text style={styles.actionCardTitle}>Gérez vos Documents</Text>
                    <Text style={styles.actionCardText}>
                      Consultez et téléchargez les documents importants pour votre entreprise.
                    </Text>
                    <TouchableOpacity
                      style={styles.actionButton}
                      onPress={() => navigation.navigate('PartnerDoc', { partnerId: partnerData?.id, partnerName: loggedInUserBusinessName, isAdmin: isAdmin })}
                    >
                      <Text style={styles.actionButtonText}>Accéder aux Documents</Text>
                      <Image source={ARROW_RIGHT_SHORT_ICON} style={styles.customActionArrowIcon} />
                    </TouchableOpacity>
                  </View>
                </>
              }
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#4a6bff']}
                />
              }
              contentContainerStyle={styles.contentContainer}
            />
          )}

          {activeTab === 'payments' && (
            <ScrollView
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#4a6bff']}
                />
              }
              contentContainerStyle={styles.contentContainer}
            >
              <Text style={styles.sectionTitle}>Historique des Paiements</Text>
              <View style={styles.paymentSummary}>
                <View style={styles.paymentSummaryItem}>
                  <Text style={styles.paymentSummaryLabel}>Total Revenus (Net)</Text>
                  <Text style={styles.paymentSummaryValue}>
                    {dashboardData.revenueGenerated.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                  </Text>
                </View>
                <View style={styles.paymentSummaryItem}>
                  <Text style={styles.paymentSummaryLabel}>Commission totale EliteReply</Text>
                  <Text style={[styles.paymentSummaryValue, { color: '#9C27B0' }]}>
                    {dashboardData.commissionEarned.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                  </Text>
                </View>
              </View>

              <View style={[styles.actionCard, { borderColor: '#16a085' }]}>
                    <Text style={styles.actionCardTitle}>Gérer les Paiements Clients</Text>
                    <Text style={styles.actionCardText}>
                      Enregistrez les paiements pour les rendez-vous confirmés et consultez l'historique détaillé.
                    </Text>
                    <TouchableOpacity
                      style={[styles.actionButton, { backgroundColor: '#16a085' }]}
                      onPress={() => navigation.navigate('RdvConfirm')}
                    >
                      <Text style={styles.actionButtonText}>Accéder aux Paiements RDV</Text>
                      <Image source={RIGHT_ENTER_ICON_PARTNER} style={styles.customActionArrowIcon} />
                    </TouchableOpacity>
                  </View>
            </ScrollView>
          )}

          {activeTab === 'reviews' && (
            <FlatList
              data={reviews}
              keyExtractor={(item) => item.id} // Simplified keyExtractor as reviews are now unique IDs from partnerRatings
              renderItem={renderReviewItem}
              ListHeaderComponent={
                <View style={styles.reviewsHeader}>
                  <Text style={styles.sectionTitle}>Avis des Clients</Text>
                  <View style={styles.overallRatingContainer}>
                    <Text style={styles.overallRatingText}>
                      Note moyenne: {dashboardData.partnerRating.toFixed(1)}/5
                    </Text>
                    <View style={styles.ratingStars}>
                      {[...Array(5)].map((_, i) => (
                        <Image
                          key={`avg_star_${i}`}
                          source={i < Math.floor(dashboardData.partnerRating) ? RATE_FULL_ICON : RATE_ICON_EMPTY}
                          style={[styles.customReviewStarIcon, { tintColor: '#FFD700' }]}
                        />
                      ))}
                    </View>
                    <Text style={styles.reviewCount}>
                      Basé sur {reviews.length} avis
                    </Text>
                  </View>
                </View>
              }
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <Image source={REVIEW_ANIM_GIF} style={styles.customEmptyReviewsGif} />
                  <Text style={styles.emptyText}>Aucun avis pour le moment</Text>
                </View>
              }
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  colors={['#4a6bff']}
                />
              }
              contentContainerStyle={[
                styles.contentContainer,
                reviews.length === 0 && { flex: 1 }
              ]}
            />
          )}
        </View>

        <View style={styles.bottomNav}>
          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setActiveTab('dashboard')}
          >
            <Image
              source={DASHBOARD_ICON}
              style={[styles.customNavIcon, { tintColor: activeTab === 'dashboard' ? '#4a6bff' : '#666' }]}
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'dashboard' ? '#4a6bff' : '#666' }
            ]}>
              Tableau
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setActiveTab('payments')}
          >
            <Image
              source={CREDIT_CARD_ICON}
              style={[styles.customNavIcon, { tintColor: activeTab === 'payments' ? '#4a6bff' : '#666' }]}
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'payments' ? '#4a6bff' : '#666' }
            ]}>
              Paiements
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => setActiveTab('reviews')}
          >
            <Image
              source={RATE_HALF_ICON_NAV}
              style={[styles.customNavIcon, { tintColor: activeTab === 'reviews' ? '#4a6bff' : '#666' }]}
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'reviews' ? '#4a6bff' : '#666' }
            ]}>
              Avis
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.navButton}
            onPress={() => {
              if (partnerData?.id && loggedInUserBusinessName) {
                navigation.navigate('SupportChat', {
                  partnerId: partnerData.id,
                  partnerName: loggedInUserBusinessName,
                  userType: 'partner'
                });
              } else {
                Alert.alert("Info", "Chargement des données du partenaire en cours ou non disponibles pour le chat.");
              }
            }}
          >
            <Image
              source={SUPPORT_ER_ICON}
              style={[styles.customNavIcon, { tintColor: activeTab === 'chat' ? '#4a6bff' : '#666' }]}
            />
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'chat' ? '#4a6bff' : '#666' }
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
      </SafeAreaView>
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
});

export default PartnerDashboard;
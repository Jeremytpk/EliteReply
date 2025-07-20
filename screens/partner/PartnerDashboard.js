import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList, // Used for Dashboard and Reviews tabs
  Image,
  SafeAreaView,
  Alert,
  ActivityIndicator,
  RefreshControl, // Import RefreshControl
  Animated,
  Easing,
  ScrollView // Used for Payments tab
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
  onSnapshot // Import onSnapshot for real-time listeners
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

// --- NEW IMPORT for this request (GIF) ---
const REVIEW_ANIM_GIF = require('../../assets/gif/review_anim.gif');
// --- END NEW IMPORTS ---

// --- Jey's Addition: Import the new notification service ---
import { sendPushNotification } from '../../services/notifications'; // ASSUMING this path is correct
// --- END Jey's Addition ---

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
  const [refreshing, setRefreshing] = useState(false); // State for refresh indicator
  const [currentUser, setCurrentUser] = useState(null);
  const [partnerData, setPartnerData] = useState(null);
  const [loggedInUserBusinessName, setLoggedInUserBusinessName] = useState('');
  const [reviews, setReviews] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    documentsCount: 0,
    confirmedBookings: 0,
    totalAppointments: 0,
    revenueGenerated: 0, // This will now represent partner's net revenue
    commissionEarned: 0,
    partnerRating: 0,
    unpaidCommissions: 0,
    couponsCount: 0,
  });
  const [activeTab, setActiveTab] = useState('dashboard');
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // --- NEW REFS FOR NOTIFICATIONS ---
  const notifiedMessages = useRef(new Set()); // To track messages already notified
  const notifiedAppointments = useRef(new Set()); // To track appointments already notified
  const notifiedSurveys = useRef(new Set()); // To track surveys already notified
  const notifiedDocuments = useRef(new Set()); // To track documents already notified
  // --- END NEW REFS ---

  // NOTE: The `sendPushNotification` function itself has been MOVED to services/notifications.js
  // It is now imported above.

  // Promotion functions (no changes)
  const getPromotionColor = () => {
    if (!partnerData?.estPromu || !partnerData.promotionEndDate) return '#34C759';

    const endDate = new Date(partnerData.promotionEndDate);
    const today = new Date();
    const diffTime = Math.abs(endDate - today);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Fix: `daysLeft` was not defined here. Assuming it means `diffDays`
    const daysLeft = diffDays; // This was missing in your original snippet here

    if (daysLeft <= 1) return '#FF0000'; // Very short time left, urgent red
    if (daysLeft <= 2) return '#FF3B30'; // Few days left, strong red
    if (daysLeft <= 5) return '#FF5E3A'; // Medium-short, orange-red
    if (daysLeft <= 7) return '#FF9500'; // Week left, orange
    // If promotion duration is 14 or 30 days, it starts green and eventually goes to orange/red
    return '#25c15b'; // Default green for active/longer promotion
  };

  const getPromotionDaysLeft = () => {
    if (!partnerData?.estPromu || !partnerData.promotionEndDate) return 0;

    const endDate = new Date(partnerData.promotionEndDate);
    const today = new Date();
    const diffTime = endDate.getTime() - today.getTime(); // Use non-absolute for accurate "days left"
    return Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24))); // Ensure no negative days
  };

  const getPromotionIcon = () => {
    const daysLeft = getPromotionDaysLeft();

    if (daysLeft <= 1) return 'flash';
    if (daysLeft <= 3) return 'alert-circle';
    if (daysLeft <= 7) return 'timer';
    return 'rocket';
  };

  // Pulse animation effect (no changes)
  useEffect(() => {
    const daysLeft = getPromotionDaysLeft();

    if (daysLeft > 0 && daysLeft <= 7) { // Only animate if promotion is active and nearing end
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
      pulseAnim.stopAnimation(); // Stop animation if not promoted or not nearing end
      pulseAnim.setValue(1); // Reset scale
    }

    return () => {
      pulseAnim.stopAnimation();
    };
  }, [partnerData?.promotionEndDate, partnerData?.estPromu, pulseAnim]); // Added isPromoted to dependencies

  // Fetch reviews (no changes, but ensure evaluations collection exists and partnerId is correct)
  const fetchReviews = useCallback(async (partnerId) => {
    try {
      const partnerReviewsQuery = query(
        collection(db, 'partners', partnerId, 'evaluations'),
        orderBy("dateCreation", "desc")
      );
      const partnerReviewsSnapshot = await getDocs(partnerReviewsQuery);

      const generalReviewsQuery = query(
        collection(db, 'evaluations'),
        where("partnerId", "==", partnerId),
        orderBy("dateCreation", "desc")
      );
      const generalReviewsSnapshot = await getDocs(generalReviewsQuery);

      const uniqueReviewIds = new Set();
      const partnerReviews = partnerReviewsSnapshot.docs
        .filter(doc => !uniqueReviewIds.has(doc.id))
        .map(doc => {
          uniqueReviewIds.add(doc.id);
          return {
            id: doc.id,
            ...doc.data(),
            dateCreation: doc.data().dateCreation?.toDate(),
            isPartnerReview: true
          };
        });

      const generalReviews = generalReviewsSnapshot.docs
        .filter(doc => !uniqueReviewIds.has(doc.id))
        .map(doc => {
          uniqueReviewIds.add(doc.id);
          return {
            id: doc.id,
            ...doc.data(),
            dateCreation: doc.data().dateCreation?.toDate(),
            isPartnerReview: false
          };
        });

      const combinedReviews = [
        ...partnerReviews,
        ...generalReviews
      ].sort((a, b) => b.dateCreation - a.dateCreation);

      setReviews(combinedReviews);
    }
    catch (error) {
      console.error("Error fetching reviews:", error);
      Alert.alert("Erreur", "Problème de chargement des avis");
      setReviews([]);
    }
  }, []);

  const fetchPartnerData = useCallback(async (userId) => {
    try {
      setLoading(true);
      const userRef = doc(db, 'users', userId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        Alert.alert("Erreur", "Document utilisateur non trouvé");
        setPartnerData(null);
        setLoggedInUserBusinessName('');
        return;
      }

      const userData = userSnap.data();
      setLoggedInUserBusinessName(userData.partnerName || 'Mon Entreprise');
      setIsAdmin(userData.isAdmin || false);

      const partnerId = userData.partnerId;

      if (!partnerId) {
        Alert.alert("Erreur", "Aucun ID partenaire trouvé pour cet utilisateur. Assurez-vous que votre compte est lié à un partenaire.");
        setPartnerData(null);
        return;
      }

      const partnerRef = doc(db, 'partners', partnerId);
      const partnerSnap = await getDoc(partnerRef);

      if (partnerSnap.exists()) {
        const data = { id: partnerSnap.id, ...partnerSnap.data() };
        setPartnerData(data);
        const avgRating = data.averageRating || 0;
        setDashboardData(prev => ({ ...prev, partnerRating: avgRating }));
      } else {
        Alert.alert("Erreur", "Document partenaire non trouvé pour l'ID: " + partnerId);
        setPartnerData(null);
        return;
      }

      await fetchReviews(partnerId);

      const allRdvsQuery = query(
        collection(db, 'appointments'),
        where('partnerId', '==', partnerId)
      );
      const allRdvQuerySnapshot = await getDocs(allRdvsQuery);

      let totalAppointments = 0;
      let confirmedBookings = 0;

      allRdvQuerySnapshot.forEach(doc => {
          const rdvData = doc.data();
          totalAppointments++;
          if (rdvData.status === 'confirmed' || rdvData.status === 'completed') {
              confirmedBookings++;
          }
      });

      const documentsQuery = query(
          collection(db, 'documents'),
          where('partnerId', '==', partnerId)
      );
      const documentsSnapshot = await getDocs(documentsQuery);
      const documentsCount = documentsSnapshot.size;

      let revenueGenerated = 0; // This will store the partner's net revenue
      let commissionEarned = 0;
      const revenueTransactionsQuery = query(
          collection(db, 'partners', partnerId, 'revenue_transactions')
      );
      const revenueTransactionsSnapshot = await getDocs(revenueTransactionsQuery);

      revenueTransactionsSnapshot.forEach(doc => {
          const transaction = doc.data();
          if (typeof transaction.amountReceived === 'number' && typeof transaction.commissionAmount === 'number') {
              revenueGenerated += (transaction.amountReceived - transaction.commissionAmount); // Calculate net revenue
              commissionEarned += transaction.commissionAmount;
          } else if (typeof transaction.amountReceived === 'number') { // Fallback if commission is missing
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
        requestsReceived: documentsCount, // This might be redundant if documentsCount is used directly
      }));

    } catch (error) {
      console.error("Erreur lors de la récupération des données:", error);
      Alert.alert("Erreur", "Échec du chargement des données du partenaire: " + error.message);
      setPartnerData(null);
      setLoggedInUserBusinessName('');
    } finally {
      setLoading(false);
      setRefreshing(false); // Stop the refreshing indicator
    }
  }, [fetchReviews]);

  // Callback for pull-to-refresh
  const onRefresh = useCallback(() => {
    setRefreshing(true); // Start the refreshing indicator
    if (currentUser) {
      fetchPartnerData(currentUser.uid);
    } else {
      setRefreshing(false); // If no user, stop refreshing immediately
    }
  }, [currentUser, fetchPartnerData]);

  useEffect(() => {
    let unsubscribes = []; // To store all unsubscribe functions for cleanup

    const setupPartnerNotifications = async () => {
      const user = auth.currentUser;
      if (!user) {
        console.warn("No authenticated user for PartnerDashboard notifications.");
        return;
      }

      // Fetch the current user's (partner's) document to get their partnerId and ExpoPushToken
      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (!userDocSnap.exists()) {
        console.warn("Partner user document not found for notifications.");
        return;
      }
      const partnerId = userDocSnap.data().partnerId;
      const partnerExpoPushToken = userDocSnap.data().expoPushToken;
      const currentUserName = userDocSnap.data().name || user.displayName || 'Partenaire';


      if (!partnerId || !partnerExpoPushToken) {
        console.warn("Partner ID or ExpoPushToken missing for notifications.");
        return;
      }

      // Listener 1: New messages in partnerConversations (from Support/Client to Partner)
      // Listen to the main partnerConversation document for lastMessage updates
      const partnerConvoQuery = query(collection(db, 'partnerConversations'), where('id', '==', partnerId)); // Assuming partnerId is doc ID
      const unsubscribeConvo = onSnapshot(partnerConvoQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              const convoData = change.doc.data();
              const convoId = change.doc.id;
              // Trigger notification if a new message is from support/client and it's marked unread for partner
              if ((change.type === 'added' || change.type === 'modified') &&
                  convoData.lastMessageSender !== partnerId && // Not sent by this partner
                  convoData.unreadByPartner === true && // Marked unread for partner
                  !notifiedMessages.current.has(convoId)) {

                  console.log(`[PartnerDashboard] NEW UNREAD MESSAGE for Partner: ${convoData.lastMessage}`);
                  // --- Using imported sendPushNotification ---
                  sendPushNotification(
                      partnerExpoPushToken,
                      `Nouveau message de ${convoData.lastMessageSenderName || 'Support EliteReply'}!`,
                      convoData.lastMessage,
                      { type: 'partner_chat_message', partnerId: convoId }
                  );
                  notifiedMessages.current.add(convoId); // Mark as notified
              } else if (change.type === 'modified' && convoData.unreadByPartner === false) {
                  // If partner reads it, remove from notified set
                  notifiedMessages.current.delete(convoId);
              }
          });
      }, (error) => console.error("Error listening to partner conversations for notifications:", error));
      unsubscribes.push(unsubscribeConvo);


      // Listener 2: New Rendez-vous or Status Changes
      const appointmentsQuery = query(collection(db, 'appointments'), where('partnerId', '==', partnerId));
      const unsubscribeAppointments = onSnapshot(appointmentsQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              const apptData = change.doc.data();
              const apptId = change.doc.id;
              const apptStatus = apptData.status;

              // Unique identifier for notification (ID + Status to notify on status changes)
              const notificationIdentifier = `${apptId}-${apptStatus}`;

              // Notify if new appointment or a status change that is relevant
              if ((change.type === 'added' && apptStatus === 'scheduled') || // New scheduled appointment
                  (change.type === 'modified' && (apptStatus === 'rescheduled' || apptStatus === 'cancelled'))) { // Status change to rescheduled/cancelled

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

                      console.log(`[PartnerDashboard] Notifying for Appointment: ${apptId}, Status: ${apptStatus}`);
                      // --- Using imported sendPushNotification ---
                      sendPushNotification(
                          partnerExpoPushToken,
                          title,
                          body,
                          { type: 'partner_appointment', apptId: apptId, apptType: apptType }
                      );
                      notifiedAppointments.current.add(notificationIdentifier); // Mark as notified
                  }
              } else if (change.type === 'modified' && (apptStatus === 'confirmed' || apptStatus === 'completed')) {
                  // If appointment is confirmed/completed, remove it from the notified set.
                  // This prevents re-notifying if it goes back to scheduled later (though not ideal status flow)
                  notifiedAppointments.current.delete(`${apptId}-scheduled`);
                  notifiedAppointments.current.delete(`${apptId}-rescheduled`);
              } else if (change.type === 'removed') {
                  // Clean up if appointment is deleted
                  notifiedAppointments.current.delete(notificationIdentifier);
              }
          });
      }, (error) => console.error("Error listening to appointments for notifications:", error));
      unsubscribes.push(unsubscribeAppointments);


      // Listener 3: New Enquêtes (Surveys)
      const surveysQuery = query(collection(db, 'surveys'), where('couponDetails.sponsor', '==', partnerId));
      const unsubscribeSurveys = onSnapshot(surveysQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') { // Only notify when a new survey is added for this partner
                  const surveyData = change.doc.data();
                  const surveyId = change.doc.id;
                  if (!notifiedSurveys.current.has(surveyId)) {
                      console.log(`[PartnerDashboard] NEW SURVEY for Partner: ${surveyData.title}`);
                      // --- Using imported sendPushNotification ---
                      sendPushNotification(
                          partnerExpoPushToken,
                          "Nouvelle Enquête!",
                          `Une nouvelle enquête "${surveyData.title}" sponsorisée par vous est disponible.`,
                          { type: 'partner_survey', surveyId: surveyId }
                      );
                      notifiedSurveys.current.add(surveyId); // Mark as notified
                  }
              }
          });
      }, (error) => console.error("Error listening to surveys for notifications:", error));
      unsubscribes.push(unsubscribeSurveys);


      // Listener 4: New Documents
      const documentsQuery = query(collection(db, 'documents'), where('partnerId', '==', partnerId));
      const unsubscribeDocuments = onSnapshot(documentsQuery, (snapshot) => {
          snapshot.docChanges().forEach((change) => {
              if (change.type === 'added') { // Only notify when a new document is added for this partner
                  const docData = change.doc.data();
                  const docId = change.doc.id;
                  // Ensure it's not a payment receipt as those might be handled differently or in a separate flow if needed
                  if (!docData.receiptURL && !notifiedDocuments.current.has(docId)) {
                      console.log(`[PartnerDashboard] NEW DOCUMENT for Partner: ${docData.title}`);
                      // --- Using imported sendPushNotification ---
                      sendPushNotification(
                          partnerExpoPushToken,
                          "Nouveau Document!",
                          `Un nouveau document "${docData.title}" a été ajouté pour votre entreprise.`,
                          { type: 'partner_document', documentId: docId }
                      );
                      notifiedDocuments.current.add(docId); // Mark as notified
                  }
              }
          });
      }, (error) => console.error("Error listening to documents for notifications:", error));
      unsubscribes.push(unsubscribeDocuments);

    };

    // This useEffect will now only fetch initial data once AND set up listeners.
    // The listeners will then trigger `fetchData()` or specific UI updates as needed.
    const user = auth.currentUser;
    setCurrentUser(user);
    if (user) {
      // Initial fetch of partner data to populate the dashboard and get partnerId/token
      fetchPartnerData(user.uid);
      // Set up real-time listeners AFTER partner data is fetched and partnerId is available
      setupPartnerNotifications();
    } else {
      setLoading(false);
    }

    // Cleanup function: unsubscribe from all listeners when the component unmounts
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [fetchPartnerData]); // Added fetchPartnerData to ensure it runs after partner data is available

  const renderReviewItem = ({ item }) => (
    <View style={styles.reviewCard}>
      <View style={styles.reviewHeader}>
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
        <Text style={styles.ratingText}>{(item.rating || item.note)?.toFixed(1)}</Text>
      </View>
      <Text style={styles.reviewText}>{item.commentaire || item.comment}</Text>
      <Text style={styles.reviewDate}>
        {(item.dateCreation || item.createdAt)?.toLocaleDateString('fr-FR')}
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
      onPress: () => navigation.navigate('PartnerSurvey') // This should probably navigate to a list of all appointments, not surveys
    },
    {
      icon: <Image source={MONEY_BILL_ICON} style={[styles.customStatIcon, { tintColor: '#FBBC05' }]} />,
      title: "Revenus",
      value: `${dashboardData.revenueGenerated.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}`,
      color: "#FBBC05",
      onPress: () => navigation.navigate('RdvConfirm') // This should probably navigate to a payments/revenue screen
    },
    {
      icon: <Image source={MONEY_COMMISSION_ICON} style={[styles.customStatIcon, { tintColor: '#9C27B0' }]} />,
      title: "Commission",
      value: `${dashboardData.commissionEarned.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}`,
      color: "#9C27B0",
      onPress: () => navigation.navigate('RdvConfirm') // This should probably navigate to a payments/commission screen
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
  const uri = partnerData?.profileImage ? String(partnerData.profileImage) : undefined; // Unused variable 'uri'

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
          <Image
            source={require('../../assets/images/logoVide.png')}
            style={styles.logo}
          />
        </View>

        {partnerData?.isPromoted && activeTab !== 'chat' && activeTab !== 'reviews' && (
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
              <Ionicons
                name={promotionIcon}
                size={20}
                color={promotionColor}
              />
              <View style={styles.promotionTextContainer}>
                <Text style={[styles.promotionBannerText, { color: promotionColor }]}>
                  {daysLeft <= 1 ?
                    'DERNIER JOUR DE PROMOTION!' :
                    `Promotion active • ${daysLeft} jours restants`
                  }
                </Text>
                {daysLeft > 0 && daysLeft <= 7 && ( // Ensure progress bar only shows for remaining days within 7
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
                          {/* Use the custom image icon */}
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
                      <MaterialIcons name="arrow-forward-ios" size={18} color="white" style={{ marginLeft: 8 }} />
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
                      <MaterialIcons name="arrow-forward-ios" size={18} color="white" style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                  </View>
                </>
              }
              // RefreshControl is correctly applied here for FlatList
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
              // RefreshControl is correctly applied here for ScrollView
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
                      {/* --- MODIFIED: Use custom image for right arrow --- */}
                      <Image source={RIGHT_ENTER_ICON_PARTNER} style={styles.customActionArrowIcon} />
                      {/* --- END MODIFIED --- */}
                    </TouchableOpacity>
                  </View>
            </ScrollView>
          )}

          {activeTab === 'reviews' && (
            <FlatList
              data={reviews}
              keyExtractor={(item) => `${item.id}_${item.isPartnerReview ? 'partner' : 'general'}`}
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
                  {/* --- MODIFIED: Use custom GIF for empty reviews icon --- */}
                  <Image source={REVIEW_ANIM_GIF} style={styles.customEmptyReviewsGif} />
                  {/* --- END MODIFIED --- */}
                  <Text style={styles.emptyText}>Aucun avis pour le moment</Text>
                </View>
              }
              // RefreshControl is correctly applied here for FlatList
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
            {/* --- MODIFIED: Use custom image for Dashboard icon --- */}
            <Image
              source={DASHBOARD_ICON}
              style={[styles.customNavIcon, { tintColor: activeTab === 'dashboard' ? '#4a6bff' : '#666' }]}
            />
            {/* --- END MODIFIED --- */}
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
            {/* --- MODIFIED: Use custom image for Payments icon --- */}
            <Image
              source={CREDIT_CARD_ICON}
              style={[styles.customNavIcon, { tintColor: activeTab === 'payments' ? '#4a6bff' : '#666' }]}
            />
            {/* --- END MODIFIED --- */}
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
            {/* --- MODIFIED: Use custom image for Reviews icon --- */}
            <Image
              source={RATE_HALF_ICON_NAV}
              style={[styles.customNavIcon, { tintColor: activeTab === 'reviews' ? '#4a6bff' : '#666' }]}
            />
            {/* --- END MODIFIED --- */}
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
            {/* --- MODIFIED: Use custom image for Support icon --- */}
            <Image
              source={SUPPORT_ER_ICON}
              style={[styles.customNavIcon, { tintColor: activeTab === 'chat' ? '#4a6bff' : '#666' }]}
            />
            {/* --- END MODIFIED --- */}
            <Text style={[
              styles.navButtonText,
              { color: activeTab === 'chat' ? '#4a6bff' : '#666' }
            ]}>
              Support
            </Text>
          </TouchableOpacity>
        </View>
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
  // --- NEW STYLE for Custom Stat Icons (from previous request) ---
  customStatIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline in the component to maintain specific colors
  },
  // --- END NEW STYLE ---
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
  // --- NEW STYLE for custom action arrow icon ---
  customActionArrowIcon: {
    width: 18, // Match MaterialIcons size
    height: 18, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: 'white', // Match original MaterialIcons color
    marginLeft: 8,
  },
  // --- END NEW STYLE ---
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
  // --- NEW STYLE for custom review star icons ---
  customReviewStarIcon: {
    width: 16, // Match Ionicons size
    height: 16, // Match Ionicons size
    resizeMode: 'contain',
    marginHorizontal: 1, // Adjust as needed
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
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
  // --- NEW STYLE for custom nav icons ---
  customNavIcon: {
    width: 24, // Match MaterialIcons/Ionicons size
    height: 24, // Match MaterialIcons/Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
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
  cancelButtonText: {
    color: '#333',
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: '#4a6bff',
  },
  submitButtonText: {
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
  // --- NEW STYLE for custom empty reviews GIF ---
  customEmptyReviewsGif: {
    width: 100, // Adjust size as needed
    height: 100, // Adjust size as needed
    resizeMode: 'contain',
    marginBottom: 10,
  },
  // --- END NEW STYLE ---
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
});

export default PartnerDashboard;
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image, // Make sure Image is imported
  RefreshControl,
  Animated,
  Easing,
  Dimensions,
  Modal,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import Swiper from 'react-native-swiper';
import { MaterialCommunityIcons, Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import { collection, query, where, onSnapshot, doc, getDoc, serverTimestamp, updateDoc, orderBy, limit, getDocs, addDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { db } from '../firebase';
import *as Animatable from 'react-native-animatable';

// Import the custom NotificationBanner component
//import NotificationBanner from './NotificationBanner'; // Make sure this path is correct

const { width } = Dimensions.get('window');

const Dashboard = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const [userData, setUserData] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [news, setNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [activeSurvey, setActiveSurvey] = useState(null);
  const [showSurveyBanner, setShowSurveyBanner] = useState(false);
  const bounceAnim = useRef(new Animated.Value(1)).current;
  const auth = getAuth();

  // --- UPDATED: STATES FOR CUSTOM NOTIFICATION BANNER ---
  const [showNotificationBanner, setShowNotificationBanner] = useState(false);
  const [notificationTitle, setNotificationTitle] = useState('');
  const [notificationMessage, setNotificationMessage] = useState(''); // Corrected
  const [notificationType, setNotificationType] = useState(null);
  const [notificationSenderName, setNotificationSenderName] = useState(''); // Corrected
  const [notificationTargetId, setNotificationTargetId] = useState(null);
  // --- END STATES ---

  // --- MODIFIED: STATES FOR RATING MODAL ---
  const [showRatePartnerModal, setShowRatePartnerModal] = useState(false);
  const [partnerToRateId, setPartnerToRateId] = useState(null);
  const [rdvIdForRating, setRdvIdForRating] = useState(null);
  const [rating, setRating] = useState(0); // 0-5 stars
  const [ratingComment, setRatingComment] = useState('');
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [partnerToRateName, setPartnerToRateName] = useState(''); // To display in modal
  // --- END STATES FOR RATING MODAL ---

  const lastNotifiedMessageId = useRef(null);
  const lastNotifiedSurveyId = useRef(null);

  const APP_LOGO = require('../assets/images/favicon.png');
  // --- NEW: IMPORT YOUR CUSTOM ICONS HERE ---
  const ASSISTANCE_ICON = require('../assets/icons/assistance.png');
  const PROMO_ICON = require('../assets/icons/promos.png');
  const RATE_ICON = require('../assets/icons/rate.png');
  const FAQ_ICON = require('../assets/icons/faq.png');
  const INFOS_ICON = require('../assets/icons/infos.png');
  const SETTINGS_ICON = require('../assets/icons/settings.png');
  const GIFT_ICON = require('../assets/icons/gift.png');
  const RIGHT_ENTER_ICON_DASH = require('../assets/icons/right_enter.png');
  const CHAT_BUBBLE_ICON = require('../assets/icons/chat_bubble.png'); // New: Chat bubble icon
  // --- END NEW IMPORTS ---

  const fetchUserData = async () => {
    try {
      const user = auth.currentUser;
      if (!user) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (!userDoc.exists()) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      setUserData({
        ...userDoc.data(),
        photoURL: user.photoURL || user.photoURL
      });
    } catch (error) {
      console.error("Error fetching user data:", error);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const fetchActiveSurvey = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const surveysQuery = query(
        collection(db, 'surveys'),
        where('active', '==', true),
        orderBy('createdAt', 'desc'),
        limit(1)
      );

      const unsubscribe = onSnapshot(surveysQuery, (querySnapshot) => {
        if (!querySnapshot.empty) {
          const surveyData = {
            id: querySnapshot.docs[0].id,
            ...querySnapshot.docs[0].data(),
          };

          const currentUserUid = user.uid;
          if (surveyData.completedByUsers && surveyData.completedByUsers.includes(currentUserUid)) {
            setActiveSurvey(null);
            setShowSurveyBanner(false);
          } else {
            setActiveSurvey(surveyData);
            setShowSurveyBanner(true);
          }
        } else {
          setActiveSurvey(null);
          setShowSurveyBanner(false);
        }
      });

      return () => unsubscribe();
    };

    fetchActiveSurvey();
  }, [userData]);

  useEffect(() => {
    if (showSurveyBanner && activeSurvey && lastNotifiedSurveyId.current !== activeSurvey.id) {
      setNotificationTitle("Sondage Disponible");
      setNotificationMessage(activeSurvey.title || "Donnez votre avis et gagnez un coupon !");
      setNotificationType('survey');
      setNotificationSenderName('');
      setNotificationTargetId(activeSurvey.id);
      setShowNotificationBanner(true);
      lastNotifiedSurveyId.current = activeSurvey.id;
    }
  }, [showSurveyBanner, activeSurvey]);

  useEffect(() => {
    const fetchNews = () => {
      try {
        const q = query(
          collection(db, 'news'),
          orderBy('createdAt', 'desc'),
          limit(5)
        );

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
          const newsItems = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();

            let createdAt;
            if (data.createdAt?.toDate) {
              createdAt = data.createdAt.toDate();
            } else if (data.createdAt?.seconds) {
              createdAt = new Date(data.createdAt.seconds * 1000);
            } else if (data.createdAt) {
              createdAt = data.createdAt;
            } else {
              createdAt = new Date();
            }

            newsItems.push({
              id: doc.id,
              title: data.title || 'Sans titre',
              description: data.description || '',
              imageUrl: data.imageUrl || null,
              createdAt,
              isNew: createdAt > new Date(Date.now() - 48 * 60 * 60 * 1000)
            });
          });
          setNews(newsItems);
          setNewsLoading(false);
        });

        return unsubscribe;
      } catch (error) {
        console.error("Error fetching news:", error);
        setNewsLoading(false);
      }
    };

    const unsubscribe = fetchNews();
    return () => unsubscribe();
  }, []);


  useEffect(() => {
    const user = auth.currentUser;
    if (!user || !userData) return;

    const q = query(
      collection(db, 'conversations'),
      where('participants', 'array-contains', user.uid),
      where('lastUpdated', '>', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      let currentUnreadCount = 0;
      let latestMessageTicketId = null;
      let latestMessageText = '';
      let latestMessageSenderName = '';

      querySnapshot.docChanges().forEach(change => {
        const data = change.doc.data();
        const conversationId = change.doc.id;

        if (data.lastMessageSender !== user.uid &&
            data.lastMessageSender !== 'systeme' &&
            data.lastUpdated?.toDate() > (userData.lastSeenMessages?.toDate() || new Date(0))) {

          currentUnreadCount++;
          if (!latestMessageTicketId || data.lastUpdated?.toDate() > (querySnapshot.docs.find(d => d.id === latestMessageTicketId)?.data().lastUpdated?.toDate() || new Date(0))) {
            latestMessageTicketId = conversationId;
            latestMessageText = data.lastMessage || "Nouveau message dans une conversation.";
            latestMessageSenderName = data.lastMessageSender === 'jey-ai' ? 'Jey' : data.lastMessageSenderName || 'Quelqu\'un';
          }
        }
      });

      if (currentUnreadCount > unreadCount) {
        if (latestMessageTicketId && latestMessageTicketId !== lastNotifiedMessageId.current) {
          setNotificationTitle("Nouveau Message!");
          setNotificationMessage(latestMessageText);
          setNotificationType('message');
          setNotificationSenderName(latestMessageSenderName);
          setShowNotificationBanner(true);
          lastNotifiedMessageId.current = latestMessageTicketId;
        }

        Animated.sequence([
          Animated.timing(bounceAnim, {
            toValue: 1.2,
            duration: 200,
            easing: Easing.linear,
            useNativeDriver: true
          }),
          Animated.timing(bounceAnim, {
            toValue: 1,
            duration: 200,
            easing: Easing.linear,
            useNativeDriver: true
          })
        ]).start();
      }
      setUnreadCount(currentUnreadCount);
    });

    return () => unsubscribe();
  }, [userData?.lastSeenMessages, userData, unreadCount, bounceAnim]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchUserData);
    fetchUserData();
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) return;

    const q = query(
      collection(db, 'ratingRequests'),
      where('clientId', '==', user.uid),
      where('status', 'in', ['pending', 'displayed']),
      orderBy('requestDate', 'desc'),
      limit(1)
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      if (!querySnapshot.empty) {
        const ratingRequestDoc = querySnapshot.docs[0];
        const ratingRequest = ratingRequestDoc.data();
        const requestId = ratingRequestDoc.id;

        const rdvDoc = await getDoc(doc(db, 'appointments', ratingRequest.rdvId));
        if (rdvDoc.exists() && rdvDoc.data().clientRated) {
          await updateDoc(doc(db, 'ratingRequests', requestId), { status: 'completed' });
          if (showRatePartnerModal) {
              setShowRatePartnerModal(false);
          }
          return;
        }

        if (ratingRequest.rdvId !== rdvIdForRating || !showRatePartnerModal) {
          setPartnerToRateId(ratingRequest.partnerId);
          setRdvIdForRating(ratingRequest.rdvId);
          setRating(0);
          setRatingComment('');

          const fetchPartnerName = async () => {
            try {
              const partnerDocSnap = await getDoc(doc(db, 'partners', ratingRequest.partnerId));
              if (partnerDocSnap.exists()) {
                setPartnerToRateName(partnerDocSnap.data().name || 'le partenaire');
              } else {
                setPartnerToRateName('le partenaire');
              }
            } catch (error) {
              console.error("Error fetching partner name for rating:", error);
              setPartnerToRateName('le partenaire');
            } finally {
              setShowRatePartnerModal(true);
              await updateDoc(doc(db, 'ratingRequests', requestId), { status: 'displayed' });
            }
          };
          fetchPartnerName();
        }
      } else {
        setShowRatePartnerModal(false);
      }
    });

    return () => unsubscribe();
  }, [auth.currentUser, rdvIdForRating, showRatePartnerModal]);


  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUserData();
    setRefreshing(false);
  };

  const handleProfilePress = () => {
    navigation.navigate('Settings');
  };

  const handleNotificationPress = async () => {
    setShowNotificationBanner(false);
    const user = auth.currentUser;

    if (notificationType === 'message' && notificationTargetId) {
      if (user) {
        try {
          await updateDoc(doc(db, 'users', user.uid), {
            lastSeenMessages: serverTimestamp()
          });
          navigation.navigate('Conversation', { ticketId: notificationTargetId });
        } catch (error) {
          console.error("Error updating last seen or navigating to message:", error);
          navigation.navigate('ConversationList');
        }
      } else {
        navigation.navigate('Login');
      }
    } else if (notificationType === 'survey' && notificationTargetId) {
      navigation.navigate('SurveyResponses', { surveyId: notificationTargetId });
    }
  };

  const handleChatPress = async () => {
    const user = auth.currentUser;
    if (!user) {
      navigation.navigate('Login');
      return;
    }

    try {
      await updateDoc(doc(db, 'users', user.uid), {
        lastSeenMessages: serverTimestamp()
      });
      navigation.navigate('ConversationList');
    } catch (error) {
      console.error("Error updating last seen:", error);
    }
  };

  const handleSurveyPress = () => {
    if (activeSurvey) {
      navigation.navigate('SurveyResponses', { surveyId: activeSurvey.id });
    }
  };

  const submitRating = async () => {
    if (rating === 0) {
      Alert.alert("Évaluation Requise", "Veuillez donner une note de 1 à 5 étoiles.");
      return;
    }
    if (!partnerToRateId || !rdvIdForRating || !userData?.uid) {
        Alert.alert("Erreur", "Informations d'évaluation manquantes.");
        return;
    }

    setIsSubmittingRating(true);
    try {
        await addDoc(collection(db, 'partnerRatings'), {
            partnerId: partnerToRateId,
            clientId: userData.uid,
            nomUtilisateur: userData.name || 'Anonyme',
            rating: rating,
            comment: ratingComment,
            rdvId: rdvIdForRating,
            dateCreation: serverTimestamp(),
            status: 'completed',
        });

        await addDoc(collection(db, 'partners', partnerToRateId, 'evaluations'), {
            partnerId: partnerToRateId,
            clientId: userData.uid,
            nomUtilisateur: userData.name || 'Anonyme',
            rating: rating,
            comment: ratingComment,
            rdvId: rdvIdForRating,
            dateCreation: serverTimestamp(),
            status: 'completed',
        });

        // --- MODIFIED: Update the appointment status to mark it as rated AND completed ---
        const appointmentRef = doc(db, 'appointments', rdvIdForRating);
        const appointmentSnap = await getDoc(appointmentRef);
        let updateAppointmentData = {
            clientRated: true,
            clientRating: rating,
            clientComment: ratingComment,
        };

        // If the appointment is not already 'completed' by the partner, mark it completed now.
        // This ensures it gets removed from the client's 'scheduled/rescheduled' list in UserRdv.
        if (appointmentSnap.exists() && appointmentSnap.data().status !== 'completed') {
            updateAppointmentData.status = 'completed';
            console.log("Dashboard: Client rating also marking appointment as completed:", rdvIdForRating);
        } else {
            console.log("Dashboard: Appointment already completed or does not exist, not changing status on client rating.");
        }
        await updateDoc(appointmentRef, updateAppointmentData);
        // --- END MODIFIED ---

        const ratingRequestsQuery = query(
          collection(db, 'ratingRequests'),
          where('clientId', '==', userData.uid),
          where('rdvId', '==', rdvIdForRating),
          where('partnerId', '==', partnerToRateId),
          where('status', 'in', ['pending', 'displayed']),
          limit(1)
        );
        const querySnapshot = await getDocs(ratingRequestsQuery);
        if (!querySnapshot.empty) {
          const requestId = querySnapshot.docs[0].id;
          await updateDoc(doc(db, 'ratingRequests', requestId), { status: 'completed' });
        }

        setShowRatePartnerModal(false);
        Alert.alert(
          "Merci pour votre évaluation !",
          `Nous apprécions grandement votre avis sur ${partnerToRateName}.`
        );

        setRating(0);
        setRatingComment('');

    } catch (error) {
        console.error("Error submitting rating:", error);
        Alert.alert("Erreur", "Impossible de soumettre votre évaluation. Veuillez réessayer.");
    } finally {
        setIsSubmittingRating(false);
    }
  };

  const renderNewsSlide = (item) => {
    const colors = ['#0a8fdf', '#25c15b', '#5f27cd', '#1dd1a1'];
    const bgColor = colors[item.id ? item.id.charCodeAt(0) % colors.length : Math.floor(Math.random() * colors.length)];

    return (
      <TouchableOpacity
        key={item.id}
        activeOpacity={0.9}
        onPress={() => navigation.navigate('NewsDetail', { newsItem: item })}
        style={[styles.slideContainer, { backgroundColor: bgColor }]}
      >
        <View style={styles.slideContent}>
          {item.imageUrl ? (
            <Image
              source={{ uri: item.imageUrl }}
              style={styles.slideImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.slideImage, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
              <Ionicons name="newspaper-outline" size={36} color="white" />
            </View>
          )}
          <View style={styles.textContainer}>
            <Text style={styles.slideTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.slideDescription} numberOfLines={2}>
              {item.description ?
                `${item.description.split(' ').slice(0, 15).join(' ')}${item.description.split(' ').length > 15 ? '...' : ''}`
                : 'Aucune description disponible'}
            </Text>
          </View>
        </View>
        {item.isNew && (
          <View style={styles.newsBadge}>
            <Text style={styles.badgeTextNews}>Nouveau</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  const greetingText = `Bonjour, ${userData?.name || userData?.email?.split('@')[0] || 'Client'}  !`;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#0a8fdf']}
            tintColor="#0a8fdf"
          />
        }
      >
        <View style={styles.header}>
          <View style={styles.greetingAndPremiumContainer}>
            <Text style={styles.welcomeText}>{greetingText}</Text>
            {userData?.isPremium && (
              <MaterialCommunityIcons
                name="medal"
                size={22}
                color="#FFD700"
                style={styles.premiumIcon}
              />
            )}
            <Text style={styles.helpText}>Bienvenu(e) chez l'Elite du service client en Afrique.</Text>
          </View>
          <TouchableOpacity onPress={handleProfilePress} style={styles.profileButton}>
            {userData?.photoURL ? (
              <Image
                source={{ uri: userData.photoURL }}
                style={{ width: 46, height: 46, borderRadius: 23 }}
              />
            ) : (
              <Ionicons name="person-circle-outline" size={46} color="#25c15b" />
            )}
          </TouchableOpacity>
        </View>

        {newsLoading ? (
          <View style={styles.swiperLoadingContainer}>
            <ActivityIndicator size="large" color="#0a8fdf" />
          </View>
        ) : news.length > 0 ? (
          <View style={styles.swiperWrapper}>
            <Swiper
              autoplay
              autoplayTimeout={5}
              showsPagination={true}
              dot={<View style={styles.swiperDot} />}
              activeDot={<View style={styles.swiperActiveDot} />}
              removeClippedSubviews={false}
              loop
            >
              {news.map(renderNewsSlide)}
            </Swiper>
          </View>
        ) : (
          <View style={styles.emptySwiper}>
            <Ionicons name="images" size={40} color="#cbd5e1" />
            <Text style={styles.emptySwiperText}>Aucune promotions disponible</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Services Rapides</Text>
          <View style={styles.quickActions}>
            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('UserRequest')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#ff6b6b' }]}>
                {/* --- MODIFIED: Use your custom image for Assistance --- */}
                <Image source={ASSISTANCE_ICON} style={styles.customActionIcon} />
                {/* --- END MODIFIED --- */}
              </View>
              <Text style={styles.actionText}>Assistance</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionCard}
              onPress={() => navigation.navigate('News')}
            >
              <View style={[styles.actionIcon, { backgroundColor: '#25c15b' }]}>
                {/* --- MODIFIED: Use your custom image for Promos --- */}
                <Image source={PROMO_ICON} style={styles.customActionIcon} />
                {/* --- END MODIFIED --- */}
              </View>
              <Text style={styles.actionText}>Promos</Text>
            </TouchableOpacity>
          </View>
        </View>

        {showSurveyBanner && activeSurvey ? (
          <Animatable.View animation="pulse" easing="ease-out" iterationCount="infinite" style={styles.catchySurveyCardContainer}>
            <TouchableOpacity
              style={[styles.catchySurveyCard, { backgroundColor: activeSurvey.cardColor || '#0a8fdf' }]}
              activeOpacity={0.8}
              onPress={handleSurveyPress}
            >
              <View style={styles.catchySurveyCardContent}>
                <View style={styles.catchySurveyIconSection}>
                  {/* --- MODIFIED: Use custom image for Gift Icon --- */}
                  <Image source={GIFT_ICON} style={styles.customGiftIcon} />
                  {/* --- END MODIFIED --- */}
                  {activeSurvey.couponDetails?.value && (
                    <Animatable.View animation="bounceIn" delay={300} style={styles.rewardBubble}>
                      <Text style={styles.rewardBubbleText}>
                        {activeSurvey.couponDetails.type === 'percentage'
                          ? `${activeSurvey.couponDetails.value}%`
                          : `${activeSurvey.couponDetails.value}$`}
                      </Text>
                    </Animatable.View>
                  )}
                </View>

                <View style={styles.catchySurveyTextSection}>
                  <Text style={styles.catchySurveyMainTitle}>
                    {activeSurvey.title || "Votre avis vous paie !"}
                  </Text>
                  <Text style={styles.catchySurveySubtitle}>
                    {activeSurvey.couponDetails?.title || "Participez à notre enquête"}
                  </Text>
                  {activeSurvey.couponDetails?.value ? (
                    <Text style={styles.catchySurveyRewardText}>
                      **
                      {activeSurvey.couponDetails.type === 'percentage'
                        ? `${activeSurvey.couponDetails.value}%`
                        : `${activeSurvey.couponDetails.value}$`}
                      ** {activeSurvey.couponDetails?.sponsorName && `Reduction offerte par ${activeSurvey.couponDetails.sponsorName}`} !
                    </Text>
                  ) : (
                    <Text style={styles.catchySurveyRewardText}>
                      Répondez et Gagnez un Coupon Gratuit.
                    </Text>
                  )}
                </View>

                <View style={styles.catchySurveyArrow}>
                  {/* --- MODIFIED: Use custom image for Right Arrow --- */}
                  <Image source={RIGHT_ENTER_ICON_DASH} style={styles.customArrowIconDashboard} />
                  {/* --- END MODIFIED --- */}
                </View>
              </View>
            </TouchableOpacity>
          </Animatable.View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Support Client</Text>
          <View style={styles.optionsGrid}>
            {[
              { icon: RATE_ICON, name: 'Évaluer', screen: 'RateApp', color: '#feca57' },
              { icon: FAQ_ICON, name: 'FAQ', screen: 'FAQ', color: '#1dd1a1' },
              { icon: INFOS_ICON, name: 'À Propos', screen: 'About', color: '#5f27cd' },
              { icon: SETTINGS_ICON, name: 'Paramètres', screen: 'Settings', color: '#ff9f43' },
            ].map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.optionCard}
                onPress={() => navigation.navigate(option.screen)}
              >
                <View style={[styles.optionIcon, { backgroundColor: option.color }]}>
                  {/* --- MODIFIED: Use custom image for Support Client icons --- */}
                  <Image source={option.icon} style={styles.customOptionIcon} />
                  {/* --- END MODIFIED --- */}
                </View>
                <Text style={styles.optionText}>{option.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.statusContainer}>
          <View style={styles.statusIndicator} />
          <Text style={styles.statusText}>Service disponible 24/7 • Temps d'attente: ~3 min</Text>
        </View>
      </ScrollView>

      <Animated.View
        style={[
          styles.chatButton,
          { transform: [{ scale: bounceAnim }] }
        ]}
      >
        <TouchableOpacity onPress={handleChatPress} activeOpacity={0.7}>
          {/* --- MODIFIED: Use custom image for Chat Bubble Icon --- */}
          <Image source={CHAT_BUBBLE_ICON} style={styles.customChatBubbleIcon} />
          {/* --- END MODIFIED --- */}
          {unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </Animated.View>
      {/*
      {showNotificationBanner && notificationType && (
        <NotificationBanner
          isVisible={showNotificationBanner}
          title={notificationTitle}
          message={notificationMessage}
          senderName={notificationSenderName}
          onClose={() => setShowNotificationBanner(false)}
          onPress={handleNotificationPress}
          appLogoSource={APP_LOGO}
          type={notificationType}
        />
      )}

      */}

      <Modal
        animationType="slide"
        transparent={true}
        visible={showRatePartnerModal}
        onRequestClose={() => setShowRatePartnerModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.ratingModalContent}>
            <Text style={styles.ratingModalTitle}>Évaluer {partnerToRateName}</Text>
            <Text style={styles.ratingModalSubtitle}>
              Veuillez donner une note de 1 à 5 étoiles et laisser un commentaire.
            </Text>

            <View style={styles.starsContainer}>
              {[1, 2, 3, 4, 5].map((starValue) => (
                <TouchableOpacity
                  key={starValue}
                  onPress={() => setRating(starValue)}
                  disabled={isSubmittingRating}
                >
                  <Ionicons
                    name={rating >= starValue ? "star" : "star-outline"}
                    size={40}
                    color="#FFD700"
                    style={{ marginHorizontal: 5 }}
                  />
                </TouchableOpacity>
              ))}
            </View>
            
            <TextInput
              style={styles.ratingTextInput}
              placeholder="Votre commentaire (optionnel)..."
              multiline
              numberOfLines={4}
              value={ratingComment}
              onChangeText={setRatingComment}
              editable={!isSubmittingRating}
            />

            <View style={styles.ratingModalActions}>
              <TouchableOpacity
                style={[styles.ratingModalButton, styles.ratingCancelButton]}
                onPress={() => setShowRatePartnerModal(false)}
                disabled={isSubmittingRating}
              >
                <Text style={styles.ratingCancelButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ratingModalButton, styles.ratingSubmitButton]}
                onPress={submitRating}
                disabled={isSubmittingRating || rating === 0}
              >
                {isSubmittingRating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.ratingSubmitButtonText}>Soumettre</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#f4f4f4',
    padding: 20,
    //marginTop: 26,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  greetingAndPremiumContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    flex: 1,
  },
  welcomeText: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1e293b',
    marginRight: 8,
  },
  premiumIcon: {
    marginRight: 8,
  },
  helpText: {
    fontSize: 16,
    color: '#64748b',
    marginTop: 4,
    width: '100%',
  },
  profileButton: {
    backgroundColor: '#f1f5f9',
    borderRadius: 20,
    padding: 8,
  },
  swiperWrapper: {
    height: 120,
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  slideContainer: {
    flex: 1,
    padding: 15,
    justifyContent: 'center',
  },
  slideContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slideImage: {
    width: 90,
    height: 90,
    borderRadius: 8,
    marginRight: 15,
    justifyContent: 'center',
    alignItems: 'center',
    resizeMode: 'contain'
  },
  textContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  slideTitle: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  slideDescription: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    lineHeight: 18,
  },
  newsBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeTextNews: {
    color: '#0a8fdf',
    fontSize: 10,
    fontWeight: 'bold',
  },
  swiperLoadingContainer: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    marginBottom: 24,
  },
  emptySwiper: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    marginBottom: 24,
  },
  emptySwiperText: {
    marginTop: 8,
    color: '#94a3b8',
    fontSize: 14,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 16,
  },
  quickActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  actionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    width: '48%',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  // --- NEW STYLE FOR CUSTOM IMAGE ICONS ---
  customActionIcon: {
    width: 28, // Adjust size as needed
    height: 28, // Adjust size as needed
    resizeMode: 'contain', // Ensures the image scales properly within the view
    tintColor: '#fff', // This will make the icon white, matching the previous icons' color
  },
  // --- END NEW STYLE ---
  actionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#334155',
    textAlign: 'center',
  },
  optionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  optionCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  // --- NEW STYLE FOR CUSTOM OPTION ICONS ---
  customOptionIcon: {
    width: 24, // Adjust size as needed
    height: 24, // Adjust size as needed
    resizeMode: 'contain',
    tintColor: '#fff', // These icons should also be white on their colored backgrounds
  },
  // --- END NEW STYLE ---
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f4f4f4',
    padding: 12,
    borderRadius: 8,
    marginTop: -30,
    marginBottom: 30
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#10b981',
    marginRight: 8,
    alignSelf: 'center',
  },
  statusText: {
    fontSize: 13,
    color: '#64748b',
  },
  chatButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#0a8fdf',
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  // --- NEW STYLE for Custom Chat Bubble Icon ---
  customChatBubbleIcon: {
    width: 28, // Match Ionicons size
    height: 28, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  badge: {
    position: 'absolute',
    right: -5,
    top: -5,
    backgroundColor: 'red',
    borderRadius: 10,
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  badgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  /*
  swiperDot: {
    backgroundColor: 'rgba(255,255,255,0.3)',
    width: 8,
    height: 8,
    borderRadius: 4,
    margin: 3,
  },
  swiperActiveDot: {
    backgroundColor: 'white',
    width: 8,
    height: 8,
    borderRadius: 4,
    margin: 3,
  },
  */
  catchySurveyCardContainer: {
    borderRadius: 15,
    marginBottom: 24,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  catchySurveyCard: {
    borderRadius: 15,
    width: '100%',
    paddingVertical: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
  },
  catchySurveyCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  catchySurveyIconSection: {
    position: 'relative',
    marginRight: 15,
  },
  // --- NEW STYLE for Custom Gift Icon ---
  customGiftIcon: {
    width: 45, // Match Ionicons size
    height: 45, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  rewardBubble: {
    position: 'absolute',
    top: 35,
    right: -10,
    backgroundColor: '#34D399',
    borderRadius: 15,
    paddingHorizontal: 8,
    paddingVertical: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  rewardBubbleText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  catchySurveyTextSection: {
    flex: 1,
    marginRight: 10,
  },
  catchySurveyMainTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 4,
    textShadowColor: 'rgba(0, 0, 0, 0.1)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 2,
  },
  catchySurveySubtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 6,
  },
  catchySurveyRewardText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFD700',
    lineHeight: 20,
  },
  catchySurveyArrow: {
    marginLeft: 'auto',
  },
  // --- NEW STYLE for Custom Arrow Icon in Dashboard ---
  customArrowIconDashboard: {
    width: 30, // Match Ionicons size
    height: 30, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match original Ionicons color
  },
  // --- END NEW STYLE ---

  ratingModalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
    alignSelf: 'center',
    top: 230
  },
  ratingModalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 10,
    textAlign: 'center',
  },
  ratingModalSubtitle: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
  },
  starsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  ratingTextInput: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
    fontSize: 16,
    backgroundColor: '#F9FAFB',
    color: '#333',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  ratingModalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  ratingModalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  ratingCancelButton: {
    backgroundColor: '#E2E8F0',
  },
  ratingCancelButtonText: {
    color: '#4A5568',
    fontWeight: '600',
    fontSize: 16,
  },
  ratingSubmitButton: {
    backgroundColor: '#4a6bff',
  },
  ratingSubmitButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
});

export default Dashboard;
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  RefreshControl,
  Platform,
  Alert,
  Dimensions,
  StatusBar
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { auth, db } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  doc,
  getDoc
} from 'firebase/firestore';
import { sendSystemNotification, sendPaymentNotification, sendMessageNotification } from '../services/notificationHelpers';
import { Ionicons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AdminScreen = () => {
  const navigation = useNavigation();
  const [adminData, setAdminData] = useState(null);
  const [screenDimensions, setScreenDimensions] = useState(Dimensions.get('window'));
  const [stats, setStats] = useState({
    users: 0,
    inactiveUsers: 0,
    onlineUsers: 0,
    newUsersToday: 0,
    newUsersMonth: 0,
    newUsersYear: 0,
    tickets: 0,
    conversations: 0,
    partners: 0,
    surveys: 0,
    pendingPayments: 0,
    onlinePayments: 0,
    newsCount: 0,
    partnerApplications: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const lastNotifiedNewUsersDate = useRef(null);
  // Removed notifiedPartnerIds as it's no longer needed for new partner notifications
  const notifiedPaymentIds = useRef(new Set());
  const notifiedPartnerConvosMsgs = useRef(new Set());

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

  // --- NEW: Import your custom icons ---
  const USERS_ICON = require('../assets/icons/users.png');
  const PARTNERS_ICON = require('../assets/icons/partners.png');
  const TICKET_ICON = require('../assets/icons/ticket.png'); // New
  const MESSAGE_ICON = require('../assets/icons/message_icon.png'); // New
  const PROMOS_ICON = require('../assets/icons/promos.png'); // New (was already in Dashboard)
  const SURVEY_CHECK_ICON = require('../assets/icons/survey_check.png'); // New
  const MONEY_BILL_ICON = require('../assets/icons/money_bill.png'); // New (already in PartnerDashboard)
  const ADD_CIRCLE_ICON = require('../assets/icons/add_circle.png'); // New
  const ADD_USER_ICON = require('../assets/icons/add_user.png'); // New
  const GRAPHIC_ICON = require('../assets/icons/graphic.png'); // New
  // --- END NEW IMPORTS ---



  const fetchData = async () => {
    setLoading(true);
    try {
      const user = auth.currentUser;
      if (!user) {
        setLoading(false);
        return;
      }

      const adminQuery = query(collection(db, 'users'), where('uid', '==', user.uid));
      const adminDocSnap = await getDocs(adminQuery);
      let currentAdminData = null;
      if (!adminDocSnap.empty) {
        currentAdminData = adminDocSnap.docs[0].data();
        setAdminData(currentAdminData);
      } else {
        console.warn("Admin user document not found for current UID:", user.uid);
        setAdminData({ name: 'Admin', photoURL: null, expoPushToken: null });
      }

      const storedDate = await AsyncStorage.getItem('lastNotifiedNewUsersDate');
      if (storedDate) {
        lastNotifiedNewUsersDate.current = new Date(storedDate);
      } else {
        lastNotifiedNewUsersDate.current = null;
      }

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

      const usersQuerySnapshot = await getDocs(collection(db, 'users'));
      let inactiveUsers = 0;
      let onlineUsers = 0;
      let newUsersToday = 0;
      let newUsersMonth = 0;
      let newUsersYear = 0;

      usersQuerySnapshot.forEach(doc => {
        const userData = doc.data();
        const lastActive = userData.lastActive?.toDate();

        if (lastActive && (now - lastActive) > 30 * 24 * 60 * 60 * 1000) {
          inactiveUsers++;
        }

        if (lastActive && (now - lastActive) < 5 * 60 * 1000) {
          onlineUsers++;
        }

        const createdAt = userData.createdAt?.toDate();
        if (createdAt) {
          if (createdAt >= todayStart) newUsersToday++;
          if (createdAt >= monthStart) newUsersMonth++;
          if (createdAt >= yearStart) newUsersYear++;
        }
      });

      const hasNotifiedTodayForNewUsers = lastNotifiedNewUsersDate.current &&
                               new Date(lastNotifiedNewUsersDate.current).toDateString() === new Date().toDateString();

      if (newUsersToday > 0 && !hasNotifiedTodayForNewUsers) {
        console.log(`[AdminScreen Notifications] Attempting to notify for ${newUsersToday} new users today.`);
        try {
          await sendSystemNotification.newUsersToday(
            currentUser.uid,
            { count: newUsersToday }
          );
          lastNotifiedNewUsersDate.current = new Date();
          await AsyncStorage.setItem('lastNotifiedNewUsersDate', new Date().toISOString());
        } catch (notificationError) {
          console.error('Error sending new users notification:', notificationError);
        }
      }      const ticketsQuerySnapshot = await getDocs(collection(db, 'tickets'));
      const partnersQuerySnapshot = await getDocs(collection(db, 'partners'));
      const surveysQuerySnapshot = await getDocs(collection(db, 'surveys'));
      const paymentsQuerySnapshot = await getDocs(query(collection(db, 'payments'), where('confirmed', '==', false)));
      const onlinePaymentsSnapshot = await getDocs(collection(db, 'payments'));

      const partnerConversationsSnapshot = await getDocs(collection(db, 'partnerConversations'));
      const totalUnifiedChatConversations = partnerConversationsSnapshot.size;

      const newsQuerySnapshot = await getDocs(collection(db, 'news'));
      const totalNews = newsQuerySnapshot.size;

      const partnerApplicationsSnapshot = await getDocs(collection(db, 'applications'));
      const totalPartnerApplications = partnerApplicationsSnapshot.size;

      setStats(prevStats => ({
        ...prevStats,
        users: usersQuerySnapshot.size,
        inactiveUsers,
        onlineUsers,
        newUsersToday,
        newUsersMonth,
        newUsersYear,
        tickets: ticketsQuerySnapshot.size,
        conversations: totalUnifiedChatConversations,
        partners: partnersQuerySnapshot.size,
        surveys: surveysQuerySnapshot.size,
        pendingPayments: paymentsQuerySnapshot.size,
        onlinePayments: onlinePaymentsSnapshot.size,
        newsCount: totalNews,
        partnerApplications: totalPartnerApplications,
      }));

      setLastUpdated(now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch (error) {
      console.error("Error fetching admin data:", error);
      Alert.alert("Erreur de chargement", "Impossible de charger les données du tableau de bord.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let unsubscribes = [];
    
    // Listen for dimension changes
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setScreenDimensions(window);
    });

    const setupRealtimeListeners = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        console.warn("No authenticated user for setting up AdminScreen listeners.");
        return;
      }

      // --- Real-time Listener for Partners (removed new partner notification) ---
      const partnersRealtimeQuery = query(collection(db, 'partners'));
      const unsubscribePartners = onSnapshot(partnersRealtimeQuery, async (snapshot) => {
        // No new partner notification logic here as per request
        // We still call fetchData to update the count if a partner is added/removed/modified
        fetchData();
      }, (error) => {
        console.error("Error listening to partners (AdminScreen):", error);
      });
      unsubscribes.push(unsubscribePartners);

      // --- Real-time Listener for New/Modified Pending Payments ---
      const paymentsRealtimeQuery = query(collection(db, 'payments'), where('confirmed', '==', false));
      const unsubscribePayments = onSnapshot(paymentsRealtimeQuery, async (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          if (change.type === 'added' || (change.type === 'modified' && change.doc.data().confirmed === false)) {
            const paymentData = change.doc.data();
            const paymentId = change.doc.id;
            if (!notifiedPaymentIds.current.has(paymentId)) {
              console.log(`[AdminScreen Notifications] NEW PENDING PAYMENT DETECTED: ${paymentId}`);
              try {
                await sendPaymentNotification.pendingPayment(
                  currentUser.uid,
                  {
                    paymentId: paymentId,
                    amount: paymentData.paymentAmount,
                    partnerName: paymentData.partnerName
                  }
                );
                notifiedPaymentIds.current.add(paymentId);
              } catch (notificationError) {
                console.error('Error sending pending payment notification:', notificationError);
              }
            }
          } else if (change.type === 'removed' || (change.type === 'modified' && change.doc.data().confirmed === true)) {
             notifiedPaymentIds.current.delete(change.doc.id);
          }
        });
        fetchData();
      }, (error) => {
        console.error("Error listening to payments (AdminScreen):", error);
      });
      unsubscribes.push(unsubscribePayments);

      // --- Real-time Listener for New/Unread Partner Conversations Messages ---
      const partnerConvosRealtimeQuery = query(collection(db, 'partnerConversations'));
      const unsubscribePartnerConvos = onSnapshot(partnerConvosRealtimeQuery, async (snapshot) => {
        snapshot.docChanges().forEach(async (change) => {
          const convoData = change.doc.data();
          const convoId = change.doc.id;

          if ((change.type === 'added' || change.type === 'modified') &&
              convoData.lastMessageSender !== currentUser.uid &&
              convoData.unreadBySupport === true) {

            if (!notifiedPartnerConvosMsgs.current.has(convoId)) {
              console.log(`[AdminScreen Notifications] NEW UNREAD PARTNER CONVERSATION MESSAGE DETECTED: ${convoId}`);
              try {
                await sendMessageNotification.partnerMessage(
                  currentUser.uid,
                  {
                    partnerName: convoData.partnerName || 'un partenaire',
                    message: convoData.lastMessage || 'nouveau message',
                    partnerId: convoId
                  }
                );
                notifiedPartnerConvosMsgs.current.add(convoId);
              } catch (notificationError) {
                console.error('Error sending partner message notification:', notificationError);
              }
            }
          } else if (change.type === 'modified' && convoData.unreadBySupport === false) {
              notifiedPartnerConvosMsgs.current.delete(convoId);
          } else if (change.type === 'removed') {
              notifiedPartnerConvosMsgs.current.delete(convoId);
          }
        });
      }, (error) => {
        console.error("Error listening to partner conversations (AdminScreen):", error);
      });
      unsubscribes.push(unsubscribePartnerConvos);
    };

    fetchData();
    setupRealtimeListeners();

    return () => {
      unsubscribes.forEach(unsub => unsub());
      subscription?.remove();
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const responsiveValues = getResponsiveValues();

  if (loading && !refreshing) {
    return (
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        style={styles.loadingContainer}
      >
        <StatusBar barStyle="light-content" backgroundColor="#667eea" />
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.loadingText}>Chargement du tableau de bord...</Text>
      </LinearGradient>
    );
  }

  return (
    <View style={styles.mainContainer}>
      <StatusBar barStyle="light-content" backgroundColor="#667eea" />
      
      {/* Simple Clean Header */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity
            style={styles.profileContainer}
            onPress={() => navigation.navigate('Settings')}
          >
            <Image
              source={adminData?.photoURL ? { uri: adminData.photoURL } : require('../assets/images/Profile.png')}
              style={styles.profilePicture}
            />
            <View style={styles.userInfo}>
              <Text style={styles.userName}>{adminData?.name || 'Admin'}</Text>
              <Text style={styles.userRole}>Administrateur</Text>
            </View>
          </TouchableOpacity>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Settings')}>
              <Ionicons name="settings-outline" size={24} color="#667eea" />
            </TouchableOpacity>
          </View>
        </View>
        {/*
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Tableau de bord administrateur</Text>
          <Text style={styles.lastUpdateText}>Dernière MAJ: {lastUpdated || '--:--'}</Text>
        </View>
        */}
      </View>

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#667eea']}
            tintColor="#667eea"
            title="Actualisation..."
            titleColor="#667eea"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Analytics Banner */}
        <TouchableOpacity
          style={styles.analyticsBanner}
          onPress={() => navigation.navigate('Datas')}
        >
          <LinearGradient
            colors={['#4facfe', '#00f2fe']}
            style={styles.analyticsBannerGradient}
          >
            <Image source={GRAPHIC_ICON} style={[styles.analyticsIcon, { tintColor: '#fff' }]} />
            <View style={styles.analyticsBannerContent}>
              <Text style={styles.analyticsBannerTitle}>Analytics Dashboard</Text>
              <Text style={styles.analyticsBannerSubtitle}>Voir les graphiques détaillés</Text>
            </View>
            <Ionicons name="chevron-forward-outline" size={24} color="#fff" />
          </LinearGradient>
        </TouchableOpacity>

        {/* Performance Overview */}
        <View style={styles.performanceSection}>
          <Text style={styles.sectionTitle}>📊 Vue d'ensemble</Text>
          <View style={styles.performanceGrid}>
            <View style={styles.performanceCard}>
              <Text style={styles.performanceLabel}>Activité</Text>
              <Text style={styles.performanceValue}>{stats.inactiveUsers}</Text>
              <Text style={styles.performanceSubtext}>Inactifs (30j+)</Text>
            </View>
            <View style={styles.performanceCard}>
              <Text style={styles.performanceLabel}>Croissance</Text>
              <Text style={styles.performanceValue}>{stats.newUsersMonth}</Text>
              <Text style={styles.performanceSubtext}>Ce mois</Text>
            </View>
            <View style={styles.performanceCard}>
              <Text style={styles.performanceLabel}>Support</Text>
              <Text style={styles.performanceValue}>{stats.tickets}</Text>
              <Text style={styles.performanceSubtext}>Tickets total</Text>
            </View>
          </View>
        </View>

        {/* Main Statistics Grid */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>📈 Statistiques Principales</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.statsScrollView}
            contentContainerStyle={styles.statsScrollContent}
          >
            <View style={[styles.modernStatCard, { backgroundColor: '#667eea' }]}>
              <LinearGradient
                colors={['#667eea', '#764ba2']}
                style={styles.statCardGradient}
              >
                <View style={styles.statCardHeader}>
                  <Image source={USERS_ICON} style={[styles.modernStatIcon, { tintColor: '#fff' }]} />
                  <Text style={styles.modernStatLabel}>Utilisateurs</Text>
                </View>
                <Text style={styles.modernStatNumber}>{stats.users.toLocaleString()}</Text>
                <View style={styles.statCardFooter}>
                  <Text style={styles.statTrend}>+{stats.newUsersMonth} ce mois</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={[styles.modernStatCard, { backgroundColor: '#4facfe' }]}>
              <LinearGradient
                colors={['#4facfe', '#00f2fe']}
                style={styles.statCardGradient}
              >
                <View style={styles.statCardHeader}>
                  <Image source={TICKET_ICON} style={[styles.modernStatIcon, { tintColor: '#fff' }]} />
                  <Text style={styles.modernStatLabel}>Support</Text>
                </View>
                <Text style={styles.modernStatNumber}>{stats.tickets}</Text>
                <View style={styles.statCardFooter}>
                  <Text style={styles.statTrend}>Tickets totaux</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={[styles.modernStatCard, { backgroundColor: '#f093fb' }]}>
              <LinearGradient
                colors={['#f093fb', '#f5576c']}
                style={styles.statCardGradient}
              >
                <View style={styles.statCardHeader}>
                  <Image source={MESSAGE_ICON} style={[styles.modernStatIcon, { tintColor: '#fff' }]} />
                  <Text style={styles.modernStatLabel}>Messages</Text>
                </View>
                <Text style={styles.modernStatNumber}>{stats.conversations}</Text>
                <View style={styles.statCardFooter}>
                  <Text style={styles.statTrend}>Conversations partenaires</Text>
                </View>
              </LinearGradient>
            </View>

            <View style={[styles.modernStatCard, { backgroundColor: '#4ecdc4' }]}>
              <LinearGradient
                colors={['#4ecdc4', '#44a08d']}
                style={styles.statCardGradient}
              >
                <View style={styles.statCardHeader}>
                  <Image source={PARTNERS_ICON} style={[styles.modernStatIcon, { tintColor: '#fff' }]} />
                  <Text style={styles.modernStatLabel}>Partenaires</Text>
                </View>
                <Text style={styles.modernStatNumber}>{stats.partners}</Text>
                <View style={styles.statCardFooter}>
                  <Text style={styles.statTrend}>Actifs maintenant</Text>
                </View>
              </LinearGradient>
            </View>
          </ScrollView>
        </View>

        {/* Professional Action Sections */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>⚡ Actions Rapides</Text>
          
          {/* Financial Management */}
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryIconContainer}>
                <Ionicons name="card-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.categoryTitle}>Gestion Financière</Text>
              {stats.pendingPayments > 0 && (
                <View style={styles.urgentBadge}>
                  <Text style={styles.urgentBadgeText}>{stats.pendingPayments}</Text>
                </View>
              )}
            </View>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.actionScrollView}
              contentContainerStyle={styles.actionScrollContent}
            >
              <TouchableOpacity
                style={[styles.modernActionCard, styles.priorityCard]}
                onPress={() => navigation.navigate('Payments')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#ff6b6b' }]}>
                  <Image source={MONEY_BILL_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Paiements</Text>
                <Text style={styles.modernActionSubtitle}>{stats.pendingPayments} en attente</Text>
                {stats.pendingPayments > 0 && <View style={styles.actionBadge} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('OnlinePaid')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#4ecdc4' }]}>
                  <Ionicons name="card" size={24} color="#fff" />
                </View>
                <Text style={styles.modernActionTitle}>En Ligne</Text>
                <Text style={styles.modernActionSubtitle}>{stats.onlinePayments} paiements</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('PartnerPayments')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#667eea' }]}>
                  <Ionicons name="business" size={24} color="#fff" />
                </View>
                <Text style={styles.modernActionTitle}>Partenaires</Text>
                <Text style={styles.modernActionSubtitle}>Tous paiements</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* Partner Management */}
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryIconContainer}>
                <Ionicons name="people-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.categoryTitle}>Gestion des Partenaires</Text>
              {stats.partnerApplications > 0 && (
                <View style={styles.urgentBadge}>
                  <Text style={styles.urgentBadgeText}>{stats.partnerApplications}</Text>
                </View>
              )}
            </View>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.actionScrollView}
              contentContainerStyle={styles.actionScrollContent}
            >
              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('Partners')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#9C27B0' }]}>
                  <Image source={PARTNERS_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Partenaires</Text>
                <Text style={styles.modernActionSubtitle}>{stats.partners} actifs</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modernActionCard, stats.partnerApplications > 0 ? styles.priorityCard : null]}
                onPress={() => navigation.navigate('PartnerApplications')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#FF9500' }]}>
                  <Image source={ADD_USER_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Candidatures</Text>
                <Text style={styles.modernActionSubtitle}>{stats.partnerApplications} nouvelles</Text>
                {stats.partnerApplications > 0 && <View style={styles.actionBadge} />}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('AdminPartnerChatList')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#FF9800' }]}>
                  <Image source={MESSAGE_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Messages</Text>
                <Text style={styles.modernActionSubtitle}>{stats.conversations} convos</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>

          {/* User & Support Management */}
          <View style={styles.categorySection}>
            <View style={styles.categoryHeader}>
              <View style={styles.categoryIconContainer}>
                <Ionicons name="settings-outline" size={20} color="#667eea" />
              </View>
              <Text style={styles.categoryTitle}>Gestion & Support</Text>
            </View>
            
            <ScrollView 
              horizontal 
              showsHorizontalScrollIndicator={false}
              style={styles.actionScrollView}
              contentContainerStyle={styles.actionScrollContent}
            >
              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('Users')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#0a8fdf' }]}>
                  <Image source={USERS_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Utilisateurs</Text>
                <Text style={styles.modernActionSubtitle}>{stats.users} total</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('tickets')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#4CAF50' }]}>
                  <Image source={TICKET_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Tickets</Text>
                <Text style={styles.modernActionSubtitle}>{stats.tickets} support</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('Promotions')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#F44336' }]}>
                  <Image source={PROMOS_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Promos</Text>
                <Text style={styles.modernActionSubtitle}>{stats.newsCount} actives</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('Survey')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#FFC107' }]}>
                  <Image source={SURVEY_CHECK_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Enquêtes</Text>
                <Text style={styles.modernActionSubtitle}>{stats.surveys} total</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modernActionCard}
                onPress={() => navigation.navigate('CreateSurvey')}
              >
                <View style={[styles.modernActionIcon, { backgroundColor: '#4CAF50' }]}>
                  <Image source={ADD_CIRCLE_ICON} style={[styles.customActionIcon, { tintColor: '#fff' }]} />
                </View>
                <Text style={styles.modernActionTitle}>Créer</Text>
                <Text style={styles.modernActionSubtitle}>Nouvelle enquête</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        
        {/* Footer Spacing */}
        <View style={styles.footerSpacing} />
      </ScrollView>
      
      {/* Floating Action Button */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Settings')}
      >
        <LinearGradient
          colors={['#667eea', '#764ba2']}
          style={styles.fabGradient}
        >
          <Ionicons name="settings-outline" size={24} color="#fff" />
        </LinearGradient>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  // Main Container Styles
  mainContainer: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 15,
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },

  // Clean Header Styles
  header: {
    backgroundColor: '#fff',
    paddingTop: Platform.OS === 'ios' ? 50 : 35,
    paddingHorizontal: 20,
    //paddingBottom: 10,
    //bottom: 30,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profilePicture: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 2,
  },
  userRole: {
    fontSize: 14,
    color: '#6b7280',
    fontWeight: '500',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeSection: {
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f3f4f6',
  },
  welcomeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
  },
  lastUpdateText: {
    fontSize: 13,
    color: '#9ca3af',
  },

  // Scroll Container
  scrollContainer: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingTop: 0,
  },

  // Analytics Banner
  analyticsBanner: {
    marginBottom: 5,
    //paddingTop: 10,
    borderBottomRightRadius: 20,
    borderBottomLeftRadius: 20,
    overflow: 'hidden',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  analyticsBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  analyticsIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
    marginRight: 15,
  },
  analyticsBannerContent: {
    flex: 1,
  },
  analyticsBannerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 2,
  },
  analyticsBannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.8)',
  },

  // Performance Section
  performanceSection: {
    marginBottom: 25,
  },
  performanceGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  performanceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    width: '31%',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  performanceLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '500',
    marginBottom: 5,
  },
  performanceValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 2,
  },
  performanceSubtext: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
  },

  // Section Titles
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 15,
  },

  // Statistics Section
  statsSection: {
    marginBottom: 25,
  },
  statsScrollView: {
    marginHorizontal: -5,
  },
  statsScrollContent: {
    paddingHorizontal: 5,
  },
  modernStatCard: {
    width: 160,
    height: 120,
    borderRadius: 15,
    marginRight: 15,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  statCardGradient: {
    flex: 1,
    padding: 15,
    justifyContent: 'space-between',
  },
  statCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  modernStatIcon: {
    width: 24,
    height: 24,
    resizeMode: 'contain',
    marginRight: 8,
  },
  modernStatLabel: {
    fontSize: 13,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  modernStatNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 5,
  },
  statCardFooter: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
    paddingTop: 8,
  },
  statTrend: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },

  // Actions Section
  actionsSection: {
    marginBottom: 30,
  },
  categorySection: {
    marginBottom: 25,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    paddingHorizontal: 5,
  },
  categoryIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(102, 126, 234, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  categoryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    flex: 1,
  },
  urgentBadge: {
    backgroundColor: '#ef4444',
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  urgentBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },

  // Action Cards
  actionScrollView: {
    marginHorizontal: -5,
  },
  actionScrollContent: {
    paddingHorizontal: 5,
  },
  modernActionCard: {
    width: 140,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginRight: 15,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    position: 'relative',
  },
  priorityCard: {
    borderWidth: 2,
    borderColor: '#fbbf24',
    backgroundColor: '#fffbeb',
  },
  modernActionIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  customActionIcon: {
    width: 26,
    height: 26,
    resizeMode: 'contain',
  },
  modernActionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 4,
    textAlign: 'center',
  },
  modernActionSubtitle: {
    fontSize: 12,
    color: '#6b7280',
    textAlign: 'center',
  },
  actionBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
  },

  // Legacy Icon Styles (keeping for compatibility)
  customStatIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
  },

  // Footer and FAB
  footerSpacing: {
    height: 80,
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
  },
  fabGradient: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default AdminScreen;
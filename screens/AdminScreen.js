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
  Alert
} from 'react-native';
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
import { Ionicons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AdminScreen = () => {
  const navigation = useNavigation();
  const [adminData, setAdminData] = useState(null);
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
    newsCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const lastNotifiedNewUsersDate = useRef(null);
  // Removed notifiedPartnerIds as it's no longer needed for new partner notifications
  const notifiedPaymentIds = useRef(new Set());
  const notifiedPartnerConvosMsgs = useRef(new Set());

  const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
    const message = {
      to: expoPushToken,
      sound: 'er_notification',
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
      console.log('Push notification sent successfully (AdminScreen)!');
    } catch (error) {
      console.error('Failed to send push notification (AdminScreen):', error);
    }
  };

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
        if (currentAdminData?.expoPushToken) {
          sendPushNotification(
            currentAdminData.expoPushToken,
            "Nouveaux Utilisateurs!",
            `${newUsersToday} nouveau(x) utilisateur(s) a/ont rejoint aujourd'hui.`,
            { type: 'admin_new_users', count: newUsersToday }
          );
          lastNotifiedNewUsersDate.current = new Date();
          await AsyncStorage.setItem('lastNotifiedNewUsersDate', new Date().toISOString());
        } else {
            console.warn(`[AdminScreen Notifications] Admin user ${user.uid} has no expoPushToken to send new user notification.`);
        }
      }

      const ticketsQuerySnapshot = await getDocs(collection(db, 'tickets'));
      const partnersQuerySnapshot = await getDocs(collection(db, 'partners'));
      const surveysQuerySnapshot = await getDocs(collection(db, 'surveys'));
      const paymentsQuerySnapshot = await getDocs(query(collection(db, 'payments'), where('confirmed', '==', false)));

      const partnerConversationsSnapshot = await getDocs(collection(db, 'partnerConversations'));
      const totalUnifiedChatConversations = partnerConversationsSnapshot.size;

      const newsQuerySnapshot = await getDocs(collection(db, 'news'));
      const totalNews = newsQuerySnapshot.size;

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
        newsCount: totalNews,
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
              const adminUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
              if (adminUserDoc.exists() && adminUserDoc.data().expoPushToken) {
                sendPushNotification(
                  adminUserDoc.data().expoPushToken,
                  "Nouveau Paiement en Attente!",
                  `Un paiement de ${paymentData.paymentAmount}$ pour ${paymentData.partnerName} est en attente de confirmation.`,
                  { type: 'admin_pending_payment', paymentId: paymentId }
                );
                notifiedPaymentIds.current.add(paymentId);
              } else {
                console.warn(`[AdminScreen Notifications] Admin user ${currentUser.uid} has no expoPushToken or doc doesn't exist for new pending payment notification.`);
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
              const adminUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
              if (adminUserDoc.exists() && adminUserDoc.data().expoPushToken) {
                sendPushNotification(
                  adminUserDoc.data().expoPushToken,
                  `Nouveau Message Partenaire!`,
                  `De ${convoData.partnerName || 'un partenaire'}: "${convoData.lastMessage || 'nouveau message'}"`,
                  { type: 'admin_partner_chat', partnerId: convoId }
                );
                notifiedPartnerConvosMsgs.current.add(convoId);
              } else {
                console.warn(`[AdminScreen Notifications] Admin user ${currentUser.uid} has no expoPushToken or doc doesn't exist for partner convo notification.`);
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
    };
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={{ marginTop: 10, color: '#666' }}>Chargement du tableau de bord...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#0a8fdf']}
          tintColor="#0a8fdf"
          title="Actualisation..."
          titleColor="#0a8fdf"
        />
      }
    >
      {/* Header Section */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => navigation.navigate('Settings')}
      >
        <Image
          source={adminData?.photoURL ? { uri: adminData.photoURL } : require('../assets/images/Profile.png')}
          style={styles.profileImage}
        />
        <View style={styles.headerText}>
          <Text style={styles.greeting}>Bonjour, {adminData?.name || 'Admin'} !</Text>
          <Text style={styles.role}>Tableau de bord administrateur</Text>
        </View>
      </TouchableOpacity>

      {/* "See Graphics" Banner */}
      <TouchableOpacity
        style={styles.graphicsBanner}
        onPress={() => navigation.navigate('Datas')}
      >
        <Ionicons name="stats-chart-outline" size={24} color="#fff" />
        <Text style={styles.graphicsBannerText}>Voir les graphiques des données</Text>
        <Ionicons name="chevron-forward-outline" size={24} color="#fff" />
      </TouchableOpacity>

      {/* Recent Activity Section */}
      <Text style={styles.sectionTitle}>Activité récente</Text>
      <View style={styles.activityCard}>
        <Text style={styles.activityText}>Dernière connexion: Aujourd'hui à {lastUpdated || '--:--'}</Text>
        <Text style={styles.activityText}>
          <Text style={{ fontWeight: 'bold' }}>{stats.inactiveUsers}</Text> utilisateurs inactifs (30+ jours)
        </Text>
        <Text style={styles.activityText}>
          Nouveaux utilisateurs: <Text style={{ fontWeight: 'bold' }}>{stats.newUsersToday}</Text> aujourd'hui,{' '}
          <Text style={{ fontWeight: 'bold' }}>{stats.newUsersMonth}</Text> ce mois-ci,{' '}
          <Text style={{ fontWeight: 'bold' }}>{stats.newUsersYear}</Text> cette année
        </Text>
        <Text style={styles.activityText}>{stats.tickets} tickets au total</Text>
        {refreshing && (
          <Text style={[styles.activityText, { color: '#0a8fdf' }]}>
            Actualisation en cours...
          </Text>
        )}
      </View>

      {/* Stats Overview Grid */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#E3F2FD' }]}>
            <Ionicons name="people" size={24} color="#0a8fdf" />
          </View>
          <Text style={styles.statNumber}>{stats.users}</Text>
          <Text style={styles.statLabel}>Utilisateurs</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#E8F5E9' }]}>
            <Ionicons name="ticket" size={24} color="#4CAF50" />
          </View>
          <Text style={styles.statNumber}>{stats.tickets}</Text>
          <Text style={styles.statLabel}>Tickets</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#FFF3E0' }]}>
            <MaterialIcons name="chat" size={24} color="#FF9800" />
          </View>
          <Text style={styles.statNumber}>{stats.conversations}</Text>
          <Text style={styles.statLabel}>Conversations (Partenaire)</Text>
        </View>

        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#F3E5F5' }]}>
            <Feather name="users" size={24} color="#9C27B0" />
          </View>
          <Text style={styles.statNumber}>{stats.partners}</Text>
          <Text style={styles.statLabel}>Partenaires</Text>
        </View>
      </View>

      {/* Quick Actions Section */}
      <Text style={styles.sectionTitle}>Actions rapides</Text>
      <View style={styles.actionsContainer}>
        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Users')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#0a8fdf' }]}>
            <Ionicons name="people-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Gérer les utilisateurs</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('tickets')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#4CAF50' }]}>
            <Ionicons name="ticket-outline" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Gérer les tickets</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('PartnerMsg')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#FF9800' }]}>
            <MaterialIcons name="chat" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Conversations (Partenaire) ({stats.conversations})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Promotions')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#F44336' }]}>
            <FontAwesome name="newspaper-o" size={24} color="#fff" />
          </View>
          <Text style={styles.actionText}>Actualités ({stats.newsCount})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Partners')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#9C27B0' }]}>
            <Feather name="users" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Partenaires</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Survey')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#FFC107' }]}>
            <Ionicons name="list" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Enquêtes ({stats.surveys})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('Payments')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#607D8B' }]}>
            <FontAwesome name="money" size={24} color="#fff" />
          </View>
          <Text style={styles.actionText}>Paiements ({stats.pendingPayments})</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionCard}
          onPress={() => navigation.navigate('CreateSurvey')}
        >
          <View style={[styles.actionIcon, { backgroundColor: '#4CAF50' }]}>
            <Ionicons name="add-circle" size={28} color="#fff" />
          </View>
          <Text style={styles.actionText}>Créer une enquête</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 15,
    //marginTop: 20
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginRight: 15,
  },
  headerText: {
    flex: 1,
  },
  greeting: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  role: {
    fontSize: 14,
    color: '#666',
  },
  graphicsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a8fdf',
    padding: 15,
    borderRadius: 10,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  graphicsBannerText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 10,
    marginRight: 10,
  },
  statsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  statIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  actionsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  actionCard: {
    width: '48%',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: 'center',
  },
  actionIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  activityCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  activityText: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
});

export default AdminScreen;
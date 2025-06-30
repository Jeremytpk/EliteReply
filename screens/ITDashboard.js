import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Modal,
  Animated,
  Easing,
  Dimensions
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Swiper from 'react-native-swiper';
import { MaterialCommunityIcons, Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  getDocs,
  where,
  addDoc,
  arrayRemove // Added arrayRemove for potential future use or consistency
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

const ITDashboard = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [isClockedIn, setIsClockedIn] = useState(false);
  const [showClockInOutModal, setShowClockInOutModal] = useState(false);
  const [modalMessage, setModalMessage] = useState('');
  const [showStats, setShowStats] = useState(true);
  
  const [allPartnersForDropdown, setAllPartnersForDropdown] = useState([]);
  const [loadingPartnersForDropdown, setLoadingPartnersForDropdown] = useState(true);

  const [stats, setStats] = useState({
    totalTickets: 0,
    waitingTickets: 0,
    activeConversations: 0,
    completedTickets: 0,
    rating: 4.5, // This rating is static, consider making it dynamic from agent performance
    unreadPartnerMessagesCount: 0,
    agentTerminatedTickets: 0,
    scheduledAppointmentsCount: 0,
    jeyHandlingTicketsCount: 0,
    premiumTicketsCount: 0,
  });

  const currentUser = auth.currentUser;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  // Ref to keep track of tickets for which a notification has been sent
  const notifiedTicketsRef = useRef(new Set()); 

  useEffect(() => {
    const startPulse = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
    };

    startPulse();
  }, [pulseAnim]);

  const calculateWaitingTime = (createdAt) => {
    if (!createdAt?.toDate) return 'Maintenant';
    const diffInSeconds = Math.floor((new Date() - createdAt.toDate()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} sec`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} h`;
    return `${Math.floor(diffInSeconds / 86400)} jours`;
  };

  const isTicketOverdue = (createdAt, status) => {
    if (status !== 'nouveau') return false;
    if (!createdAt?.toDate) return false;

    const now = new Date();
    const createdTime = createdAt.toDate();
    const diffInMinutes = (now - createdTime) / (1000 * 60);

    return diffInMinutes > 10;
  };

  const updateTicketStats = (ticketsData) => {
    setStats(prevStats => ({
      ...prevStats,
      totalTickets: ticketsData.length,
      waitingTickets: ticketsData.filter(t =>
        (t.status === 'nouveau' && !t.assignedTo) || // New and unassigned
        (t.status === 'jey-handling' && t.isAgentRequested && !t.assignedTo) || // Jey asked for agent, unassigned
        (t.status === 'escalated_to_agent' && !t.assignedTo) // Escalated, unassigned
      ).length,
      activeConversations: ticketsData.filter(t => t.status === 'in-progress' && t.assignedTo === currentUser?.uid).length,
      completedTickets: ticketsData.filter(t => t.status === 'terminé').length,
      jeyHandlingTicketsCount: ticketsData.filter(t => t.status === 'jey-handling' && !t.isAgentRequested).length,
      premiumTicketsCount: ticketsData.filter(t => t.userIsPremium).length,
    }));
  };

  useEffect(() => {
    const partnersCollectionRef = collection(db, 'partners');
    const q = query(partnersCollectionRef, orderBy('name', 'asc'));

    const unsubscribePartners = onSnapshot(q, (snapshot) => {
      const fetchedPartners = snapshot.docs.map(doc => ({
        id: doc.id,
        label: doc.data().name,
        value: doc.id,
        ...doc.data(),
      }));
      setAllPartnersForDropdown(fetchedPartners);
      setLoadingPartnersForDropdown(false);
    }, (error) => {
      console.error("Error fetching all partners for dropdown:", error);
      setLoadingPartnersForDropdown(false);
    });

    return () => unsubscribePartners();
  }, []);

  const handleClockInOut = async () => {
    if (!currentUser) {
      Alert.alert("Erreur", "Veuillez vous connecter pour enregistrer votre présence.");
      return;
    }

    const userDocRef = doc(db, 'users', currentUser.uid);

    if (!isClockedIn) {
      Alert.alert(
        "Confirmation",
        "Voulez-vous commencer votre journée ?",
        [
          { text: "Annuler", style: "cancel" },
          {
            text: "Confirmer",
            onPress: async () => {
              try {
                await updateDoc(userDocRef, {
                  isClockedIn: true,
                  clockInTime: serverTimestamp(),
                  lastActivity: serverTimestamp(),
                });
                setIsClockedIn(true);
                setModalMessage(`Bonjour ${userData?.name || 'Agent'}! Bonne journée de travail.`);
                setShowClockInOutModal(true);
              } catch (error) {
                console.error("Error clocking in:", error);
                Alert.alert("Erreur", "Impossible de vous enregistrer.");
              }
            }
          }
        ]
      );
    } else {
      Alert.alert(
        "Confirmation",
        "Voulez-vous vraiment clôturer votre journée ?",
        [
          { text: "Annuler",
            style: "cancel" },
          {
            text: "Confirmer",
            onPress: async () => {
              try {
                await updateDoc(userDocRef, {
                  isClockedIn: false,
                  clockOutTime: serverTimestamp(),
                  lastActivity: serverTimestamp(),
                });
                setIsClockedIn(false);
                setModalMessage("Au revoir et à bientôt !");
                setShowClockInOutModal(true);
              } catch (error) {
                console.error("Error clocking out:", error);
                Alert.alert("Erreur", "Impossible de vous désenregistrer.");
              }
            }
          }
        ]
      );
    }
  };

  // --- NEW: Function to send push notification (placeholder) ---
  // In a real app, this would be a call to your backend/Cloud Function
  const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
    // console.log("Sending push notification to token:", expoPushToken, "Title:", title, "Body:", body, "Data:", data);
    const message = {
      to: expoPushToken,
      sound: 'default',
      title,
      body,
      data,
    };

    try {
      await fetch('https://exp.host/--/api/v2/push/send', { // Expo's Push Notification API
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Accept-encoding': 'gzip, deflate',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });
      console.log('Push notification sent successfully!');
    } catch (error) {
      console.error('Failed to send push notification:', error);
    }
  };
  // --- END NEW: Function to send push notification ---

  useEffect(() => {
    let unsubscribes = [];

    const setupListeners = async () => {
      if (!currentUser) {
        setLoading(false);
        return;
      }

      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setUserData(data);
          setIsClockedIn(data.isClockedIn || false);
          setStats(prevStats => ({
              ...prevStats,
              agentTerminatedTickets: data.terminatedTicketsCount || 0
          }));
        } else {
          setUserData({ name: 'Agent', terminatedTicketsCount: 0 });
          setStats(prevStats => ({ ...prevStats, agentTerminatedTickets: 0 }));
        }
      } catch (error) {
        console.error("Error fetching initial user data:", error);
        setUserData({ name: 'Agent', terminatedTicketsCount: 0 });
        setStats(prevStats => ({ ...prevStats, agentTerminatedTickets: 0 }));
      }

      try {
        const ticketsQuery = query(
          collection(db, 'tickets'),
          where('status', '!=', 'terminé'),
          orderBy('createdAt', 'asc')
        );

        const unsubscribeTickets = onSnapshot(ticketsQuery, async (snapshot) => {
          const newTicketsData = snapshot.docs
            .map(doc => ({
              id: doc.id,
              ...doc.data(),
              waitingTime: moment(doc.data().createdAt?.toDate()).fromNow(),
              isOverdue: isTicketOverdue(doc.data().createdAt, doc.data().status),
              userIsPremium: doc.data().userIsPremium || false,
            }))
            .filter(ticket =>
              ticket.status === 'nouveau' ||
              ticket.status === 'escalated_to_agent' ||
              (ticket.status === 'jey-handling' && (ticket.isAgentRequested || !ticket.assignedTo)) ||
              (ticket.status === 'in-progress' && ticket.assignedTo === currentUser.uid) ||
              (ticket.status === 'in-progress' && ticket.assignedTo !== currentUser.uid)
            )
            .sort((a, b) => {
              const aIsMineInProgress = a.status === 'in-progress' && a.assignedTo === currentUser.uid;
              const bIsMineInProgress = b.status === 'in-progress' && b.assignedTo === currentUser.uid;

              // Rule 1: 'in-progress' and assigned to current user always on top
              if (aIsMineInProgress && !bIsMineInProgress) return -1;
              if (!aIsMineInProgress && bIsMineInProgress) return 1;

              const aIsJeyHandling = a.status === 'jey-handling';
              const bIsJeyHandling = b.status === 'jey-handling';

              // Rule 4: Jey-handling tickets always last
              if (aIsJeyHandling && !bIsJeyHandling) return 1;
              if (!aIsJeyHandling && bIsJeyHandling) return -1;

              // Rule 2: Premium tickets (among non-my-in-progress and non-jey-handling)
              if (a.userIsPremium && !b.userIsPremium) return -1;
              if (!a.userIsPremium && b.userIsPremium) return 1;

              // Rule 3: All others (non-my-in-progress, non-jey-handling, non-premium) by waiting time (createdAt ascending)
              return a.createdAt?.toDate() - b.createdAt?.toDate();
            });

          // --- NEW: Push notification logic for new tickets ---
          if (currentUser?.uid && isClockedIn) { // Only notify if agent is clocked in
            newTicketsData.forEach(async (newTicket) => {
              const isRelevantNewTicket =
                (!newTicket.assignedTo || newTicket.assignedTo === 'jey-ai') && // Unassigned or Jey handling
                (newTicket.status === 'nouveau' ||
                 newTicket.status === 'escalated_to_agent' ||
                 (newTicket.status === 'jey-handling' && newTicket.isAgentRequested));

              if (isRelevantNewTicket && !notifiedTicketsRef.current.has(newTicket.id)) {
                console.log(`NEW TICKET DETECTED: ${newTicket.id} - Status: ${newTicket.status}, isAgentRequested: ${newTicket.isAgentRequested}`);
                // Get all IT Support agents' tokens
                const itAgentsQuery = query(
                  collection(db, 'users'),
                  where('role', '==', 'IT'),
                  where('isClockedIn', '==', true), // Only notify clocked-in agents
                  where('expoPushToken', '!=', null) // Ensure they have a token
                );
                const itAgentsSnap = await getDocs(itAgentsQuery);
                
                const currentAgentRole = userData?.role; // Assuming userData has role
                const isCurrentAgentIT = currentAgentRole === 'IT';

                if (itAgentsSnap.empty) {
                  console.log("No IT agents found or no clocked-in IT agents with push tokens to notify.");
                }

                itAgentsSnap.forEach(agentDoc => {
                  if (agentDoc.id !== currentUser.uid && isCurrentAgentIT) { // Don't notify the current user if they are an IT agent already viewing
                    const agentData = agentDoc.data();
                    if (agentData.expoPushToken) {
                      sendPushNotification(
                        agentData.expoPushToken,
                        "Nouveau Ticket Urgent!",
                        `Un nouveau ticket de type "${newTicket.category}" de ${newTicket.userName} est en attente.`,
                        { type: 'ticket', ticketId: newTicket.id }
                      );
                      notifiedTicketsRef.current.add(newTicket.id); // Mark as notified
                    }
                  } else if (agentDoc.id === currentUser.uid && !isCurrentAgentIT) {
                    // This block could be used to notify the current user if they are NOT an IT agent
                    // but the ticket is relevant to them in some other way, though less common for ITDashboard.
                  }
                });
              }
            });
          }
          // --- END NEW: Push notification logic ---

          setTickets(newTicketsData);
          updateTicketStats(newTicketsData);
        }, (error) => {
          console.error("Error fetching tickets:", error);
        });
        unsubscribes.push(unsubscribeTickets);

        const partnerConvosQuery = query(
          collection(db, 'partnerConversations'),
          where('participants', 'array-contains', currentUser.uid)
        );

        const unsubscribePartnerConvos = onSnapshot(partnerConvosQuery, async (snapshot) => {
          let totalUnreadCount = 0;
          const unreadChecks = snapshot.docs.map(async (docSnapshot) => {
            const conversationId = docSnapshot.id;
            const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', conversationId);
            const userConvoStateSnap = await getDoc(userConvoStateRef);
            const lastReadTimestamp = userConvoStateSnap.exists()
              ? userConvoStateSnap.data().lastRead
              : null;

            let messagesQuery = query(
              collection(db, 'partnerConversations', conversationId, 'messages'),
              orderBy('createdAt', 'asc')
            );
            if (lastReadTimestamp) {
              messagesQuery = query(messagesQuery, where('createdAt', '>', lastReadTimestamp));
            }
            const messagesSnap = await getDocs(messagesQuery);
            return messagesSnap.docs.filter(msgDoc => msgDoc.data().senderId !== currentUser.uid).length;
          });

          const counts = await Promise.all(unreadChecks);
          totalUnreadCount = counts.reduce((sum, count) => sum + count, 0);

          setStats(prev => ({
            ...prev,
            unreadPartnerMessagesCount: totalUnreadCount
          }));
        }, (error) => {
          console.error("Error fetching partner conversations for unread count:", error);
        });
        unsubscribes.push(unsubscribePartnerConvos);

        const agentRdvQuery = query(
          collection(db, 'rdv'),
          where('bookedByAgentId', '==', currentUser.uid),
          where('status', 'in', ['scheduled', 'rescheduled'])
        );
        const unsubscribeAgentRdv = onSnapshot(agentRdvQuery, (snapshot) => {
          setStats(prevStats => ({
            ...prevStats,
            scheduledAppointmentsCount: snapshot.docs.length
          }));
        }, (error) => {
          console.error("Error fetching agent's scheduled appointments:", error);
        });
        unsubscribes.push(unsubscribeAgentRdv);

        setLoading(false);

      } catch (error) {
        console.error("Error setting up listeners:", error);
        setLoading(false);
      }
    };

    setupListeners();

    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [currentUser?.uid, isFocused, isClockedIn, userData]); // Added isClockedIn and userData to dependencies

  const handleRefresh = useCallback(() => {
    setLoading(true);
  }, [currentUser]);


  const handleTakeTicket = async (ticket) => {
    if (!currentUser) {
        Alert.alert("Erreur", "Vous devez être connecté pour prendre un ticket.");
        return;
    }
    if (ticket.status === 'jey-handling' && !ticket.isAgentRequested) {
      Alert.alert("Information", "Ce ticket est actuellement géré par Jey et le client n'a pas encore demandé d'agent humain.");
      return;
    }
    if (ticket.status === 'in-progress' && ticket.assignedTo !== currentUser?.uid) {
        Alert.alert("Information", `Ce ticket est déjà pris en charge par ${ticket.assignedToName || 'un autre agent'}.`);
        return;
    }

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, 'tickets', ticket.id), {
        status: 'in-progress',
        assignedTo: currentUser.uid,
        assignedToName: userData?.name || 'Agent',
        updatedAt: serverTimestamp(),
        isAgentRequested: false,
      });

      const conversationRef = doc(db, 'conversations', ticket.id);
      const conversationSnap = await getDoc(conversationRef);

      if (conversationSnap.exists()) {
        batch.update(conversationRef, {
          status: 'in-progress',
          assignedTo: currentUser.uid,
          assignedToName: userData?.name || 'Agent',
          lastUpdated: serverTimestamp(),
          participants: arrayUnion(currentUser.uid),
          participantNames: arrayUnion(userData?.name || 'Agent'),
          isAgentRequested: false,
        });
      } else {
        batch.set(conversationRef, {
          ticketId: ticket.id,
          status: 'in-progress',
          assignedTo: currentUser.uid,
          assignedToName: userData?.name || 'Agent',
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          participants: [currentUser.uid, ticket.userId],
          participantNames: [userData?.name || 'Agent', ticket.userName],
          lastMessage: "Conversation initiée par Agent",
          lastMessageTimestamp: serverTimestamp(),
          unreadByUser: true,
          unreadBySupport: false,
          isAgentRequested: false,
        });
      }

      await batch.commit();

      await addDoc(collection(db, 'tickets', ticket.id, 'messages'), {
        texte: `${userData?.name || 'Un agent'} a pris le relais de cette conversation.`,
        expediteurId: 'systeme',
        nomExpediteur: 'Système',
        createdAt: serverTimestamp(),
        type: 'text'
      });

      navigation.navigate('Conversation', {
        ticketId: ticket.id,
        isITSupport: true,
        userId: ticket.userId,
        userName: ticket.userName,
        userPhone: ticket.userPhone
      });
    } catch (error) {
      console.error("Error taking ticket:", error);
      Alert.alert("Erreur", "Impossible de prendre en charge ce ticket");
    }
  };

  const navigateToTicketInfo = (ticketId) => {
    navigation.navigate('TicketInfo', { ticketId });
  };

  const navigateToSettings = () => {
    navigation.navigate('Settings');
  };

  if (loading || loadingPartnersForDropdown) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Chargement des données...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <TouchableOpacity style={styles.header} onPress={navigateToSettings}>
        <View style={styles.profileContainer}>
          <Image
            source={userData?.photoURL ? { uri: userData.photoURL } : require('../assets/images/Profile.png')}
            style={styles.profileImage}
          />
          <View>
            <Text style={styles.userName}>{userData?.name || 'Agent'}</Text>
            <Text style={styles.userRole}>Agent</Text>
          </View>
        </View>
        <Image style={{ height: 40, width: 60, resizeMode: 'contain' }} source={require('../assets/images/logoVide.png')} />
      </TouchableOpacity>

      {/* Stats Cards Section */}
      <TouchableOpacity
        onPress={() => setShowStats(!showStats)}
        style={styles.toggleStatsButton}
      >
        <Text style={styles.sectionTitle}>Statistiques de performance</Text>
        <Ionicons
          name={showStats ? 'chevron-up-outline' : 'chevron-down-outline'}
          size={24}
          color="#6B7280"
        />
      </TouchableOpacity>

      {showStats && (
        <>
          <View style={styles.statsRow}>
            {/* Clock In/Out Button */}
            <TouchableOpacity
              style={[
                styles.statCard,
                isClockedIn ? styles.clockOutCard : styles.clockInCard,
                styles.clockButtonPadding
              ]}
              onPress={handleClockInOut}
            >
              <View style={[
                  styles.statIcon,
                  isClockedIn ? styles.clockOutIconBackground : styles.clockInIconBackground
                ]}>
                <MaterialIcons name={isClockedIn ? "logout" : "login"} size={24} color="#FFF" />
              </View>
              <Text style={styles.clockButtonText}>
                {isClockedIn ? 'Terminer' : 'Travailler'}
              </Text>
              <Text style={styles.clockButtonSubText}>
                {isClockedIn ? 'Fin de journée' : 'Début de journée'}
              </Text>
            </TouchableOpacity>

            <StatCard
              icon={<MaterialIcons name="hourglass-empty" size={24} color="#EA4335" />}
              value={stats.waitingTickets}
              label="En Attente"
            />
            <StatCard
                icon={<MaterialIcons name="check-circle" size={24} color="#66BB6A" />}
                value={stats.agentTerminatedTickets}
                label="Mes Terminés"
            />
          </View>

          <View style={styles.statsRow}>
            <StatCard
              icon={<MaterialIcons name="calendar-today" size={24} color="#FF9500" />} 
              value={stats.scheduledAppointmentsCount}
              label="Rendez-vous"
              onPress={() => navigation.navigate('Appointments')}
            />
            <StatCard
              icon={<MaterialIcons name="assignment" size={24} color="#9C27B0" />}
              value={stats.totalTickets}
              label="Total Tickets"
            />
            <StatCard
              icon={<MaterialIcons name="chat" size={24} color="#4285F4" />}
              value={stats.activeConversations}
              label="Actives"
            />
          </View>
          <View style={styles.statsRow}>
            <View style={{ width: '30%' }} />
          </View>
        </>
      )}

      <View style={styles.ticketSectionHeader}>
        <Text style={styles.sectionTitle}>Tickets ({tickets.length})</Text>
        {stats.jeyHandlingTicketsCount > 0 && (
          <Text style={styles.jeyHandlingLabel}>Jey ({stats.jeyHandlingTicketsCount})</Text>
        )}
        {stats.premiumTicketsCount > 0 && (
          <View style={styles.premiumCountContainer}>
            <MaterialIcons name="workspace-premium" size={20} color="#FFD700" />
            <Text style={styles.premiumCountLabel}>Premium ({stats.premiumTicketsCount})</Text>
          </View>
        )}
      </View>

      <FlatList
        data={tickets}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[
            styles.ticketCard,
            item.userIsPremium && styles.premiumTicketCard
          ]}>
            <View style={styles.ticketHeader}>
              <View style={styles.ticketStatusContainer}>
                {item.status === 'in-progress' && item.assignedTo === currentUser?.uid && (
                  <View style={[styles.statusDot, styles.greenDot]} />
                )}
                {item.status === 'in-progress' && item.assignedTo !== currentUser?.uid && (
                    <View style={[styles.statusDot, styles.lightBlueDot]} />
                )}
                {item.status === 'nouveau' && !item.isOverdue && (
                  <View style={[styles.statusDot, styles.blueDot]} />
                )}
                {item.isOverdue && (
                  <View style={[styles.statusDot, styles.redDot]} />
                )}
                {item.status === 'jey-handling' && !item.isAgentRequested && (
                  <View style={[styles.statusDot, styles.orangeDot]} />
                )}
                {item.status === 'escalated_to_agent' && (
                  <View style={[styles.statusDot, styles.purpleDot]} />
                )}
                {item.status === 'jey-handling' && item.isAgentRequested && (
                    <View style={[styles.statusDot, styles.purpleDot]} />
                )}

                <Text style={styles.ticketCategory}>{item.category}</Text>

                {/* Premium Icon for Premium Users (within card) */}
                {item.userIsPremium && (
                  <Animated.View
                    style={[
                      styles.premiumIconContainer,
                      { transform: [{ scale: pulseAnim }] },
                    ]}
                  >
                    <MaterialIcons name="workspace-premium" size={24} color="white" />
                  </Animated.View>
                )}

                {item.isAgentRequested && (
                  <MaterialIcons
                    name="emoji-people"
                    size={30}
                    color="red"
                    style={styles.agentRequestedIcon}
                  />
                )}
              </View>

              <View style={styles.ticketHeaderRight}>
                <Text style={styles.ticketTime}>
                  Attente: {calculateWaitingTime(item.createdAt)}
                </Text>
                <TouchableOpacity onPress={() => navigateToTicketInfo(item.id)}>
                  <MaterialIcons name="info" size={20} color="#6B7280" />
                </TouchableOpacity>
              </View>
            </View>

            <Text style={styles.ticketMessage}>{item.message}</Text>
            <Text style={styles.ticketUser}>De: {item.userName}</Text>

            {item.status === 'in-progress' && item.assignedTo === currentUser?.uid && (
              <Text style={styles.assignedText}>Assigné à: Vous</Text>
            )}
            {item.status === 'in-progress' && item.assignedTo !== currentUser?.uid && (
              <Text style={styles.assignedText}>Assigné à: {item.assignedToName}</Text>
            )}
            {item.status === 'jey-handling' && !item.isAgentRequested && (
                <Text style={styles.assignedText}>Géré par: Jey (Assistant IA)</Text>
            )}
             {item.status === 'jey-handling' && item.isAgentRequested && (
                <Text style={styles.assignedText}>Géré par Jey. Agent demandé par le client.</Text>
            )}
             {item.status === 'escalated_to_agent' && (
                <Text style={styles.assignedText}>Agent demandé par Jey.</Text>
            )}


            <View style={styles.ticketActions}>
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  (item.status === 'jey-handling' && !item.isAgentRequested) ? styles.disabledButton :
                  (item.status === 'in-progress' && item.assignedTo !== currentUser?.uid) ? styles.disabledButton :
                  (item.status === 'in-progress' && item.assignedTo === currentUser?.uid) ? styles.inProgressButton :
                  styles.takeButton
                ]}
                onPress={() => handleTakeTicket(item)}
                disabled={
                  (item.status === 'jey-handling' && !item.isAgentRequested) ||
                  (item.status === 'in-progress' && item.assignedTo !== currentUser?.uid)
                }
              >
                <Text style={styles.buttonText}>
                  {item.status === 'jey-handling' && !item.isAgentRequested ? 'Géré par Jey' :
                   item.status === 'in-progress' ?
                    (item.assignedTo === currentUser?.uid ? 'En cours...' : 'Pris par un autre Agent') :
                    'Prendre'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={60} color="#34C759" />
            <Text style={styles.emptyText}>Aucun ticket en attente</Text>
          </View>
        }
      />

      <Modal
        animationType="fade"
        transparent={true}
        visible={showClockInOutModal}
        onRequestClose={() => setShowClockInOutModal(false)}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalContent}>
            <Image
              source={require('../assets/images/logoFace.png')}
              style={styles.modalLogo}
              resizeMode="contain"
            />
            <Text style={styles.modalTitle}>{modalMessage}</Text>
            <TouchableOpacity
              style={styles.modalButton}
              onPress={() => setShowClockInOutModal(false)}
            >
              <Text style={styles.modalButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const StatCard = ({ icon, value, label, onPress }) => (
  <TouchableOpacity style={styles.statCard} onPress={onPress} activeOpacity={onPress ? 0.8 : 1}>
    <View style={styles.statIcon}>{icon}</View>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 40 : 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    //marginTop: 20,
    padding: 12,
    backgroundColor: 'white',
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  profileContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profileImage: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E5E7EB',
  },
  userName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  userRole: {
    fontSize: 14,
    color: '#6B7280',
  },
  logo: {
    height: 40,
    width: 60,
    resizeMode: 'contain'
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    width: '30%',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  statIcon: {
    backgroundColor: '#F3F4F6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    fontWeight: '500',
  },
  ticketSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    marginLeft: 4,
    flexWrap: 'wrap', // Allow labels to wrap if too long
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  jeyHandlingLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FF9500',
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 149, 0, 0.1)',
    borderRadius: 8,
  },
  premiumCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 215, 0, 0.1)',
    borderRadius: 8,
  },
  premiumCountLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFD700',
    marginLeft: 5,
  },
  ticketCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  // NEW IMPROVED PREMIUM TICKET CARD COLOR
  premiumTicketCard: {
    backgroundColor: '#FFE082', // A more visible light amber/gold
    borderColor: '#FFD700', // Gold border
    borderWidth: 1,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  ticketStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  greenDot: {
    backgroundColor: '#34C759',
  },
  lightBlueDot: {
    backgroundColor: '#5AC8FA',
  },
  redDot: {
    backgroundColor: '#EA4335',
  },
  blueDot: {
    backgroundColor: '#007AFF',
  },
  orangeDot: {
    backgroundColor: '#FF9500',
  },
  purpleDot: {
    backgroundColor: '#AF52DE',
  },
  ticketHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ticketCategory: {
    fontSize: 14,
    fontWeight: '600',
    color: '#34C759',
    textTransform: 'uppercase',
  },
  agentRequestedIcon: {
    marginLeft: 8,
  },
  ticketTime: {
    fontSize: 12,
    color: '#9CA3AF',
    fontWeight: '500',
    marginRight: 8,
  },
  ticketMessage: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 8,
    lineHeight: 20,
  },
  ticketUser: {
    fontSize: 12,
    color: '#9CA3AF',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  assignedText: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 12,
    fontStyle: 'italic',
  },
  ticketActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    width: '100%',
    justifyContent: 'center',
  },
  takeButton: {
    backgroundColor: '#34C759',
  },
  inProgressButton: {
    backgroundColor: '#4285F4',
  },
  completeButton: {
    backgroundColor: '#6B7280',
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
    fontWeight: '500',
  },
   clockInCard: {
    backgroundColor: '#34C759',
  },
  clockOutCard: {
    backgroundColor: '#EA4335',
  },
  clockButtonPadding: {
    paddingVertical: 20,
  },
  clockButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 16,
    marginBottom: 4,
  },
  clockButtonSubText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '500',
  },
  statIcon: {
    backgroundColor: '#F3F4F6',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  clockInIconBackground: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  clockOutIconBackground: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 25,
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    width: '80%',
  },
  modalLogo: {
    width: 100,
    height: 100,
    marginBottom: 20,
    borderRadius: 100
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  modalButton: {
    backgroundColor: '#0a8fdf',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
  },
  modalButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  toggleStatsButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  premiumIconContainer: {
    marginLeft: 10,
    marginRight: 5,
  },
});

export default ITDashboard;
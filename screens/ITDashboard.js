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
  Dimensions,
  RefreshControl,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Swiper from 'react-native-swiper'; // This still seems unused, consider removing if confirmed not needed.
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
  arrayRemove
} from 'firebase/firestore';
import { db, auth } from '../firebase';
// REMOVED: import moment from 'moment';
// REMOVED: import 'moment/moment-timezone';
// REMOVED: import 'moment/locale/fr';

// REMOVED: moment.locale('fr');

const ITDashboard = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    completedTickets: 0, // This stat will still count completed tickets for the dashboard summary
    rating: 4.5,
    unreadPartnerMessagesCount: 0,
    agentTerminatedTickets: 0,
    scheduledAppointmentsCount: 0,
    jeyHandlingTicketsCount: 0,
    premiumTicketsCount: 0,
  });

  const [inAppNotification, setInAppNotification] = useState(null);

  const currentUser = auth.currentUser;

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const notifiedTicketsRef = useRef(new Set());
  const lastKnownTicketsRef = useRef([]);

  const unsubscribesRef = useRef([]);

  // --- Animation for Premium Icon ---
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

  // --- Helper to calculate waiting time (using native Date and Intl.RelativeTimeFormat) ---
  const calculateWaitingTime = (createdAt) => {
    if (!createdAt?.toDate) return 'Maintenant';
    const date = createdAt.toDate();
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds} sec`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} h`;
    return `${Math.floor(diffInSeconds / 86400)} jours`;
  };

  // --- Helper to check if ticket is overdue (new status, older than 10 minutes) ---
  const isTicketOverdue = (createdAt, status) => {
    if (status !== 'nouveau') return false;
    if (!createdAt?.toDate) return false;

    const now = new Date();
    const createdTime = createdAt.toDate();
    const diffInMinutes = (now.getTime() - createdTime.getTime()) / (1000 * 60);

    return diffInMinutes > 10;
  };

  // --- Updates dashboard statistics based on fetched tickets ---
  const updateTicketStats = (allTicketsData) => { // Renamed parameter to clarify it's all tickets
    setStats(prevStats => ({
      ...prevStats,
      totalTickets: allTicketsData.length,
      waitingTickets: allTicketsData.filter(t =>
        (t.status === 'nouveau' && !t.assignedTo) ||
        (t.status === 'jey-handling' && t.isAgentRequested && !t.assignedTo) ||
        (t.status === 'escalated_to_agent' && !t.assignedTo)
      ).length,
      activeConversations: allTicketsData.filter(t => t.status === 'in-progress' && t.assignedTo === currentUser?.uid).length,
      completedTickets: allTicketsData.filter(t => t.status === 'terminé').length,
      jeyHandlingTicketsCount: allTicketsData.filter(t =>
        t.status === 'jey-handling' && !t.isAgentRequested
      ).length,
      premiumTicketsCount: allTicketsData.filter(t => t.userIsPremium).length,
    }));
  };

  // This fetches partners for the dropdown, not directly related to the current issue
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

  // --- Handles agent clock-in/clock-out ---
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
                setModalMessage(`Bonjour ${userData?.name || currentUser?.displayName || 'Agent'}! Bonne journée de travail.`);
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
          { text: "Annuler", style: "cancel" },
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

  // --- Function to send push notifications (used for IT agent notifications) ---
  const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
    const message = {
      to: expoPushToken,
      sound: 'er_notification', // Custom sound
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
      console.log('Push notification sent successfully!');
    } catch (error) {
      console.error('Failed to send push notification:', error);
    }
  };

  // --- Sets up all Firestore listeners for the dashboard ---
  const setupListeners = useCallback(async () => {
    unsubscribesRef.current.forEach(unsub => unsub());
    unsubscribesRef.current = [];

    if (!currentUser) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    setLoading(true);
    setRefreshing(true);

    try {
      // 1. Fetch current agent's user data
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
      // 2. Listener for Tickets (real-time updates) - NOW FETCHES ALL TICKETS
      const ticketsQuery = query(
        collection(db, 'tickets'),
        orderBy('createdAt', 'desc')
      );

      const unsubscribeTickets = onSnapshot(ticketsQuery, async (snapshot) => {
        const allFetchedTickets = snapshot.docs // Renamed to clearly indicate all tickets are fetched initially
          .map(doc => ({
            id: doc.id,
            ...doc.data(),
            // Using native Date for waitingTime calculation
            waitingTime: calculateWaitingTime(doc.data().createdAt),
            isOverdue: isTicketOverdue(doc.data().createdAt, doc.data().status),
            userIsPremium: doc.data().userIsPremium || false,
            // Add the new clientTerminated flag here
            clientTerminated: doc.data().clientTerminated || false,
          }));

        // Filter out completely terminated tickets for the main display list
        // but include those terminated by Jey for agent action.
        const activeDisplayTickets = allFetchedTickets.filter(t =>
            t.status !== 'terminé' || (t.status === 'terminé' && t.terminatedBy === 'jey-ai')
        );

        // --- Push Notification and In-App Notification Logic for IT Agents ---
        if (currentUser?.uid && isClockedIn) {
          const currentTicketIds = new Set(allFetchedTickets.map(t => t.id)); // Use allFetchedTickets for notification logic
          const previouslyKnownTicketIds = new Set(lastKnownTicketsRef.current.map(t => t.id));

          for (const newTicket of allFetchedTickets) { // Iterate over allFetchedTickets for notifications
              const oldTicketState = lastKnownTicketsRef.current.find(t => t.id === newTicket.id);
              const isNewTicketAdded = !previouslyKnownTicketIds.has(newTicket.id);

              let shouldNotifyInApp = false;
              let shouldSendPush = false;
              let notificationTitle = "Nouveau Ticket!";
              let notificationBody = "";

              // Skip notifications for tickets that are already terminated by a human agent
              if (newTicket.status === 'terminé' && newTicket.terminatedBy !== 'jey-ai') {
                  continue;
              }

              // Case 1: Brand new ticket
              if (isNewTicketAdded) {
                  notificationBody = `Un nouveau ticket de type "${newTicket.category}" de ${newTicket.userName} est en attente.`;
                  shouldNotifyInApp = true;
                  shouldSendPush = true;
                  console.log(`[NOTIFY] NEW TICKET ADDED: ${newTicket.id}`);
              }
              // Case 2: Jey handling ticket where agent was requested (status change from Jey-handling to agent-requested)
              // Only notify if it wasn't already assigned to an agent
              else if (oldTicketState?.status === 'jey-handling' && oldTicketState?.isAgentRequested === false && newTicket.isAgentRequested === true && !newTicket.assignedTo) {
                  notificationTitle = "Jey a demandé un Agent!";
                  notificationBody = `Le client a demandé un agent pour le ticket "${newTicket.category}" de ${newTicket.userName}.`;
                  shouldNotifyInApp = true;
                  shouldSendPush = true;
                  console.log(`[NOTIFY] JEY REQUESTED AGENT: ${newTicket.id}`);
              }
              // Case 3: Ticket escalated by Jey (status change)
              // Only notify if it wasn't already assigned to an agent
              else if (oldTicketState?.status === 'jey-handling' && newTicket.status === 'escalated_to_agent' && !newTicket.assignedTo) {
                  notificationTitle = "Ticket Escaladé par Jey!";
                  notificationBody = `Jey a escaladé le ticket "${newTicket.category}" de ${newTicket.userName}. Il nécessite une intervention humaine.`;
                  shouldNotifyInApp = true;
                  shouldSendPush = true;
                  console.log(`[NOTIFY] JEY ESCALATED: ${newTicket.id}`);
              }
              // Case 4: Ticket terminated by Jey (client or Jey initiated) and needs agent's manual termination
              else if (oldTicketState?.status !== 'terminé' && newTicket.status === 'terminé' && newTicket.terminatedBy === 'jey-ai') {
                  notificationTitle = "Conversation Terminée par Jey!";
                  notificationBody = `Le ticket "${newTicket.category}" de ${newTicket.userName} a été terminé par Jey. Veuillez le clôturer manuellement.`;
                  shouldNotifyInApp = true;
                  shouldSendPush = true;
                  console.log(`[NOTIFY] JEY TERMINATED: ${newTicket.id}`);
              }


              if (shouldNotifyInApp && !notifiedTicketsRef.current.has(newTicket.id + '_inapp') && isFocused) {
                setInAppNotification({
                  title: notificationTitle,
                  body: notificationBody,
                  ticketId: newTicket.id,
                });
                notifiedTicketsRef.current.add(newTicket.id + '_inapp');
                console.log(`[IN-APP NOTIFY] Ticket ${newTicket.id}: ${notificationTitle}`);
              }

              if (shouldSendPush && !notifiedTicketsRef.current.has(newTicket.id + '_push')) {
                  const itAgentsQuery = query(
                      collection(db, 'users'),
                      where('role', '==', 'IT'),
                      where('isClockedIn', '==', true),
                      where('expoPushToken', '!=', null)
                  );
                  const itAgentsSnap = await getDocs(itAgentsQuery);

                  itAgentsSnap.forEach(agentDoc => {
                      const agentData = agentDoc.data();
                      // Only send push if not to the current agent (they get in-app)
                      if (agentData.expoPushToken && agentDoc.id !== currentUser.uid) {
                          sendPushNotification(
                              agentData.expoPushToken,
                              notificationTitle,
                              notificationBody,
                              { type: 'ticket', ticketId: newTicket.id, screen: 'TicketInfo' }
                          );
                      }
                  });
                  notifiedTicketsRef.current.add(newTicket.id + '_push');
                  console.log(`[PUSH NOTIFY] Ticket ${newTicket.id}: ${notificationTitle}`);
              }
          }

          // Cleanup notifiedTicketsRef for tickets that are no longer in the fetched list (e.g., terminated)
          notifiedTicketsRef.current.forEach(notifiedId => {
              const ticketId = notifiedId.split('_')[0];
              const ticketExistsInCurrentFetch = currentTicketIds.has(ticketId);
              // Only remove from notified list if the ticket is truly no longer active AND not in the `terminatedBy Jey` state
              const isTerminatedByJeyAndStillInList = activeDisplayTickets.some(t => t.id === ticketId && t.status === 'terminé' && t.terminatedBy === 'jey-ai');

              if (!ticketExistsInCurrentFetch && !isTerminatedByJeyAndStillInList) {
                  notifiedTicketsRef.current.delete(notifiedId);
              }
          });
        }

        // Sort the *active* tickets for display
        activeDisplayTickets.sort((a, b) => {
            const getPriority = (ticket) => {
                // Highest priority: Tickets terminated by Jey awaiting agent closure
                if (ticket.status === 'terminé' && ticket.terminatedBy === 'jey-ai') {
                    return 0;
                }
                if (ticket.status === 'in-progress' && ticket.assignedTo === currentUser?.uid) {
                    return 1; // My active conversations
                }
                if (ticket.status === 'jey-handling' && ticket.isAgentRequested === true) {
                    return 2; // Jey requested agent (client initiated)
                }
                if (ticket.status === 'escalated_to_agent') {
                    return 3; // Jey escalated (Jey initiated, perhaps for a different reason)
                }
                if (ticket.status === 'nouveau' && !ticket.assignedTo) {
                    return 4; // Truly new, unassigned
                }
                if (ticket.status === 'jey-handling' && (ticket.assignedTo === null || ticket.assignedTo === undefined || ticket.assignedTo === '')) {
                    return 5; // Jey handling, not agent requested
                }
                if (ticket.status === 'in-progress' && ticket.assignedTo && ticket.assignedTo !== currentUser?.uid) {
                    return 6; // Other agent's active conversations
                }
                return 99; // Fallback for any unexpected status
            };

            const priorityA = getPriority(a);
            const priorityB = getPriority(b);

            if (priorityA !== priorityB) {
                return priorityA - priorityB;
            }

            // Secondary sort: Premium tickets come first
            if (a.userIsPremium && !b.userIsPremium) return -1;
            if (!a.userIsPremium && b.userIsPremium) return 1;

            // Tertiary sort: Oldest first for same priority/premium
            return a.createdAt?.toDate() - b.createdAt?.toDate();
        });


        setTickets(activeDisplayTickets); // Set the state with ONLY non-terminated tickets
        lastKnownTicketsRef.current = allFetchedTickets; // Keep ALL tickets for notification logic
        updateTicketStats(allFetchedTickets); // Update stats based on ALL tickets
      }, (error) => {
        console.error("Error fetching tickets:", error);
      });
      unsubscribesRef.current.push(unsubscribeTickets);

      // 3. Listener for Agent's Scheduled Appointments
      const agentAppointmentsQuery = query(
        collection(db, 'appointments'),
        where('bookedByAgentId', '==', currentUser.uid),
        where('status', 'in', ['scheduled', 'rescheduled'])
      );
      const unsubscribeAgentAppointments = onSnapshot(agentAppointmentsQuery, (snapshot) => {
        setStats(prevStats => ({
          ...prevStats,
          scheduledAppointmentsCount: snapshot.docs.length
        }));
      }, (error) => {
        console.error("Error fetching agent's scheduled appointments:", error);
      });
      unsubscribesRef.current.push(unsubscribeAgentAppointments);

    } catch (error) {
      console.error("Error setting up listeners:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentUser?.uid, isFocused, isClockedIn, userData?.name]);

  useEffect(() => {
    setupListeners();

    return () => {
      unsubscribesRef.current.forEach(unsub => unsub());
      unsubscribesRef.current = [];
    };
  }, [setupListeners]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);

    unsubscribesRef.current.forEach(unsub => unsub());
    unsubscribesRef.current = [];

    setTickets([]);
    setInAppNotification(null);
    notifiedTicketsRef.current.clear();
    lastKnownTicketsRef.current = [];

    try {
        await setupListeners();
    } catch (error) {
        console.error("Error during manual refresh:", error);
    } finally {
        setRefreshing(false);
    }

    console.log('ITDashboard manually refreshed!');
  }, [setupListeners]);


  // ⭐ NEW: handleManualJeyTermination
  const handleManualJeyTermination = async (ticketIdToTerminate) => {
    Alert.alert(
      'Clôturer le ticket',
      'Ce ticket a été terminé par Jey. Confirmez-vous la clôture manuelle ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: async () => {
            try {
              const ticketDocRef = doc(db, 'tickets', ticketIdToTerminate);
              // Update the ticket to indicate it's now fully handled by an agent
              // We're changing the terminatedBy field from 'jey-ai' to the current agent's ID
              await updateDoc(ticketDocRef, {
                status: 'terminé', // Ensure it's terminated
                terminatedBy: currentUser?.uid, // Set to current agent's ID
                terminatedByName: userData?.name || currentUser?.displayName || 'Agent',
                manuallyClosedByAgent: true, // New flag to indicate agent's final action
                lastUpdated: serverTimestamp(),
              });

              // Add a system message to the chat indicating agent manual closure
              await addDoc(collection(db, 'tickets', ticketIdToTerminate, 'messages'), {
                texte: `${userData?.name || currentUser.displayName || 'Un agent'} a clôturé ce ticket manuellement.`,
                expediteurId: 'systeme',
                nomExpediteur: 'Système',
                createdAt: serverTimestamp(),
                type: 'system_message'
              });

              Alert.alert('Succès', 'Ticket clôturé manuellement.');
              // The `onSnapshot` listener will automatically remove this ticket from the active list
              // if its status is now 'terminé' and `terminatedBy` is a human agent.

            } catch (error) {
              console.error("Error manually closing Jey-terminated ticket:", error);
              Alert.alert("Erreur", "Impossible de clôturer le ticket manuellement.");
            }
          },
        },
      ]
    );
  };


  const handleTakeTicket = async (ticket) => {
    if (!currentUser) {
        Alert.alert("Erreur", "Vous devez être connecté pour prendre un ticket.");
        return;
    }
    // Allow taking a ticket if it's 'nouveau', 'escalated_to_agent', or 'jey-handling' AND agent was requested
    if (ticket.status === 'jey-handling' && !ticket.isAgentRequested) {
        Alert.alert("Information", "Ce ticket est actuellement géré par Jey et le client n'a pas encore demandé d'agent humain.");
        return;
    }
    if (ticket.status === 'in-progress' && ticket.assignedTo !== currentUser?.uid) {
        Alert.alert("Information", `Ce ticket est déjà pris en charge par ${ticket.assignedToName || 'un autre agent'}.`);
        return;
    }
    if (ticket.status === 'terminé' && ticket.terminatedBy !== 'jey-ai') { // Prevents taking tickets already closed by a human agent
        Alert.alert("Information", "Ce ticket est déjà terminé par un agent.");
        return;
    }

    try {
      const batch = writeBatch(db);

      batch.update(doc(db, 'tickets', ticket.id), {
        status: 'in-progress',
        assignedTo: currentUser.uid,
        assignedToName: userData?.name || currentUser.displayName || 'Agent',
        updatedAt: serverTimestamp(),
        isAgentRequested: false, // Reset this flag once agent takes over
        agentJoinedNotified: true,
      });

      const conversationRef = doc(db, 'conversations', ticket.id);
      const conversationSnap = await getDoc(conversationRef);

      if (conversationSnap.exists()) {
        batch.update(conversationRef, {
          status: 'in-progress',
          assignedTo: currentUser.uid,
          assignedToName: userData?.name || currentUser.displayName || 'Agent',
          lastUpdated: serverTimestamp(),
          participants: arrayUnion(currentUser.uid),
          participantNames: arrayUnion(userData?.name || currentUser.displayName || 'Agent'),
          isAgentRequested: false,
        });
      } else {
        batch.set(conversationRef, {
          ticketId: ticket.id,
          status: 'in-progress',
          assignedTo: currentUser.uid,
          assignedToName: userData?.name || currentUser.displayName || 'Agent',
          createdAt: serverTimestamp(),
          lastUpdated: serverTimestamp(),
          participants: [currentUser.uid, ticket.userId],
          participantNames: [userData?.name || currentUser.displayName || 'Agent', ticket.userName],
          lastMessage: "Conversation initiée par Agent",
          lastMessageTimestamp: serverTimestamp(),
          unreadByUser: true,
          unreadBySupport: false,
          isAgentRequested: false,
        });
      }

      await batch.commit();

      // Add system message about agent taking over
      await addDoc(collection(db, 'tickets', ticket.id, 'messages'), {
        texte: `${userData?.name || currentUser.displayName || 'Un agent'} a pris le relais de cette conversation.`,
        expediteurId: 'systeme',
        nomExpediteur: 'Système',
        createdAt: serverTimestamp(),
        type: 'system_message'
      });

      if (inAppNotification && inAppNotification.ticketId === ticket.id) {
          setInAppNotification(null);
      }

      navigation.navigate('Conversation', {
        ticketId: ticket.id,
        isITSupport: true,
        userId: ticket.userId,
        userName: ticket.userName,
        userPhone: ticket.userPhone,
        ticketCategory: ticket.category,
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

  const handleDismissNotification = () => {
    setInAppNotification(null);
  };

  const handleTapNotification = () => {
    if (inAppNotification?.ticketId) {
      navigation.navigate('TicketInfo', { ticketId: inAppNotification.ticketId });
      setInAppNotification(null);
    }
  };

  if (loading) {
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
      <View style={styles.header}>
        <TouchableOpacity style={styles.profileContainer} onPress={navigateToSettings}>
          <Image
            source={userData?.photoURL ? { uri: userData.photoURL } : require('../assets/images/Profile.png')}
            style={styles.profileImage}
          />
          <View>
            <Text style={styles.userName}>{userData?.name || 'Agent'}</Text>
            <Text style={styles.userRole}>Agent</Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerRightSection}>
            <TouchableOpacity onPress={handleRefresh} style={styles.refreshIconContainer}>
                <MaterialIcons name="refresh" size={24} color="#6B7280" />
            </TouchableOpacity>
            <Image style={styles.logo} source={require('../assets/images/logoVide.png')} />
        </View>
      </View>

      {/* Stats Cards Section */}
      <TouchableOpacity
        onPress={() => setShowStats(!showStats)}
        style={styles.toggleStatsButton}
        activeOpacity={0.8}
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
              activeOpacity={0.8}
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
        </>
      )}

      {/* Tickets Section Header */}
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

      {/* Ticket List */}
      <FlatList
        data={tickets}
        keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <View style={[
            styles.ticketCard,
            item.userIsPremium && styles.premiumTicketCard,
            // Apply a distinct style for Jey-terminated tickets that need manual closure
            item.status === 'terminé' && item.terminatedBy === 'jey-ai' && styles.jeyTerminatedCard,
            // Visually diminish if already fully closed by an agent (though filter should largely prevent this)
            item.status === 'terminé' && item.terminatedBy !== 'jey-ai' && styles.fullyClosedCard,
          ]}>
            <View style={styles.ticketHeader}>
              <View style={styles.ticketStatusContainer}>
                {/* Status Dots */}
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
                {/* ⭐ MODIFIED: Red check icon for Jey-terminated tickets awaiting manual close ⭐ */}
                {item.status === 'terminé' && item.terminatedBy === 'jey-ai' && (
                  <MaterialIcons name="check-circle" size={18} color="#FF3B30" style={styles.jeyTerminatedIcon} />
                )}
                 {/* Gray dot for fully closed tickets (by human agent) - if they still appear due to filter logic */}
                {item.status === 'terminé' && item.terminatedBy !== 'jey-ai' && (
                  <View style={[styles.statusDot, styles.grayDot]} />
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
            {/* ⭐ NEW: Specific label for Jey-terminated tickets ⭐ */}
            {item.status === 'terminé' && item.terminatedBy === 'jey-ai' && (
                <Text style={[styles.assignedText, styles.jeyTerminationLabel]}>Terminé par Jey (client ou auto).</Text>
            )}
            {item.status === 'terminé' && item.terminatedBy !== 'jey-ai' && (
                <Text style={[styles.assignedText, {color: '#6B7280', fontWeight: 'bold'}]}>Terminé par l'agent.</Text>
            )}


            <View style={styles.ticketActions}>
              {/* ⭐ MODIFIED: Button for Jey-terminated tickets ⭐ */}
              {item.status === 'terminé' && item.terminatedBy === 'jey-ai' ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.completeButton]} // Use complete button style for manual close
                  onPress={() => handleManualJeyTermination(item.id)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonText}>Clôturer Manuellement</Text>
                </TouchableOpacity>
              ) : item.assignedTo === currentUser?.uid ? (
                <TouchableOpacity
                  style={[styles.actionButton, styles.inProgressButton]}
                  onPress={() => navigation.navigate('Conversation', {
                    ticketId: item.id,
                    isITSupport: true,
                    userId: item.userId,
                    userName: item.userName,
                    userPhone: item.userPhone,
                    ticketCategory: item.category,
                  })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonText}>En cours...</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[
                    styles.actionButton,
                    // ⭐ MODIFIED: If Jey is handling and it's not requested, or if terminated by Jey, disable "Take" ⭐
                    (item.status === 'jey-handling' && !item.isAgentRequested) ||
                    (item.status === 'in-progress' && item.assignedTo && item.assignedTo !== currentUser?.uid) ||
                    (item.status === 'terminé' && item.terminatedBy === 'jey-ai') // Disable if terminated by Jey
                      ? styles.disabledButton
                      : styles.takeButton
                  ]}
                  onPress={() => handleTakeTicket(item)}
                  disabled={
                    (item.status === 'jey-handling' && !item.isAgentRequested) ||
                    (item.status === 'in-progress' && item.assignedTo && item.assignedTo !== currentUser?.uid) ||
                    (item.status === 'terminé' && item.terminatedBy === 'jey-ai') // Disable if terminated by Jey
                  }
                  activeOpacity={0.8}
                >
                  <Text style={styles.buttonText}>
                    {item.status === 'jey-handling' && !item.isAgentRequested ? 'Géré par Jey' :
                     (item.status === 'in-progress' && item.assignedTo && item.assignedTo !== currentUser?.uid) ? 'Pris par un autre Agent' :
                     // ⭐ MODIFIED: If terminated by Jey, show "Terminer" on the button ⭐
                     (item.status === 'terminé' && item.terminatedBy === 'jey-ai') ? 'Terminer' :
                     'Prendre'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={60} color="#34C759" />
            <Text style={styles.emptyText}>Aucun ticket actif trouvé.</Text>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={['#34C759']}
            tintColor={'#34C759'}
          />
        }
      />

      {/* Clock In/Out Modal */}
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
              activeOpacity={0.8}
            >
              <Text style={styles.modalButtonText}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* In-App Notification Modal (top banner) */}
      {inAppNotification && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={!!inAppNotification}
          onRequestClose={handleDismissNotification}
        >
          <TouchableOpacity
            style={styles.notificationOverlay}
            activeOpacity={1}
            onPress={handleTapNotification}
          >
            <View style={styles.notificationContainer}>
              <View style={styles.notificationHeader}>
                <MaterialIcons name="notifications" size={24} color="#FFF" />
                <Text style={styles.notificationTitle}>{inAppNotification.title}</Text>
                <TouchableOpacity onPress={handleDismissNotification} style={styles.closeNotificationButton}>
                  <Ionicons name="close-circle" size={24} color="#FFF" />
                </TouchableOpacity>
              </View>
              <Text style={styles.notificationBody}>{inAppNotification.body}</Text>
              <TouchableOpacity style={styles.notificationActionButton} onPress={handleTapNotification} activeOpacity={0.8}>
                <Text style={styles.notificationActionButtonText}>Voir le ticket</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
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
  headerRightSection: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshIconContainer: {
    padding: 8,
    marginRight: 8,
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
    flexWrap: 'wrap',
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
  premiumTicketCard: {
    backgroundColor: '#FFE082',
    borderColor: '#FFD700',
    borderWidth: 1,
  },
  // ⭐ NEW STYLE: For tickets terminated by Jey, awaiting agent closure
  jeyTerminatedCard: {
    backgroundColor: '#FEE2E2', // Light red background
    borderColor: '#EF4444',    // Red border
    borderWidth: 1.5,
  },
  fullyClosedCard: { // For tickets terminated by human agents (can be visually deemphasized or filtered out entirely)
    opacity: 0.7,
    borderColor: '#B0B9C2',
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
  grayDot: {
    backgroundColor: '#6B7280',
  },
  // ⭐ NEW STYLE: Icon for Jey-terminated tickets ⭐
  jeyTerminatedIcon: {
    marginLeft: 5,
    marginRight: 8,
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
  // ⭐ NEW STYLE: Label for Jey-terminated tickets ⭐
  jeyTerminationLabel: {
    color: '#EF4444', // Red color
    fontWeight: 'bold',
    fontSize: 13,
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
    backgroundColor: '#6B7280', // Darker gray for manual closure
  },
  disabledButton: {
    backgroundColor: '#D1D5DB',
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
  notificationOverlay: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingTop: Platform.OS === 'android' ? 50 : 30,
  },
  notificationContainer: {
    width: '90%',
    backgroundColor: '#0a8fdf',
    borderRadius: 10,
    padding: 15,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  notificationTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginLeft: 10,
    flex: 1,
  },
  notificationBody: {
    fontSize: 14,
    color: 'white',
    marginBottom: 10,
  },
  notificationActionButton: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
    paddingVertical: 8,
    alignItems: 'center',
  },
  notificationActionButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  closeNotificationButton: {
    marginLeft: 10,
    padding: 5,
  },
});

export default ITDashboard;
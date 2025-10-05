// AppointmentManager.js (Updated)

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  collection,
  doc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  where,
  updateDoc,
  getDoc,
  writeBatch,
  getDocs,
} from 'firebase/firestore';
import { auth, db } from '../firebase';

import AppointmentFormModal from '../components/AppointmentFormModal';

import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

const AppointmentManager = ({ route, navigation }) => {
  const {
    ticketId,
    initialUserId,
    initialUserName,
    userPhone,
    initialUserEmail,
  } = route.params;

  const currentUser = auth.currentUser;

  const [loggedInAgentData, setLoggedInAgentData] = useState(null);
  const [loadingAgentData, setLoadingAgentData] = useState(true);

  const clientEmailToFilter = initialUserEmail;

  const [partners, setPartners] = useState([]);
  const [loadingPartners, setLoadingPartners] = true;
  const [appointments, setAppointments] = useState([]);

  const [showAppointmentFormModal, setShowAppointmentFormModal] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState(null);

  const formatDateTime = useCallback((dateISOString) => {
    if (!dateISOString) return 'N/A';
    const date = new Date(dateISOString);
    if (isNaN(date.getTime())) {
      console.warn("Invalid date string provided to formatDateTime:", dateISOString);
      return 'Date invalide';
    }
    return moment(date).format('DD/MM/YYYY [à] HH:mm');
  }, []);

  const sendSystemMessageToTicket = useCallback(async (messageText, messageType = 'text', messageData = {}) => {
    if (!ticketId) {
        console.warn("WARN: Not sending system message, no ticketId provided in AppointmentManager.");
        return;
    }
    try {
      const batch = writeBatch(db);

      const ticketRef = doc(db, 'tickets', ticketId);
      const conversationRef = doc(db, 'conversations', ticketId);
      const messagesCollectionRef = collection(db, 'tickets', ticketId, 'messages');

      batch.set(doc(messagesCollectionRef), {
        texte: messageText,
        expediteurId: 'systeme',
        nomExpediteur: 'Système Rendez-vous',
        createdAt: serverTimestamp(),
        type: messageType,
        ...messageData,
      });

      const updateData = {
        lastMessage: messageText.substring(0, 100),
        lastUpdated: serverTimestamp(),
        lastMessageSender: 'systeme',
      };
      batch.update(ticketRef, updateData);
      batch.update(conversationRef, updateData);

      await batch.commit();

    } catch (error) {
      console.error("ERROR: Failed to send system message from AppointmentManager:", error);
      Alert.alert("Erreur", "Impossible d'envoyer le message système au ticket.");
    }
  }, [ticketId]);

  useEffect(() => {
    const fetchAgentDetails = async () => {
      if (!currentUser || !currentUser.uid) {
        setLoadingAgentData(false);
        console.warn("WARN: No current user authenticated to fetch agent data.");
        return;
      }
      setLoadingAgentData(true);
      try {
        const agentDocRef = doc(db, 'users', currentUser.uid);
        const agentDocSnap = await getDoc(agentDocRef);
        if (agentDocSnap.exists()) {
          setLoggedInAgentData({ id: agentDocSnap.id, ...agentDocSnap.data() });
        } else {
          console.warn(`WARN: Agent profile not found for UID: ${currentUser.uid}`);
        }
      } catch (error) {
        console.error("ERROR: Failed to fetch logged-in agent details:", error);
        Alert.alert("Erreur", "Impossible de charger les informations de l'agent.");
      } finally {
        setLoadingAgentData(false);
      }
    };
    fetchAgentDetails();
  }, [currentUser]);

  useEffect(() => {
    const fetchPartners = async () => {
      setLoadingPartners(true);
      try {
        const partnersCollectionRef = collection(db, 'partners');
        const q = query(partnersCollectionRef);
        const querySnapshot = await getDocs(q);
        const fetchedPartners = querySnapshot.docs.map(doc => {
          return {
            id: doc.id,
            nom: doc.data().nom,
            categorie: doc.data().categorie,
            isPromoted: doc.data().isPromoted || false,
            rating: doc.data().rating || 0,
            ...doc.data()
          };
        }).sort((a, b) => {
          if (a.isPromoted && !b.isPromoted) return -1;
          if (!a.isPromoted && b.isPromoted) return 1;
          return b.rating - a.rating;
        });
        setPartners(fetchedPartners);
      } catch (error) {
        console.error("ERROR: Error fetching partners in AppointmentManager:", error);
        Alert.alert("Erreur", "Impossible de charger les partenaires.");
      } finally {
        setLoadingPartners(false);
      }
    };
    fetchPartners();
  }, []);

  useEffect(() => {
    if (route.params?.editingAppointment) {
      setAppointmentToEdit(route.params.editingAppointment);
      setShowAppointmentFormModal(true);
      navigation.setParams({ editingAppointment: undefined });
    }

    const { appointmentToDelete, partnerIdToDelete, appointmentDetailsForMessage } = route.params || {};
    if (appointmentToDelete && partnerIdToDelete) {
      handleDeleteAppointmentConfirmed(appointmentToDelete, partnerIdToDelete, appointmentDetailsForMessage);
      navigation.setParams({ appointmentToDelete: undefined, partnerIdToDelete: undefined, appointmentDetailsForMessage: undefined });
    }
  }, [route.params, navigation]);

  useEffect(() => {
    if (!clientEmailToFilter) {
      setAppointments([]);
      return;
    }

    const appointmentsCollectionRef = collection(db, 'appointments');
    const q = query(
      appointmentsCollectionRef,
      where('clientEmail', '==', clientEmailToFilter)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const fetchedAppointments = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).sort((a, b) => {
        const dateA = a.appointmentDateTime ? new Date(a.appointmentDateTime).getTime() : 0;
        const dateB = b.appointmentDateTime ? new Date(b.appointmentDateTime).getTime() : 0;
        return dateB - dateA;
      });
      setAppointments(fetchedAppointments);
    }, (error) => {
      console.error("ERROR: Error fetching live appointments for client email:", error);
      Alert.alert("Erreur de synchronisation", "Impossible de charger les rendez-vous spécifiques au client.");
    });

    return () => unsubscribe();
  }, [clientEmailToFilter]);


  const handleBookingSuccessFromModal = useCallback(async (newOrUpdatedAppointment) => {
    setAppointmentToEdit(null);

    const action = newOrUpdatedAppointment.id ? 'mis à jour' : 'créé';
    let message = `Le rendez-vous avec ${newOrUpdatedAppointment.partnerNom} pour ${newOrUpdatedAppointment.clientNames ? newOrUpdatedAppointment.clientNames.join(', ') : newOrUpdatedAppointment.clientName || 'un client'} du ${formatDateTime(newOrUpdatedAppointment.appointmentDateTime)} a été ${action} par l'agent ${loggedInAgentData?.name || 'inconnu'}.`;
    if (newOrUpdatedAppointment.description) {
      message += ` Description: ${newOrUpdatedAppointment.description}.`;
    }
    await sendSystemMessageToTicket(
        message,
        'appointment_booked_agent_confirmation',
        {
            appointmentId: newOrUpdatedAppointment.id,
            partnerNom: newOrUpdatedAppointment.partnerNom,
            appointmentDateTime: newOrUpdatedAppointment.appointmentDateTime,
            clientNames: newOrUpdatedAppointment.clientNames,
            bookedByAgentName: loggedInAgentData?.name || currentUser?.displayName,
            bookedByAgentId: loggedInAgentData?.id || currentUser?.uid,
            clientId: newOrUpdatedAppointment.clientId,
            clientName: newOrUpdatedAppointment.clientName,
            clientEmail: newOrUpdatedAppointment.clientEmail,
            clientPhone: newOrUpdatedAppointment.clientPhone,
        }
    );
  }, [loggedInAgentData, sendSystemMessageToTicket, formatDateTime, currentUser]);

  const handleDeleteAppointmentConfirmed = useCallback(async (appointmentId, partnerId, apptDetailsForMessage) => {
    if (!appointmentId || !partnerId) {
        console.error("ERROR: Missing critical appointment data for confirmed deletion.");
        Alert.alert("Erreur", "Données de rendez-vous incomplètes pour la suppression. Veuillez réessayer.");
        return;
    }

    try {
        const batch = writeBatch(db);

        const rdvDocRefMain = doc(db, 'appointments', appointmentId);
        batch.delete(rdvDocRefMain);

        const partnerRdvDocRef = doc(db, 'partners', partnerId, 'rdv_reservation', appointmentId);
        batch.delete(partnerRdvDocRef);

        await batch.commit();

        let message = `Le rendez-vous avec ${apptDetailsForMessage.partnerNom} du ${formatDateTime(apptDetailsForMessage.appointmentDateTime)} a été supprimé par l'agent ${loggedInAgentData?.name || 'inconnu'}.`;
        if (apptDetailsForMessage.description) {
          message += ` Description: ${apptDetailsForMessage.description}.`;
        }
        await sendSystemMessageToTicket(
            message,
            'appointment_deleted_agent_confirmation',
            {
                appointmentId: appointmentId,
                partnerNom: apptDetailsForMessage.partnerNom,
                appointmentDateTime: apptDetailsForMessage.appointmentDateTime,
                bookedByAgentName: loggedInAgentData?.name || currentUser?.displayName,
                bookedByAgentId: loggedInAgentData?.id || currentUser?.uid,
            }
        );

        Alert.alert("Succès", "Rendez-vous supprimé.");
    } catch (error) {
        console.error("ERROR: Error deleting appointment:", error);
        Alert.alert(
            "Erreur",
            "Impossible de supprimer le rendez-vous. Il se peut qu'il ait déjà été supprimé ou qu'une erreur de permission se soit produite. Veuillez réessayer ou contacter le support."
        );
    }
  }, [loggedInAgentData, sendSystemMessageToTicket, formatDateTime, currentUser]);


  if (loadingPartners || loadingAgentData) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement des données...</Text>
      </View>
    );
  }

  const ticketClientInfo = {
    id: initialUserId,
    name: initialUserName,
    email: initialUserEmail,
    phone: userPhone,
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={28} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gérer les Rendez-vous</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>

        <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
                onPress={() => {
                    // Send a simple message to the ticket that Jey can interpret
                    sendSystemMessageToTicket(
                        `/demander_rendez_vous`, // New internal command for Jey
                        'command_to_jey', // A type to explicitly indicate it's a command for Jey
                        {
                            agentId: loggedInAgentData?.id || currentUser?.uid,
                            agentName: loggedInAgentData?.name || currentUser?.displayName,
                            // Pass client info for Jey's context if needed
                            clientId: initialUserId,
                            clientName: initialUserName,
                            clientEmail: initialUserEmail,
                            clientPhone: userPhone,
                        }
                    );
                    Alert.alert(
                        "Demande envoyée à Jey",
                        "Jey va maintenant aider le client à prendre rendez-vous dans la conversation."
                    );
                }}
                style={styles.newAppointmentButton}
            >
                <Ionicons name="chatbox-outline" size={22} color="white" />
                <Text style={styles.newAppointmentButtonText}>Demander Rendez-vous à Jey</Text>
            </TouchableOpacity>

            <TouchableOpacity
                onPress={() => navigation.navigate('AppointmentListScreen', {
                    ticketId: ticketId,
                    initialUserId: initialUserId,
                    initialUserName: initialUserName,
                    userPhone: userPhone,
                    initialUserEmail: initialUserEmail,
                    allPartners: partners,
                    loggedInAgentId: loggedInAgentData?.id || currentUser?.uid,
                    loggedInAgentName: loggedInAgentData?.name || currentUser?.displayName,
                })}
                style={styles.viewAppointmentsButton}
            >
                <Ionicons name="calendar" size={22} color="#0a8fdf" />
                <Text style={styles.viewAppointmentsButtonText}>Voir les Rendez-vous</Text>
            </TouchableOpacity>
        </View>

        <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={24} color="#0a8fdf" style={{ marginRight: 10 }} />
            <Text style={styles.infoText}>
                Cliquez sur "**Demander Rendez-vous à Jey**" pour que Jey assiste le client dans la prise de rendez-vous directement dans la conversation.
                {"\n"}
                Utilisez "**Voir les Rendez-vous**" pour consulter et gérer l'historique de tous les rendez-vous pris.
            </Text>
        </View>

      </ScrollView>

      <AppointmentFormModal
          isVisible={showAppointmentFormModal}
          onClose={() => {
              setShowAppointmentFormModal(false);
              setAppointmentToEdit(null);
          }}
          onBookingSuccess={handleBookingSuccessFromModal}
          ticketId={ticketId}
          allPartners={partners}
          editingAppointment={appointmentToEdit}
          isAgentMode={true}
          ticketClientInfo={ticketClientInfo}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF3F8',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF3F8',
  },
  loadingText: {
    marginTop: 10,
    color: '#4A5568',
    fontSize: 16,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
    marginTop: 25,
    paddingHorizontal: 20,
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3748',
    flex: 1,
    textAlign: 'center',
    marginHorizontal: 10,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
    marginTop: 10,
    flexWrap: 'wrap',
  },
  newAppointmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a8fdf',
    paddingVertical: 16,
    paddingHorizontal: 25,
    borderRadius: 12,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
    marginVertical: 10,
    minWidth: '45%',
    justifyContent: 'center',
  },
  newAppointmentButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  viewAppointmentsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EBF3F8',
    paddingVertical: 16,
    paddingHorizontal: 25,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#0a8fdf',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
    marginVertical: 10,
    minWidth: '45%',
    justifyContent: 'center',
  },
  viewAppointmentsButtonText: {
    color: '#0a8fdf',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 10,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#e6f7ff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 5,
    borderColor: '#0a8fdf',
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    color: '#4A5568',
    lineHeight: 22,
  },
});

export default AppointmentManager;
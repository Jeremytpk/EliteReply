// AppointmentManager.js
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
  Image,
  ScrollView,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import {
  collection,
  doc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  getDoc,
  deleteField,
  // Removed arrayUnion, arrayRemove as they won't be strictly necessary for deletion
  writeBatch, // Will use writeBatch for atomic deletions across collections
  runTransaction,
  increment,
  getDocs,
  where,
  deleteDoc, // Import deleteDoc
} from 'firebase/firestore';
import { auth, db, storage } from '../firebase';

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
    isITSupport,
    currentTicketAppointments: initialCurrentTicketAppointments,
  } = route.params;

  const currentUser = auth.currentUser;
  const actualClientName = initialUserName || 'Client';

  const [partners, setPartners] = useState([]);
  const [loadingPartners, setLoadingPartners] = useState(true);

  const [appointments, setAppointments] = useState(initialCurrentTicketAppointments || []);

  const [showAppointmentFormModal, setShowAppointmentFormModal] = useState(false);
  const [appointmentToEdit, setAppointmentToEdit] = useState(null);

  useEffect(() => {
    const fetchPartners = async () => {
      setLoadingPartners(true);
      try {
        const partnersCollectionRef = collection(db, 'partners');
        const q = query(partnersCollectionRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        const fetchedPartners = querySnapshot.docs.map(doc => {
          return { id: doc.id, label: doc.data().name, value: doc.id, ...doc.data() };
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
    }
  }, [route.params?.editingAppointment]);


  useEffect(() => {
    if (!ticketId) return;

    const ticketDocRef = doc(db, 'tickets', ticketId);
    const unsubscribe = onSnapshot(ticketDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const sortedAppointments = (data.appointments || []).sort((a, b) => {
          const dateA = a.appointmentDateTime ? new Date(a.appointmentDateTime).getTime() : 0;
          const dateB = b.appointmentDateTime ? new Date(b.appointmentDateTime).getTime() : 0;
          return dateB - dateA;
        });
        setAppointments(sortedAppointments);
      }
    }, (error) => {
      console.error("ERROR: Error fetching live ticket appointments:", error);
    });

    return () => unsubscribe();
  }, [ticketId]);


  const sendSystemMessageToTicket = useCallback(async (messageText) => {
    if (!ticketId) {
        console.warn("WARN: Not sending system message, no ticketId provided in AppointmentManager.");
        return;
    }
    try {
      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        texte: messageText,
        expediteurId: 'systeme',
        nomExpediteur: 'Système Rendez-vous',
        createdAt: serverTimestamp(),
        type: 'text',
      });
      await updateDoc(doc(db, 'tickets', ticketId), {
        lastMessage: messageText.substring(0, 50),
        lastUpdated: serverTimestamp(),
        lastMessageSender: 'systeme',
      });
      await updateDoc(doc(db, 'conversations', ticketId), {
        lastMessage: messageText.substring(0, 50),
        lastUpdated: serverTimestamp(),
        lastMessageSender: 'systeme',
      });
    } catch (error) {
      console.error("ERROR: Failed to send system message from AppointmentManager:", error);
    }
  }, [ticketId]);

  // Modified handleCancelAppointment to delete documents
  const handleCancelAppointment = async (appointmentToCancel) => {
    // --- ADD THIS CHECK ---
    if (!appointmentToCancel || !appointmentToCancel.id || !appointmentToCancel.partnerId || !appointmentToCancel.appointmentId) {
        console.error("ERROR: Missing critical appointment data for cancellation:", appointmentToCancel);
        Alert.alert("Erreur", "Données de rendez-vous incomplètes pour l'annulation. Veuillez réessayer.");
        return;
    }
    // --- END ADDITION ---

    Alert.alert(
      "Annuler Rendez-vous",
      `Êtes-vous sûr de vouloir annuler et supprimer le rendez-vous avec ${appointmentToCancel.partnerName} du ${formatDateTime(appointmentToCancel.appointmentDateTime)} ? Cette action est irréversible.`,
      [
        { text: "Non", style: "cancel" },
        {
          text: "Oui, Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              const batch = writeBatch(db);

              const rdvDocRefMain = doc(db, 'appointments', appointmentToCancel.id);
              batch.delete(rdvDocRefMain);
              console.log("DEBUG_CANCEL: Marked for deletion from top-level 'appointments':", appointmentToCancel.id);

              const partnerRdvDocRef = doc(db, 'partners', appointmentToCancel.partnerId, 'rdv_reservation', appointmentToCancel.appointmentId);
              batch.delete(partnerRdvDocRef);
              console.log("DEBUG_CANCEL: Marked for deletion from partner's 'rdv_reservation' subcollection:", appointmentToCancel.partnerId, appointmentToCancel.appointmentId);

              if (ticketId) {
                const ticketDocRef = doc(db, 'tickets', ticketId);
                const ticketSnapshot = await getDoc(ticketDocRef);

                if (ticketSnapshot.exists()) {
                    const currentAppointmentsInTicket = ticketSnapshot.data().appointments || [];
                    // --- SLIGHTLY MORE ROBUST FILTER ---
                    const updatedAppointments = currentAppointmentsInTicket.filter(
                        appt => appt && appt.appointmentId && appt.appointmentId !== appointmentToCancel.appointmentId
                    );
                    batch.update(ticketDocRef, { appointments: updatedAppointments });
                    console.log("DEBUG_CANCEL: Marked ticket's appointments array for update/removal.");
                } else {
                    console.warn("WARN: Ticket document not found for array update during cancellation.");
                }
              }

              await batch.commit();
              console.log("DEBUG_CANCEL: All batched deletions/updates committed successfully.");

              let message = `Votre rendez-vous avec ${appointmentToCancel.partnerName} du ${formatDateTime(appointmentToCancel.appointmentDateTime)} a été annulé et supprimé.`;
              if (appointmentToCancel.description) {
                message += ` Description: ${appointmentToCancel.description}.`;
              }
              await sendSystemMessageToTicket(message);

              Alert.alert("Succès", "Rendez-vous annulé et supprimé.");
            } catch (error) {
              console.error("ERROR: Error cancelling/deleting appointment:", error);
              Alert.alert("Erreur", "Impossible d'annuler ou de supprimer le rendez-vous. Il se peut qu'il ait déjà été supprimé ou qu'une erreur de permission se soit produite. Veuillez réessayer ou contacter le support.");
            }
          }
        }
      ]
    );
};

  const formatDateTime = (dateISOString) => {
    if (!dateISOString) return 'N/A';
    const date = new Date(dateISOString);
    return date.toLocaleDateString('fr-FR') + ' à ' + date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };

  const handleOpenEditModal = (appointment) => {
    setAppointmentToEdit(appointment);
    setShowAppointmentFormModal(true);
  };

  const handleBookingSuccessFromModal = useCallback((newOrUpdatedAppointment) => {
    if (appointmentToEdit) {
        setAppointmentToEdit(null);
    }
  }, [appointmentToEdit]);


  if (loadingPartners) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Chargement des partenaires...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Gérer Rendez-vous</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>

        <View style={styles.actionButtonsContainer}>
            <TouchableOpacity
                onPress={() => {
                    setAppointmentToEdit(null);
                    setShowAppointmentFormModal(true);
                }}
                style={styles.newAppointmentButton}
            >
                <Ionicons name="add-circle" size={20} color="white" />
                <Text style={styles.newAppointmentButtonText}>Nouveau Rendez-vous</Text>
            </TouchableOpacity>
        </View>


        {appointments.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={80} color="#CBD5E1" />
            <Text style={styles.emptyText}>Aucun rendez-vous pour ce ticket.</Text>
            <Text style={styles.emptySubtitle}>
              Ajoutez un nouveau rendez-vous ci-dessus.
            </Text>
          </View>
        ) : (
          <View style={styles.existingAppointmentsSection}>
            <Text style={styles.sectionHeading}>Rendez-vous existants pour ce ticket:</Text>
            {appointments.map((appt) => (
              <View key={appt.id} style={[styles.existingAppointmentItem, appt.status === 'cancelled' && styles.cancelledAppointment]}>
                <Text style={styles.existingAppointmentText}>
                  <Text style={{ fontWeight: 'bold' }}>Partenaire:</Text> {appt.partnerName}
                </Text>
                <Text style={styles.existingAppointmentText}>
                  <Text style={{ fontWeight: 'bold' }}>Date:</Text> {formatDateTime(appt.appointmentDateTime)}
                </Text>
                <Text style={styles.existingAppointmentText}>
                  <Text style={{ fontWeight: 'bold' }}>Pour:</Text> {appt.clientNames ? appt.clientNames.join(', ') : 'N/A'}
                </Text>
                {appt.description && (
                  <Text style={styles.existingAppointmentText}>
                    <Text style={{ fontWeight: 'bold' }}>Description:</Text> {appt.description}
                  </Text>
                )}
                {/* Note: If you choose to delete cancelled appointments, the 'status' text below might become redundant for them */}
                <Text style={[styles.existingAppointmentStatus, appt.status === 'cancelled' ? styles.statusCancelledText : styles.statusScheduledText]}>
                  Statut: {appt.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
                </Text>
                <View style={styles.appointmentActions}>
                  {appt.status !== 'cancelled' && ( // Only show buttons if not already cancelled (and thus, not yet deleted from UI)
                    <>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.editButton]}
                        onPress={() => handleOpenEditModal(appt)}
                      >
                        <Ionicons name="create-outline" size={18} color="white" />
                        <Text style={styles.actionButtonText}>Modifier</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionButton, styles.cancelButton]}
                        onPress={() => handleCancelAppointment(appt)} // This will now trigger deletion
                      >
                        <Ionicons name="close-circle-outline" size={18} color="white" />
                        <Text style={styles.actionButtonText}>Supprimer</Text> {/* Changed text to reflect deletion */}
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <AppointmentFormModal
          isVisible={showAppointmentFormModal}
          onClose={() => {
              setShowAppointmentFormModal(false);
              setAppointmentToEdit(null);
          }}
          onBookingSuccess={handleBookingSuccessFromModal}
          ticketId={ticketId}
          initialUserId={initialUserId}
          initialUserName={initialUserName}
          userPhone={userPhone}
          allPartners={partners}
          editingAppointment={appointmentToEdit}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
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
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    paddingTop: Platform.OS === 'android' ? 40 : 50,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  scrollViewContent: {
    padding: 16,
    paddingBottom: 40,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 10,
  },
  existingAppointmentsSection: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
  },
  existingAppointmentItem: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderColor: '#007AFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  cancelledAppointment: {
    borderColor: '#A0AEC0',
    opacity: 0.7, // Visual cue for items that are 'cancelled' but not yet removed from UI by listener
  },
  existingAppointmentText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 3,
  },
  existingAppointmentStatus: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 5,
  },
  statusScheduledText: {
    color: '#34C759',
  },
  statusCancelledText: {
    color: '#EF4444',
  },
  appointmentActions: {
    flexDirection: 'row',
    marginTop: 10,
    justifyContent: 'flex-end',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
    marginLeft: 8,
  },
  editButton: {
    backgroundColor: '#FF9500',
  },
  cancelButton: { // Renamed from cancelButton for clarity, now used for deletion
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: 'white',
    fontSize: 12,
    marginLeft: 4,
  },
  separator: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 15,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 10,
  },
  newAppointmentButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 25,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  newAppointmentButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  emptyContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
    marginTop: 20,
    backgroundColor: '#FFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  emptyText: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default AppointmentManager;
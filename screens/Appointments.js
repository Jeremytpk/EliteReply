import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { collection, query, orderBy, onSnapshot, where, getDoc, doc, deleteDoc, arrayRemove, updateDoc, getDocs } from 'firebase/firestore';
import { db, auth } from '../firebase'; // Adjust path if necessary
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

const Appointments = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const currentUser = auth.currentUser;

  // Helper function to format date/time safely
  const formatDateTime = (date) => {
    if (!date) return 'Date/Heure inconnue';
    try {
      let d = date;
      if (date.toDate) { // Check if it's a Firestore Timestamp object
        d = date.toDate();
      } else if (typeof date === 'string') { // If it's an ISO string
        d = new Date(d);
      }
      return d.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      console.error("Error formatting date/time:", e);
      return 'Date/Heure invalide';
    }
  };

  const fetchAppointments = useCallback(() => {
    if (!currentUser) {
      setLoading(false);
      Alert.alert('Erreur', 'Vous devez être connecté pour voir les rendez-vous.');
      return;
    }

    setLoading(true); // Set loading true on refresh/initial load

    // --- MODIFIED: Query the top-level 'appointments' collection ---
    const q = query(
      collection(db, 'appointments'), // Query the top-level 'appointments' collection
      orderBy('appointmentDateTime', 'desc') // Order by latest appointments
    );

    const unsubscribe = onSnapshot(q, async (querySnapshot) => {
      const fetchedAppointments = [];
      for (const docSnapshot of querySnapshot.docs) {
        const data = docSnapshot.data();
        let clientUserName = data.clientName || 'Client Inconnu';
        let clientUserPhone = data.clientPhone || 'N/A';

        // Fetch client's user details if ticketId and userId are available
        if (data.clientId) {
          try {
            const clientDoc = await getDoc(doc(db, 'users', data.clientId));
            if (clientDoc.exists()) {
              const clientData = clientDoc.data();
              clientUserName = clientData.name || clientUserName;
              clientUserPhone = clientData.phone || clientUserPhone;
            }
          } catch (e) {
            console.warn("Could not fetch client details for appointment:", data.clientId, e);
          }
        }

        fetchedAppointments.push({
          id: docSnapshot.id, // ID from the 'appointments' collection
          ...data,
          // Ensure these fields are passed consistently to AppointmentManager for editing
          initialUserName: clientUserName, 
          userPhone: clientUserPhone, 
          // Crucial: AppointmentManager also expects 'appointmentId' for the subcollection path.
          // For appointments from the 'appointments' collection, its own ID IS its appointmentId.
          appointmentId: docSnapshot.id, 
        });
      }
      setAppointments(fetchedAppointments);
      setLoading(false);
      setRefreshing(false);
    }, (error) => {
      console.error("Error fetching appointments:", error);
      Alert.alert('Erreur', 'Impossible de charger les rendez-vous. Veuillez vérifier la console pour créer un index Firestore.');
      setLoading(false);
      setRefreshing(false);
    });

    return unsubscribe; // Return unsubscribe for cleanup
  }, [currentUser]); // Dependency on currentUser to re-fetch if user changes

  useEffect(() => {
    if (isFocused) {
      const unsubscribe = fetchAppointments();
      return () => {
        if (unsubscribe) unsubscribe();
      };
    }
  }, [isFocused, fetchAppointments]); // Re-fetch when screen is focused or fetchAppointments changes

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchAppointments(); // Re-run the data fetch
  }, [fetchAppointments]);

  const handleCreateAppointment = () => {
    // Navigate to AppointmentManager in 'create' mode (no initial data)
    navigation.navigate('AppointmentManager', {
      isITSupport: true, // Agent is creating
      ticketId: null, // No associated ticket initially
      initialUserId: null,
      initialUserName: null,
      userPhone: null,
      currentTicketAppointments: [], // No existing ticket appointments
      editingAppointment: null, // Indicate creation mode
    });
  };

  const handleEditAppointment = (appointment) => {
    // Navigate to AppointmentManager in 'edit' mode, passing all relevant data
    // The 'appointment' object received here is already from the 'appointments' collection
    navigation.navigate('AppointmentManager', {
      isITSupport: true,
      ticketId: appointment.ticketId || null, 
      initialUserId: appointment.clientId || null,
      initialUserName: appointment.initialUserName || appointment.clientName || null, 
      userPhone: appointment.userPhone || appointment.clientPhone || null, 
      currentTicketAppointments: [], 
      editingAppointment: appointment, // The specific appointment object to edit
    });
  };

  const handleDeleteAppointment = async (appointment) => {
    Alert.alert(
      'Supprimer le Rendez-vous',
      `Êtes-vous sûr de vouloir supprimer le rendez-vous avec ${appointment.partnerName} le ${formatDateTime(appointment.appointmentDateTime)} ? Cette action est irréversible.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              // 1. Delete from top-level 'appointments' collection
              await deleteDoc(doc(db, 'appointments', appointment.id));
              console.log("Deleted appointment from top-level 'appointments':", appointment.id);

              // 2. Also delete from partner's rdv_reservation subcollection if it exists
              // We use appointment.appointmentId as the ID for the subcollection document
              const partnerRdvDocRef = doc(db, 'partners', appointment.partnerId, 'rdv_reservation', appointment.appointmentId);
              const partnerRdvSnap = await getDoc(partnerRdvDocRef);
              if (partnerRdvSnap.exists()) {
                await deleteDoc(partnerRdvDocRef);
                console.log("Deleted appointment from partner's rdv_reservation subcollection:", appointment.appointmentId);
              } else {
                console.warn("Appointment not found in partner's rdv_reservation subcollection, skipped deletion.");
              }

              // 3. Remove from associated ticket's appointments array if ticketId exists
              if (appointment.ticketId) {
                const ticketDocRef = doc(db, 'tickets', appointment.ticketId);
                const ticketSnap = await getDoc(ticketDocRef);

                if (ticketSnap.exists()) {
                  const currentAppointments = ticketSnap.data().appointments || [];
                  // Filter out the exact appointment being deleted based on its ID from the ticket's array
                  const updatedAppointments = currentAppointments.filter(
                    (appt) => appt.id !== appointment.appointmentId // Use appt.id from ticket's array
                  );
                  await updateDoc(ticketDocRef, { appointments: updatedAppointments });
                  console.log("Removed appointment from ticket's array:", appointment.ticketId);
                }
              }

              Alert.alert('Succès', 'Le rendez-vous a été supprimé.');
              // The onSnapshot listener will automatically update the list.
            } catch (error) {
              console.error('Error deleting appointment:', error);
              Alert.alert('Erreur', 'Impossible de supprimer le rendez-vous.');
            }
          },
        },
      ]
    );
  };


  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.infoText}>Chargement des rendez-vous...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Tous les Rendez-vous</Text>
        <TouchableOpacity onPress={handleCreateAppointment} style={styles.createButton}>
          <Ionicons name="add-circle-outline" size={24} color="#007AFF" />
          <Text style={styles.createButtonText}>Créer</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={appointments}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[
              styles.appointmentCard,
              item.status === 'cancelled' && styles.cancelledAppointmentCard,
            ]}
            onPress={() => handleEditAppointment(item)} // Tapping card opens for edit
          >
            <View style={styles.appointmentIconContainer}>
              <Ionicons name="calendar" size={30} color="#FF9500" />
            </View>
            <View style={styles.appointmentDetails}>
              <Text style={styles.appointmentPartnerName}>{item.partnerName}</Text>
              <Text style={styles.appointmentClientNames}>
                Pour: {item.clientNames ? item.clientNames.join(', ') : 'N/A'}
              </Text>
              <Text style={styles.appointmentDateTime}>
                Le: {formatDateTime(item.appointmentDateTime)}
              </Text>
              <Text
                style={[
                  styles.appointmentStatus,
                  item.status === 'cancelled'
                    ? styles.statusCancelledText
                    : styles.statusScheduledText,
                ]}
              >
                Statut: {item.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
              </Text>
              {item.ticketId && (
                <Text style={styles.appointmentTicketId}>Ticket: {item.ticketId.substring(0, 8)}...</Text>
              )}
            </View>
            <View style={styles.appointmentActions}> {/* New container for actions */}
                <TouchableOpacity
                    onPress={() => handleEditAppointment(item)}
                    style={styles.actionIconRight}
                >
                    <Ionicons name="create-outline" size={24} color="#A0AEC0" />
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => handleDeleteAppointment(item)}
                    style={styles.actionIconRight}
                >
                    <Ionicons name="trash-outline" size={24} color="#EF4444" />
                </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={80} color="#CBD5E1" />
            <Text style={styles.emptyText}>Aucun rendez-vous trouvé.</Text>
            <Text style={styles.emptySubtitle}>
              Utilisez le bouton "Créer" pour ajouter un nouveau rendez-vous.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#007AFF']} />
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
  },
  infoText: {
    marginTop: 15,
    fontSize: 16,
    color: '#4A5568',
    textAlign: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 15,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingTop: Platform.OS === 'android' ? 30 : 50,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: '#E6F7ED', // Light green background
    borderColor: '#34C759',
    borderWidth: 1,
  },
  createButtonText: {
    marginLeft: 5,
    color: '#34C759',
    fontWeight: 'bold',
  },
  listContentContainer: {
    padding: 20,
    paddingBottom: 40,
    flexGrow: 1, // Ensures content takes full height even if few items
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 50,
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
  appointmentCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
    borderLeftWidth: 6,
    borderColor: '#007AFF', // Blue for scheduled appointments
  },
  cancelledAppointmentCard: {
    opacity: 0.6,
    borderColor: '#A0AEC0', // Gray for cancelled appointments
  },
  appointmentIconContainer: {
    marginRight: 15,
  },
  appointmentDetails: {
    flex: 1,
  },
  appointmentPartnerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 5,
  },
  appointmentClientNames: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 5,
  },
  appointmentDateTime: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 8,
    fontWeight: '500',
  },
  appointmentStatus: {
    fontSize: 13,
    fontWeight: 'bold',
  },
  statusScheduledText: {
    color: '#34C759',
  },
  statusCancelledText: {
    color: '#EF4444',
  },
  appointmentTicketId: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 5,
    fontStyle: 'italic',
  },
  appointmentActions: { // NEW: Container for action icons
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIconRight: { // NEW: Style for individual icons on the right
    padding: 8,
    marginLeft: 10,
  },
});

export default Appointments;


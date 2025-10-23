import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Dimensions, Platform, Image } from 'react-native';
// --- NEW: Import SafeAreaView from 'react-native-safe-area-context' for better handling ---
import { SafeAreaView } from 'react-native-safe-area-context'; 
import { useNavigation } from '@react-navigation/native';
// --- NEW: Import deleteDoc and doc from firestore ---
import { db, auth } from '../firebase'; 
import { collectionGroup, query, where, getDocs, orderBy, deleteDoc, doc } from 'firebase/firestore'; 
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

const { width } = Dimensions.get('window');

// --- Import your custom icon ---
const APPOINTMENT_ICON_PNG = require('../assets/icons/appointment.png');
// --- END NEW IMPORTS ---

const UserRdv = () => {
  const navigation = useNavigation();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // Helper function to format date/time safely (Kept as is)
  const formatDateTime = (date) => {
    if (!date) return 'Date/Heure inconnue';
    try {
      let d = date;
      if (typeof date === 'object' && date !== null && typeof date.toDate === 'function') {
        d = date.toDate();
      } else if (typeof date === 'string') {
        d = new Date(date);
      } else if (!(d instanceof Date)) {
         console.warn("WARN: Invalid date format passed to formatDateTime:", date);
         return 'Date/Heure invalide';
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

  const fetchUserAppointments = async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        // ... (Error handling remains the same)
        return;
      }

      const q = query(
        collectionGroup(db, 'rdv_reservation'),
        where('clientId', '==', currentUser.uid),
        where('status', 'in', ['scheduled', 'rescheduled'])
      );

      const querySnapshot = await getDocs(q);
      let fetchedAppointments = [];
      querySnapshot.forEach((document) => {
        const data = document.data();
        const partnerId = document.ref.parent.parent?.id || null; // Get partnerId from the ref path if available
        fetchedAppointments.push({ 
            id: document.id, 
            partnerId: partnerId, // Save partnerId for deletion
            ...data 
        });
      });

      // Client-side sort by appointmentDateTime desc
      fetchedAppointments = fetchedAppointments.sort((a, b) => {
        const aTime = a.appointmentDateTime?.toDate ? a.appointmentDateTime.toDate().getTime() : new Date(a.appointmentDateTime || 0).getTime();
        const bTime = b.appointmentDateTime?.toDate ? b.appointmentDateTime.toDate().getTime() : new Date(b.appointmentDateTime || 0).getTime();
        return bTime - aTime;
      });

      setAppointments(fetchedAppointments);

    } catch (error) {
      console.error("Error fetching user appointments:", error);
      Alert.alert('Erreur', 'Impossible de charger vos rendez-vous. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAppointments();
  }, []);

  const openAppointmentModal = (appointment) => {
    setSelectedAppointment(appointment);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedAppointment(null);
  };

  // 💥 NEW: Delete Appointment Functionality 💥
  const deleteAppointment = async (appointment) => {
    if (!appointment || !appointment.id || !appointment.partnerId) {
        Alert.alert('Erreur', 'Impossible de supprimer: informations de rendez-vous incomplètes.');
        return;
    }

    Alert.alert(
      'Confirmer l\'annulation',
      `Êtes-vous sûr de vouloir annuler votre rendez-vous avec ${appointment.partnerNom || 'ce partenaire'} le ${formatDateTime(appointment.appointmentDateTime)} ? Cette action est irréversible.`,
      [
        {
          text: 'Non',
          style: 'cancel',
        },
        {
          text: 'Oui, Annuler',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            closeModal(); // Close the modal immediately

            try {
              // Path: partners/{partnerId}/rdv_reservation/{appointmentId}
              const appointmentRef = doc(db, 'partners', appointment.partnerId, 'rdv_reservation', appointment.id);
              await deleteDoc(appointmentRef);
              
              Alert.alert('Succès', 'Votre rendez-vous a été annulé (supprimé).');
              // Refresh the list after successful deletion
              fetchUserAppointments(); 

            } catch (error) {
              console.error("Error deleting appointment:", error);
              Alert.alert('Erreur de Suppression', 'Une erreur est survenue lors de l\'annulation. Veuillez réessayer.');
              setLoading(false); // Stop loading if deletion fails
            }
          },
        },
      ]
    );
  };


  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#FF9500" />
        <Text style={styles.infoText}>Chargement de vos rendez-vous...</Text>
      </View>
    );
  }

  // --- MODIFIED: Wrap everything in SafeAreaView ---
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color="#2D3748" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Mes Rendez-vous</Text>
          <View style={{ width: 24 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollViewContent}>
          {appointments.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="calendar-outline" size={80} color="#CBD5E1" />
              <Text style={styles.emptyText}>Vous n'avez pas encore de rendez-vous planifiés.</Text>
              <Text style={styles.emptySubtitle}>
                Contactez le support pour prendre un rendez-vous !
              </Text>
            </View>
          ) : (
            appointments.map((appointmentData) => (
              <TouchableOpacity
                key={appointmentData.id}
                style={[
                  styles.appointmentCard,
                  appointmentData.status === 'cancelled' && styles.cancelledAppointmentCard
                ]}
                onPress={() => openAppointmentModal(appointmentData)}
              >
                <View style={styles.appointmentIconContainer}>
                  <Image source={APPOINTMENT_ICON_PNG} style={[styles.customAppointmentIcon, { tintColor: '#FF9500' }]} />
                </View>
                <View style={styles.appointmentDetails}>
                  <Text style={styles.appointmentPartnerName}>{appointmentData.partnerNom || 'Partenaire Inconnu'}</Text>
                  <Text style={styles.appointmentClientNames}>
                    Pour: {Array.isArray(appointmentData.clientNames) ? appointmentData.clientNames.join(', ') : appointmentData.clientNames || 'N/A'}
                  </Text>
                  <Text style={styles.appointmentDateTime}>
                    Le: {formatDateTime(appointmentData.appointmentDateTime)}
                  </Text>
                  <Text style={[
                    styles.appointmentStatus,
                    appointmentData.status === 'cancelled' ? styles.statusCancelledText : styles.statusScheduledText
                  ]}>
                    Statut: {appointmentData.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward-outline" size={24} color="#A0AEC0" />
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {/* Appointment Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={closeModal}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <TouchableOpacity onPress={closeModal} style={styles.closeModalButton}>
                <Ionicons name="close-circle-outline" size={30} color="#A0AEC0" />
              </TouchableOpacity>

              {selectedAppointment && (
                <>
                  <Text style={styles.modalAppointmentTitle}>Détails du Rendez-vous</Text>
                  <Text style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Partenaire:</Text> {selectedAppointment.partnerNom || 'N/A'}
                  </Text>
                  <Text style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Date et Heure:</Text> {formatDateTime(selectedAppointment.appointmentDateTime)}
                  </Text>
                  <Text style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Pour:</Text> {Array.isArray(selectedAppointment.clientNames) ? selectedAppointment.clientNames.join(', ') : selectedAppointment.clientNames || 'N/A'}
                  </Text>
                  {selectedAppointment.description && (
                    <Text style={styles.modalDetailText}>
                      <Text style={styles.modalDetailLabel}>Description:</Text> {selectedAppointment.description}
                    </Text>
                  )}
                  <Text style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Statut:</Text> {selectedAppointment.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
                  </Text>
                  
                  {/* QR Code Logic (Kept as is) */}
                  {(() => {
                    let qrValueToEncode = null;
                    let displayedCodeValue = null;
                    if (selectedAppointment.codeData && typeof selectedAppointment.codeData === 'object') {
                      if (typeof selectedAppointment.codeData.qrContent === 'string' && selectedAppointment.codeData.qrContent.length > 0) {
                        qrValueToEncode = selectedAppointment.codeData.qrContent;
                      }
                      else if (typeof selectedAppointment.codeData.value === 'string' && selectedAppointment.codeData.value.length > 0) {
                        qrValueToEncode = selectedAppointment.codeData.value;
                      }
                      
                      if (typeof selectedAppointment.codeData.value === 'string' && selectedAppointment.codeData.value.length > 0) {
                        displayedCodeValue = selectedAppointment.codeData.value;
                      }
                    }
                    else if (typeof selectedAppointment.codeData === 'string' && selectedAppointment.codeData.length > 0) {
                        qrValueToEncode = selectedAppointment.codeData;
                        displayedCodeValue = selectedAppointment.codeData;
                    }

                    if (qrValueToEncode) {
                      return (
                        <View style={styles.modalQrCodeContainer}>
                          <QRCode
                            value={qrValueToEncode}
                            size={width * 0.6}
                            color="#2D3748"
                            backgroundColor="#FFFFFF"
                            ecl="H"
                          />
                          <Text style={styles.modalQrCodeLabel}>
                            **Veuillez présenter ce code QR** lors de votre rendez-vous.
                          </Text>
                          {displayedCodeValue && (
                              <Text style={styles.modalDetailText}>
                                  Code: <Text style={styles.modalDetailValue}>{displayedCodeValue}</Text>
                              </Text>
                          )}
                        </View>
                      );
                    } else {
                      return (
                        <Text style={styles.modalDetailText}>
                          *Aucun code QR associé à ce rendez-vous.*
                        </Text>
                      );
                    }
                  })()}


                  {selectedAppointment.ticketId && (
                    <Text style={styles.modalDetailText}>
                      <Text style={styles.modalDetailLabel}>Ticket associé:</Text> {selectedAppointment.ticketId.substring(0, 8)}...
                    </Text>
                  )}

                  {/* 💥 NEW: Delete Button in Modal 💥 */}
                  <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => deleteAppointment(selectedAppointment)}
                  >
                      <Ionicons name="trash-outline" size={20} color="#FFFFFF" />
                      <Text style={styles.deleteButtonText}>Annuler le Rendez-vous</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
    // --- END MODIFIED: SafeAreaView Wrap ---
  );
};

const styles = StyleSheet.create({
  // --- NEW STYLE: Added for SafeAreaView ---
  safeArea: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  // --- END NEW STYLE ---
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
    // Platform specific padding is no longer needed here due to SafeAreaView
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  scrollViewContent: {
    padding: 20,
    paddingBottom: 40,
  },
  emptyContainer: {
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
    borderColor: '#FF9500',
  },
  cancelledAppointmentCard: {
    opacity: 0.6,
    borderColor: '#A0AEC0',
  },
  appointmentIconContainer: {
    marginRight: 15,
  },
  customAppointmentIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
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

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 25,
    width: '90%',
    maxWidth: 450,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 15,
  },
  closeModalButton: {
    position: 'absolute',
    top: 15,
    right: 15,
    zIndex: 1,
  },
  modalAppointmentTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalDetailText: {
    fontSize: 16,
    color: '#4A5568',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalDetailLabel: {
    fontWeight: 'bold',
    color: '#2D3748',
  },
  modalQrCodeContainer: {
    marginTop: 20,
    marginBottom: 20,
    alignItems: 'center',
    padding: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalQrCodeLabel: {
    marginTop: 15,
    fontSize: 14,
    color: '#4A5568',
    textAlign: 'center',
    fontWeight: '500',
  },
  modalDetailValue: {
        fontWeight: 'bold',
        color: '#34C759',
  },
  // --- NEW STYLE: Delete Button ---
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EF4444', // Red for destructive action
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 20,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
  deleteButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  // --- END NEW STYLE ---
});

export default UserRdv;
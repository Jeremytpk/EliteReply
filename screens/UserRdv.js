import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Modal, Dimensions, Platform, Image } from 'react-native'; // Import Image
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../firebase'; // Adjust path if necessary
import { collectionGroup, query, where, getDocs, orderBy } from 'firebase/firestore'; // Use collectionGroup
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg'; // Keep if QR codes are generated for appointments

const { width } = Dimensions.get('window');

// --- NEW: Import your custom icon ---
const APPOINTMENT_ICON_PNG = require('../assets/icons/appointment.png');
// --- END NEW IMPORTS ---

const UserRdv = () => {
  const navigation = useNavigation();
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // Helper function to format date/time safely
  const formatDateTime = (date) => {
    if (!date) return 'Date/Heure inconnue';
    try {
      let d = date;
      // Handle Firebase Timestamp objects
      if (typeof date === 'object' && date !== null && typeof date.toDate === 'function') {
        d = date.toDate();
      } else if (typeof date === 'string') { // If it's an ISO string
        d = new Date(date);
      } else if (!(d instanceof Date)) { // If it's something else that's not a Date object
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

  useEffect(() => {
    const fetchUserAppointments = async () => {
      setLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          Alert.alert('Erreur', 'Vous devez être connecté pour voir vos rendez-vous.');
          navigation.goBack();
          return;
        }

        // Fetching from 'rdv_reservation' collection group
        // This collection is expected to be under each 'partner' document
        // Example path: partners/{partnerId}/rdv_reservation/{appointmentId}
        const q = query(
          collectionGroup(db, 'rdv_reservation'),
          where('clientId', '==', currentUser.uid),
          where('status', 'in', ['scheduled', 'rescheduled']), // Only show active appointments
          orderBy('appointmentDateTime', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const fetchedAppointments = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          fetchedAppointments.push({ id: doc.id, ...data }); // doc.id here is the ID within rdv_reservation
        });
        setAppointments(fetchedAppointments);

      } catch (error) {
        console.error("Error fetching user appointments:", error);
        Alert.alert('Erreur', 'Impossible de charger vos rendez-vous. Veuillez réessayer ou vérifier la console pour créer un index Firestore si nécessaire.');
      } finally {
        setLoading(false);
      }
    };

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

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#FF9500" />
        <Text style={styles.infoText}>Chargement de vos rendez-vous...</Text>
      </View>
    );
  }

  return (
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
                {/* --- MODIFIED: Use custom image for calendar icon --- */}
                <Image source={APPOINTMENT_ICON_PNG} style={[styles.customAppointmentIcon, { tintColor: '#FF9500' }]} />
                {/* --- END MODIFIED --- */}
              </View>
              <View style={styles.appointmentDetails}>
                <Text style={styles.appointmentPartnerName}>{appointmentData.partnerNom || 'Partenaire Inconnu'}</Text> {/* Using partnerNom */}
                <Text style={styles.appointmentClientNames}>
                  Pour: {Array.isArray(appointmentData.clientNames) ? appointmentData.clientNames.join(', ') : appointmentData.clientNames || 'N/A'} {/* Ensure Array.isArray check */}
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
              <Ionicons name="close-circle-outline" size={30} color="#EF4444" />
            </TouchableOpacity>

            {selectedAppointment && (
              <>
                <Text style={styles.modalAppointmentTitle}>Détails du Rendez-vous</Text>
                <Text style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Partenaire:</Text> {selectedAppointment.partnerNom || 'N/A'} {/* Using partnerNom */}
                </Text>
                <Text style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Date et Heure:</Text> {formatDateTime(selectedAppointment.appointmentDateTime)}
                </Text>
                <Text style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Pour:</Text> {Array.isArray(selectedAppointment.clientNames) ? selectedAppointment.clientNames.join(', ') : selectedAppointment.clientNames || 'N/A'} {/* Ensure Array.isArray check */}
                </Text>
                {selectedAppointment.description && (
                  <Text style={styles.modalDetailText}>
                    <Text style={styles.modalDetailLabel}>Description:</Text> {selectedAppointment.description}
                  </Text>
                )}
                <Text style={styles.modalDetailText}>
                  <Text style={styles.modalDetailLabel}>Statut:</Text> {selectedAppointment.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
                </Text>

                {/* ⭐⭐⭐ MODIFIED: Improved QR code display logic ⭐⭐⭐ */}
                {(() => {
                  let qrValueToEncode = null;
                  let displayedCodeValue = null;

                  // Your AppointmentFormModal saves codeData as an object { type, value, qrContent }
                  // and also codeImageUrl.
                  // The 'id' in rdv_reservation comes from the main 'appointments' collection.
                  // The rdv_reservation documents should also have 'codeData' saved.

                  if (selectedAppointment.codeData && typeof selectedAppointment.codeData === 'object') {
                    // Prioritize qrContent for encoding if available and is a valid string
                    if (typeof selectedAppointment.codeData.qrContent === 'string' && selectedAppointment.codeData.qrContent.length > 0) {
                      qrValueToEncode = selectedAppointment.codeData.qrContent;
                    }
                    // Fallback to 'value' for encoding if qrContent is not present/valid, but 'value' is
                    else if (typeof selectedAppointment.codeData.value === 'string' && selectedAppointment.codeData.value.length > 0) {
                      qrValueToEncode = selectedAppointment.codeData.value;
                    }
                    
                    // The human-readable code to display is usually 'value'
                    if (typeof selectedAppointment.codeData.value === 'string' && selectedAppointment.codeData.value.length > 0) {
                      displayedCodeValue = selectedAppointment.codeData.value;
                    }
                  }
                  // Handle legacy case if codeData was just a simple string (less likely now)
                  else if (typeof selectedAppointment.codeData === 'string' && selectedAppointment.codeData.length > 0) {
                      qrValueToEncode = selectedAppointment.codeData;
                      displayedCodeValue = selectedAppointment.codeData;
                  }

                  if (qrValueToEncode) {
                    return (
                      <View style={styles.modalQrCodeContainer}>
                        <QRCode
                          value={qrValueToEncode} // This must be a string
                          size={width * 0.6}
                          color="#2D3748"
                          backgroundColor="#FFFFFF"
                          ecl="H" // Error Correction Level
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
              </>
            )}
          </View>
        </View>
      </Modal>
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
    paddingTop: Platform.OS === 'android' ? 30 : 0,
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
    borderColor: '#FF9500', // Orange border for active appointments
  },
  cancelledAppointmentCard: {
    opacity: 0.6,
    borderColor: '#A0AEC0', // Gray border for cancelled appointments
  },
  appointmentIconContainer: {
    marginRight: 15,
  },
  // --- NEW STYLE for Custom Appointment Icon ---
  customAppointmentIcon: {
    width: 30, // Match Ionicons size
    height: 30, // Match Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline to maintain specific color
  },
  // --- END NEW STYLE ---
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

  // Modal Styles - Reused from UserCoupons for consistency
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
  modalDetailValue: { // Added this style for the displayed code value
        fontWeight: 'bold',
        color: '#34C759',
  },
});

export default UserRdv;
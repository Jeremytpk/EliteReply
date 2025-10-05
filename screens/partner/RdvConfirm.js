import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Platform,
  RefreshControl,
  KeyboardAvoidingView,
  ScrollView,
  Image
} from 'react-native';
import {
  Ionicons,
  MaterialIcons
} from '@expo/vector-icons';
import { db, auth } from '../../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
  orderBy,
  limit // Keep limit for single order/filter scenarios, but not with multiple 'where' causing issues
} from 'firebase/firestore';
import { useNavigation } from '@react-navigation/native';
import moment from 'moment';

// --- NEW: Import your custom icons ---
const BACK_CIRCLE_ICON = require('../../assets/icons/back_circle.png');
const CALENDAR_OUTLINE_ICON = require('../../assets/icons/appointment.png');
const PAYMENT_ICON = require('../../assets/icons/money_bill.png');
const EYE_OUTLINE_ICON = require('../../assets/icons/eye_outline.png');
const CHECK_CIRCLE_OUTLINE_ICON = require('../../assets/icons/checked_apt.png');
const STAR_ICON_RATING = require('../../assets/icons/rate.png');
// --- END NEW IMPORTS ---

const COMMISSION_RATE = 0.13; // 13% commission rate

const RdvConfirm = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [rdvs, setRdvs] = useState([]); // List of confirmed RDVs
  const [currentPartnerId, setCurrentPartnerId] = useState(null);
  const [loggedInPartnerName, setLoggedInPartnerName] = useState(''); // This will store the partner's 'nom'

  const [paymentModalVisible, setPaymentModalVisible] = useState(false);
  const [paymentDetailsModalVisible, setPaymentDetailsModalVisible] = useState(false);
  const [selectedRdvForPayment, setSelectedRdvForPayment] = useState(null);
  const [paymentAmountInput, setPaymentAmountInput] = useState('');
  const [commissionAmount, setCommissionAmount] = useState(0);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  // States for displaying payment details
  const [displayedPaymentDetails, setDisplayedPaymentDetails] = useState(null);

  // Helper functions
  const formatDate = (timestamp) => {
    if (!timestamp) return 'Date inconnue';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Date invalide';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'Heure inconnue';
    try {
      const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleTimeString('fr-FR', {
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      console.error("Error formatting time:", e);
      return 'Heure invalide';
    }
  };

  useEffect(() => {
    const fetchPartnerInfo = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Non autorisé", "Vous devez être connecté pour gérer les rendez-vous.");
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      const userDocRef = doc(db, 'users', currentUser.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists() && userDocSnap.data().partnerId) {
        const partnerIdFromUser = userDocSnap.data().partnerId;
        setCurrentPartnerId(partnerIdFromUser);

        const partnerDocRef = doc(db, 'partners', partnerIdFromUser);
        const partnerDocSnap = await getDoc(partnerDocRef);
        if (partnerDocSnap.exists()) {
          setLoggedInPartnerName(partnerDocSnap.data().nom || 'Partenaire Inconnu');
        } else {
          setLoggedInPartnerName('Partenaire (Non trouvé)');
          console.warn("WARN: Partner document not found for ID:", partnerIdFromUser);
        }
      } else {
        Alert.alert("Erreur", "Votre compte n'est pas lié à un partenaire. Accès refusé.");
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      }
    };
    fetchPartnerInfo();
  }, [navigation]);

  const fetchData = useCallback(async () => {
    if (!currentPartnerId) return;

    setLoading(true);
    try {
      // Using only partnerId filter to avoid composite index requirement
      const rdvsQuery = query(
        collection(db, 'appointments'),
        where('partnerId', '==', currentPartnerId),
        orderBy('appointmentDateTime', 'desc')
      );
      const rdvQuerySnapshot = await getDocs(rdvsQuery);
      
      // Filter for confirmed/completed status in memory to avoid composite index
      const fetchedRdvs = [];
      rdvQuerySnapshot.docs.forEach(doc => {
        const data = doc.data();
        if (data.status === 'confirmed' || data.status === 'completed') {
          fetchedRdvs.push({ id: doc.id, ...data });
        }
      });
      setRdvs(fetchedRdvs);

    } catch (error) {
      console.error("Error fetching RDVs for RdvConfirm:", error);
      Alert.alert("Erreur", "Impossible de charger les rendez-vous. " + error.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentPartnerId]);

  useEffect(() => {
    if (currentPartnerId) {
      fetchData();
    }
  }, [currentPartnerId, fetchData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchData();
  }, [fetchData]);

  const openPaymentModal = (rdvItem) => {
    setSelectedRdvForPayment(rdvItem);
    setPaymentAmountInput('');
    setCommissionAmount(0);
    setPaymentModalVisible(true);
  };

  const handlePaymentAmountChange = (text) => {
    const cleanedText = text.replace(/[^0-9.]/g, '');
    setPaymentAmountInput(cleanedText);

    const amount = parseFloat(cleanedText);
    if (!isNaN(amount) && amount >= 0) {
      setCommissionAmount(amount * COMMISSION_RATE);
    } else {
      setCommissionAmount(0);
    }
  };

  const submitPayment = async () => {
    if (!selectedRdvForPayment || !currentPartnerId) return;

    const amount = parseFloat(paymentAmountInput);
    if (isNaN(amount) || amount <= 0) {
      Alert.alert("Erreur de montant", "Veuillez entrer un montant valide et positif.");
      return;
    }

    setIsProcessingPayment(true);
    try {
      await addDoc(collection(db, 'partners', currentPartnerId, 'revenue_transactions'), {
        rdvId: selectedRdvForPayment.id, // Still using rdvId here as it's for partner's specific revenue
        clientId: selectedRdvForPayment.clientId,
        clientName: selectedRdvForPayment.clientName,
        partnerId: currentPartnerId,
        partnerName: loggedInPartnerName,
        amountReceived: amount,
        commissionAmount: commissionAmount,
        transactionDate: serverTimestamp(),
        status: 'recorded',
        appointmentDateTime: selectedRdvForPayment.appointmentDateTime,
      });

      const rdvDocRef = doc(db, 'appointments', selectedRdvForPayment.id);
      await updateDoc(rdvDocRef, {
        status: 'completed',
        paymentRecorded: true,
        paymentAmount: amount,
        commissionCalculated: commissionAmount,
      });

      Alert.alert("Succès", `Paiement de $${amount.toFixed(2)} enregistré. Commission de $${commissionAmount.toFixed(2)} calculée.`);
      
      setPaymentModalVisible(false);
      setPaymentAmountInput('');
      setCommissionAmount(0);
      setSelectedRdvForPayment(null);
      fetchData();
    } catch (error) {
      console.error("Error submitting payment:", error);
      Alert.alert("Erreur", "Impossible d'enregistrer le paiement. Veuillez réessayer: " + error.message);
    } finally {
      setIsProcessingPayment(false);
    }
  };

  const openPaymentDetailsModal = (rdvItem) => {
    if (rdvItem.status === 'completed' && rdvItem.paymentRecorded) {
        setDisplayedPaymentDetails(rdvItem);
        setPaymentDetailsModalVisible(true);
    } else {
        Alert.alert("Détails non disponibles", "Le paiement pour ce rendez-vous n'a pas encore été enregistré.");
    }
  };

  // MODIFIED: sendRatingRequestToClient function to use client-side filtering
  const sendRatingRequestToClient = async (clientId, partnerId, appointmentCodeData, clientName, partnerName) => {
    if (!clientId || !partnerId || !appointmentCodeData || !clientName || !partnerName) {
      Alert.alert("Erreur", "Informations de la demande d'évaluation manquantes.");
      console.log("Missing info for rating request: ", { clientId, partnerId, appointmentCodeData, clientName, partnerName });
      return;
    }

    try {
      // Step 1: Query for all rating requests for this client that are pending or displayed.
      // This query should not require a composite index if 'clientId' and 'status' are indexed.
      const baseQuery = query(
        collection(db, 'ratingRequests'),
        where('clientId', '==', clientId),
        where('status', 'in', ['pending', 'displayed'])
        // DO NOT add where('partnerId', '==', partnerId) or where('codeData', '==', appointmentCodeData) here
        // if you want to avoid the composite index requirement.
        // Also remove orderBy if it's causing issues without a matching index.
      );
      const querySnapshot = await getDocs(baseQuery);

      // Step 2: Filter results on the client side
      const existingRequest = querySnapshot.docs.find(doc => {
        const data = doc.data();
        return data.partnerId === partnerId && data.codeData === appointmentCodeData;
      });

      if (existingRequest) {
        Alert.alert("Demande Déjà Envoyée", "Une demande d'évaluation est déjà en attente ou affichée pour ce rendez-vous.");
        setPaymentDetailsModalVisible(false); // Close details modal
        return;
      }

      // If no existing request found after client-side filtering, add a new one
      await addDoc(collection(db, 'ratingRequests'), {
        clientId: clientId,
        partnerId: partnerId,
        codeData: appointmentCodeData,
        partnerName: partnerName,
        requestDate: serverTimestamp(),
        status: 'pending',
      });
      setPaymentDetailsModalVisible(false);
      Alert.alert("Demande Envoyée", `Une demande d'évaluation a été envoyée au client pour le rendez-vous ${appointmentCodeData}.`);
    } catch (error) {
      console.error("Error sending rating request (client-side filter):", error);
      Alert.alert("Erreur", "Impossible d'envoyer la demande d'évaluation. Veuillez réessayer.");
    }
  };
  // END MODIFIED: sendRatingRequestToClient

  const renderRdvItem = ({ item }) => {
    const isCompleted = item.status === 'completed';
    const partnerTotal = (item.paymentAmount || 0) - (item.commissionCalculated || 0);
    const formattedPartnerTotal = partnerTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' });

    return (
      <View style={styles.rdvCard}>
        <View style={styles.rdvCardHeader}>
          <Image source={CALENDAR_OUTLINE_ICON} style={[styles.customRdvCardIcon, { tintColor: '#16a085' }]} />
          <Text style={styles.rdvCardTitle}>Rendez-vous avec {Array.isArray(item.clientNames) ? item.clientNames.join(', ') : item.clientNames || 'un client'}</Text>
        </View>
        <Text style={styles.rdvCardDetails}>Description: {item.description || 'Non spécifié'}</Text>
        <Text style={styles.rdvCardDetails}>Date: {formatDate(item.appointmentDateTime)}</Text>
        <Text style={styles.rdvCardDetails}>Heure: {formatTime(item.appointmentDateTime)}</Text>
        {isCompleted && (
          <Text style={styles.rdvCardDetailsText}>
            Votre Total: {formattedPartnerTotal}
          </Text>
        )}
        {!isCompleted ? (
          <TouchableOpacity
            style={styles.payButton}
            onPress={() => openPaymentModal(item)}
          >
            <Image source={PAYMENT_ICON} style={styles.customPayButtonIcon} />
            <Text style={styles.payButtonText}>Enregistrer le Paiement</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.viewDetailsButton}
            onPress={() => openPaymentDetailsModal(item)}
          >
            <Image source={EYE_OUTLINE_ICON} style={[styles.customViewDetailsIcon, { tintColor: '#4a6bff' }]} />
            <Text style={styles.viewDetailsButtonText}>Voir les Détails</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a6bff" />
        <Text style={styles.loadingText}>Chargement des rendez-vous...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Image source={BACK_CIRCLE_ICON} style={styles.customHeaderIconRdv} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Rendez-vous Confirmés</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollViewContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#4a6bff']}
          />
        }
      >
        {rdvs.length === 0 ? (
          <View style={styles.emptyCard}>
            <Image source={CHECK_CIRCLE_OUTLINE_ICON} style={styles.customEmptyCardIcon} />
            <Text style={styles.emptyCardText}>Aucun rendez-vous confirmé ou complété.</Text>
            <Text style={styles.emptyCardSubText}>Les rendez-vous confirmés s'afficheront ici pour paiement.</Text>
          </View>
        ) : (
          <FlatList
            data={rdvs}
            keyExtractor={item => item.id}
            renderItem={renderRdvItem}
            scrollEnabled={false}
            contentContainerStyle={styles.listContentContainer}
          />
        )}
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={paymentModalVisible}
        onRequestClose={() => setPaymentModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enregistrer le Paiement</Text>
            {selectedRdvForPayment && (
              <Text style={styles.modalSubtitle}>
                Pour: {Array.isArray(selectedRdvForPayment.clientNames) ? selectedRdvForPayment.clientNames.join(', ') : selectedRdvForPayment.clientNames || 'un client'} ({formatDate(selectedRdvForPayment.appointmentDateTime)})
              </Text>
            )}

            <Text style={styles.formLabel}>Montant reçu du client ($):</Text>
            <TextInput
              style={styles.textInput}
              keyboardType="numeric"
              placeholder="Ex: 100.00"
              value={paymentAmountInput}
              onChangeText={handlePaymentAmountChange}
              editable={!isProcessingPayment}
            />

            <View style={styles.commissionDisplay}>
              <Text style={styles.formLabel}>Commission EliteReply (13%):</Text>
              <Text style={styles.commissionAmountText}>
                ${commissionAmount.toFixed(2)}
              </Text>
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => setPaymentModalVisible(false)}
                disabled={isProcessingPayment}
              >
                <Text style={styles.cancelModalButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitModalButton]}
                onPress={submitPayment}
                disabled={isProcessingPayment || !paymentAmountInput.trim() || parseFloat(paymentAmountInput) <= 0}
              >
                {isProcessingPayment ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.submitModalButtonText}>Enregistrer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={paymentDetailsModalVisible}
        onRequestClose={() => setPaymentDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Détails du Paiement</Text>
            {displayedPaymentDetails && (
              <>
                <Text style={styles.detailText}>Client: {Array.isArray(displayedPaymentDetails.clientNames) ? displayedPaymentDetails.clientNames.join(', ') : displayedPaymentDetails.clientNames || 'N/A'}</Text>
                <Text style={styles.detailText}>Date RDV: {formatDate(displayedPaymentDetails.appointmentDateTime)}</Text>
                <Text style={styles.detailText}>Montant Total Reçu: {displayedPaymentDetails.paymentAmount?.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}</Text>
                <Text style={styles.detailText}>Commission EliteReply: {displayedPaymentDetails.commissionCalculated?.toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}</Text>
                 <Text style={styles.detailText}>
                    Votre Total:{' '}
                    {(
                      displayedPaymentDetails.paymentAmount -
                      displayedPaymentDetails.commissionCalculated
                    )?.toLocaleString('fr-FR', {
                      style: 'currency',
                      currency: 'USD',
                    })}
                  </Text>
                <Text style={styles.detailText}>Statut: {displayedPaymentDetails.status === 'completed' ? 'Complété' : 'Inconnu'}</Text>

                <TouchableOpacity
                  style={styles.rateClientButton}
                  onPress={() => sendRatingRequestToClient(
                    displayedPaymentDetails.clientId,
                    displayedPaymentDetails.partnerId,
                    displayedPaymentDetails.codeData,
                    Array.isArray(displayedPaymentDetails.clientNames) ? displayedPaymentDetails.clientNames.join(', ') : displayedPaymentDetails.clientNames || 'N/A',
                    loggedInPartnerName
                  )}
                >
                  <Image source={STAR_ICON_RATING} style={styles.customRateClientIcon} />
                  <Text style={styles.rateClientButtonText}>Demander évaluation au client</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelModalButton, { marginTop: 15 }]}
                  onPress={() => setPaymentDetailsModalVisible(false)}
                >
                  <Text style={styles.cancelModalButtonText}>Fermer</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F0F4F8',
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
      customHeaderIconRdv: {
        width: 24,
        height: 24,
        resizeMode: 'contain',
        tintColor: '#2D3748',
      },
      headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#2D3748',
      },
      loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F4F8',
      },
      loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#4A5568',
      },
      scrollViewContent: {
        padding: 20,
        paddingBottom: 40,
      },
      listContentContainer: {
        paddingBottom: 10,
      },
      rdvCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 6,
        borderLeftWidth: 8,
        borderColor: '#16a085',
      },
      rdvCardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
      },
      customRdvCardIcon: {
        width: 24,
        height: 24,
        resizeMode: 'contain',
      },
      rdvCardTitle: {
        fontSize: 19,
        fontWeight: '700',
        color: '#2D3748',
        marginLeft: 10,
      },
      rdvCardDetails: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
      },
      payButton: {
        backgroundColor: '#34C759',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        marginTop: 15,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      customPayButtonIcon: {
        width: 20,
        height: 20,
        resizeMode: 'contain',
        tintColor: 'white',
        marginRight: 5,
      },
      payButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
      },
      viewDetailsButton: {
        backgroundColor: '#E0EFFF',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        marginTop: 15,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: '#4a6bff',
      },
      customViewDetailsIcon: {
        width: 20,
        height: 20,
        resizeMode: 'contain',
        marginRight: 5,
      },
      viewDetailsButtonText: {
        color: '#4a6bff',
        fontWeight: '600',
        fontSize: 15,
      },
      emptyCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        minHeight: 180,
      },
      customEmptyCardIcon: {
        width: 50,
        height: 50,
        resizeMode: 'contain',
        tintColor: '#ccc',
      },
      emptyCardText: {
        fontSize: 16,
        color: '#6B7280',
        marginTop: 10,
        textAlign: 'center',
      },
      emptyCardSubText: {
        fontSize: 13,
        color: '#9CA3AF',
        marginTop: 5,
        textAlign: 'center',
      },
      modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
      },
      modalContent: {
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
        height: 430
      },
      modalTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        color: '#2D3748',
        marginBottom: 10,
        textAlign: 'center',
      },
      modalSubtitle: {
        fontSize: 16,
        color: '#6B7280',
        marginBottom: 20,
        textAlign: 'center',
      },
      formLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#4A5568',
        marginBottom: 8,
      },
      textInput: {
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 12,
        marginBottom: 15,
        fontSize: 16,
        backgroundColor: '#F9FAFB',
        color: '#333',
      },
      commissionDisplay: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#E6F7FF',
        padding: 12,
        borderRadius: 8,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#B3E5FC',
      },
      commissionAmountText: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#01579B',
      },
      modalActions: {
        flexDirection: 'row',
        justifyContent: 'space-between',
      },
      modalButton: {
        flex: 1,
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: 'center',
        marginHorizontal: 5,
      },
      cancelModalButton: {
        backgroundColor: '#E2E8F0',
      },
      cancelModalButtonText: {
        color: '#4A5568',
        fontWeight: '600',
        fontSize: 16,
      },
      submitModalButton: {
        backgroundColor: '#4a6bff',
      },
      submitModalButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 16,
      },
      detailText: {
        fontSize: 16,
        color: '#4A5568',
        marginBottom: 8,
        lineHeight: 24,
      },
      rateClientButton: {
        backgroundColor: '#FF9500',
        paddingVertical: 12,
        paddingHorizontal: 15,
        borderRadius: 8,
        marginTop: 20,
        alignSelf: 'stretch',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
      },
      customRateClientIcon: {
        width: 20,
        height: 20,
        resizeMode: 'contain',
        tintColor: 'white',
        marginRight: 5,
      },
      rateClientButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 16,
      },
      rdvCardDetailsText: {
        fontWeight: 'bold',
        fontSize: 16
      }
    });

export default RdvConfirm;
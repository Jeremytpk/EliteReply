import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Linking, // Import Linking for opening files
  Alert,
  Modal,
  RefreshControl,
  Platform,
  PermissionsAndroid,
  FlatList,
  TextInput, // Import TextInput
  Image // Import Image for custom icons
} from 'react-native';
import {
  collection,
  getDocs,
  doc,
  updateDoc,
  query,
  where,
  collectionGroup,
  getDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';
// No longer need MaterialIcons or Ionicons directly if replacing them all with custom images
// import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing'; // NEW: Import Expo Sharing

// --- NEW: Import your custom icons ---
const SEARCH_ICON = require('../assets/icons/search.png'); // For search input
const WALLET_OUTLINE_ICON = require('../assets/icons/wallet_outline.png'); // For payment item card
const CHEVRON_FORWARD_ICON = require('../assets/icons/arrow_rightShort.png'); // For partner card
const CLOSE_CIRCLE_OUTLINE_ICON = require('../assets/icons/close_circle.png'); // For modal close button
const OPEN_OUTLINE_ICON = require('../assets/icons/open_outline.png'); // For open receipt button
const DOWNLOAD_OUTLINE_ICON = require('../assets/icons/download_outline.png'); // For download receipt button

const PaymentsScreen = () => {
  const [partnersFinancials, setPartnersFinancials] = useState([]);
  const [paymentsList, setPaymentsList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [globalStats, setGlobalStats] = useState({
    totalAmountReceived: 0,
    totalCommissionAmount: 0,
  });

  const [isPartnerModalVisible, setIsPartnerModalVisible] = useState(false);
  const [selectedPartnerDetails, setSelectedPartnerDetails] = useState(null);
  const [partnerModalLoading, setPartnerModalLoading] = useState(false);

  const [paymentDetailsModalVisible, setPaymentDetailsModalVisible] = useState(false);
  const [selectedPaymentDetails, setSelectedPaymentDetails] = useState(null);

  const [searchQuery, setSearchQuery] = useState(''); // State for search query

  const notifiedFinancialUpdatePartners = useRef(new Set());

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
      console.log('Push notification sent successfully!');
    } catch (error) {
      console.error('Failed to send push notification:', error);
    }
  };

  const formatDateTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      let date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      console.error("Error formatting date/time for display:", e);
      return 'Date invalide';
    }
  };

  const formatDateOnly = (timestamp) => {
    if (!timestamp) return 'N/A';
    try {
      let date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
      return date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      console.error("Error formatting date only:", e);
      return 'Date invalide';
    }
  };

  const fetchGlobalStatsAndPartners = useCallback(async () => {
    setLoading(true);
    try {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Accès refusé", "Veuillez vous connecter pour accéder aux données financières.");
        setLoading(false);
        setRefreshing(false);
        return;
      }

      let currentTotalAmountReceived = 0;
      let currentTotalCommissionAmount = 0;
      const partnersFinancialsList = [];
      const partnerDataMap = new Map();

      const partnersQuerySnapshot = await getDocs(collection(db, 'partners'));
      partnersQuerySnapshot.forEach(doc => {
        partnerDataMap.set(doc.id, {
          id: doc.id,
          nom: doc.data().nom || 'Nom Inconnu', // Changed to nom
          categorie: doc.data().categorie || 'Catégorie Inconnue', // Changed to categorie
          monthlyNet: 0,
          yearlyNet: 0,
          monthlyCommission: 0,
          yearlyCommission: 0,
          confirmedAppointments: 0,
          scheduledAppointments: 0,
          latestTransactionDate: null,
          latestAmount: 0,
        });
      });

      const revenueTransactionsQuerySnapshot = await getDocs(collectionGroup(db, 'revenue_transactions'));

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentYearStart = new Date(now.getFullYear(), 0, 1);

      for (const docSnapshot of revenueTransactionsQuerySnapshot.docs) {
        const transaction = docSnapshot.data();
        const partnerId = docSnapshot.ref.parent.parent.id;
        const transactionDate = transaction.transactionDate?.toDate();

        if (typeof transaction.amountReceived === 'number' && typeof transaction.commissionAmount === 'number') {
          currentTotalAmountReceived += transaction.amountReceived;
          currentTotalCommissionAmount += transaction.commissionAmount;

          if (partnerDataMap.has(partnerId)) {
            const partner = partnerDataMap.get(partnerId);
            const netAmount = transaction.amountReceived - transaction.commissionAmount;

            if (transactionDate >= currentMonthStart) {
                partner.monthlyNet += netAmount;
                partner.monthlyCommission += transaction.commissionAmount;
            }
            if (transactionDate >= currentYearStart) {
                partner.yearlyNet += netAmount;
                partner.yearlyCommission += transaction.commissionAmount;
            }

            const prevLatestTransactionDate = partner.latestTransactionDate;

            if (!partner.latestTransactionDate || transactionDate > partner.latestTransactionDate) {
                partner.latestTransactionDate = transactionDate;
                partner.latestAmount = netAmount;

                if (currentUser.uid !== partnerId) {
                    const isNewTransaction = !prevLatestTransactionDate || transactionDate > prevLatestTransactionDate;
                    if (isNewTransaction && !notifiedFinancialUpdatePartners.current.has(partnerId)) {
                        console.log(`NEW FINANCIAL UPDATE DETECTED for partner: ${partner.nom}`); // Changed to nom
                        const adminDocSnap = await getDoc(doc(db, 'users', currentUser.uid));
                        if (adminDocSnap.exists() && adminDocSnap.data().expoPushToken) {
                            sendPushNotification(
                                adminDocSnap.data().expoPushToken,
                                "Mise à jour financière partenaire!",
                                `Nouvelle transaction enregistrée pour ${partner.nom}.`, // Changed to nom
                                { type: 'partner_payment_update', partnerId: partner.id }
                            );
                            notifiedFinancialUpdatePartners.current.add(partnerId);
                        }
                    }
                }
            }
          }
        }
      }

      partnerDataMap.forEach(partner => partnersFinancialsList.push(partner));
      partnersFinancialsList.sort((a, b) => a.nom.localeCompare(b.nom)); // Sorted by nom

      setGlobalStats({
        totalAmountReceived: currentTotalAmountReceived,
        totalCommissionAmount: currentTotalCommissionAmount,
      });
      setPartnersFinancials(partnersFinancialsList);

      const paymentsQuerySnapshot = await getDocs(collection(db, 'payments'));
      const fetchedPayments = paymentsQuerySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          recordedAt: doc.data().recordedAt?.toDate(),
          paymentFromDate: doc.data().paymentFromDate?.toDate(),
          paymentToDate: doc.data().paymentToDate?.toDate(),
      })).sort((a, b) => b.recordedAt - a.recordedAt);
      setPaymentsList(fetchedPayments);

    } catch (error) {
      console.error("Error fetching global stats and partners:", error);
      Alert.alert("Erreur", "Impossible de charger les données financières. Vérifiez votre connexion ou les index Firestore.");
      setPartnersFinancials([]);
      setGlobalStats({ totalAmountReceived: 0, totalCommissionAmount: 0 });
      setPaymentsList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const fetchSelectedPartnerDetails = useCallback(async (partnerId) => {
    setPartnerModalLoading(true);
    try {
      const partnerDocSnapQuery = await getDocs(query(collection(db, 'partners'), where('id', '==', partnerId)));
      let partnerName = 'N/A';
      if (!partnerDocSnapQuery.empty) {
        partnerName = partnerDocSnapQuery.docs[0].data().nom || 'N/A'; // Changed to nom
      }

      let monthlyNet = 0;
      let yearlyNet = 0;
      let monthlyCommission = 0;
      let yearlyCommission = 0;
      let confirmedAppointments = 0;
      let scheduledAppointments = 0;

      const now = new Date();
      const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const currentYearStart = new Date(now.getFullYear(), 0, 1);

      const partnerRevenueTransactionsQuery = query(
        collection(db, 'partners', partnerId, 'revenue_transactions')
      );
      const revenueTransactionsSnapshot = await getDocs(partnerRevenueTransactionsQuery);

      revenueTransactionsSnapshot.forEach(doc => {
        const transaction = doc.data();
        const transactionDate = transaction.transactionDate?.toDate();

        if (typeof transaction.amountReceived === 'number' && typeof transaction.commissionAmount === 'number') {
          const netAmount = transaction.amountReceived - transaction.commissionAmount;
          if (transactionDate >= currentMonthStart) {
            monthlyNet += netAmount;
            monthlyCommission += transaction.commissionAmount;
          }
          if (transactionDate >= currentYearStart) {
            yearlyNet += netAmount;
            yearlyCommission += transaction.commissionAmount;
          }
        }
      });

      const partnerAppointmentsQuery = query(
        collection(db, 'appointments'),
        where('partnerId', '==', partnerId)
      );
      const appointmentsSnapshot = await getDocs(partnerAppointmentsQuery);

      appointmentsSnapshot.forEach(doc => {
        const appt = doc.data();
        if (appt.status === 'confirmed' || appt.status === 'completed') {
          confirmedAppointments++;
        } else if (appt.status === 'scheduled' || appt.status === 'rescheduled') {
          scheduledAppointments++;
        }
      });

      setSelectedPartnerDetails({
        id: partnerId,
        name: partnerName, // This 'name' is derived from 'nom' for the modal
        monthlyNet,
        yearlyNet,
        monthlyCommission,
        yearlyCommission,
        confirmedAppointments,
        scheduledAppointments,
      });
      setIsPartnerModalVisible(true);

    } catch (error) {
      console.error("Error fetching selected partner details:", error);
      Alert.alert("Erreur", "Impossible de charger les détails du partenaire. " + error.message);
    } finally {
      setPartnerModalLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGlobalStatsAndPartners();
  }, [fetchGlobalStatsAndPartners]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchGlobalStatsAndPartners();
  }, [fetchGlobalStatsAndPartners]);

  const downloadDocument = async (url, filename) => {
    Alert.alert("Téléchargement", "Téléchargement du document en cours...", [{ text: "OK" }]);
    console.log("Attempting to download:", filename, "from:", url);

    try {
      const temporaryLocalUri = `${FileSystem.cacheDirectory}${Date.now()}_${filename}`;

      console.log("Downloading to temporary URI:", temporaryLocalUri);
      const { uri: downloadedFileUri } = await FileSystem.downloadAsync(url, temporaryLocalUri);
      console.log("Download complete, temporary URI:", downloadedFileUri);

      if (Platform.OS === 'android') {
        console.log("Platform is Android. Requesting MediaLibrary permissions for potential save...");
        const { status: mediaLibStatus } = await MediaLibrary.requestPermissionsAsync();

        if (mediaLibStatus === 'granted') {
          try {
            // Attempt to save to MediaLibrary. This usually places it in a default accessible folder (e.g., Downloads/Pictures).
            // Direct creation of custom named folders within MediaLibrary via createAlbumAsync
            // with a downloaded file from cache can be problematic and is often not the intended use case for MediaLibrary.
            const asset = await MediaLibrary.createAssetAsync(downloadedFileUri);

            Alert.alert(
              "Succès",
              `Document téléchargé et disponible dans votre galerie ou dossier de téléchargements.`
            );
            // Delete the temporary file after it's been handled by MediaLibrary
            await FileSystem.deleteAsync(downloadedFileUri, { idempotent: true });
            console.log("Temporary file deleted after MediaLibrary save.");

            // Offer to share/open the file immediately after successful save
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(asset.uri); // Use the asset's content URI for sharing
            } else {
              Alert.alert("Partage non disponible", "Le partage de fichiers n'est pas pris en charge sur cet appareil.");
            }

          } catch (saveError) {
            console.error("Android: Error saving to MediaLibrary (falling back to Sharing):", saveError);
            Alert.alert(
              "Erreur de sauvegarde",
              "Impossible de sauvegarder le document directement. Il sera ouvert pour que vous puissiez le gérer."
            );
            // If MediaLibrary save fails, fall back to sharing
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(downloadedFileUri); // Expo Sharing handles FileProvider correctly
            } else {
              Alert.alert("Erreur", "Le partage de fichiers n'est pas pris en charge sur cet appareil et la sauvegarde a échoué.");
            }
          }
        } else {
          // MediaLibrary permission denied. Fall back to sharing directly.
          Alert.alert(
            "Permission refusée",
            "Impossible de sauvegarder le document directement. Le fichier sera ouvert pour que vous puissiez le gérer."
          );
          if (await Sharing.isAvailableAsync()) {
            await Sharing.shareAsync(downloadedFileUri); // Expo Sharing handles FileProvider correctly
          } else {
            Alert.alert("Erreur", "Le partage de fichiers n'est pas pris en charge sur cet appareil.");
          }
        }

      } else if (Platform.OS === 'ios') {
        console.log("Platform is iOS. Copying to document directory and then sharing.");

        const destinationFileUri = `${FileSystem.documentDirectory}${filename}`;
        await FileSystem.copyAsync({
          from: downloadedFileUri,
          to: destinationFileUri,
        });
        console.log("Copied to iOS document directory:", destinationFileUri);

        Alert.alert(
          "Succès",
          "Document téléchargé. Vous pouvez l'ouvrir ou le sauvegarder dans Fichiers."
        );

        // Use Expo Sharing on iOS, which provides the "Save to Files" option.
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(destinationFileUri);
        } else {
          Alert.alert("Partage non disponible", "Le partage de fichiers n'est pas pris en charge sur cet appareil.");
        }

        await FileSystem.deleteAsync(downloadedFileUri, { idempotent: true });
        console.log("Temporary file deleted on iOS.");

      } else {
        console.log("Platform is neither Android nor iOS. Attempting direct open.");
        Alert.alert("Téléchargé", `Document sauvegardé temporairement. Vous pouvez le trouver ici: ${downloadedFileUri}`);
        await Linking.openURL(downloadedFileUri);
      }

    } catch (error) {
      console.error("Error during downloadDocument:", error);
      Alert.alert("Erreur", "Impossible de télécharger le document: " + error.message);
    }
  };


  const renderPaymentItem = ({ item }) => (
    <TouchableOpacity
      style={styles.paymentItemCard}
      onPress={() => {
        setSelectedPaymentDetails(item);
        setPaymentDetailsModalVisible(true);
      }}
    >
      <View style={styles.paymentItemHeader}>
        {/* --- MODIFIED: Using custom wallet outline icon --- */}
        <Image source={WALLET_OUTLINE_ICON} style={[styles.customIcon, { tintColor: '#34C759' }]} />
        {/* --- END MODIFIED --- */}
        <Text style={styles.paymentItemPartnerName}>{item.partnerName}</Text>
        <Text style={styles.paymentItemAmount}>
          {(item.paymentAmount ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
        </Text>
      </View>
      <Text style={styles.paymentItemPeriod}>
        Période: {formatDateOnly(item.paymentFromDate)} - {formatDateOnly(item.paymentToDate)}
      </Text>
      <Text style={styles.paymentItemRecordedAt}>
        Enregistré le: {formatDateTime(item.recordedAt)} par {item.recordedByName}
      </Text>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement des données financières...</Text>
      </View>
    );
  }
  // --- NEW: Filter partners based on search query ---
  const filteredPartnersFinancials = partnersFinancials.filter(partner => {
    return partner.nom.toLowerCase().includes(searchQuery.toLowerCase()); // Filter by nom
  });
  // --- END NEW ---

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={['#0a8fdf']}
          tintColor="#0a8fdf"
          title="Tirer pour actualiser"
          titleColor="#0a8fdf"
        />
      }
    >
      <Text style={styles.title}>Statistiques Financières Partenaires</Text>

      {/* Global Financial Summary */}
      <View style={styles.globalSummaryCard}>
        <Text style={styles.globalSummaryTitle}>Vue d'overview financière globale</Text>
        <View style={styles.globalSummaryRow}>
          <View style={styles.globalSummaryItem}>
            <Text style={styles.globalSummaryLabel}>Revenus Totaux (EliteReply)</Text>
            <Text style={styles.globalSummaryValue}>
              {(globalStats.totalAmountReceived ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
            </Text>
          </View>
          <View style={styles.globalSummaryItem}>
            <Text style={styles.globalSummaryLabel}>Commissions Totales (EliteReply)</Text>
            <Text style={[styles.globalSummaryValue, { color: '#9C27B0' }]}>
              {(globalStats.totalCommissionAmount ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Revenus par Partenaire</Text>

      {/* NEW: Search Bar */}
      <View style={styles.searchBarContainer}>
        {/* --- MODIFIED: Using custom search icon --- */}
        <Image source={SEARCH_ICON} style={styles.customIcon} />
        {/* --- END MODIFIED --- */}
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un partenaire par nom..." // Updated placeholder
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      {/* END NEW: Search Bar */}

      {filteredPartnersFinancials.length === 0 ? (
        <Text style={styles.noData}>Aucun partenaire correspondant à la recherche ou aucune donnée financière à afficher.</Text>
      ) : (
        filteredPartnersFinancials.map(partner => ( // Use filteredPartnersFinancials here
          <TouchableOpacity
            key={partner.id}
            style={styles.partnerCard}
            onPress={() => fetchSelectedPartnerDetails(partner.id)}
          >
            <View style={styles.partnerHeader}>
              <Text style={styles.partnerName}>{partner.nom}</Text> {/* Changed to nom */}
              {/* --- MODIFIED: Using custom chevron forward icon --- */}
              <Image source={CHEVRON_FORWARD_ICON} style={[styles.customIcon, { tintColor: '#666' }]} />
              {/* --- END MODIFIED --- */}
            </View>
            <Text style={styles.partnerCategory}>{partner.categorie}</Text> {/* Changed to categorie */}
            {partner.latestTransactionDate && (
              <Text style={styles.partnerLatestTransaction}>
                Dernière transaction: {(partner.latestAmount ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })} le {formatDateTime(partner.latestTransactionDate)}
              </Text>
            )}
            {!partner.latestTransactionDate && (
              <Text style={styles.partnerLatestTransaction}>
                Pas de transactions enregistrées.
              </Text>
            )}
          </TouchableOpacity>
        ))
      )}

      {/* Section for Payments List */}
      <Text style={styles.sectionTitle}>Paiements Enregistrés</Text>
      {paymentsList.length === 0 ? (
        <Text style={styles.noData}>Aucun paiement enregistré pour le moment.</Text>
      ) : (
        <FlatList
          data={paymentsList}
          keyExtractor={item => item.id}
          renderItem={renderPaymentItem}
          scrollEnabled={false} // Disable FlatList scrolling as it's inside a ScrollView
          contentContainerStyle={styles.paymentsListContainer}
        />
      )}

      {/* Partner Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={isPartnerModalVisible}
        onRequestClose={() => setIsPartnerModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setIsPartnerModalVisible(false)}
            >
              {/* --- MODIFIED: Using custom close circle outline icon --- */}
              <Image source={CLOSE_CIRCLE_OUTLINE_ICON} style={styles.customModalCloseIcon} />
              {/* --- END MODIFIED --- */}
            </TouchableOpacity>

            {partnerModalLoading ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color="#0a8fdf" />
                <Text style={styles.loadingText}>Chargement des détails...</Text>
              </View>
            ) : (
              selectedPartnerDetails && (
                <ScrollView contentContainerStyle={styles.modalScrollContent}>
                  <Text style={styles.modalTitle}>{selectedPartnerDetails.name}</Text>
                  <Text style={styles.modalSubtitle}>Statistiques Financières & Rendez-vous</Text>

                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Revenus Nets ce mois-ci:</Text>
                    <Text style={styles.modalStatValue}>
                      {(selectedPartnerDetails.monthlyNet ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Revenus Nets cette année:</Text>
                    <Text style={styles.modalStatValue}>
                      {(selectedPartnerDetails.yearlyNet ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={[styles.modalStatCard, { borderColor: '#9C27B0' }]}>
                    <Text style={styles.modalStatLabel}>Commission ce mois-ci:</Text>
                    <Text style={[styles.modalStatValue, { color: '#9C27B0' }]}>
                      {(selectedPartnerDetails.monthlyCommission ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={[styles.modalStatCard, { borderColor: '#9C27B0' }]}>
                    <Text style={styles.modalStatLabel}>Commission cette année:</Text>
                    <Text style={[styles.modalStatValue, { color: '#9C27B0' }]}>
                      {(selectedPartnerDetails.yearlyCommission ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Rendez-vous Confirmés:</Text>
                    <Text style={styles.modalStatValue}>{(selectedPartnerDetails.confirmedAppointments ?? 0)}</Text>
                  </View>

                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Rendez-vous Planifiés:</Text>
                    <Text style={styles.modalStatValue}>{(selectedPartnerDetails.scheduledAppointments ?? 0)}</Text>
                  </View>
                </ScrollView>
              )
            )}
          </View>
        </View>
      </Modal>

      {/* Payment Details Modal */}
      <Modal
        animationType="fade"
        transparent={true}
        visible={paymentDetailsModalVisible}
        onRequestClose={() => setPaymentDetailsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => setPaymentDetailsModalVisible(false)}
            >
              {/* --- MODIFIED: Using custom close circle outline icon --- */}
              <Image source={CLOSE_CIRCLE_OUTLINE_ICON} style={styles.customModalCloseIcon} />
              {/* --- END MODIFIED --- */}
            </TouchableOpacity>

            {selectedPaymentDetails && (
              <ScrollView contentContainerStyle={styles.modalScrollContent}>
                <Text style={styles.modalTitle}>Détails du paiement</Text>
                <Text style={styles.modalSubtitle}>{selectedPaymentDetails.partnerName}</Text>

                <View style={styles.modalStatCard}>
                  <Text style={styles.modalStatLabel}>Montant:</Text>
                  <Text style={styles.modalStatValue}>
                    {(selectedPaymentDetails.paymentAmount ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                  </Text>
                </View>

                <View style={styles.modalStatCard}>
                  <Text style={styles.modalStatLabel}>Période:</Text>
                  <Text style={styles.modalStatValue}>
                    {formatDateOnly(selectedPaymentDetails.paymentFromDate)} - {formatDateOnly(selectedPaymentDetails.paymentToDate)}
                  </Text>
                </View>

                <View style={styles.modalStatCard}>
                  <Text style={styles.modalStatLabel}>Enregistré le:</Text>
                  <Text style={styles.modalStatValue}>
                    {formatDateTime(selectedPaymentDetails.recordedAt)}
                  </Text>
                </View>

                <View style={styles.modalStatCard}>
                  <Text style={styles.modalStatLabel}>Enregistré par:</Text>
                  <Text style={styles.modalStatValue}>
                    {selectedPaymentDetails.recordedByName || 'N/A'}
                  </Text>
                </View>

                {selectedPaymentDetails.receiptURL ? (
                  <View style={styles.receiptActionsContainer}>
                    <Text style={styles.modalStatLabel}>Reçu:</Text>
                    <TouchableOpacity
                      style={[styles.receiptButton, styles.openReceiptButton]}
                      onPress={() => Linking.openURL(selectedPaymentDetails.receiptURL)}
                    >
                      {/* --- MODIFIED: Using custom open outline icon --- */}
                      <Image source={OPEN_OUTLINE_ICON} style={styles.customReceiptButtonIcon} />
                      {/* --- END MODIFIED --- */}
                      <Text style={styles.receiptButtonText}>Ouvrir le reçu</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.receiptButton, styles.downloadReceiptButton]}
                      onPress={() => downloadDocument(selectedPaymentDetails.receiptURL, `reçu_${selectedPaymentDetails.partnerName}_${selectedPaymentDetails.id}.pdf`)}
                    >
                      {/* --- MODIFIED: Using custom download outline icon --- */}
                      <Image source={DOWNLOAD_OUTLINE_ICON} style={styles.customReceiptButtonIcon} />
                      {/* --- END MODIFIED --- */}
                      <Text style={styles.receiptButtonText}>Télécharger le reçu</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.noDataText}>Aucun reçu disponible.</Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#666',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 15,
    color: '#333',
  },
  globalSummaryCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 5,
    borderColor: '#0a8fdf',
  },
  globalSummaryTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0a8fdf',
    marginBottom: 15,
    textAlign: 'center',
  },
  globalSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    flexWrap: 'wrap',
  },
  globalSummaryItem: {
    alignItems: 'center',
    marginBottom: 10,
    width: '48%',
  },
  globalSummaryLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
    textAlign: 'center',
  },
  globalSummaryValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchIcon: { // Original search icon style (now customIcon)
    marginRight: 10,
  },
  // --- NEW STYLE for custom icons in general ---
  customIcon: {
    width: 20, // Match typical Ionicons size
    height: 20, // Match typical Ionicons size
    resizeMode: 'contain',
    tintColor: '#999', // Default tint, can be overridden inline
    marginRight: 10, // Maintain spacing for search/wallet
  },
  // --- END NEW STYLE ---
  searchInput: {
    flex: 1,
    height: 45,
    fontSize: 16,
    color: '#333',
  },
  partnerCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  partnerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  partnerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  partnerCategory: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  partnerLatestTransaction: {
    fontSize: 12,
    color: '#999',
  },
  noData: {
    textAlign: 'center',
    marginTop: 20,
    fontSize: 16,
    color: '#666',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
  // --- NEW STYLE for custom modal close icon ---
  customModalCloseIcon: {
    width: 30, // Match Ionicons size
    height: 30, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#EF4444', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  modalLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: 150,
  },
  modalScrollContent: {
    paddingTop: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  modalStatCard: {
    backgroundColor: '#F0F4F8',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderColor: '#0a8fdf',
  },
  modalStatLabel: {
    fontSize: 16,
    color: '#444',
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 10,
  },
  modalStatValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0a8fdf',
    textAlign: 'right',
  },
  paymentsListContainer: {
    paddingTop: 10,
    paddingBottom: 20,
  },
  paymentItemCard: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
    borderLeftWidth: 5,
    borderColor: '#34C759',
  },
  paymentItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentItemPartnerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3748',
    marginLeft: 10,
    flex: 1,
  },
  paymentItemAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#34C759',
  },
  paymentItemPeriod: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 4,
  },
  paymentItemRecordedAt: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  receiptActionsContainer: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    alignItems: 'flex-start',
  },
  receiptButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 8,
    marginTop: 10,
    width: '100%',
  },
  openReceiptButton: {
    backgroundColor: '#0a8fdf',
  },
  downloadReceiptButton: {
    backgroundColor: '#6C757D',
  },
  receiptButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 10,
  },
  // --- NEW STYLE for custom receipt button icons ---
  customReceiptButtonIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: 'white', // Match Ionicons color
  },
  // --- END NEW STYLE ---
});

export default PaymentsScreen;
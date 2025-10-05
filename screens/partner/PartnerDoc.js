// PartnerDoc.js
import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  Linking,
  PermissionsAndroid,
  ScrollView,
  Image // Import Image
} from 'react-native';
import {
  Ionicons, // Keep if still used elsewhere
  MaterialIcons // Keep if still used elsewhere
} from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import * as Share from 'expo-sharing'; // Import expo-sharing

import { db, storage, auth } from '../../firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  serverTimestamp,
  doc,
  getDoc,
  deleteDoc
} from 'firebase/firestore';
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject
} from 'firebase/storage';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';

// --- NEW: Import your custom icons ---
const BACK_CIRCLE_ICON = require('../../assets/icons/back_circle.png');
const ADD_CIRCLE_ICON = require('../../assets/icons/add_circle.png');
const RECEIPT_ICON = require('../../assets/icons/receipt.png');
const CREDIT_CARD_ICON_DOC = require('../../assets/icons/credit_card.png'); // For payment recording FAB
const DOC_ICON_EMPTY = require('../../assets/icons/doc.png'); // For empty file icon in document card
const DOWNLOAD_ICON = require('../../assets/icons/cloud_download.png'); // Assuming this is the download icon
const DELETE_ICON_DOC = require('../../assets/icons/delete.png'); // For delete document button
const RECEIPT_OUTLINE_ICON = require('../../assets/icons/receipt.png'); // For payment receipt picker
const CALENDAR_OUTLINE_ICON = require('../../assets/icons/appointment.png'); // For date pickers
const ATTACH_ICON_DOC = require('../../assets/icons/attach.png'); // For document picker
// --- END NEW IMPORTS ---

const PartnerDoc = ({ navigation, route }) => {
  const { partnerId: currentPartnerId, partnerName: currentPartnerName, isAdmin } = route.params;

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false); // For document upload modal
  const [newDocumentTitle, setNewDocumentTitle] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [allPartners, setAllPartners] = useState([]);
  const [selectedUploadPartnerId, setSelectedUploadPartnerId] = useState(currentPartnerId);

  // States for payment modal
  const [recordPaymentModalVisible, setRecordPaymentModalVisible] = useState(false);
  const [paymentFromDate, setPaymentFromDate] = useState(new Date());
  const [paymentToDate, setPaymentToDate] = useState(new Date());
  const [showPaymentFromDatePicker, setShowPaymentFromDatePicker] = useState(false);
  const [showPaymentToDatePicker, setShowPaymentToDatePicker] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReceipt, setPaymentReceipt] = useState(null); // File object for receipt
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  
  // Ref for managing push notification sending (though handled by backend in production)
  const notifiedPaymentReceipts = useRef(new Set()); // To prevent duplicate notifications for the same receipt


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

  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const docsQuery = query(
        collection(db, 'documents'),
        where('partnerId', '==', currentPartnerId),
        orderBy('uploadedAt', 'desc')
      );
      const querySnapshot = await getDocs(docsQuery);
      const fetchedDocs = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        uploadedAt: doc.data().uploadedAt?.toDate()
      }));
      setDocuments(fetchedDocs);
    } catch (error) {
      console.error("Error fetching documents:", error);
      Alert.alert("Erreur", "Impossible de charger les documents.");
    } finally {
      setLoading(false);
    }
  }, [currentPartnerId]);

  const fetchAllPartners = useCallback(async () => {
    if (isAdmin) {
      try {
        const partnersCollectionRef = collection(db, 'partners');
        const q = query(partnersCollectionRef, orderBy('name'));
        const querySnapshot = await getDocs(q);
        const fetchedPartners = querySnapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name || 'Nom Inconnu'
        }));
        setAllPartners(fetchedPartners);
      } catch (error) {
        console.error("Error fetching all partners for admin:", error);
      }
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchDocuments();
    fetchAllPartners();
  }, [fetchDocuments, fetchAllPartners]);

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setSelectedFile(result.assets[0]);
        setNewDocumentTitle(result.assets[0].name.split('.').slice(0, -1).join('.'));
      }
    } catch (err) {
      console.error("Error picking document:", err);
      Alert.alert("Erreur", "Impossible de sélectionner le document.");
    }
  };

  const uploadDocument = async () => {
    if (!newDocumentTitle.trim() || !selectedFile) {
      Alert.alert("Champs manquants", "Veuillez saisir un titre et sélectionner un document.");
      return;
    }

    setUploading(true);
    try {
      const response = await fetch(selectedFile.uri);
      const blob = await response.blob();
      const filename = `${selectedUploadPartnerId}/${Date.now()}_${selectedFile.name}`;
      const storageRef = ref(storage, `documents/${filename}`);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);

      const newDocRef = await addDoc(collection(db, 'documents'), { // Capture doc ref for ID
        title: newDocumentTitle.trim(),
        filename: selectedFile.name,
        fileType: selectedFile.mimeType,
        fileSize: selectedFile.size,
        downloadURL: downloadURL,
        storagePath: `documents/${filename}`,
        partnerId: selectedUploadPartnerId,
        partnerName: allPartners.find(p => p.id === selectedUploadPartnerId)?.name || currentPartnerName,
        uploadedBy: auth.currentUser?.uid,
        uploadedByName: auth.currentUser?.displayName || 'Admin',
        uploadedAt: serverTimestamp(),
      });

      Alert.alert("Succès", "Document téléchargé avec succès !");
      setModalVisible(false);
      setNewDocumentTitle('');
      setSelectedFile(null);
      fetchDocuments();

      const partnerUserDocRef = doc(db, 'users', selectedUploadPartnerId);
      const partnerUserDocSnap = await getDoc(partnerUserDocRef);

      if (partnerUserDocSnap.exists()) {
        const partnerData = partnerUserDocSnap.data();
        if (partnerData.expoPushToken) {
          sendPushNotification(
            partnerData.expoPushToken,
            "Nouveau Document Disponible!",
            `Un nouveau document "${newDocumentTitle}" a été partagé avec vous.`,
            { type: 'partner_document', partnerId: selectedUploadPartnerId, documentId: newDocRef.id } // Pass new document ID
          );
        }
      }

    } catch (error) {
      console.error("Error uploading document:", error);
      Alert.alert("Erreur", "Impossible de télécharger le document: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  // --- MODIFIED downloadDocument function signature and Share.shareAsync mimeType ---
  const downloadDocument = async (url, filename, fileType) => {
    Alert.alert("Téléchargement", "Téléchargement du document en cours...", [{ text: "OK" }]);
    console.log("Attempting to download:", filename, "from:", url, "Type:", fileType);

    try {
        const temporaryLocalUri = `${FileSystem.cacheDirectory}${Date.now()}_${filename}`;

        console.log("Downloading to temporary URI:", temporaryLocalUri);
        const { uri: downloadedFileUri } = await FileSystem.downloadAsync(url, temporaryLocalUri);
        console.log("Download complete, temporary URI:", downloadedFileUri);

        if (Platform.OS === 'android') {
            // New approach for Android: Use ACTION_CREATE_DOCUMENT to let user choose save location
            try {
                // Check if ACTION_CREATE_DOCUMENT is available (Android 5.0+)
                const isIntentAvailable = await Linking.canOpenURL('content://com.android.providers.downloads.documents'); // Common check for file picker
                if (isIntentAvailable) {
                    Alert.alert(
                        "Enregistrer le document",
                        "Choisissez un emplacement pour sauvegarder le document.",
                        [
                            { text: "Annuler", style: "cancel" },
                            {
                                text: "Sauvegarder",
                                onPress: async () => {
                                    // This requires launching a native activity, so we use Linking.sendIntent
                                    try {
                                        const result = await Linking.openURL(downloadedFileUri); // This might still error
                                        // For ACTION_CREATE_DOCUMENT, you need to use a library like react-native-document-picker
                                        // or a bridge to native intents. Linking.openURL is not designed for this.
                                        //
                                        // Given Expo managed workflow, directly launching ACTION_CREATE_DOCUMENT is tricky without ejecting
                                        // or using a library that bridges it.
                                        //
                                        // The most direct way in Expo to "save" to user chosen location is often via share sheet.
                                        // Let's refine the share sheet fallback to be more specific.

                                        // Fallback to the share sheet if direct opening fails (which it often does for file://)
                                        const canShare = await Share.isAvailableAsync();
                                        if (canShare) {
                                            await Share.shareAsync(downloadedFileUri, {
                                                UTI: 'public.item',
                                                mimeType: fileType || 'application/octet-stream',
                                            });
                                            Alert.alert("Document ouvert", "Veuillez choisir une application pour ouvrir ou enregistrer le document.");
                                        } else {
                                            Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
                                        }

                                    } catch (intentError) {
                                        console.error("Android: Error launching save intent:", intentError);
                                        // If launching the intent fails, fall back to share sheet
                                        const canShare = await Share.isAvailableAsync();
                                        if (canShare) {
                                            await Share.shareAsync(downloadedFileUri, {
                                                UTI: 'public.item',
                                                mimeType: fileType || 'application/octet-stream',
                                            });
                                            Alert.alert("Document ouvert", "Veuillez choisir une application pour ouvrir ou enregistrer le document.");
                                        } else {
                                            Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
                                        }
                                    }
                                }
                            }
                        ]
                    );
                } else {
                    console.warn("Android: ACTION_CREATE_DOCUMENT intent not fully available/detected. Falling back to Share.");
                    const canShare = await Share.isAvailableAsync();
                    if (canShare) {
                        await Share.shareAsync(downloadedFileUri, {
                            UTI: 'public.item',
                            mimeType: fileType || 'application/octet-stream',
                        });
                        Alert.alert("Document ouvert", "Veuillez choisir une application pour ouvrir ou enregistrer le document.");
                    } else {
                        Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
                    }
                }
            } catch (errorCheck) {
                console.error("Error checking intent availability:", errorCheck);
                // Fallback to generic share if even the intent check fails
                const canShare = await Share.isAvailableAsync();
                if (canShare) {
                    await Share.shareAsync(downloadedFileUri, {
                        UTI: 'public.item',
                        mimeType: fileType || 'application/octet-octets',
                    });
                    Alert.alert("Document ouvert", "Veuillez choisir une application pour ouvrir ou enregistrer le document.");
                } else {
                    Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
                }
            } finally {
                await FileSystem.deleteAsync(downloadedFileUri, { idempotent: true });
                console.log("Temporary file deleted.");
            }

        } else if (Platform.OS === 'ios') {
            console.log("Platform is iOS. Using Share.shareAsync.");
            const canShare = await Share.isAvailableAsync();
            if (canShare) {
                await Share.shareAsync(downloadedFileUri);
                Alert.alert("Succès", "Document prêt à être partagé ou sauvegardé.");
            } else {
                Alert.alert("Erreur", "Le partage n'est pas disponible sur cet appareil.");
            }
            await FileSystem.deleteAsync(downloadedFileUri, { idempotent: true });
            console.log("Temporary file deleted.");

        } else {
            console.log("Platform is neither Android nor iOS (e.g., Web).");
            if (url) {
                Linking.openURL(url);
                Alert.alert("Téléchargé", `Document ouvert dans le navigateur.`);
            } else {
                Alert.alert("Erreur", "Impossible d'ouvrir le document sur cette plateforme.");
            }
        }

    } catch (error) {
      console.error("Error during downloadDocument:", error);
      Alert.alert("Erreur", "Impossible de télécharger le document: " + error.message);
    }
  };
  // --- END MODIFIED downloadDocument function ---

  const deleteDocument = async (docId, storagePath) => {
    Alert.alert(
      "Supprimer le document",
      "Êtes-vous sûr de vouloir supprimer ce document ? Cette action est irréversible.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'documents', docId));

              if (storagePath) {
                try {
                  const fileRef = ref(storage, storagePath);
                  await deleteObject(fileRef);
                  console.log("File deleted from Storage successfully!");
                } catch (storageError) {
                  console.warn("Could not delete file from Storage:", storageError);
                }
              }

              Alert.alert("Succès", "Document supprimé.");
              fetchDocuments();
            } catch (error) {
              console.error("Error deleting document:", error);
              Alert.alert("Erreur", "Impossible de supprimer le document: " + error.message);
            }
          },
          style: "destructive",
        },
      ]
    );
  };

  // --- Payment Modal Handlers ---
  const handlePaymentFromDateChange = (event, selectedDate) => {
    setShowPaymentFromDatePicker(false);
    if (selectedDate) {
      setPaymentFromDate(selectedDate);
    }
  };

  const handlePaymentToDateChange = (event, selectedDate) => {
    setShowPaymentToDatePicker(false);
    if (selectedDate) {
      setPaymentToDate(selectedDate);
    }
  };

  const pickPaymentReceipt = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'], // Allow images and PDFs
        copyToCacheDirectory: true,
      });

      if (!result.canceled) {
        setPaymentReceipt(result.assets[0]);
      }
    } catch (err) {
      console.error("Error picking payment receipt:", err);
      Alert.alert("Erreur", "Impossible de sélectionner le reçu.");
    }
  };

  const submitPayment = async () => {
    if (!selectedUploadPartnerId) {
        Alert.alert("Erreur", "Veuillez sélectionner un partenaire.");
        return;
    }
    if (!paymentAmount.trim() || isNaN(parseFloat(paymentAmount))) {
      Alert.alert("Champ manquant", "Veuillez entrer un montant valide.");
      return;
    }
    if (paymentFromDate > paymentToDate) {
      Alert.alert("Dates invalides", "La date de début ne peut pas être postérieure à la date de fin.");
      return;
    }
    if (!paymentReceipt) {
        Alert.alert("Reçu manquant", "Veuillez télécharger le reçu du paiement.");
        return;
    }

    setIsSubmittingPayment(true);
    let receiptDownloadURL = null;
    let receiptStoragePath = null;

    try {
      if (paymentReceipt) {
        const response = await fetch(paymentReceipt.uri);
        const blob = await response.blob();
        const filename = `${selectedUploadPartnerId}/receipts/${Date.now()}_${paymentReceipt.name}`;
        const storageRef = ref(storage, `payments/${filename}`);

        await uploadBytes(storageRef, blob);
        receiptDownloadURL = await getDownloadURL(storageRef);
        receiptStoragePath = `payments/${filename}`;
      }

      const newPaymentRef = await addDoc(collection(db, 'payments'), { // Capture new payment ID
        partnerId: selectedUploadPartnerId,
        partnerName: allPartners.find(p => p.id === selectedUploadPartnerId)?.name || currentPartnerName,
        paymentAmount: parseFloat(paymentAmount),
        paymentFromDate: paymentFromDate,
        paymentToDate: paymentToDate,
        receiptURL: receiptDownloadURL,
        receiptStoragePath: receiptStoragePath,
        recordedBy: auth.currentUser?.uid,
        recordedByName: auth.currentUser?.displayName || 'Admin',
        recordedAt: serverTimestamp(),
      });

      Alert.alert("Succès", `Paiement de ${paymentAmount}$ enregistré pour ${allPartners.find(p => p.id === selectedUploadPartnerId)?.name || currentPartnerName}.`);
      setRecordPaymentModalVisible(false);
      setPaymentAmount('');
      setPaymentReceipt(null);
      setPaymentFromDate(new Date());
      setPaymentToDate(new Date());

      // Send push notification to the partner about the payment
      const partnerUserDocRef = doc(db, 'users', selectedUploadPartnerId);
      const partnerUserDocSnap = await getDoc(partnerUserDocRef);
      if (partnerUserDocSnap.exists()) {
        const partnerData = partnerUserDocSnap.data();
        if (partnerData.expoPushToken) {
          sendPushNotification(
            partnerData.expoPushToken,
            "Paiement Reçu!",
            `Un paiement de ${parseFloat(paymentAmount).toFixed(2)}$ a été enregistré pour la période du ${formatDate(paymentFromDate)} au ${formatDate(paymentToDate)}.`,
            { type: 'partner_payment_recorded', partnerId: selectedUploadPartnerId, paymentId: newPaymentRef.id } // Pass new payment ID
          );
        }
      }

    } catch (error) {
      console.error("Error submitting payment:", error);
      Alert.alert("Erreur", "Impossible d'enregistrer le paiement: " + error.message);
    } finally {
      setIsSubmittingPayment(false);
    }
  };
  // --- End Payment Modal Handlers ---


  const renderDocumentItem = ({ item }) => (
    <View style={styles.documentCard}>
      <View style={styles.documentHeader}>
        {/* --- MODIFIED: Use custom image for empty file icon --- */}
        <Image source={DOC_ICON_EMPTY} style={[styles.customDocumentIcon, { tintColor: '#4a6bff' }]} />
        {/* --- END MODIFIED --- */}
        <Text style={styles.documentTitle}>{item.title}</Text>
        <TouchableOpacity onPress={() => deleteDocument(item.id, item.storagePath)} style={styles.deleteDocumentButton}>
          {/* --- MODIFIED: Use custom image for delete icon --- */}
          <Image source={DELETE_ICON_DOC} style={styles.customDeleteDocumentIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>
      </View>
      <Text style={styles.documentFilename}>{item.filename}</Text>
      <Text style={styles.documentMeta}>
        Type: {item.fileType || 'N/A'} | Taille: {(item.fileSize / 1024).toFixed(2)} KB
      </Text>
      <Text style={styles.documentMeta}>
        Téléchargé le: {formatDate(item.uploadedAt) || 'N/A'}
      </Text>
      <Text style={styles.documentMeta}>
        Pour partenaire: {item.partnerName || 'N/A'}
      </Text>
      <TouchableOpacity
        style={styles.downloadButton}
        onPress={() => downloadDocument(item.downloadURL, item.filename, item.fileType)} // <--- MODIFIED HERE: Pass item.fileType
      >
        {/* --- MODIFIED: Use custom image for download icon --- */}
        <Image source={DOWNLOAD_ICON} style={styles.customDownloadButtonIcon} />
        {/* --- END MODIFIED --- */}
        <Text style={styles.downloadButtonText}>Télécharger</Text>
      </TouchableOpacity>
    </View>
  );

  // Determine if the current user is a partner viewing their own documents, or an admin
  // The 'isAdmin' prop is passed through route.params
  const isCurrentUserPartnerViewingSelf = auth.currentUser?.uid === currentPartnerId;
  const canRecordPayment = isCurrentUserPartnerViewingSelf || isAdmin;


  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          {/* --- MODIFIED: Use custom image for back arrow --- */}
          <Image source={BACK_CIRCLE_ICON} style={styles.customHeaderIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Documents</Text>
        <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => navigation.navigate('PartnerPayments')} style={styles.paymentsButton}>
                {/* --- MODIFIED: Use custom image for Payments icon --- */}
                <Image source={RECEIPT_ICON} style={[styles.customHeaderIcon, { tintColor: '#28a745' }]} />
                {/* --- END MODIFIED --- */}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addDocumentButton}>
                {/* --- MODIFIED: Use custom image for Add icon --- */}
                <Image source={ADD_CIRCLE_ICON} style={[styles.customHeaderIcon, { tintColor: '#4a6bff' }]} />
                {/* --- END MODIFIED --- */}
            </TouchableOpacity>
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4a6bff" />
          <Text style={styles.loadingText}>Chargement des documents...</Text>
        </View>
      ) : documents.length === 0 ? (
        <View style={styles.emptyContainer}>
          {/* --- MODIFIED: Use custom image for empty document icon --- */}
          <Image source={DOC_ICON_EMPTY} style={styles.customEmptyDocumentIcon} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.emptyText}>Aucun document disponible.</Text>
          <Text style={styles.emptySubText}>Cliquez sur le bouton '+' pour en ajouter un.</Text>
        </View>
      ) : (
        <FlatList
          data={documents}
          keyExtractor={item => item.id}
          renderItem={renderDocumentItem}
          contentContainerStyle={styles.listContentContainer}
        />
      )}

      {/* --- Floating Action Button for Payments (positioned at bottom right) --- */}
      <TouchableOpacity 
          style={styles.fabButton} 
          onPress={() => setRecordPaymentModalVisible(true)}
      >
          {/* --- MODIFIED: Use custom image for Credit Card icon --- */}
          <Image source={CREDIT_CARD_ICON_DOC} style={styles.customFabIcon} />
          {/* --- END MODIFIED --- */}
      </TouchableOpacity>
      {/* --- END Floating Action Button --- */}


      {/* Add Document Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          setModalVisible(false);
          setNewDocumentTitle('');
          setSelectedFile(null);
          setSelectedUploadPartnerId(currentPartnerId);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter un nouveau document</Text>

            {isAdmin && (
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={selectedUploadPartnerId}
                  onValueChange={(itemValue) => setSelectedUploadPartnerId(itemValue)}
                  style={styles.picker}
                >
                  {allPartners.map(partner => (
                    <Picker.Item key={partner.id} label={partner.name} value={partner.id} />
                  ))}
                </Picker>
              </View>
            )}

            <TextInput
              style={styles.textInput}
              placeholder="Titre du document (ex: Contrat 2024)"
              value={newDocumentTitle}
              onChangeText={setNewDocumentTitle}
            />

            <TouchableOpacity style={styles.pickFileButton} onPress={pickDocument}>
              {/* --- MODIFIED: Use custom image for Attach icon in modal --- */}
              <Image source={ATTACH_ICON_DOC} style={styles.customPickFileIcon} />
              {/* --- END MODIFIED --- */}
              <Text style={styles.pickFileButtonText}>
                {selectedFile ? selectedFile.name : "Sélectionner un document"}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelModalButton]}
                onPress={() => {
                  setModalVisible(false);
                  setNewDocumentTitle('');
                  setSelectedFile(null);
                  setSelectedUploadPartnerId(currentPartnerId);
                }}
              >
                <Text style={styles.cancelModalButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.uploadModalButton]}
                onPress={uploadDocument}
                disabled={uploading || !newDocumentTitle.trim() || !selectedFile}
              >
                {uploading ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.uploadModalButtonText}>Télécharger</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Record Payment Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={recordPaymentModalVisible}
        onRequestClose={() => {
          setRecordPaymentModalVisible(false);
          setPaymentAmount('');
          setPaymentReceipt(null);
          setPaymentFromDate(new Date());
          setPaymentToDate(new Date());
        }}
      >
        <View style={styles.modalOverlay}>
          <ScrollView contentContainerStyle={styles.paymentModalScrollContent}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Enregistrer un paiement</Text>

              {isAdmin && (
                <View style={styles.pickerContainer}>
                  <Picker
                    selectedValue={selectedUploadPartnerId}
                    onValueChange={(itemValue) => setSelectedUploadPartnerId(itemValue)}
                    style={styles.picker}
                  >
                    {allPartners.map(partner => (
                      <Picker.Item key={partner.id} label={partner.name} value={partner.id} />
                    ))}
                  </Picker>
                </View>
              )}

              <Text style={styles.modalLabel}>Période de paiement:</Text>
              <View style={styles.datePickerContainer}>
                <TouchableOpacity onPress={() => setShowPaymentFromDatePicker(true)} style={styles.datePickerButton}>
                  {/* --- MODIFIED: Use custom image for calendar icon --- */}
                  <Image source={CALENDAR_OUTLINE_ICON} style={styles.customDatePickerIcon} />
                  {/* --- END MODIFIED --- */}
                  <Text style={styles.datePickerText}>{formatDate(paymentFromDate)}</Text>
                </TouchableOpacity>
                <Text style={styles.dateSeparator}>au</Text>
                <TouchableOpacity onPress={() => setShowPaymentToDatePicker(true)} style={styles.datePickerButton}>
                  {/* --- MODIFIED: Use custom image for calendar icon --- */}
                  <Image source={CALENDAR_OUTLINE_ICON} style={styles.customDatePickerIcon} />
                  {/* --- END MODIFIED --- */}
                  <Text style={styles.datePickerText}>{formatDate(paymentToDate)}</Text>
                </TouchableOpacity>
              </View>

              {showPaymentFromDatePicker && (
                <DateTimePicker
                  value={paymentFromDate}
                  mode="date"
                  display="default"
                  onChange={handlePaymentFromDateChange}
                />
              )}
              {showPaymentToDatePicker && (
                <DateTimePicker
                  value={paymentToDate}
                  mode="date"
                  display="default"
                  onChange={handlePaymentToDateChange}
                  minimumDate={paymentFromDate} // End date cannot be before start date
                />
              )}

              <TextInput
                style={styles.textInput}
                placeholder="Montant total (ex: 1500.00)"
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />

              <TouchableOpacity style={styles.pickFileButton} onPress={pickPaymentReceipt}>
                {/* --- MODIFIED: Use custom image for receipt icon --- */}
                <Image source={RECEIPT_OUTLINE_ICON} style={styles.customPickFileIcon} />
                {/* --- END MODIFIED --- */}
                <Text style={styles.pickFileButtonText}>
                  {paymentReceipt ? paymentReceipt.name : "Télécharger le reçu (Obligatoire)"}
                </Text>
              </TouchableOpacity>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelModalButton]}
                  onPress={() => {
                    setRecordPaymentModalVisible(false);
                    setPaymentAmount('');
                    setPaymentReceipt(null);
                    setPaymentFromDate(new Date());
                    setPaymentToDate(new Date());
                  }}
                >
                  <Text style={styles.cancelModalButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.uploadModalButton]}
                  onPress={submitPayment}
                  disabled={isSubmittingPayment || !paymentAmount.trim() || isNaN(parseFloat(paymentAmount))}
                >
                  {isSubmittingPayment ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <Text style={styles.uploadModalButtonText}>Enregistrer Paiement</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
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
    top: 10
  },
  backButton: {
    padding: 8,
  },
  // --- NEW STYLE for custom header icons (back arrow, add document) ---
  customHeaderIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#2D3748', // Default color for back arrow
  },
  // --- END NEW STYLE ---
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2D3748',
  },
  headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  addDocumentButton: {
    padding: 8,
    marginLeft: 10,
  },
  paymentsButton: {
    padding: 8,
    marginRight: 5,
  },
  // Removed addPaymentButton styles from here as it's now a FAB
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyText: {
    fontSize: 18,
    color: '#6B7280',
    marginTop: 10,
    textAlign: 'center',
  },
  emptySubText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 5,
    textAlign: 'center',
  },
  // --- NEW STYLE for custom empty document icon ---
  customEmptyDocumentIcon: {
    width: 50, // Match Ionicons size
    height: 50, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#ccc', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  listContentContainer: {
    padding: 15,
    paddingBottom: 20,
  },
  documentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    borderLeftWidth: 5,
    borderColor: '#4a6bff',
  },
  documentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  // --- NEW STYLE for custom document icon in card ---
  customDocumentIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline
  },
  // --- NEW STYLE for custom delete document icon ---
  customDeleteDocumentIcon: {
    width: 24, // Match MaterialIcons size
    height: 24, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: '#EF4444', // Match MaterialIcons color
  },
  // --- END NEW STYLE ---
  documentTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3748',
    marginLeft: 10,
    flex: 1,
  },
  deleteDocumentButton: {
    padding: 5,
  },
  documentFilename: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 5,
  },
  documentMeta: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C755', // Changed to match your custom icon tint
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
  // --- NEW STYLE for custom download button icon ---
  customDownloadButtonIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: 'white', // Match Ionicons color
    marginRight: 5,
  },
  // --- END NEW STYLE ---
  downloadButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 5,
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
    width: '100%',
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#2D3748',
    marginBottom: 20,
    textAlign: 'center',
  },
  pickerContainer: {
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden',
    backgroundColor: '#F9FAFB',
  },
  picker: {
    height: 50,
    width: '100%',
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
  pickFileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E6EFFF',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4a6bff',
    marginBottom: 20,
  },
  // --- NEW STYLE for custom pick file icon (attach/receipt) ---
  customPickFileIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#4a6bff', // Match Ionicons color
    marginRight: 10,
  },
  // --- END NEW STYLE ---
  pickFileButtonText: {
    color: '#4a6bff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
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
  uploadModalButton: {
    backgroundColor: '#4a6bff',
  },
  uploadModalButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  // Payment Modal Specific Styles
  paymentModalScrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  modalLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 10,
    marginTop: 5,
  },
  datePickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 10,
    padding: 12,
    flex: 1,
  },
  // --- NEW STYLE for custom date picker icon ---
  customDatePickerIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#2D3748', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  datePickerText: {
    marginLeft: 10,
    fontSize: 16,
    color: '#333',
  },
  dateSeparator: {
    marginHorizontal: 10,
    fontSize: 16,
    color: '#6B7280',
  },
  // --- NEW FAB STYLES ---
  fabButton: {
    position: 'absolute',
    bottom: 30, // Adjust as needed
    right: 20,  // Adjust as needed
    backgroundColor: '#34C759', // Green color for payment/add
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    zIndex: 10, // Ensure it floats above other content
  },
  // --- NEW STYLE for custom FAB icon ---
  customFabIcon: {
    width: 28, // Match MaterialIcons size
    height: 28, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: '#FFFFFF', // Match MaterialIcons color
  },
  // --- END NEW STYLE ---
});

export default PartnerDoc;
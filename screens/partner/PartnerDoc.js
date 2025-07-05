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
  ScrollView
} from 'react-native';
import {
  Ionicons,
  MaterialIcons
} from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';

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

  const downloadDocument = async (url, filename) => {
    Alert.alert("Téléchargement", "Téléchargement du document en cours...", [{ text: "OK" }]);
    console.log("Attempting to download:", filename, "from:", url);

    try {
        const temporaryLocalUri = `${FileSystem.cacheDirectory}${Date.now()}_${filename}`;

        console.log("Downloading to temporary URI:", temporaryLocalUri);
        const { uri: downloadedFileUri } = await FileSystem.downloadAsync(url, temporaryLocalUri);
        console.log("Download complete, temporary URI:", downloadedFileUri);

        if (Platform.OS === 'android') {
            console.log("Platform is Android. Requesting permissions...");
            const permissionStatus = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
                {
                    title: "Permission de stockage",
                    message: "L'application a besoin d'accéder à votre stockage pour télécharger des fichiers.",
                    buttonNeutral: "Demander plus tard",
                    buttonNegative: "Annuler",
                    buttonPositive: "OK"
                }
            );

            if (permissionStatus === PermissionsAndroid.RESULTS.GRANTED) {
                console.log("Storage permission granted.");
                try {
                    const albumName = 'EliteReply'; 

                    const { status: mediaLibStatus } = await MediaLibrary.requestPermissionsAsync();
                    if (mediaLibStatus !== 'granted') {
                        Alert.alert("Permission requise", "Pour sauvegarder dans un dossier spécifique, veuillez accorder l'accès à la médiathèque.");
                        console.log("MediaLibrary permission denied. Trying to open directly.");
                        await Linking.openURL(downloadedFileUri);
                        return;
                    }
                    console.log("MediaLibrary permission granted.");

                    const asset = await MediaLibrary.createAssetAsync(downloadedFileUri);
                    console.log("Asset created:", asset.uri);

                    let album = await MediaLibrary.getAlbumAsync(albumName);
                    console.log("Album (EliteReply) status:", album ? 'exists' : 'does not exist');

                    if (album) {
                        await MediaLibrary.addAssetsToAlbumAsync([asset], album, false);
                        console.log("Added asset to existing album.");
                    } else {
                        album = await MediaLibrary.createAlbumAsync(albumName, asset, false);
                        console.log("Created new album and added asset.");
                    }

                    if (album) {
                        Alert.alert(
                            "Succès",
                            `Document téléchargé dans votre dossier "Téléchargements/${albumName}".`
                        );
                        await FileSystem.deleteAsync(downloadedFileUri, { idempotent: true });
                        console.log("Temporary file deleted.");
                    } else {
                        Alert.alert("Erreur", "Impossible de créer ou ajouter au dossier EliteReply. Le document peut être dans les téléchargements généraux.");
                        await Linking.openURL(downloadedFileUri);
                    }

                } catch (saveError) {
                    console.error("Android: Error saving to EliteReply folder:", saveError);
                    Alert.alert(
                        "Erreur de sauvegarde",
                        "Impossible de sauvegarder le document dans le dossier 'EliteReply'. Il a peut-être été enregistré temporairement dans le cache de l'application."
                    );
                    await Linking.openURL(downloadedFileUri);
                }
            } else {
                Alert.alert(
                    "Permission refusée",
                    "Impossible de sauvegarder le document dans le dossier de téléchargements sans permission de stockage. Le fichier sera ouvert directement si possible."
                );
                await Linking.openURL(downloadedFileUri);
            }

        } else if (Platform.OS === 'ios') {
            console.log("Platform is iOS.");
            
            const destinationFileUri = `${FileSystem.documentDirectory}${filename}`;
            console.log("Copying to iOS document directory:", destinationFileUri);
            await FileSystem.copyAsync({
                from: downloadedFileUri,
                to: destinationFileUri,
            });
            console.log("Copied to iOS document directory.");

            const { status: mediaLibStatus } = await MediaLibrary.requestPermissionsAsync();
            if (mediaLibStatus === 'granted') {
            }

            Alert.alert(
                "Succès",
                "Document téléchargé. Vous pouvez l'ouvrir ou le sauvegarder dans Fichiers."
            );
            console.log("Opening file on iOS via Linking.openURL:", destinationFileUri);
            await Linking.openURL(destinationFileUri);
            await FileSystem.deleteAsync(downloadedFileUri, { idempotent: true });
            console.log("Temporary file deleted.");

        } else {
            console.log("Platform is neither Android nor iOS.");
            Alert.alert("Téléchargé", `Document sauvegardé temporairement. Vous pouvez le trouver ici: ${downloadedFileUri}`);
            await Linking.openURL(downloadedFileUri);
        }

    } catch (error) {
      console.error("Error during downloadDocument:", error);
      Alert.alert("Erreur", "Impossible de télécharger le document: " + error.message);
    }
  };

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
        <Ionicons name="document-text-outline" size={24} color="#4a6bff" />
        <Text style={styles.documentTitle}>{item.title}</Text>
        <TouchableOpacity onPress={() => deleteDocument(item.id, item.storagePath)} style={styles.deleteDocumentButton}>
          <MaterialIcons name="delete" size={24} color="#EF4444" />
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
        onPress={() => downloadDocument(item.downloadURL, item.filename)}
      >
        <Ionicons name="download-outline" size={20} color="white" />
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
          <Ionicons name="arrow-back" size={24} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Documents</Text>
        <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => setModalVisible(true)} style={styles.addDocumentButton}>
                <Ionicons name="add-circle-outline" size={30} color="#4a6bff" />
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
          <Ionicons name="document-outline" size={50} color="#ccc" />
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
              <MaterialIcons name="payment" size={28} color="#FFFFFF" />
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
              <Ionicons name="attach" size={20} color="#4a6bff" />
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
                  <Ionicons name="calendar-outline" size={20} color="#2D3748" />
                  <Text style={styles.datePickerText}>{formatDate(paymentFromDate)}</Text>
                </TouchableOpacity>
                <Text style={styles.dateSeparator}>au</Text>
                <TouchableOpacity onPress={() => setShowPaymentToDatePicker(true)} style={styles.datePickerButton}>
                  <Ionicons name="calendar-outline" size={20} color="#2D3748" />
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
                <Ionicons name="receipt-outline" size={20} color="#4a6bff" />
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
    backgroundColor: '#34C759',
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 10,
  },
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
    borderRadius: 8,
    padding: 12,
    flex: 1,
  },
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
});

export default PartnerDoc;
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  ActivityIndicator, // Import ActivityIndicator for loading state
  Alert, // Import Alert for user feedback
  Image, // Import Image for custom icons
  KeyboardAvoidingView, // For modal input on iOS
  Platform // For KeyboardAvoidingView platform specific behavior
} from 'react-native';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons'; // Keep if used elsewhere, but replace specific ones

// --- NEW: Firebase Imports ---
import { db, auth } from '../../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  serverTimestamp,
  doc, // For getting partner info
  getDoc, // For getting partner info
  // orderBy // REMOVED: No longer needed for client-side sorting
} from 'firebase/firestore';
// --- END NEW: Firebase Imports ---

// --- NEW: Import your custom icons ---
const PLUS_ICON = require('../../assets/icons/add_circle.png');
const MONEY_BILL_EMPTY_ICON = require('../../assets/icons/money_bill.png');
const ADD_ICON = require('../../assets/icons/add_circle.png'); // For modal Add button
const CLOSE_ICON = require('../../assets/icons/close_circle.png'); // For modal Cancel button
// --- END NEW IMPORTS ---

const Revenus = ({ navigation }) => {
  const [revenues, setRevenues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [newRevenue, setNewRevenue] = useState({
    clientName: '', // Changed from 'client' to 'clientName' to match Firestore data structure
    amount: '',
    reason: '', // This might map to 'description' or be a new field
    date: new Date().toISOString().split('T')[0] // Default to today's date
  });
  const [currentPartnerId, setCurrentPartnerId] = useState(null);
  const [loggedInPartnerName, setLoggedInPartnerName] = useState(''); // To store partner's name for new payments

  // --- NEW: Fetch Partner ID and Name on component mount ---
  useEffect(() => {
    const fetchPartnerInfo = async () => {
      const currentUser = auth.currentUser;
      if (!currentUser) {
        Alert.alert("Non autorisé", "Vous devez être connecté pour voir vos revenus.");
        setLoading(false);
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists() && userDocSnap.data().partnerId) {
          const partnerIdFromUser = userDocSnap.data().partnerId;
          setCurrentPartnerId(partnerIdFromUser);

          const partnerDocRef = doc(db, 'partners', partnerIdFromUser);
          const partnerDocSnap = await getDoc(partnerDocRef);
          if (partnerDocSnap.exists()) {
            setLoggedInPartnerName(partnerDocSnap.data().name || 'Partenaire Inconnu'); // Assuming 'name' field for partner
          } else {
            setLoggedInPartnerName('Partenaire (Non trouvé)');
            console.warn("WARN: Partner document not found for ID:", partnerIdFromUser);
          }
        } else {
          Alert.alert("Erreur", "Votre compte n'est pas lié à un partenaire. Accès refusé.");
          setLoading(false);
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        }
      } catch (error) {
        console.error("Error fetching partner info:", error);
        Alert.alert("Erreur", "Impossible de charger les informations du partenaire.");
        setLoading(false);
      }
    };
    fetchPartnerInfo();
  }, [navigation]); // Added navigation to dependency array

  // --- MODIFIED: Fetch revenues from Firestore and sort client-side ---
  const fetchRevenues = useCallback(async () => {
    if (!currentPartnerId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Query without orderBy, only filtering by partnerId
      const q = query(
        collection(db, 'payments'),
        where('partnerId', '==', currentPartnerId)
      );
      const querySnapshot = await getDocs(q);
      let fetchedRevenues = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        // Ensure date/timestamp fields are converted to Date objects
        // Use toISOString().split('T')[0] for date string if needed for display
        date: doc.data().transactionDate?.toDate().toISOString().split('T')[0] || 'Date inconnue',
        // Assuming 'amountReceived' is the main amount and 'clientName' is available
        amount: doc.data().amountReceived || 0,
        clientName: doc.data().clientName || 'Client Inconnu',
        reason: doc.data().description || 'Paiement de service' // Assuming a 'description' field or default
      }));

      // ⭐ NEW: Client-side sorting by transactionDate (descending) ⭐
      fetchedRevenues.sort((a, b) => {
        const dateA = a.transactionDate ? a.transactionDate.toDate().getTime() : 0;
        const dateB = b.transactionDate ? b.transactionDate.toDate().getTime() : 0;
        return dateB - dateA; // Descending order
      });

      setRevenues(fetchedRevenues);
    } catch (error) {
      console.error("Error fetching revenues:", error);
      Alert.alert("Erreur", "Impossible de charger les revenus.");
      setRevenues([]); // Clear revenues on error
    } finally {
      setLoading(false);
    }
  }, [currentPartnerId]); // Re-fetch when currentPartnerId changes

  useEffect(() => {
    if (currentPartnerId) {
      fetchRevenues();
    }
  }, [currentPartnerId, fetchRevenues]); // Depend on currentPartnerId and fetchRevenues

  // --- MODIFIED: Handle adding revenue to Firestore ---
  const handleAddRevenue = async () => {
    if (!newRevenue.clientName.trim() || !newRevenue.amount.trim() || !newRevenue.reason.trim()) {
      Alert.alert("Champs manquants", "Veuillez remplir tous les champs.");
      return;
    }
    const amountValue = parseFloat(newRevenue.amount);
    if (isNaN(amountValue) || amountValue <= 0) {
      Alert.alert("Montant invalide", "Veuillez entrer un montant valide et positif.");
      return;
    }

    if (!currentPartnerId) {
        Alert.alert("Erreur", "ID partenaire non défini. Impossible d'ajouter le revenu.");
        return;
    }

    setLoading(true); // Show loading while adding
    try {
      await addDoc(collection(db, 'payments'), { // Add to 'payments' collection
        partnerId: currentPartnerId,
        partnerName: loggedInPartnerName,
        clientName: newRevenue.clientName.trim(),
        amountReceived: amountValue,
        description: newRevenue.reason.trim(), // Map 'reason' to 'description'
        transactionDate: serverTimestamp(), // Use server timestamp for consistency
        status: 'manual_entry', // Mark as manually entered payment
        recordedBy: auth.currentUser?.uid,
        recordedByName: auth.currentUser?.displayName || 'Admin',
      });

      Alert.alert("Succès", "Revenu ajouté avec succès !");
      setModalVisible(false);
      setNewRevenue({
        clientName: '',
        amount: '',
        reason: '',
        date: new Date().toISOString().split('T')[0]
      });
      fetchRevenues(); // Re-fetch data to update the list
    } catch (error) {
      console.error("Error adding revenue:", error);
      Alert.alert("Erreur", "Impossible d'ajouter le revenu: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.client}>{item.clientName}</Text>
        <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
      </View>
      <Text style={styles.reason}>{item.reason}</Text>
      <Text style={styles.date}>{item.date}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement des revenus...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        {/* --- MODIFIED: Use custom image for Plus icon --- */}
        <Image source={PLUS_ICON} style={styles.customAddButtonIcon} />
        {/* --- END MODIFIED --- */}
        <Text style={styles.addButtonText}>Ajouter Revenu</Text>
      </TouchableOpacity>

      {revenues.length === 0 ? (
        <View style={styles.emptyContainer}>
          {/* --- MODIFIED: Use custom image for empty money bill icon --- */}
          <Image source={MONEY_BILL_EMPTY_ICON} style={styles.customEmptyIcon} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.emptyText}>Aucun revenu enregistré</Text>
        </View>
      ) : (
        <FlatList
          data={revenues}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView // Wrap modal content for keyboard avoidance
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay} // Use a full-screen overlay for modal
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter un Revenu</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Nom du client"
              value={newRevenue.clientName}
              onChangeText={text => setNewRevenue({...newRevenue, clientName: text})}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Montant ($)"
              keyboardType="numeric"
              value={newRevenue.amount}
              onChangeText={text => setNewRevenue({...newRevenue, amount: text})}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Raison"
              value={newRevenue.reason}
              onChangeText={text => setNewRevenue({...newRevenue, reason: text})}
            />
            
            {/* Date input can be simplified or replaced with a DatePicker component if needed */}
            <TextInput
              style={styles.input}
              placeholder="Date (YYYY-MM-DD)"
              value={newRevenue.date}
              onChangeText={text => setNewRevenue({...newRevenue, date: text})}
              editable={false} // Make it read-only if you want to use a DatePicker
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                {/* --- MODIFIED: Use custom image for Cancel icon --- */}
                <Image source={CLOSE_ICON} style={styles.customModalButtonIcon} />
                {/* --- END MODIFIED --- */}
                <Text style={[styles.modalButtonText, { color: '#4A5568' }]}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleAddRevenue}
              >
                {/* --- MODIFIED: Use custom image for Add icon --- */}
                <Image source={ADD_ICON} style={styles.customModalButtonIcon} />
                {/* --- END MODIFIED --- */}
                <Text style={[styles.modalButtonText, { color: 'white' }]}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    paddingTop: 15, // Added padding top for overall screen
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#4a6bff',
    padding: 15,
    borderRadius: 8,
    marginHorizontal: 15, // Changed to horizontal for better spacing
    marginBottom: 15, // Add margin bottom
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  // --- NEW STYLE for custom add button icon ---
  customAddButtonIcon: {
    width: 20, // Match FontAwesome size
    height: 20, // Match FontAwesome size
    resizeMode: 'contain',
    tintColor: 'white', // Match original icon color
    marginRight: 10,
  },
  // --- END NEW STYLE ---
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  // --- NEW STYLE for custom empty icon ---
  customEmptyIcon: {
    width: 60, // Match MaterialIcons size
    height: 60, // Match MaterialIcons size
    resizeMode: 'contain',
    tintColor: '#ccc', // Match original icon color
  },
  // --- END NEW STYLE ---
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
  },
  list: {
    paddingHorizontal: 15, // Added horizontal padding
    paddingBottom: 20, // Added bottom padding for scroll
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  client: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  reason: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  modalOverlay: { // Style for the full-screen transparent overlay
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    width: '90%', // Make it responsive
    maxWidth: 400, // Max width for larger screens
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
    flexDirection: 'row', // Align icon and text
    justifyContent: 'center',
  },
  // --- NEW STYLE for custom modal button icons ---
  customModalButtonIcon: {
    width: 20, // Adjust size as needed
    height: 20, // Adjust size as needed
    resizeMode: 'contain',
    marginRight: 8, // Space between icon and text
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  submitButton: {
    backgroundColor: '#4a6bff',
  },
  modalButtonText: {
    fontWeight: '600',
    fontSize: 16, // Ensure font size is consistent
  },
});

export default Revenus;
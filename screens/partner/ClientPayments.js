import React, { useEffect, useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  Modal, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator,
  TextInput // Import TextInput for search
} from 'react-native';
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { firebaseApp } from '../../firebase'; // Adjust path if needed
import { Feather } from '@expo/vector-icons'; // We'll use Feather icons

// Helper to get initials from a name
const getInitials = (name) => {
  if (!name) return '??';
  const names = name.split(' ');
  let initials = names[0].substring(0, 1).toUpperCase();
  if (names.length > 1) {
    initials += names[names.length - 1].substring(0, 1).toUpperCase();
  }
  return initials;
};

// Helper to format date
const formatDate = (date) => {
  if (!date) return 'Date inconnue';
  let d;
  if (typeof date === 'object' && date.seconds) {
    // Firestore Timestamp
    d = new Date(date.seconds * 1000);
  } else if (date instanceof Date) {
    d = date;
  } else {
    d = new Date(date);
  }
  
  if (isNaN(d.getTime())) return 'Date invalide';
  
  // Format to Date only for the list, full string for modal
  return d.toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
};

// Full date/time for modal
const formatFullDate = (date) => {
    if (!date) return 'N/A';
    let d;
    if (typeof date === 'object' && date.seconds) {
        d = new Date(date.seconds * 1000);
    } else if (date instanceof Date) {
        d = date;
    } else {
        d = new Date(date);
    }
    if (isNaN(d.getTime())) return 'Date invalide';
    return d.toLocaleString('fr-FR');
};

const ClientPayments = ({ partnerId }) => {
  const [payments, setPayments] = useState([]); // Master list from Firestore
  const [filteredPayments, setFilteredPayments] = useState([]); // List to be displayed
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [searchQuery, setSearchQuery] = useState(''); // State for search text

  // For deletion feedback
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [confirmDeleteVisible, setConfirmDeleteVisible] = useState(false);
  // Delete payment function (called after confirmation)
  const handleDeletePayment = async () => {
    if (!selectedPayment) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const db = getFirestore(firebaseApp);
      await import('firebase/firestore').then(({ deleteDoc, doc }) =>
        deleteDoc(doc(db, 'payments', selectedPayment.id))
      );
      // Remove from local state
      setPayments(prev => prev.filter(p => p.id !== selectedPayment.id));
      setFilteredPayments(prev => prev.filter(p => p.id !== selectedPayment.id));
      setModalVisible(false);
      setSelectedPayment(null);
      setConfirmDeleteVisible(false);
    } catch (err) {
      setDeleteError('Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  };

  useEffect(() => {
    const fetchPayments = async () => {
      setLoading(true); 
      try {
        const db = getFirestore(firebaseApp);
        const paymentsRef = collection(db, 'payments');
        let querySnapshot;
        if (partnerId) {
          const q = query(paymentsRef, where('partnerId', '==', partnerId));
          querySnapshot = await getDocs(q);
        } else {
          querySnapshot = await getDocs(paymentsRef);
        }
        
        const dataPromises = querySnapshot.docs.map(async (docSnap, index) => {
          const payment = { ...docSnap.data(), id: docSnap.id, index: index };
          let clientName = 'Client Inconnu';
          if (payment.userId) {
            try {
              const userRef = doc(db, 'users', payment.userId);
              const userSnap = await getDoc(userRef);
              if (userSnap.exists()) {
                const userData = userSnap.data();
                clientName = userData.name || userData.displayName || userData.fullName || 'Client Inconnu';
              }
            } catch (e) {
              console.warn("Error fetching user data:", e);
            }
          }
          return { ...payment, clientName };
        });

        let data = await Promise.all(dataPromises);
          // Sort by date/createdAt descending (newest first)
          data.sort((a, b) => {
            const dateA = a.date?.seconds ? a.date.seconds : (a.createdAt?.seconds ? a.createdAt.seconds : 0);
            const dateB = b.date?.seconds ? b.date.seconds : (b.createdAt?.seconds ? b.createdAt.seconds : 0);
            return dateB - dateA;
          });
        setPayments(data); // Set the master list
        setFilteredPayments(data); // Set the initial displayed list
      } catch (error) {
        console.error('Error fetching payments:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchPayments();
  }, [partnerId]);

  // useEffect for filtering based on searchQuery
  useEffect(() => {
    if (!searchQuery) {
      setFilteredPayments(payments); // No search, show all payments
      return;
    }

    const lowerCaseQuery = searchQuery.toLowerCase();

    const filteredData = payments.filter(payment => {
      // Check client name
      if (payment.clientName?.toLowerCase().includes(lowerCaseQuery)) {
        return true;
      }
      // Check description
      if (payment.description?.toLowerCase().includes(lowerCaseQuery)) {
        return true;
      }
      // Check formatted date
      const formattedDate = formatDate(payment.date || payment.createdAt);
      if (formattedDate.toLowerCase().includes(lowerCaseQuery)) {
        return true;
      }
      
      return false; // No match
    });

    setFilteredPayments(filteredData);
  }, [searchQuery, payments]); // Re-run filter when query or master list changes

  const handleOpenModal = (payment) => {
    setSelectedPayment(payment);
    setModalVisible(true);
  };

  const handleCloseModal = () => {
    setModalVisible(false);
    setSelectedPayment(null);
  };

  const getCurrencySign = (currency) => {
    if (!currency || currency === 'EUR' || currency === '€') return '€';
    if (currency === 'USD' || currency === '$') return '$';
    return currency;
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card} onPress={() => handleOpenModal(item)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{getInitials(item.clientName)}</Text>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardClientName}>{item.clientName}</Text>
        <Text style={styles.cardDate}>
          {formatDate(item.date || item.createdAt)}
        </Text>
      </View>
      <View style={styles.cardAmountContainer}>
        <Text style={styles.cardAmount}>
          {item.amount ? `${item.amount}${getCurrencySign(item.currency)}` : 'N/A'}
        </Text>
      </View>
    </TouchableOpacity>
  );

  const renderContent = () => {
    if (loading) {
      return (
        <View style={styles.centeredContent}>
          <ActivityIndicator size="large" color="#1976d2" />
          <Text style={styles.loadingText}>Chargement des paiements...</Text>
        </View>
      );
    }
    // Case 1: No payments found for this partner at all
    if (payments.length === 0) {
      return (
        <View style={styles.centeredContent}>
          <Feather name="inbox" size={48} color="#b0bec5" />
          <Text style={styles.emptyText}>Aucun paiement trouvé.</Text>
        </View>
      );
    }
    // Case 2: Payments exist, but search filter found no results
    if (filteredPayments.length === 0) {
      return (
        <View style={styles.centeredContent}>
          <Feather name="search" size={48} color="#b0bec5" />
          <Text style={styles.emptyText}>Aucun résultat pour votre recherche.</Text>
        </View>
      );
    }
    // Case 3: Show filtered list
    return (
      <FlatList
        data={filteredPayments} // Use the filtered list here
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled" // Dismiss keyboard on tap
      />
    );
  };

  return (
    <View style={styles.container}>
      {/* Header with total payment count */}
      <Text style={styles.title}>
        Historique des Paiements
        <Text style={styles.countText}>  ({payments.length})</Text>
      </Text>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Feather name="search" size={20} color="#78909c" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom, date, description..."
          placeholderTextColor="#78909c"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {renderContent()}

      {/* Modal - This is already scrollable due to <ScrollView> */}
      <Modal
        visible={modalVisible}
        animationType="slide" 
        transparent={true}
        onRequestClose={handleCloseModal}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* This ScrollView makes the modal content scrollable if it exceeds maxHeight */}
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Détails du paiement</Text>
                <TouchableOpacity onPress={handleCloseModal}>
                   <Feather name="x-circle" size={26} color="#78909c" />
                </TouchableOpacity>
              </View>

              {selectedPayment && (
                <View style={styles.detailsContainer}>
                  <View style={styles.detailRow}>
                    <View style={styles.modalLabelContainer}>
                       <Feather name="user" size={16} color="#1976d2" style={styles.icon} />
                       <Text style={styles.modalLabel}>Client</Text>
                    </View>
                    <Text style={styles.modalValue}>{selectedPayment.clientName || 'Inconnu'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <View style={styles.modalLabelContainer}>
                       <Feather name="dollar-sign" size={16} color="#1976d2" style={styles.icon} />
                       <Text style={styles.modalLabel}>Montant</Text>
                    </View>
                    <Text style={styles.modalValue}>{selectedPayment.amount ? `${selectedPayment.amount} ${getCurrencySign(selectedPayment.currency)}` : 'N/A'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                     <View style={styles.modalLabelContainer}>
                       <Feather name="calendar" size={16} color="#1976d2" style={styles.icon} />
                       <Text style={styles.modalLabel}>Date</Text>
                    </View>
                    <Text style={styles.modalValue}>{formatFullDate(selectedPayment.date || selectedPayment.createdAt)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                     <View style={styles.modalLabelContainer}>
                       <Feather name="file-text" size={16} color="#1976d2" style={styles.icon} />
                       <Text style={styles.modalLabel}>Description</Text>
                    </View>
                    <Text style={styles.modalValue} selectable>{selectedPayment.description || 'N/A'}</Text>
                  </View>
                  <View style={[styles.detailRow, { borderBottomWidth: 0 }]}>
                     <View style={styles.modalLabelContainer}>
                       <Feather name="map-pin" size={16} color="#1976d2" style={styles.icon} />
                       <Text style={styles.modalLabel}>Adresse</Text>
                    </View>
                    <Text style={styles.modalValue} selectable>{selectedPayment.address || 'N/A'}</Text>
                  </View>
                  {/* Delete button and error message */}
                  <View style={{ marginTop: 10 }}>
                    {deleteError && (
                      <Text style={{ color: 'red', marginBottom: 8 }}>{deleteError}</Text>
                    )}
                    <TouchableOpacity
                      style={[styles.deleteButton, deleting && { opacity: 0.6 }]}
                      onPress={() => setConfirmDeleteVisible(true)}
                      disabled={deleting}
                    >
                      {deleting ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.deleteButtonText}>Supprimer ce paiement</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              <TouchableOpacity style={styles.closeButton} onPress={handleCloseModal}>
                <Text style={styles.closeButtonText}>Fermer</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Confirmation Modal for Deletion */}
      <Modal
        visible={confirmDeleteVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setConfirmDeleteVisible(false)}
      >
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Confirmer la suppression</Text>
            <Text style={styles.confirmText}>Voulez-vous vraiment supprimer ce paiement ? Cette action est irréversible.</Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                style={styles.confirmCancel}
                onPress={() => setConfirmDeleteVisible(false)}
                disabled={deleting}
              >
                <Text style={styles.confirmCancelText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmDelete}
                onPress={handleDeletePayment}
                disabled={deleting}
              >
                {deleting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.confirmDeleteText}>Supprimer</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// All styles included in one block as requested
const styles = StyleSheet.create({
  confirmOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 35, 126, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 28,
    width: '80%',
    shadowColor: '#1976d2',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7,
    alignItems: 'center',
  },
  confirmTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmText: {
    fontSize: 16,
    color: '#333',
    marginBottom: 22,
    textAlign: 'center',
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  confirmCancel: {
    backgroundColor: '#e3eafc',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginRight: 10,
  },
  confirmCancelText: {
    color: '#1976d2',
    fontSize: 16,
    fontWeight: 'bold',
  },
  confirmDelete: {
    backgroundColor: '#d32f2f',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
  },
  confirmDeleteText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f2f6fc', // Brand background
  },
  title: {
    fontSize: 26, 
    fontWeight: 'bold',
    color: '#1a237e', // Brand primary
    marginBottom: 20,
    textAlign: 'center',
  },
  countText: {
    fontSize: 18,
    color: '#1976d2',
    fontWeight: '600',
  },
  deleteButton: {
    marginTop: 8,
    backgroundColor: '#d32f2f',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#d32f2f',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  // --- Search Bar Styles ---
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingHorizontal: 16,
    marginBottom: 16,
    borderColor: '#e3eafc',
    borderWidth: 1,
    shadowColor: '#1976d2',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 14,
    fontSize: 16,
    color: '#1a237e',
  },
  // --- Content Styles ---
  centeredContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    marginTop: -50, // Adjust to center in remaining space
  },
  loadingText: {
    fontSize: 17,
    color: '#1976d2',
    fontWeight: '500',
    marginTop: 15,
  },
  emptyText: {
    fontSize: 18,
    color: '#78909c', // Softer color
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 15,
  },
  listContent: {
    paddingBottom: 24,
  },
  
  // --- Card Styles ---
  card: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    shadowColor: '#1976d2',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    borderWidth: 1,
    borderColor: '#e3eafc',
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e3eafc', // Light brand color
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  avatarText: {
    color: '#1976d2', // Brand color
    fontSize: 18,
    fontWeight: 'bold',
  },
  cardBody: {
    flex: 1, // Takes up remaining space
    justifyContent: 'center',
  },
  cardClientName: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#1a237e',
    marginBottom: 2,
  },
  cardDate: {
    fontSize: 14,
    color: '#78909c', // Muted color for secondary info
  },
  cardAmountContainer: {
    paddingLeft: 10,
  },
  cardAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1976d2', // Brand color
  },

  // --- Modal Styles ---
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(26, 35, 126, 0.25)', // Slightly darker overlay
    justifyContent: 'flex-end', // Slide up from bottom
    alignItems: 'center',
  },
  modalContent: {
    width: '100%',
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    shadowColor: '#1976d2',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 7,
    maxHeight: '85%', // This ensures the modal doesn't cover the whole screen
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 22,
    borderBottomWidth: 1,
    borderBottomColor: '#e3eafc',
    paddingBottom: 16,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#1a237e',
  },
  detailsContainer: {
    marginBottom: 18,
  },
  detailRow: {
    flexDirection: 'column', // Stack label and value for clarity
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f4f8',
  },
  modalLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  icon: {
    marginRight: 8,
  },
  modalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1976d2',
  },
  modalValue: {
    fontSize: 16,
    color: '#333',
    paddingLeft: 24, // Indent value under the icon/label
  },
  closeButton: {
    marginTop: 10,
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#1976d2',
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 3,
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});

export default ClientPayments;

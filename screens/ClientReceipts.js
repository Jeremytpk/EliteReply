import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import OrderTracking from '../components/OrderTracking';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  doc,
  deleteDoc,
  limit 
} from 'firebase/firestore';

const ClientReceipts = ({ navigation }) => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    const user = auth.currentUser;
    if (!user) {
      navigation.goBack();
      return;
    }

    // Listen to user's payments with receipts
    // Using only userId filter to avoid composite index requirement
    const paymentsQuery = query(
      collection(db, 'payments'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(100) // Get more results since we'll filter in memory
    );

    const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
      const userReceipts = [];
      snapshot.forEach((doc) => {
        const payment = { id: doc.id, ...doc.data() };
        // Filter in memory to avoid composite index
        if (payment.status === 'succeeded' && (payment.receiptSent || payment.receiptData)) {
          userReceipts.push(payment);
        }
      });
      
      // Sort by createdAt descending and limit to 50
      userReceipts.sort((a, b) => {
        const dateA = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
        const dateB = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
        return dateB - dateA;
      });
      
      setReceipts(userReceipts.slice(0, 50));
      setLoading(false);
    });

    return () => unsubscribe();
  }, [navigation]);

  const formatDate = (timestamp) => {
    if (!timestamp) return 'Date inconnue';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatCurrency = (amount, currency = 'usd') => {
    const value = amount / 100;
    const symbol = currency === 'eur' ? '€' : '$';
    return `${symbol}${value.toFixed(2)}`;
  };

  const handleDeleteReceipt = (receipt) => {
    Alert.alert(
      'Supprimer le reçu',
      'Êtes-vous sûr de vouloir supprimer ce reçu ? Cette action est irréversible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeleting(receipt.id);
            try {
              await deleteDoc(doc(db, 'payments', receipt.id));
              Alert.alert('Succès', 'Reçu supprimé avec succès');
            } catch (error) {
              console.error('Error deleting receipt:', error);
              Alert.alert('Erreur', 'Impossible de supprimer le reçu');
            } finally {
              setDeleting(null);
            }
          }
        }
      ]
    );
  };

  const openReceiptModal = (receipt) => {
    setSelectedReceipt(receipt);
    setShowReceiptModal(true);
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'succeeded': return '#28a745';
      case 'pending': return '#ffc107';
      case 'failed': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'succeeded': return 'checkmark-circle';
      case 'pending': return 'time';
      case 'failed': return 'close-circle';
      default: return 'help-circle';
    }
  };

  const renderReceiptItem = ({ item }) => (
    <TouchableOpacity
      style={styles.receiptCard}
      onPress={() => openReceiptModal(item)}
    >
      <View style={styles.receiptHeader}>
        <View style={styles.receiptInfo}>
          <Text style={styles.receiptNumber}>
            Reçu #{item.receiptData?.receiptNumber || item.paymentIntentId.slice(-8).toUpperCase()}
          </Text>
          <Text style={styles.receiptDate}>
            {formatDate(item.succeededAt || item.createdAt)}
          </Text>
        </View>
        <View style={styles.receiptAmount}>
          <Text style={styles.amount}>
            {formatCurrency(item.amount, item.currency)}
          </Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) + '20' }]}>
            <Ionicons
              name={getStatusIcon(item.status)}
              size={14}
              color={getStatusColor(item.status)}
            />
            <Text style={[styles.statusText, { color: getStatusColor(item.status) }]}>
              {item.status?.toUpperCase()}
            </Text>
          </View>
        </View>
      </View>
      
      <View style={styles.receiptBody}>
        <Text style={styles.description}>
          {item.description || 'Paiement EliteReply'}
        </Text>
        {item.receiptSent && (
          <View style={styles.receiptSentBadge}>
            <Ionicons name="mail" size={12} color="#28a745" />
            <Text style={styles.receiptSentText}>Reçu envoyé par email</Text>
          </View>
        )}
      </View>

      <View style={styles.receiptActions}>
        <TouchableOpacity
          style={styles.viewButton}
          onPress={() => openReceiptModal(item)}
        >
          <Ionicons name="eye" size={16} color="#667eea" />
          <Text style={styles.viewButtonText}>Voir</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteReceipt(item)}
          disabled={deleting === item.id}
        >
          {deleting === item.id ? (
            <ActivityIndicator size="small" color="#dc3545" />
          ) : (
            <>
              <Ionicons name="trash" size={16} color="#dc3545" />
              <Text style={styles.deleteButtonText}>Supprimer</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderReceiptModal = () => {
    if (!selectedReceipt) return null;

    const { payment, user, partner, receipt } = {
      payment: selectedReceipt,
      user: { name: 'Client valorisé', email: selectedReceipt.customerEmail || auth.currentUser?.email },
      partner: selectedReceipt.partnerData || {},
      receipt: selectedReceipt.receiptData || {}
    };

    return (
      <Modal
        visible={showReceiptModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowReceiptModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setShowReceiptModal(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Détails du Reçu</Text>
            <View style={styles.placeholder} />
          </View>

          <ScrollView style={styles.receiptContainer}>
            {/* Receipt Header */}
            <View style={styles.receiptModalHeader}>
              <View style={styles.receiptHeaderContent}>
                <View style={styles.logoContainer}>
                  <Image 
                    source={require('../assets/images/logoOnly.png')} 
                    style={styles.receiptLogoImage}
                    resizeMode="contain"
                    onError={(error) => console.log('Logo error:', error)}
                  />
                </View>
                <Text style={styles.receiptTitle}>EliteReply</Text>
                <Text style={styles.receiptSubtitle}>Reçu de Paiement</Text>
                <View style={styles.receiptDivider} />
              </View>
            </View>

            {/* Receipt Details */}
            <View style={styles.receiptSection}>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Reçu #:</Text>
                <Text style={styles.receiptValue}>
                  {receipt?.receiptNumber || payment.paymentIntentId.slice(-8).toUpperCase()}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Date:</Text>
                <Text style={styles.receiptValue}>
                  {formatDate(payment.succeededAt || payment.createdAt)}
                </Text>
              </View>
              <View style={styles.receiptRow}>
                <Text style={styles.receiptLabel}>Statut:</Text>
                <View style={styles.statusBadge}>
                  <Ionicons
                    name={getStatusIcon(payment.status)}
                    size={16}
                    color={getStatusColor(payment.status)}
                  />
                  <Text style={[styles.statusBadgeText, { color: getStatusColor(payment.status) }]}>
                    {payment.status === 'succeeded' ? 'RÉUSSI' : 
                     payment.status === 'pending' ? 'EN ATTENTE' : 
                     payment.status === 'failed' ? 'ÉCHOUÉ' : 'INCONNU'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Order Summary */}
            <View style={styles.receiptSection}>
              <Text style={styles.receiptSectionTitle}>RÉSUMÉ DE LA COMMANDE</Text>
              <View style={styles.orderSummary}>
                <View style={styles.orderItem}>
                  <View style={styles.orderItemDetails}>
                    <Text style={styles.orderItemName}>
                      {payment.description || 'Service EliteReply'}
                    </Text>
                    <Text style={styles.orderItemDescription}>
                      Service de paiement EliteReply
                    </Text>
                  </View>
                  <Text style={styles.orderItemPrice}>
                    {formatCurrency(payment.amount, payment.currency)}
                  </Text>
                </View>
                
                <View style={styles.orderDivider} />
                
                <View style={styles.orderTotal}>
                  <Text style={styles.orderTotalLabel}>TOTAL PAYÉ</Text>
                  <Text style={styles.orderTotalAmount}>
                    {formatCurrency(payment.amount, payment.currency)}
                  </Text>
                </View>
              </View>
            </View>

            {/* Payment Method */}
            <View style={styles.receiptSection}>
              <Text style={styles.receiptSectionTitle}>MÉTHODE DE PAIEMENT</Text>
              <View style={styles.paymentMethod}>
                <View style={styles.paymentMethodRow}>
                  <Ionicons name="card" size={24} color="#667eea" />
                  <View style={styles.paymentMethodDetails}>
                    <Text style={styles.paymentMethodType}>
                      Carte de crédit
                    </Text>
                    <Text style={styles.paymentMethodInfo}>
                      **** **** **** {payment.paymentMethod?.card?.last4 || '****'}
                    </Text>
                    <Text style={styles.transactionId}>
                      Transaction: {payment.paymentIntentId}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Order Tracking Section */}
            <View style={styles.receiptSection}>
              <Text style={styles.receiptSectionTitle}>SUIVI DE COMMANDE</Text>
              <OrderTracking 
                paymentId={selectedReceipt.id}
                initialStatus={selectedReceipt.trackingStatus || 'pending'}
                isPartner={false}
              />
            </View>

            {/* Receipt Footer */}
            <View style={styles.receiptFooter}>
              <Text style={styles.receiptFooterText}>
                Merci pour votre confiance !
              </Text>
              <Text style={styles.receiptFooterSubtext}>
                EliteReply - Service de qualité
              </Text>
            </View>
          </ScrollView>
        </View>
      </Modal>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Chargement des reçus...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#667eea" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Reçus</Text>
        <View style={styles.placeholder} />
      </View>

      {receipts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="receipt-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>Aucun reçu disponible</Text>
          <Text style={styles.emptySubtext}>
            Vos reçus de paiement apparaîtront ici après vos achats
          </Text>
        </View>
      ) : (
        <FlatList
          data={receipts}
          renderItem={renderReceiptItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {renderReceiptModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  placeholder: {
    width: 34,
  },
  listContainer: {
    padding: 15,
  },
  receiptCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 15,
    padding: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  receiptInfo: {
    flex: 1,
  },
  receiptNumber: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  receiptDate: {
    fontSize: 14,
    color: '#666',
  },
  receiptAmount: {
    alignItems: 'flex-end',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  receiptBody: {
    marginBottom: 15,
  },
  description: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  receiptSentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#28a745' + '20',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  receiptSentText: {
    fontSize: 12,
    color: '#28a745',
    marginLeft: 4,
    fontWeight: '500',
  },
  receiptActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 15,
  },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#667eea' + '20',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 0.45,
    justifyContent: 'center',
  },
  viewButtonText: {
    color: '#667eea',
    marginLeft: 5,
    fontWeight: '600',
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc3545' + '20',
    paddingHorizontal: 15,
    paddingVertical: 8,
    borderRadius: 8,
    flex: 0.45,
    justifyContent: 'center',
  },
  deleteButtonText: {
    color: '#dc3545',
    marginLeft: 5,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 20,
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
    textAlign: 'center',
  },

  // Modal Styles
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#667eea',
  },
  closeButton: {
    padding: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },

  // Receipt Modal Styles
  receiptContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  receiptModalHeader: {
    backgroundColor: '#667eea',
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  receiptHeaderContent: {
    alignItems: 'center',
  },
  receiptLogo: {
    width: 60,
    height: 60,
    marginBottom: 15,
  },
  receiptLogoWhite: {
    width: 60,
    height: 60,
    marginBottom: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 8,
    padding: 8,
  },
  logoContainer: {
    width: 70,
    height: 70,
    marginBottom: 15,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  receiptLogoImage: {
    width: 50,
    height: 50,
  },
  receiptTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#fff',
    letterSpacing: 1,
  },
  receiptSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginTop: 5,
  },
  receiptDivider: {
    width: 60,
    height: 3,
    backgroundColor: '#fff',
    marginTop: 15,
    borderRadius: 2,
  },
  receiptSection: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginTop: 15,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  receiptSectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 0.5,
    marginBottom: 15,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  receiptLabel: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  receiptValue: {
    fontSize: 16,
    color: '#333',
    fontWeight: '600',
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
  },

  // Order Summary Styles
  orderSummary: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 15,
  },
  orderItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  orderItemDetails: {
    flex: 1,
    marginRight: 15,
  },
  orderItemName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  orderItemDescription: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  orderItemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  orderDivider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 15,
  },
  orderTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 15,
    borderRadius: 6,
  },
  orderTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 0.5,
  },
  orderTotalAmount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#28a745',
  },

  // Payment Method Styles
  paymentMethod: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentMethodDetails: {
    flex: 1,
    marginLeft: 12,
  },
  paymentMethodType: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  paymentMethodInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
    fontFamily: 'monospace',
  },
  transactionId: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },

  // Receipt Footer
  receiptFooter: {
    alignItems: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  receiptFooterText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  receiptFooterSubtext: {
    fontSize: 13,
    color: '#666',
    textAlign: 'center',
    marginBottom: 4,
  },
});

export default ClientReceipts;

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Modal,
  ScrollView,
  Image,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  doc, 
  getDoc, 
  getDocs,
  updateDoc 
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import OrderTracking from '../components/OrderTracking';

const PartnerPayments = ({ navigation }) => {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [trackingModalVisible, setTrackingModalVisible] = useState(false);
  const [currentPartner, setCurrentPartner] = useState(null);

  useEffect(() => {
    fetchCurrentPartner();
  }, []);

  useEffect(() => {
    if (currentPartner) {
      const unsubscribe = fetchPartnerPayments();
      return () => unsubscribe && unsubscribe();
    }
  }, [currentPartner]);

  const fetchCurrentPartner = async () => {
    try {
      const user = auth.currentUser;
      if (!user) return;

      // Get partner info from users collection
      const userDoc = await getDoc(doc(db, 'users', user.uid));
      if (userDoc.exists() && userDoc.data().role === 'Partner') {
        setCurrentPartner({ id: user.uid, ...userDoc.data() });
      } else {
        // Try to find partner in partners collection
        const partnersQuery = query(collection(db, 'partners'), where('uid', '==', user.uid));
        const partnersSnapshot = await getDocs(partnersQuery);
        
        if (!partnersSnapshot.empty) {
          const partnerData = partnersSnapshot.docs[0];
          setCurrentPartner({ id: partnerData.id, ...partnerData.data() });
        }
      }
    } catch (error) {
      console.error('Error fetching partner:', error);
    }
  };

  const fetchPartnerPayments = () => {
    try {
      const paymentsQuery = query(
        collection(db, 'payments'),
        where('partnerId', '==', currentPartner.id),
        orderBy('createdAt', 'desc')
      );

      const unsubscriber = onSnapshot(paymentsQuery, (snapshot) => {
        const paymentsData = [];
        snapshot.forEach((doc) => {
          paymentsData.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          });
        });
        setPayments(paymentsData);
        setLoading(false);
        setRefreshing(false);
      });

      return unsubscriber;
    } catch (error) {
      console.error('Error fetching partner payments:', error);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPaymentDetails = async (payment) => {
    try {
      setSelectedPayment(payment);
      setPaymentDetails(null);
      setModalVisible(true);

      // Fetch user details
      let userDetails = null;
      if (payment.userId) {
        try {
          const userDoc = await getDoc(doc(db, 'users', payment.userId));
          if (userDoc.exists()) {
            userDetails = { id: userDoc.id, ...userDoc.data() };
          }
        } catch (userError) {
          console.log('User not found:', payment.userId);
        }
      }

      // Fetch receipt details
      let receiptDetails = null;
      try {
        const receiptsQuery = query(collection(db, 'receipts'));
        const receiptsSnapshot = await getDocs(receiptsQuery);
        receiptsSnapshot.forEach((doc) => {
          const receiptData = doc.data();
          if (receiptData.paymentIntentId === payment.paymentIntentId) {
            receiptDetails = { id: doc.id, ...receiptData };
          }
        });
      } catch (receiptError) {
        console.log('Receipt not found for payment:', payment.paymentIntentId);
      }

      setPaymentDetails({
        payment,
        user: userDetails,
        partner: currentPartner,
        receipt: receiptDetails
      });

    } catch (error) {
      console.error('Error fetching payment details:', error);
      Alert.alert('Error', 'Failed to load payment details');
    }
  };

  const openTrackingModal = (payment) => {
    setSelectedPayment(payment);
    setTrackingModalVisible(true);
  };

  const handleStatusUpdate = (newStatus) => {
    if (selectedPayment) {
      setSelectedPayment({
        ...selectedPayment,
        trackingStatus: newStatus
      });
      
      // Update the payment in the list
      setPayments(prev => prev.map(p => 
        p.id === selectedPayment.id 
          ? { ...p, trackingStatus: newStatus }
          : p
      ));
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    const value = amount / 100;
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(value);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
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

  const getTrackingStatusInfo = (trackingStatus) => {
    const statuses = {
      'pending': { label: 'En Attente', color: '#FFC107', icon: 'time' },
      'processing': { label: 'En Traitement', color: '#2196F3', icon: 'cog' },
      'shipped': { label: 'Expédiée', color: '#FF9800', icon: 'car' },
      'delivered': { label: 'Livrée', color: '#4CAF50', icon: 'checkmark-circle' }
    };
    return statuses[trackingStatus] || statuses['pending'];
  };

  const renderPaymentItem = ({ item }) => {
    const trackingInfo = getTrackingStatusInfo(item.trackingStatus);
    
    return (
      <TouchableOpacity
        style={styles.paymentCard}
        onPress={() => fetchPaymentDetails(item)}
      >
        <View style={styles.paymentHeader}>
          <View style={styles.statusContainer}>
            <Ionicons
              name={getStatusIcon(item.status)}
              size={20}
              color={getStatusColor(item.status)}
            />
            <Text style={[styles.status, { color: getStatusColor(item.status) }]}>
              {item.status === 'succeeded' ? 'RÉUSSI' : 
               item.status === 'pending' ? 'EN ATTENTE' : 
               item.status === 'failed' ? 'ÉCHOUÉ' : 'INCONNU'}
            </Text>
          </View>
          <Text style={styles.amount}>
            {formatCurrency(item.amount, item.currency)}
          </Text>
        </View>

        <View style={styles.paymentInfo}>
          <Text style={styles.paymentId} numberOfLines={1}>
            ID: {item.paymentIntentId}
          </Text>
          <Text style={styles.description} numberOfLines={2}>
            {item.description || 'Paiement EliteReply'}
          </Text>
        </View>

        <View style={styles.trackingInfo}>
          <View style={styles.trackingStatus}>
            <Ionicons name={trackingInfo.icon} size={16} color={trackingInfo.color} />
            <Text style={[styles.trackingStatusText, { color: trackingInfo.color }]}>
              {trackingInfo.label}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.trackingButton}
            onPress={() => openTrackingModal(item)}
          >
            <Ionicons name="location-outline" size={16} color="#667eea" />
            <Text style={styles.trackingButtonText}>Suivi</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.paymentFooter}>
          <Text style={styles.date}>
            {formatDate(item.createdAt)}
          </Text>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderPaymentDetails = () => {
    if (!paymentDetails) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#667eea" />
          <Text style={styles.loadingText}>Chargement des détails du paiement...</Text>
        </View>
      );
    }

    const { payment, user, partner, receipt } = paymentDetails;

    return (
      <ScrollView style={styles.receiptContainer}>
        {/* Receipt Header */}
        <View style={styles.receiptHeader}>
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
            <Text style={styles.receiptSubtitle}>Reçu de Paiement - Partenaire</Text>
            <View style={styles.receiptDivider} />
          </View>
        </View>

        {/* Receipt Details */}
        <View style={styles.receiptSection}>
          <View style={styles.receiptRow}>
            <Text style={styles.receiptLabel}>Reçu #:</Text>
            <Text style={styles.receiptValue}>
              {receipt?.receiptData?.receiptNumber || payment.paymentIntentId.slice(-8).toUpperCase()}
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

        {/* Customer Information */}
        <View style={styles.receiptSection}>
          <Text style={styles.receiptSectionTitle}>INFORMATIONS CLIENT</Text>
          <View style={styles.customerInfo}>
            <View style={styles.customerRow}>
              <Ionicons name="person-outline" size={18} color="#666" />
              <View style={styles.customerDetails}>
                <Text style={styles.customerName}>
                  {user?.name || user?.displayName || user?.firstName || 'Client Valorisé'}
                </Text>
                <Text style={styles.customerEmail}>
                  {user?.email || payment.customerEmail || 'N/A'}
                </Text>
                <Text style={styles.customerId}>ID: {payment.userId || 'N/A'}</Text>
              </View>
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

        {/* Tracking Section */}
        <View style={styles.receiptSection}>
          <Text style={styles.receiptSectionTitle}>SUIVI DE COMMANDE</Text>
          <OrderTracking 
            paymentId={payment.id}
            initialStatus={payment.trackingStatus || 'pending'}
            isPartner={true}
            onStatusUpdate={handleStatusUpdate}
          />
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Chargement des paiements...</Text>
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
        <Text style={styles.headerTitle}>Mes Paiements</Text>
        <View style={styles.placeholder} />
      </View>

      {payments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="card-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>Aucun paiement trouvé</Text>
          <Text style={styles.emptySubtext}>
            Les paiements liés à votre service apparaîtront ici
          </Text>
        </View>
      ) : (
        <FlatList
          data={payments}
          renderItem={renderPaymentItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchPartnerPayments();
              }}
              colors={['#667eea']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Payment Details Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Détails du Paiement</Text>
            <TouchableOpacity
              style={styles.trackingHeaderButton}
              onPress={() => {
                setModalVisible(false);
                openTrackingModal(selectedPayment);
              }}
            >
              <Ionicons name="location" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          {renderPaymentDetails()}
        </View>
      </Modal>

      {/* Order Tracking Modal */}
      <Modal
        visible={trackingModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setTrackingModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={() => setTrackingModalVisible(false)}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Suivi de Commande</Text>
            <View style={styles.placeholder} />
          </View>
          {selectedPayment && (
            <OrderTracking 
              paymentId={selectedPayment.id}
              initialStatus={selectedPayment.trackingStatus || 'pending'}
              isPartner={true}
              onStatusUpdate={handleStatusUpdate}
            />
          )}
        </View>
      </Modal>
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
  paymentCard: {
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
  paymentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  status: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#28a745',
  },
  paymentInfo: {
    marginBottom: 10,
  },
  paymentId: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace',
    marginBottom: 5,
  },
  description: {
    fontSize: 14,
    color: '#333',
  },
  trackingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  trackingStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackingStatusText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 5,
  },
  trackingButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#667eea' + '20',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  trackingButtonText: {
    fontSize: 12,
    color: '#667eea',
    fontWeight: '600',
    marginLeft: 3,
  },
  paymentFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  date: {
    fontSize: 12,
    color: '#666',
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
  trackingHeaderButton: {
    padding: 5,
  },

  // Receipt Styles (same as OnlinePaid.js)
  receiptContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  receiptHeader: {
    backgroundColor: '#667eea',
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  receiptHeaderContent: {
    alignItems: 'center',
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
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  customerInfo: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  customerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  customerDetails: {
    marginLeft: 12,
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  customerEmail: {
    fontSize: 14,
    color: '#667eea',
    marginBottom: 2,
  },
  customerId: {
    fontSize: 12,
    color: '#999',
    fontFamily: 'monospace',
  },
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
});

export default PartnerPayments;

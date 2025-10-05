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
  Linking,
  Image
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, orderBy, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import OrderTracking from '../components/OrderTracking';

const OnlinePaid = ({ navigation }) => {
  const [payments, setPayments] = useState([]);
  const [clientPayments, setClientPayments] = useState([]);
  const [otherPayments, setOtherPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [paymentDetails, setPaymentDetails] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [activeTab, setActiveTab] = useState('client'); // 'client' or 'other'

  useEffect(() => {
    const unsubscribe = fetchPayments();
    return () => unsubscribe && unsubscribe();
  }, []);

  const fetchPayments = () => {
    try {
      const paymentsQuery = query(
        collection(db, 'payments'),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
        const paymentsData = [];
        snapshot.forEach((doc) => {
          paymentsData.push({
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
            succeededAt: doc.data().succeededAt?.toDate() || null
          });
        });

        // Separate client payments from other payments
        const clientPays = paymentsData.filter(payment => 
          payment.userId && payment.userId !== 'system' && payment.userId !== 'admin'
        );
        
        const otherPays = paymentsData.filter(payment => 
          !payment.userId || payment.userId === 'system' || payment.userId === 'admin'
        );

        setPayments(paymentsData);
        setClientPayments(clientPays);
        setOtherPayments(otherPays);
        setLoading(false);
        setRefreshing(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error fetching payments:', error);
      Alert.alert('Error', 'Failed to load payments');
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchPaymentDetails = async (payment) => {
    try {
      setSelectedPayment(payment);
      setPaymentDetails(null);
      setModalVisible(true);

      // Fetch user details with enhanced debugging
      let userDetails = null;
      const possibleUserIds = [
        payment.userId,
        payment.customerId,
        payment.user_id,
        payment.customer_id,
        payment.uid,
        payment.metadata?.userId,
        payment.customer
      ].filter(Boolean);

      console.log('=== USER FETCHING DEBUG ===');
      console.log('Payment object keys:', Object.keys(payment));
      console.log('Possible user IDs to try:', possibleUserIds);

      for (const userId of possibleUserIds) {
        if (userId && typeof userId === 'string') {
          try {
            console.log('Attempting to fetch user with ID:', userId);
            const userDoc = await getDoc(doc(db, 'users', userId));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              userDetails = { id: userDoc.id, ...userData };
              console.log('✅ User found!', { 
                id: userDoc.id,
                name: userData.name, 
                email: userData.email,
                displayName: userData.displayName,
                firstName: userData.firstName,
                fullName: userData.fullName
              });
              break; // Found user, exit loop
            } else {
              console.log('❌ User document does not exist for ID:', userId);
            }
          } catch (userError) {
            console.error('❌ Error fetching user with ID:', userId, userError);
          }
        } else {
          console.log('❌ Invalid user ID (not string):', userId, typeof userId);
        }
      }

      if (!userDetails) {
        console.log('🔍 No user details found. Full payment object:');
        console.log(JSON.stringify(payment, null, 2));
      }

      // Fetch partner details
      let partnerDetails = null;
      if (payment.partnerId) {
        try {
          const partnerDoc = await getDoc(doc(db, 'partners', payment.partnerId));
          if (partnerDoc.exists()) {
            partnerDetails = { id: partnerDoc.id, ...partnerDoc.data() };
          }
        } catch (partnerError) {
          console.log('Partner not found:', payment.partnerId);
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
        partner: partnerDetails,
        receipt: receiptDetails
      });

    } catch (error) {
      console.error('Error fetching payment details:', error);
      Alert.alert('Error', 'Failed to load payment details');
    }
  };

  const formatCurrency = (amount, currency = 'USD') => {
    const value = amount / 100; // Convert from cents
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase()
    }).format(value);
  };

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'succeeded':
        return '#28a745';
      case 'failed':
        return '#dc3545';
      case 'requires_action':
        return '#ffc107';
      case 'processing':
        return '#17a2b8';
      default:
        return '#6c757d';
    }
  };

  const getStatusIcon = (status) => {
    switch (status?.toLowerCase()) {
      case 'succeeded':
        return 'checkmark-circle';
      case 'failed':
        return 'close-circle';
      case 'requires_action':
        return 'warning';
      case 'processing':
        return 'time';
      default:
        return 'help-circle';
    }
  };

  const openStripePayment = (paymentIntentId) => {
    const stripeUrl = `https://dashboard.stripe.com/payments/${paymentIntentId}`;
    Linking.openURL(stripeUrl).catch(() => {
      Alert.alert('Error', 'Could not open Stripe dashboard');
    });
  };

  const renderPaymentItem = ({ item }) => (
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
            {item.status?.toUpperCase() || 'UNKNOWN'}
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
          {item.description || 'EliteReply Payment'}
        </Text>
      </View>

      <View style={styles.paymentFooter}>
        <Text style={styles.date}>
          {formatDate(item.createdAt)}
        </Text>
        <Ionicons name="chevron-forward" size={20} color="#666" />
      </View>
    </TouchableOpacity>
  );

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
            <Text style={styles.receiptSubtitle}>Reçu de Paiement</Text>
            <View style={styles.receiptDivider} />
          </View>
        </View>

        {/* Receipt Number & Status */}
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
                  {(() => {
                    const customerName = user?.name || 
                                       user?.displayName || 
                                       user?.firstName || 
                                       user?.fullName ||
                                       payment.customerName || 
                                       payment.metadata?.customerName ||
                                       payment.customer_name ||
                                       payment.billing_details?.name ||
                                       'Valued Customer';
                    console.log('=== CUSTOMER DEBUG ===');
                    console.log('Payment data:', {
                      userId: payment.userId,
                      customerId: payment.customerId,
                      customerName: payment.customerName,
                      customer_name: payment.customer_name
                    });
                    console.log('User data:', user);
                    console.log('Final customer name:', customerName);
                    return customerName;
                  })()}
                </Text>
                <Text style={styles.customerEmail}>
                  {user?.email || 
                   user?.emailAddress || 
                   payment.customerEmail || 
                   payment.metadata?.customerEmail ||
                   payment.receipt_email ||
                   'N/A'}
                </Text>
                <Text style={styles.customerId}>
                  ID: {payment.userId || payment.customerId || payment.customer || 'N/A'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Business Information */}
        {partner && (
          <View style={styles.receiptSection}>
            <Text style={styles.receiptSectionTitle}>FOURNISSEUR DE SERVICE</Text>
            <View style={styles.businessInfo}>
              <View style={styles.businessRow}>
                {partner.logo ? (
                  <Image source={{ uri: partner.logo }} style={styles.businessLogo} />
                ) : (
                  <View style={styles.businessLogoPlaceholder}>
                    <Ionicons name="business-outline" size={24} color="#667eea" />
                  </View>
                )}
                <View style={styles.businessDetails}>
                  <Text style={styles.businessName}>
                    {partner.nom || partner.name || 'EliteReply Partner'}
                  </Text>
                  <Text style={styles.businessCategory}>
                    {partner.categorie || partner.category || 'Fournisseur de Service'}
                  </Text>
                  <Text style={styles.businessContact}>
                    {partner.email || 'N/A'}
                  </Text>
                  <Text style={styles.businessContact}>
                    {partner.numeroTelephone || 'N/A'}
                  </Text>
                  {partner.manager && (
                    <Text style={styles.businessManager}>
                      Manager: {partner.manager}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Order Summary */}
        <View style={styles.receiptSection}>
          <Text style={styles.receiptSectionTitle}>RÉSUMÉ DE LA COMMANDE</Text>
          <View style={styles.orderSummary}>
            {payment.orderData && typeof payment.orderData === 'object' && payment.orderData.items ? (
              // Display parsed order items
              payment.orderData.items.map((item, index) => (
                <View key={index} style={styles.orderItem}>
                  <View style={styles.orderItemDetails}>
                    <Text style={styles.orderItemName}>
                      {item.name || 'Service'}
                    </Text>
                    <Text style={styles.orderItemDescription}>
                      {payment.orderData.description || payment.description || 'Service Payment'}
                    </Text>
                    {payment.orderData.partnerName && (
                      <Text style={styles.orderItemDescription}>
                        Partenaire: {payment.orderData.partnerName}
                      </Text>
                    )}
                    {payment.orderData.deliveryAddress && (
                      <Text style={styles.orderItemDescription}>
                        Livraison: {payment.orderData.deliveryAddress}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.orderItemPrice}>
                    {formatCurrency((item.price * 100) || payment.amount, payment.currency)}
                  </Text>
                </View>
              ))
            ) : (
              // Fallback for payments without structured order data
              <View style={styles.orderItem}>
                <View style={styles.orderItemDetails}>
                  <Text style={styles.orderItemName}>
                    {payment.description || 'EliteReply Service'}
                  </Text>
                  <Text style={styles.orderItemDescription}>
                    Service de paiement EliteReply
                  </Text>
                  {payment.orderData && typeof payment.orderData === 'string' && (
                    <Text style={styles.orderItemDescription}>
                      Détails: {payment.orderData}
                    </Text>
                  )}
                </View>
                <Text style={styles.orderItemPrice}>
                  {formatCurrency(payment.amount, payment.currency)}
                </Text>
              </View>
            )}
            
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
              <Ionicons name="card-outline" size={20} color="#667eea" />
              <View style={styles.paymentMethodDetails}>
                <Text style={styles.paymentMethodType}>Carte de Crédit</Text>
                <Text style={styles.paymentMethodInfo}>
                  •••• •••• •••• {payment.charges?.data?.[0]?.payment_method_details?.card?.last4 || '****'}
                </Text>
                <Text style={styles.transactionId}>
                  ID Transaction: {payment.paymentIntentId}
                </Text>
              </View>
              {/*
              <TouchableOpacity 
                style={styles.stripeButton}
                onPress={() => openStripePayment(payment.paymentIntentId)}
              >
                <Text style={styles.stripeButtonText}>Voir dans Stripe</Text>
              </TouchableOpacity>
              */}
            </View>
          </View>
        </View>

        {/* Receipt Details */}
        {receipt && (
          <View style={styles.receiptSection}>
            <Text style={styles.receiptSectionTitle}>LIVRAISON DU REÇU</Text>
            <View style={styles.receiptDelivery}>
              <View style={styles.deliveryRow}>
                <Ionicons 
                  name={receipt.emailsSent ? "mail" : "mail-outline"} 
                  size={20} 
                  color={receipt.emailsSent ? "#28a745" : "#dc3545"} 
                />
                <View style={styles.deliveryDetails}>
                  <Text style={styles.deliveryStatus}>
                    Reçu {receipt.emailsSent ? 'Livré' : 'En Attente'}
                  </Text>
                  {receipt.emailsSent && receipt.emailResult && (
                    <Text style={styles.deliveryInfo}>
                      Envoyé à {receipt.emailResult.emailsSent || 0} destinataire(s)
                    </Text>
                  )}
                  {receipt.emailSentAt && (
                    <Text style={styles.deliveryTime}>
                      {formatDate(receipt.emailSentAt.toDate())}
                    </Text>
                  )}
                </View>
              </View>
            </View>
          </View>
        )}

        {/* Order Tracking Section */}
        <View style={styles.receiptSection}>
          <Text style={styles.receiptSectionTitle}>SUIVI DE COMMANDE</Text>
          <OrderTracking 
            paymentId={selectedPayment.id}
            initialStatus={selectedPayment.trackingStatus || 'pending'}
            isPartner={false}
          />
        </View>

        {/* Footer */}
        <View style={styles.receiptFooter}>
          <Text style={styles.receiptFooterText}>
            Merci d'avoir choisi EliteReply !
          </Text>
          <Text style={styles.receiptFooterSubtext}>
            Pour le support, contactez: jeremytopaka@gmail.com
          </Text>
          <Text style={styles.receiptFooterSubtext}>
            EliteReply © {new Date().getFullYear()}
          </Text>
        </View>
      </ScrollView>
    );
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchPayments();
  };

  const getCurrentPayments = () => {
    return activeTab === 'client' ? clientPayments : otherPayments;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Loading payments...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Online Payments</Text>
        <TouchableOpacity
          style={styles.refreshButton}
          onPress={onRefresh}
        >
          <Ionicons name="refresh" size={24} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'client' && styles.activeTab]}
          onPress={() => setActiveTab('client')}
        >
          <Text style={[styles.tabText, activeTab === 'client' && styles.activeTabText]}>
            Client Payments ({clientPayments.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'other' && styles.activeTab]}
          onPress={() => setActiveTab('other')}
        >
          <Text style={[styles.tabText, activeTab === 'other' && styles.activeTabText]}>
            Other Payments ({otherPayments.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Payments List */}
      <FlatList
        data={getCurrentPayments()}
        renderItem={renderPaymentItem}
        keyExtractor={(item) => item.id}
        style={styles.paymentsList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="card-outline" size={64} color="#ccc" />
            <Text style={styles.emptyText}>
              No {activeTab} payments found
            </Text>
          </View>
        }
      />

      {/* Payment Details Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={modalVisible}
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
            <Text style={styles.modalTitle}>Payment Details</Text>
            <View style={styles.placeholder} />
          </View>
          {renderPaymentDetails()}
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#667eea',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 5,
  },
  headerTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  refreshButton: {
    padding: 5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 15,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#667eea',
  },
  tabText: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#667eea',
    fontWeight: 'bold',
  },
  paymentsList: {
    flex: 1,
    padding: 15,
  },
  paymentCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
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
    marginLeft: 5,
    fontSize: 12,
    fontWeight: 'bold',
  },
  amount: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  paymentInfo: {
    marginBottom: 10,
  },
  paymentId: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
  },
  description: {
    fontSize: 14,
    color: '#333',
    lineHeight: 20,
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
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 50,
  },
  emptyText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  modalHeader: {
    backgroundColor: '#667eea',
    paddingTop: 50,
    paddingHorizontal: 20,
    paddingBottom: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeButton: {
    padding: 5,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 34,
  },
  detailsContainer: {
    flex: 1,
    padding: 15,
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusInfo: {
    marginLeft: 15,
    flex: 1,
  },
  detailStatus: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  detailAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    fontWeight: '500',
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  linkText: {
    color: '#667eea',
    textDecorationLine: 'underline',
  },
  orderData: {
    fontSize: 12,
    color: '#666',
    backgroundColor: '#f8f9fa',
    padding: 10,
    borderRadius: 6,
    fontFamily: 'monospace',
  },
  
  // Professional Receipt Styles
  receiptContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 0,
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
    width: 60,
    height: 60,
    borderRadius: 100
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
  
  // Customer Information Styles
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
  
  // Business Information Styles
  businessInfo: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  businessRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  businessLogo: {
    width: 50,
    height: 50,
    borderRadius: 8,
    marginRight: 15,
  },
  businessLogoPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 8,
    backgroundColor: '#e9ecef',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 15,
  },
  businessDetails: {
    flex: 1,
  },
  businessName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  businessCategory: {
    fontSize: 14,
    color: '#667eea',
    fontWeight: '500',
    marginBottom: 6,
  },
  businessContact: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  businessManager: {
    fontSize: 13,
    color: '#999',
    fontStyle: 'italic',
    marginTop: 4,
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
  stripeButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  stripeButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  
  // Receipt Delivery Styles
  receiptDelivery: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 15,
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  deliveryDetails: {
    marginLeft: 12,
    flex: 1,
  },
  deliveryStatus: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  deliveryInfo: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  deliveryTime: {
    fontSize: 12,
    color: '#999',
  },
  
  // Receipt Footer Styles
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

export default OnlinePaid;

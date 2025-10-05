import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  Dimensions,
  Platform
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

const { width } = Dimensions.get('window');

const UserCoupons = () => {
  const navigation = useNavigation();
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState(null);

  // Helper function to format date safely
  const formatDate = (date) => {
    if (!date) return 'Date inconnue';
    try {
      if (date.toDate) { // Check if it's a Firestore Timestamp object
        return date.toDate().toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
      }
      return new Date(date).toLocaleDateString('fr-FR', { // Assume ISO string or Date object
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Date invalide';
    }
  };

  useEffect(() => {
    const fetchUserCoupons = async () => {
      setLoading(true);
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          Alert.alert('Erreur', 'Vous devez être connecté pour voir vos coupons.');
          navigation.goBack();
          return;
        }

        // Query the 'surveyResult' collection for responses by the current user
        // Using only userId filter to avoid composite index requirement
        const q = query(
          collection(db, 'surveyResult'),
          where('userId', '==', currentUser.uid),
          orderBy('timestamp', 'desc')
        );

        const querySnapshot = await getDocs(q);
        const fetchedCoupons = [];
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          // Filter in memory to avoid composite index requirement
          // Ensure couponDetails and qrCodeData exist and isRedeemed is false
          if (data.couponDetails && data.qrCodeData && data.isRedeemed === false) {
            fetchedCoupons.push({ id: doc.id, ...data });
          }
        });
        setCoupons(fetchedCoupons);

      } catch (error) {
        console.error("Error fetching user coupons:", error);
        // Fixed: Using in-memory filtering instead of composite index to avoid Firestore index requirements
        Alert.alert('Erreur', 'Impossible de charger vos coupons. Veuillez réessayer.');
      } finally {
        setLoading(false);
      }
    };

    fetchUserCoupons();
  }, []);

  const openCouponModal = (coupon) => {
    setSelectedCoupon(coupon);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSelectedCoupon(null);
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.infoText}>Chargement de vos coupons...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mes Coupons</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollViewContent}>
        {coupons.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="ticket-outline" size={80} color="#CBD5E1" />
            <Text style={styles.emptyText}>Vous n'avez pas encore de coupons valides.</Text> {/* Updated text */}
            <Text style={styles.emptySubtitle}>
              Complétez des enquêtes pour gagner des récompenses !
            </Text>
          </View>
        ) : (
          coupons.map((couponData) => (
            <TouchableOpacity
              key={couponData.id}
              style={styles.couponCard}
              onPress={() => openCouponModal(couponData)}
            >
              <View style={styles.couponIconContainer}>
                <Ionicons name="gift-outline" size={30} color="#28a745" />
              </View>
              <View style={styles.couponDetails}>
                <Text style={styles.couponTitle}>{couponData.couponDetails.title}</Text>
                <Text style={styles.couponDescription}>{couponData.couponDetails.description}</Text>
                <Text style={styles.couponSponsor}>Par: {couponData.couponDetails.sponsorName}</Text>
                <Text style={styles.couponExpiry}>Expire le: {formatDate(couponData.couponDetails.expiryDate)}</Text>
                <Text style={styles.couponValue}>
                  {couponData.couponDetails.type === 'percentage'
                    ? `${couponData.couponDetails.value}% de réduction`
                    : `${couponData.couponDetails.value}€ de réduction`}
                </Text>
              </View>
              <Ionicons name="chevron-forward-outline" size={24} color="#A0AEC0" />
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* QR Code Modal */}
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

            {selectedCoupon && (
              <>
                <Text style={styles.modalSponsorName}>{selectedCoupon.couponDetails.sponsorName}</Text>
                <Text style={styles.modalCouponTitle}>{selectedCoupon.couponDetails.title}</Text>

                <View style={styles.modalQrCodeContainer}>
                  {selectedCoupon.qrCodeData ? (
                    <QRCode
                      value={selectedCoupon.qrCodeData}
                      size={width * 0.7}
                      color="#2D3748"
                      backgroundColor="#FFFFFF"
                      ecl="H"
                    />
                  ) : (
                    <ActivityIndicator size="large" color="#0a8fdf" />
                  )}
                  <Text style={styles.modalQrCodeLabel}>
                    Présentez ce code pour utiliser votre coupon.
                  </Text>
                </View>

                <Text style={styles.modalExpiryText}>
                  Valable jusqu'au: {formatDate(selectedCoupon.couponDetails.expiryDate)}
                </Text>
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
  couponCard: {
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
    borderColor: '#28a745', // Green border for active coupons
  },
  couponIconContainer: {
    marginRight: 15,
  },
  couponDetails: {
    flex: 1,
  },
  couponTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 5,
  },
  couponDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 5,
  },
  couponSponsor: {
    fontSize: 13,
    color: '#9CA3AF',
    marginBottom: 3,
    fontStyle: 'italic',
  },
  couponExpiry: {
    fontSize: 13,
    color: '#EF4444',
    fontWeight: '500',
    marginBottom: 8,
  },
  couponValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },

  // Modal Styles
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
  modalSponsorName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#4A5568',
    marginBottom: 8,
    textAlign: 'center',
  },
  modalCouponTitle: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  modalQrCodeContainer: {
    marginTop: 10,
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
  modalExpiryText: {
    fontSize: 14,
    color: '#718096',
    marginTop: 10,
    textAlign: 'center',
  },
});

export default UserCoupons;
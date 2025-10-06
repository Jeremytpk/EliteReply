import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView, Modal, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { v4 as uuidv4 } from 'uuid';
import { useNavigation } from '@react-navigation/native';

// --- NEW: Import your custom icons ---
const ARROW_FORWARD_ICON = require('../../assets/icons/arrow_forward.png'); // For products/documents/revenues buttons
const FOLDER_ICON = require('../../assets/icons/folder.png'); // For documents button
const GRAPHIC_ICON = require('../../assets/icons/graphic.png'); // For revenues button
const CREATE_ICON = require('../../assets/icons/edit.png'); // For edit button
const TRASH_ICON = require('../../assets/icons/trash.png'); // For delete button
const CLOSE_CIRCLE_OUTLINE_ICON = require('../../assets/icons/close_circle.png'); // For modal close button
const BUSINESS_ICON_PLACEHOLDER = require('../../assets/icons/business_outline.png'); // For logo placeholder

// Helper function to check if a URL is a valid Firebase Storage URL
const isFirebaseStorageUrl = (url) => {
  return typeof url === 'string' && (url.startsWith('https://firebasestorage.googleapis.com/') || url.startsWith('gs://'));
};

const PartnerDetails = ({ route }) => {
  const { partnerId } = route.params;
  const navigation = useNavigation();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [isRevenuesModalVisible, setIsRevenuesModalVisible] = useState(false);
  const [partnerRevenueStats, setPartnerRevenueStats] = useState(null);
  const [revenuesModalLoading, setRevenuesModalLoading] = useState(false);

  // Function to get promotion status with remaining days
  const getPromotionStatus = (partner) => {
    if (!partner.estPromu || !partner.promotionEndDate) {
      return { color: '#666', text: 'Pas de promotion', iconColor: '#666', iconName: 'information-circle-outline' };
    }

    const endDate = new Date(partner.promotionEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (endDate < today) {
      return { color: '#FF3B30', text: 'Promotion expirée', iconColor: '#FF3B30', iconName: 'close-circle-outline' };
    }

    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays <= 7) {
      return { color: '#FF9500', text: `${diffDays} jours restants`, iconColor: '#FF9500', iconName: 'time-outline' };
    } else {
      return { color: '#34C759', text: `${diffDays} jours restants`, iconColor: '#34C759', iconName: 'checkmark-circle-outline' };
    }
  };

  const fetchPartner = useCallback(async () => {
    setLoading(true);
    try {
      const docRef = doc(db, 'partners', partnerId);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const partnerData = { id: docSnap.id, ...docSnap.data() };
        setPartner(partnerData);
      } else {
        Alert.alert("Erreur", "Partenaire non trouvé.");
        navigation.goBack();
      }
    } catch (error) {
      console.error("Erreur lors du chargement du partenaire:", error);
      Alert.alert("Erreur", "Échec du chargement des détails du partenaire.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [partnerId, navigation]);

  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      fetchPartner();
    });

    fetchPartner();

    return unsubscribeFocus;
  }, [fetchPartner, navigation]);

  const handleDeletePartner = () => {
    Alert.alert(
      "Supprimer le Partenaire",
      `Êtes-vous sûr de vouloir supprimer ${partner.nom} ? Cette action est irréversible.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          onPress: async () => {
            setUploading(true);
            try {
              if (partner.logo && isFirebaseStorageUrl(partner.logo)) {
                try {
                  const logoPath = new URL(partner.logo).pathname.split('/o/')[1].split('?')[0];
                  const decodedLogoPath = decodeURIComponent(logoPath);
                  const imageRef = ref(storage, decodedLogoPath);
                  await deleteObject(imageRef);
                  console.log("Logo du partenaire supprimé du stockage.");
                } catch (deleteError) {
                  console.warn("Erreur lors de la suppression du logo du partenaire du stockage:", deleteError);
                }
              }

              await deleteDoc(doc(db, 'partners', partnerId));
              Alert.alert("Succès", `${partner.nom} a été supprimé.`);
              navigation.goBack();
            } catch (error) {
              console.error("Erreur lors de la suppression du partenaire:", error);
              Alert.alert("Erreur", "Échec de la suppression du partenaire.");
            } finally {
              setUploading(false);
            }
          },
          style: "destructive"
        }
      ]
    );
  };

  const handleEditPartner = () => {
    navigation.navigate('PartnerEdit', { partnerId: partner.id });
  };

  const fetchPartnerRevenueDetails = useCallback(async () => {
    setRevenuesModalLoading(true);
    try {
      let monthlyNet = 0;
      let yearlyNet = 0;
      let monthlyCommission = 0;
      let yearlyCommission = 0;

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

      setPartnerRevenueStats({
        monthlyNet,
        yearlyNet,
        monthlyCommission,
        yearlyCommission,
      });
      setIsRevenuesModalVisible(true);

    } catch (error) {
      console.error("Erreur lors du chargement des détails des revenus du partenaire:", error);
      Alert.alert("Erreur", "Impossible de charger les détails des revenus du partenaire. " + error.message);
    } finally {
      setRevenuesModalLoading(false);
    }
  }, [partnerId]);

  const formatDateTimeForDisplay = (timestamp) => {
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
      console.error("Erreur lors du formatage de la date/heure pour l'affichage:", e);
      return 'Date invalide';
    }
  };


  if (loading || !partner) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={{ marginTop: 10, fontSize: 16, color: '#666' }}>Chargement des détails du partenaire...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContainer}>
      <View style={styles.logoContainer}>
        {partner.logo ? (
          <Image source={{ uri: partner.logo }} style={styles.logo} />
        ) : (
          <View style={styles.uploadPlaceholder}>
            <Image source={BUSINESS_ICON_PLACEHOLDER} style={styles.customLogoPlaceholderIcon} />
            <Text style={styles.uploadPlaceholderText}>Pas de logo</Text>
          </View>
        )}
      </View>

      <View style={styles.infoContainer}>
        <Text style={styles.name}>{partner.nom}</Text>
        <Text style={styles.category}>Catégorie: {partner.categorie}</Text>
        {partner.ceo && <Text style={styles.infoText}>CEO: {partner.ceo}</Text>}
        {partner.manager && <Text style={styles.infoText}>Manager: {partner.manager}</Text>}
        {partner.adresse && <Text style={styles.infoText}>Adresse: {partner.adresse}</Text>}
        {partner.email && <Text style={styles.email} onPress={() => Linking.openURL(`mailto:${partner.email}`)}>Email: {partner.email}</Text>}
        {partner.numeroTelephone && <Text style={styles.phone} onPress={() => Linking.openURL(`tel:${partner.numeroTelephone}`)}>Téléphone: {partner.numeroTelephone}</Text>}
        <Text
          style={styles.website}
          onPress={() => navigation.navigate('PartnerPage', { partnerId: partner.id })}
        >
          Page du Partenaire
        </Text>
        {partner.siteWeb && <Text style={styles.website} onPress={() => Linking.openURL(partner.siteWeb)}>Site Web: {partner.siteWeb}</Text>}
        {partner.description && (
          <View style={styles.descriptionContainer}>
            <Text style={styles.descriptionLabel}>Description:</Text>
            <Text style={styles.descriptionText}>{partner.description}</Text>
          </View>
        )}

        {partner.promotion && (
          <View style={styles.promotionContainer}>
            <Text style={styles.promotionLabel}>Promotion Actuelle:</Text>
            <Text style={styles.promotionText}>{partner.promotion}</Text>
          </View>
        )}

        {partner.estPromu && (
          <View style={styles.promotionStatusContainer}>
            <Text style={styles.promotionStatusLabel}>Statut de Promotion:</Text>
            <Text style={[styles.promotionStatusText, { color: getPromotionStatus(partner).color }]}>
              {getPromotionStatus(partner).text}
            </Text>
            {partner.promotionEndDate && (
              <Text style={styles.promotionEndDateText}>
                Fin: {new Date(partner.promotionEndDate).toLocaleDateString('fr-FR')}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.additionalButtonsContainer}>
        <TouchableOpacity
          style={styles.productsButton}
          onPress={() => navigation.navigate('PartnerPage', { partnerId: partner.id })} // CHANGED HERE
        >
          <Text style={styles.productsButtonText}>Voir les Produits</Text>
          <Image source={ARROW_FORWARD_ICON} style={styles.customButtonIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.documentsButton}
          onPress={() => navigation.navigate('PartnerDoc', {
            partnerId: partner.id,
            partnerName: partner.nom,
            isAdmin: true
          })}
        >
          <Text style={styles.productsButtonText}>Documents</Text>
          <Image source={FOLDER_ICON} style={styles.customButtonIcon} />
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.revenuesButton}
          onPress={fetchPartnerRevenueDetails}
        >
          <Text style={styles.productsButtonText}>Revenus</Text>
          <Image source={GRAPHIC_ICON} style={styles.customButtonIcon} />
        </TouchableOpacity>
      </View>

      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity style={styles.editButton} onPress={handleEditPartner}>
          <Image source={CREATE_ICON} style={styles.customActionButtonIcon} />
          <Text style={styles.actionButtonText}>Modifier</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteButton} onPress={handleDeletePartner} disabled={uploading}>
          {uploading ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Image source={TRASH_ICON} style={styles.customActionButtonIcon} />
          )}
          <Text style={styles.actionButtonText}>Supprimer Compte</Text>
        </TouchableOpacity>
      </View>

      <Modal
        visible={isRevenuesModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setIsRevenuesModalVisible(false)}
      >
        <View style={styles.revenuesModalOverlay}>
          <View style={styles.revenuesModalContent}>
            <TouchableOpacity
              style={styles.revenuesModalCloseButton}
              onPress={() => setIsRevenuesModalVisible(false)}
            >
              <Image source={CLOSE_CIRCLE_OUTLINE_ICON} style={styles.customModalCloseIcon} />
            </TouchableOpacity>

            {revenuesModalLoading ? (
              <View style={styles.modalLoadingContainer}>
                <ActivityIndicator size="large" color="#0a8fdf" />
                <Text style={styles.loadingText}>Chargement des données de revenus...</Text>
              </View>
            ) : (
              partnerRevenueStats && (
                <ScrollView contentContainerStyle={styles.modalScrollContent}>
                  <Text style={styles.modalRevenuesTitle}>Revenus de {partner.nom}</Text>
                  <Text style={styles.modalRevenuesSubtitle}>Statistiques Financières</Text>

                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Revenus Nets ce mois-ci:</Text>
                    <Text style={styles.modalStatValue}>
                      {(partnerRevenueStats.monthlyNet ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={styles.modalStatCard}>
                    <Text style={styles.modalStatLabel}>Revenus Nets cette année:</Text>
                    <Text style={styles.modalStatValue}>
                      {(partnerRevenueStats.yearlyNet ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={[styles.modalStatCard, { borderColor: '#9C27B0' }]}>
                    <Text style={styles.modalStatLabel}>Commission ce mois-ci:</Text>
                    <Text style={[styles.modalStatValue, { color: '#9C27B0' }]}>
                      {(partnerRevenueStats.monthlyCommission ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>

                  <View style={[styles.modalStatCard, { borderColor: '#9C27B0' }]}>
                    <Text style={styles.modalStatLabel}>Commission cette année:</Text>
                    <Text style={[styles.modalStatValue, { color: '#9C27B0' }]}>
                      {(partnerRevenueStats.yearlyCommission ?? 0).toLocaleString('fr-FR', { style: 'currency', currency: 'USD' })}
                    </Text>
                  </View>
                </ScrollView>
              )
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
    backgroundColor: '#f8f9fa',
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignSelf: 'center',
    marginBottom: 20,
    position: 'relative',
  },
  logo: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  uploadPlaceholder: {
    width: 150,
    height: 150,
    borderRadius: 75,
    borderWidth: 2,
    borderColor: '#ddd',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  customLogoPlaceholderIcon: {
    width: 40,
    height: 40,
    resizeMode: 'contain',
    tintColor: '#ccc',
  },
  uploadPlaceholderText: {
    fontSize: 14,
    color: '#999',
    marginTop: 5,
  },
  infoContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  name: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  category: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  infoText: {
    fontSize: 16,
    color: '#666',
    marginBottom: 8,
  },
  email: {
    fontSize: 16,
    color: '#0a8fdf',
    marginBottom: 8,
    textDecorationLine: 'underline',
  },
  phone: {
    fontSize: 16,
    color: '#0a8fdf',
    marginBottom: 8,
    textDecorationLine: 'underline',
  },
  website: {
    fontSize: 16,
    color: '#0a8fdf',
    marginBottom: 8,
    textDecorationLine: 'underline',
  },
  descriptionContainer: {
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 10,
  },
  descriptionLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#555',
    marginBottom: 5,
  },
  descriptionText: {
    fontSize: 16,
    color: '#666',
    lineHeight: 22,
  },
  promotionContainer: {
    marginTop: 15,
    padding: 10,
    backgroundColor: '#e6f7ff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#91d5ff',
  },
  promotionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0a8fdf',
    marginBottom: 5,
  },
  promotionText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 22,
  },
  promotionStatusContainer: {
    marginTop: 15,
    padding: 12,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  promotionStatusLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#495057',
    marginBottom: 5,
  },
  promotionStatusText: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  promotionEndDateText: {
    fontSize: 14,
    color: '#6c757d',
    fontStyle: 'italic',
  },
  additionalButtonsContainer: {
    flexDirection: 'column',
    gap: 10,
    marginBottom: 20,
  },
  productsButton: {
    backgroundColor: '#0a8fdf',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
  },
  documentsButton: {
    backgroundColor: '#4CAF50',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
  },
  revenuesButton: {
    backgroundColor: '#FF9800',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    borderRadius: 8,
  },
  productsButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  customButtonIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#fff',
    marginLeft: 10,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    marginBottom: 20,
  },
  editButton: {
    backgroundColor: '#ffc107',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  deleteButton: {
    backgroundColor: '#dc3545',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  customActionButtonIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#fff',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  revenuesModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  revenuesModalContent: {
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
  revenuesModalCloseButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 1,
  },
  customModalCloseIcon: {
    width: 30,
    height: 30,
    resizeMode: 'contain',
    tintColor: '#EF4444',
  },
  modalRevenuesTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  modalRevenuesSubtitle: {
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
});

export default PartnerDetails;
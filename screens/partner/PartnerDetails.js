import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Alert, ActivityIndicator, ScrollView, Modal, TextInput, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { doc, getDoc, updateDoc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../firebase';
import { v4 as uuidv4 } from 'uuid';
import { useNavigation } from '@react-navigation/native';
import COUNTRIES, { countryCodeToFlag } from '../../components/Countries';

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

    // Handle different date formats (Firestore timestamp, string, or Date object)
    let endDate;
    if (partner.promotionEndDate.toDate) {
      // Firestore Timestamp
      endDate = partner.promotionEndDate.toDate();
    } else if (partner.promotionEndDate.seconds) {
      // Firestore Timestamp object
      endDate = new Date(partner.promotionEndDate.seconds * 1000);
    } else {
      // String or Date
      endDate = new Date(partner.promotionEndDate);
    }

    // Check if date is valid
    if (isNaN(endDate.getTime())) {
      console.error('Invalid promotion end date:', partner.promotionEndDate);
      return { color: '#666', text: 'Date invalide', iconColor: '#666', iconName: 'information-circle-outline' };
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    if (endDate < today) {
      return { color: '#FF3B30', text: 'Promotion expirée', iconColor: '#FF3B30', iconName: 'close-circle-outline' };
    }

    const diffTime = endDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    // Ensure diffDays is a valid number
    if (isNaN(diffDays) || diffDays < 0) {
      return { color: '#666', text: 'Calcul invalide', iconColor: '#666', iconName: 'information-circle-outline' };
    }

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

  // Return a display string for partner country (flag + name) or null
  const getCountryDisplay = (partner) => {
    if (!partner) return null;
    const raw = (partner.pays || partner.country || '').toString().trim();
    if (!raw) return null;

    // If looks like an ISO code (2 letters) use code lookup
    const maybeCode = raw.length <= 3 ? raw.toUpperCase() : null;
    if (maybeCode) {
      const found = COUNTRIES.find(c => c.code === maybeCode);
      if (found) return `${found.flag} ${found.name}`;
      // fallback to emoji flag + code
      return `${countryCodeToFlag(maybeCode)} ${maybeCode}`;
    }

    // otherwise try to match by name (case-insensitive)
    const foundByName = COUNTRIES.find(c => c.name.toLowerCase() === raw.toLowerCase());
    if (foundByName) return `${foundByName.flag} ${foundByName.name}`;

    // final fallback: return raw string
    return raw;
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
        {(partner.pays || partner.country) && (
          <View style={styles.countryRow}>
            <Text style={styles.countryLabel}>Pays</Text>
            <Text style={styles.countryValue}>{getCountryDisplay(partner)}</Text>
          </View>
        )}
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
                Fin: {(() => {
                  let endDate;
                  if (partner.promotionEndDate.toDate) {
                    endDate = partner.promotionEndDate.toDate();
                  } else if (partner.promotionEndDate.seconds) {
                    endDate = new Date(partner.promotionEndDate.seconds * 1000);
                  } else {
                    endDate = new Date(partner.promotionEndDate);
                  }
                  return isNaN(endDate.getTime()) ? 'Date invalide' : endDate.toLocaleDateString('fr-FR');
                })()}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.additionalButtonsContainer}>
        <TouchableOpacity
          onPress={() => navigation.navigate('PartnerPage', { partnerId: partner.id })}
        >
          <LinearGradient
            colors={['#3b82f6', '#1d4ed8']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.productsButton}
          >
            <Text style={styles.productsButtonText}>Voir les Produits</Text>
            <Image source={ARROW_FORWARD_ICON} style={styles.customButtonIcon} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => navigation.navigate('PartnerDoc', {
            partnerId: partner.id,
            partnerName: partner.nom,
            isAdmin: true
          })}
        >
          <LinearGradient
            colors={['#10b981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.documentsButton}
          >
            <Text style={styles.productsButtonText}>Documents</Text>
            <Image source={FOLDER_ICON} style={styles.customButtonIcon} />
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={fetchPartnerRevenueDetails}
        >
          <LinearGradient
            colors={['#f59e0b', '#d97706']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.revenuesButton}
          >
            <Text style={styles.productsButtonText}>Revenus</Text>
            <Image source={GRAPHIC_ICON} style={styles.customButtonIcon} />
          </LinearGradient>
        </TouchableOpacity>
      </View>

      <View style={styles.actionButtonsContainer}>
        <TouchableOpacity onPress={handleEditPartner}>
          <LinearGradient
            colors={['#eab308', '#f59e0b']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.editButton}
          >
            <Image source={CREATE_ICON} style={styles.customActionButtonIcon} />
            <Text style={styles.actionButtonText}>Modifier</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleDeletePartner} disabled={uploading}>
          <LinearGradient
            colors={['#ef4444', '#dc2626']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.deleteButton}
          >
            {uploading ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Image source={TRASH_ICON} style={styles.customActionButtonIcon} />
            )}
            <Text style={styles.actionButtonText}>Supprimer Compte</Text>
          </LinearGradient>
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
    backgroundColor: '#f5f7fa',
  },
  scrollContainer: {
    padding: 16,
    paddingBottom: 50,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  logoContainer: {
    alignSelf: 'center',
    marginBottom: 24,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  logo: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#ffffff',
  },
  uploadPlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 3,
    borderColor: '#e2e8f0',
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  customLogoPlaceholderIcon: {
    width: 48,
    height: 48,
    resizeMode: 'contain',
    tintColor: '#94a3b8',
  },
  uploadPlaceholderText: {
    fontSize: 14,
    color: '#64748b',
    marginTop: 8,
    fontWeight: '500',
  },
  infoContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  name: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1e293b',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  category: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 10,
    textAlign: 'center',
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 12,
    lineHeight: 24,
    fontWeight: '400',
  },
  email: {
    fontSize: 16,
    color: '#3b82f6',
    marginBottom: 12,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  phone: {
    fontSize: 16,
    color: '#3b82f6',
    marginBottom: 12,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  website: {
    fontSize: 16,
    color: '#3b82f6',
    marginBottom: 12,
    textDecorationLine: 'underline',
    fontWeight: '500',
  },
  descriptionContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 20,
  },
  descriptionLabel: {
    fontSize: 18,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 12,
    letterSpacing: -0.2,
  },
  descriptionText: {
    fontSize: 16,
    color: '#475569',
    lineHeight: 26,
    fontWeight: '400',
  },
  promotionContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#dbeafe',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#93c5fd',
    borderLeftWidth: 4,
    borderLeftColor: '#3b82f6',
  },
  promotionLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e40af',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  promotionText: {
    fontSize: 16,
    color: '#1e293b',
    lineHeight: 24,
    fontWeight: '500',
  },
  promotionStatusContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderLeftWidth: 4,
    borderLeftColor: '#10b981',
  },
  promotionStatusLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    letterSpacing: -0.1,
  },
  promotionStatusText: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.2,
  },
  promotionEndDateText: {
    fontSize: 14,
    color: '#64748b',
    fontWeight: '500',
    backgroundColor: '#f1f5f9',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  countryRow: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 28,
  },
  countryLabel: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  countryValue: {
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '700',
  },
  additionalButtonsContainer: {
    flexDirection: 'column',
    gap: 16,
    marginBottom: 24,
  },
  productsButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  documentsButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  revenuesButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 18,
    borderRadius: 12,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  productsButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  customButtonIcon: {
    width: 22,
    height: 22,
    resizeMode: 'contain',
    tintColor: '#ffffff',
    marginLeft: 12,
  },
  actionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 24,
    gap: 16,
  },
  editButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    shadowColor: '#eab308',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  deleteButton: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  customActionButtonIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#ffffff',
    marginRight: 8,
  },
  actionButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  revenuesModalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
  },
  revenuesModalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 28,
    width: '92%',
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  revenuesModalCloseButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1,
    backgroundColor: '#fee2e2',
    borderRadius: 20,
    padding: 4,
  },
  customModalCloseIcon: {
    width: 28,
    height: 28,
    resizeMode: 'contain',
    tintColor: '#ef4444',
  },
  modalRevenuesTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#1e293b',
    marginBottom: 8,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  modalRevenuesSubtitle: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 28,
    textAlign: 'center',
    fontWeight: '500',
  },
  modalStatCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderColor: '#3b82f6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  modalStatLabel: {
    fontSize: 16,
    color: '#334155',
    fontWeight: '600',
    flexShrink: 1,
    marginRight: 12,
    letterSpacing: -0.1,
  },
  modalStatValue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#3b82f6',
    textAlign: 'right',
    letterSpacing: -0.3,
  },
});

export default PartnerDetails;
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
  Linking,
  Platform,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  doc, 
  updateDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { db } from '../firebase';

const PartnerApplications = ({ navigation }) => {
  const [applications, setApplications] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [userEmails, setUserEmails] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedApplication, setSelectedApplication] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    const unsubscribe = fetchApplications();
    loadUserEmails();
    return () => unsubscribe && unsubscribe();
  }, []);

  // Load all user emails into a Set for quick existence checks
  const loadUserEmails = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const emails = new Set();
      usersSnapshot.forEach(u => {
        const data = u.data();
        if (data && data.email) {
          emails.add(String(data.email).toLowerCase());
        }
      });
      setUserEmails(emails);
    } catch (err) {
      console.error('Error loading user emails:', err);
    }
  };

  const fetchApplications = () => {
    try {
      const applicationsQuery = query(
        collection(db, 'applications')
        // Note: orderBy removed temporarily to avoid index issues
      );

      const unsubscriber = onSnapshot(applicationsQuery, (snapshot) => {
        const applicationsData = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          let createdAt = new Date();
          let updatedAt = new Date();
          
          // Handle different date formats
          if (data.createdAt) {
            if (data.createdAt.toDate) {
              createdAt = data.createdAt.toDate();
            } else if (data.createdAt instanceof Date) {
              createdAt = data.createdAt;
            } else if (typeof data.createdAt === 'string') {
              createdAt = new Date(data.createdAt);
            }
          }
          
          if (data.updatedAt) {
            if (data.updatedAt.toDate) {
              updatedAt = data.updatedAt.toDate();
            } else if (data.updatedAt instanceof Date) {
              updatedAt = data.updatedAt;
            } else if (typeof data.updatedAt === 'string') {
              updatedAt = new Date(data.updatedAt);
            }
          }
          
          applicationsData.push({
            id: doc.id,
            ...data,
            createdAt,
            updatedAt,
          });
        });
        
        console.log('Fetched applications:', applicationsData.length, applicationsData);
        setApplications(applicationsData);
        setLoading(false);
        setRefreshing(false);
      });

      return unsubscriber;
    } catch (error) {
      console.error('Error fetching applications:', error);
      setLoading(false);
      setRefreshing(false);
    }
  };

  const updateApplicationStatus = async (applicationId, newStatus) => {
    // Handle special cases for accepted and rejected status
    if (newStatus === 'accepted') {
      handleAcceptApplication(applicationId);
      return;
    }
    
    if (newStatus === 'rejected') {
      handleRejectApplication(applicationId);
      return;
    }

    // Handle other status updates normally
    try {
      setUpdatingStatus(true);
      
      await updateDoc(doc(db, 'applications', applicationId), {
        status: newStatus,
        updatedAt: new Date()
      });

      // Update the local state
      setApplications(prev => prev.map(app => 
        app.id === applicationId 
          ? { ...app, status: newStatus, updatedAt: new Date() }
          : app
      ));

      Alert.alert('Succès', `Statut mis à jour: ${getStatusText(newStatus)}`);
      setModalVisible(false);
    } catch (error) {
      console.error('Error updating status:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleAcceptApplication = (applicationId) => {
    const application = applications.find(app => app.id === applicationId);
    const applicantEmail = application?.applicantInfo?.email || application?.email;
    const applicantName = `${application?.applicantInfo?.firstName || application?.firstName} ${application?.applicantInfo?.lastName || application?.lastName}`;

    Alert.alert(
      'Accepter la candidature',
      `Êtes-vous sûr de vouloir accepter la candidature de ${applicantName}?\n\nCela ouvrira votre application email pour envoyer une notification d'acceptation.`,
      [
        {
          text: 'Annuler',
          style: 'cancel'
        },
        {
          text: 'Accepter',
          style: 'default',
          onPress: () => acceptApplication(applicationId, applicantEmail, applicantName)
        }
      ]
    );
  };

  const handleRejectApplication = (applicationId) => {
    const application = applications.find(app => app.id === applicationId);
    const applicantName = `${application?.applicantInfo?.firstName || application?.firstName} ${application?.applicantInfo?.lastName || application?.lastName}`;

    Alert.alert(
      'Rejeter la candidature',
      `Êtes-vous sûr de vouloir rejeter la candidature de ${applicantName}?\n\nUn email de notification sera envoyé avec les raisons du rejet basées sur nos conditions d'utilisation.`,
      [
        {
          text: 'Annuler',
          style: 'cancel'
        },
        {
          text: 'Rejeter',
          style: 'destructive',
          onPress: () => rejectApplication(applicationId)
        }
      ]
    );
  };

  const acceptApplication = async (applicationId, applicantEmail, applicantName) => {
    try {
      setUpdatingStatus(true);
      
      // Update status in database
      await updateDoc(doc(db, 'applications', applicationId), {
        status: 'accepted',
        updatedAt: new Date()
      });

      // Update local state
      setApplications(prev => prev.map(app => 
        app.id === applicationId 
          ? { ...app, status: 'accepted', updatedAt: new Date() }
          : app
      ));

      // Open email app
      if (applicantEmail) {
        const subject = encodeURIComponent('Félicitations ! Votre candidature EliteReply a été acceptée');
        const body = encodeURIComponent(
          `Bonjour ${applicantName},\n\n` +
          `Nous avons le plaisir de vous informer que votre candidature pour devenir partenaire EliteReply a été acceptée !\n\n` +
          `Nous sommes ravis de vous accueillir dans notre équipe de partenaires. Un de nos représentants vous contactera bientôt pour finaliser le processus d'intégration.\n\n` +
          `Bienvenue chez EliteReply !\n\n` +
          `Cordialement,\n` +
          `L'équipe EliteReply`
        );
        
        const emailUrl = `mailto:${applicantEmail}?subject=${subject}&body=${body}`;
        
        // Try to open the email app
        const canOpen = await Linking.canOpenURL(emailUrl);
        if (canOpen) {
          await Linking.openURL(emailUrl);
        } else {
          Alert.alert(
            'Email non disponible', 
            `Impossible d'ouvrir l'application email. Email du candidat: ${applicantEmail}`
          );
        }
      }

      Alert.alert('Succès', `Candidature acceptée pour ${applicantName}`);
      setModalVisible(false);

    } catch (error) {
      console.error('Error accepting application:', error);
      Alert.alert('Erreur', 'Impossible d\'accepter la candidature');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const rejectApplication = async (applicationId) => {
    const application = applications.find(app => app.id === applicationId);
    const applicantEmail = application?.applicantInfo?.email || application?.email;
    const applicantName = `${application?.applicantInfo?.firstName || application?.firstName} ${application?.applicantInfo?.lastName || application?.lastName}`;

    try {
      setUpdatingStatus(true);
      
      // Update status in database
      await updateDoc(doc(db, 'applications', applicationId), {
        status: 'rejected',
        updatedAt: new Date(),
        rejectedAt: new Date()
      });

      // Update local state
      setApplications(prev => prev.map(app => 
        app.id === applicationId 
          ? { ...app, status: 'rejected', updatedAt: new Date(), rejectedAt: new Date() }
          : app
      ));

      // Open email app with rejection notification
      if (applicantEmail) {
        const subject = encodeURIComponent('Mise à jour de votre candidature EliteReply');
        const body = encodeURIComponent(
          `Bonjour ${applicantName},\n\n` +
          `Nous vous remercions pour l'intérêt que vous portez à devenir partenaire EliteReply.\n\n` +
          `Après examen attentif de votre candidature, nous regrettons de vous informer qu'elle ne peut pas être acceptée à ce stade.\n\n` +
          `Cette décision est basée sur nos conditions d'utilisation et critères de partenariat, notamment :\n` +
          `• Conformité aux standards de qualité de service requis\n` +
          `• Alignement avec nos valeurs et politiques d'entreprise\n` +
          `• Respect des exigences techniques et professionnelles\n` +
          `• Vérification des références et expériences professionnelles\n\n` +
          `Nous vous encourageons à consulter nos conditions générales d'utilisation pour plus de détails sur nos critères de sélection.\n\n` +
          `BONNE NOUVELLE : Vous pouvez soumettre une nouvelle candidature après 30 jours à compter de cette notification.\n\n` +
          `Nous vous souhaitons beaucoup de succès dans vos projets futurs.\n\n` +
          `Cordialement,\n` +
          `L'équipe EliteReply\n\n` +
          `---\n` +
          `Cette décision fait référence à nos Conditions Générales d'Utilisation disponibles sur notre plateforme.`
        );
        
        const emailUrl = `mailto:${applicantEmail}?subject=${subject}&body=${body}`;
        
        // Try to open the email app
        const canOpen = await Linking.canOpenURL(emailUrl);
        if (canOpen) {
          await Linking.openURL(emailUrl);
        } else {
          Alert.alert(
            'Email non disponible', 
            `Impossible d'ouvrir l'application email. Email du candidat: ${applicantEmail}`
          );
        }
      }

      Alert.alert('Succès', `Candidature rejetée. Un email de notification a été préparé pour ${applicantName}.`);
      setModalVisible(false);

    } catch (error) {
      console.error('Error rejecting application:', error);
      Alert.alert('Erreur', 'Impossible de rejeter la candidature');
    } finally {
      setUpdatingStatus(false);
    }
  };

  const getStatusText = (status) => {
    switch (status) {
      case 'pending': return 'En Attente';
      case 'on_work': return 'En Cours';
      case 'rejected': return 'Rejetée';
      case 'accepted': return 'Acceptée';
      default: return 'Inconnu';
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#FFC107';
      case 'on_work': return '#2196F3';
      case 'rejected': return '#F44336';
      case 'accepted': return '#4CAF50';
      default: return '#9E9E9E';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'pending': return 'time-outline';
      case 'on_work': return 'cog-outline';
      case 'rejected': return 'close-circle-outline';
      case 'accepted': return 'checkmark-circle-outline';
      default: return 'help-circle-outline';
    }
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

  const openApplicationDetails = (application) => {
    setSelectedApplication(application);
    setModalVisible(true);
  };

  // Filter applications by name or email (case-insensitive)
  const filteredApplications = applications.filter((app) => {
    if (!searchQuery || searchQuery.trim() === '') return true;
    const q = searchQuery.toLowerCase();

    const firstName = (app.applicantInfo?.firstName || app.firstName || '').toString().toLowerCase();
    const lastName = (app.applicantInfo?.lastName || app.lastName || '').toString().toLowerCase();
    const email = (app.applicantInfo?.email || app.email || '').toString().toLowerCase();

    const fullName = `${firstName} ${lastName}`.trim();

    return (
      fullName.includes(q) ||
      firstName.includes(q) ||
      lastName.includes(q) ||
      email.includes(q)
    );
  });

  const renderApplicationItem = ({ item }) => {
    return (
      <TouchableOpacity
        style={styles.applicationCard}
        onPress={() => openApplicationDetails(item)}
      >
        <View style={styles.applicationHeader}>
          <View style={styles.applicantInfo}>
            <Text style={styles.applicantName}>
              {item.applicantInfo?.firstName || item.firstName} {item.applicantInfo?.lastName || item.lastName}
            </Text>
            <Text style={styles.applicantEmail}>
              {item.applicantInfo?.email || item.email}
            </Text>
            {((item.applicantInfo?.email || item.email) && userEmails.has((item.applicantInfo?.email || item.email).toLowerCase())) ? (
              <View style={[styles.emailIndicator, { backgroundColor: '#4CAF50' }]} />
            ) : (
              <View style={[styles.emailIndicator, { backgroundColor: '#BDBDBD' }]} />
            )}
          </View>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status || 'pending') }]}>
            <Ionicons
              name={getStatusIcon(item.status || 'pending')}
              size={16}
              color="#fff"
            />
            <Text style={styles.statusText}>
              {getStatusText(item.status || 'pending')}
            </Text>
          </View>
        </View>

        <View style={styles.applicationInfo}>
          <Text style={styles.businessName} numberOfLines={1}>
            Entreprise: {item.businessInfo?.businessName || item.businessName || 'N/A'}
          </Text>
          <Text style={styles.serviceType} numberOfLines={1}>
            Service: {item.businessInfo?.category || item.serviceType || 'N/A'}
          </Text>
          <Text style={styles.applicationDate}>
            Candidature du {formatDate(item.createdAt)}
          </Text>
        </View>

        <View style={styles.applicationFooter}>
          <Ionicons name="chevron-forward" size={20} color="#666" />
        </View>
      </TouchableOpacity>
    );
  };

  const renderApplicationDetails = () => {
    if (!selectedApplication) return null;

    return (
      <ScrollView style={styles.detailsContainer}>
        {/* Header */}
        <View style={styles.detailsHeader}>
          <Text style={styles.detailsTitle}>Candidature Partenaire</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedApplication.status || 'pending') }]}>
            <Ionicons
              name={getStatusIcon(selectedApplication.status || 'pending')}
              size={16}
              color="#fff"
            />
            <Text style={styles.statusText}>
              {getStatusText(selectedApplication.status || 'pending')}
            </Text>
          </View>
        </View>

        {/* Personal Information */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>INFORMATIONS PERSONNELLES</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nom complet:</Text>
            <Text style={styles.infoValue}>
              {selectedApplication.applicantInfo?.firstName || selectedApplication.firstName} {selectedApplication.applicantInfo?.lastName || selectedApplication.lastName}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Email:</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.infoValue}>{selectedApplication.applicantInfo?.email || selectedApplication.email}</Text>
              {((selectedApplication.applicantInfo?.email || selectedApplication.email) && userEmails.has((selectedApplication.applicantInfo?.email || selectedApplication.email).toLowerCase())) ? (
                <View style={[styles.emailIndicator, { backgroundColor: '#4CAF50', marginLeft: 8 }]} />
              ) : (
                <View style={[styles.emailIndicator, { backgroundColor: '#BDBDBD', marginLeft: 8 }]} />
              )}
            </View>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Téléphone:</Text>
            <Text style={styles.infoValue}>{selectedApplication.applicantInfo?.phone || selectedApplication.phone || 'N/A'}</Text>
          </View>
        </View>

        {/* Business Information */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>INFORMATIONS ENTREPRISE</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Nom d'entreprise:</Text>
            <Text style={styles.infoValue}>{selectedApplication.businessInfo?.businessName || selectedApplication.businessName || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Catégorie:</Text>
            <Text style={styles.infoValue}>{selectedApplication.businessInfo?.category || selectedApplication.serviceType || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Adresse:</Text>
            <Text style={styles.infoValue}>{selectedApplication.businessInfo?.address || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Ville:</Text>
            <Text style={styles.infoValue}>{selectedApplication.businessInfo?.city || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Pays:</Text>
            <Text style={styles.infoValue}>{selectedApplication.businessInfo?.country || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Description:</Text>
            <Text style={[styles.infoValue, styles.descriptionText]}>
              {selectedApplication.businessInfo?.description || selectedApplication.description || 'Aucune description fournie'}
            </Text>
          </View>
        </View>

        {/* Application Details */}
        <View style={styles.detailsSection}>
          <Text style={styles.sectionTitle}>DÉTAILS DE LA CANDIDATURE</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date de soumission:</Text>
            <Text style={styles.infoValue}>
              {formatDate(selectedApplication.createdAt)}
            </Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Dernière mise à jour:</Text>
            <Text style={styles.infoValue}>
              {formatDate(selectedApplication.updatedAt)}
            </Text>
          </View>
        </View>

        {/* Status Update Buttons */}
        <View style={styles.actionsSection}>
          <Text style={styles.sectionTitle}>ACTIONS</Text>
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#FFC107' }]}
              onPress={() => updateApplicationStatus(selectedApplication.id, 'pending')}
              disabled={updatingStatus}
            >
              <Ionicons name="time-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>En Attente</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#2196F3' }]}
              onPress={() => updateApplicationStatus(selectedApplication.id, 'on_work')}
              disabled={updatingStatus}
            >
              <Ionicons name="cog-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>En Cours</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#4CAF50' }]}
              onPress={() => updateApplicationStatus(selectedApplication.id, 'accepted')}
              disabled={updatingStatus}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Acceptée</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: '#F44336' }]}
              onPress={() => updateApplicationStatus(selectedApplication.id, 'rejected')}
              disabled={updatingStatus}
            >
              <Ionicons name="close-circle-outline" size={20} color="#fff" />
              <Text style={styles.actionButtonText}>Rejetée</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#667eea" />
        <Text style={styles.loadingText}>Chargement des candidatures...</Text>
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
        <Text style={styles.headerTitle}>Candidatures Partenaires</Text>
        <View style={styles.placeholder} />
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom ou email"
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
          returnKeyType="search"
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity style={styles.clearButton} onPress={() => setSearchQuery('')}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {filteredApplications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="person-add-outline" size={80} color="#ccc" />
          <Text style={styles.emptyText}>Aucune candidature trouvée</Text>
          <Text style={styles.emptySubtext}>
            Les nouvelles candidatures de partenaires apparaîtront ici
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredApplications}
          renderItem={renderApplicationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                fetchApplications();
              }}
              colors={['#667eea']}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Application Details Modal */}
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
            <Text style={styles.modalTitle}>Détails de la Candidature</Text>
            <View style={styles.placeholder} />
          </View>
          {renderApplicationDetails()}
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
    height: Platform.OS === 'ios' ? 48 : 50,
    paddingTop: Platform.OS === 'ios' ? 10 : 0,
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#f8f9fa',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
    color: '#333',
    elevation: 1,
  },
  clearButton: {
    marginLeft: 8,
    padding: 6,
  },
  applicationCard: {
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
  applicationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  applicantInfo: {
    flex: 1,
    marginRight: 10,
  },
  applicantName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4,
  },
  applicantEmail: {
    fontSize: 14,
    color: '#667eea',
  },
  emailIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginLeft: 8,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#fff',
    marginLeft: 4,
  },
  applicationInfo: {
    marginBottom: 10,
  },
  businessName: {
    fontSize: 14,
    color: '#333',
    marginBottom: 4,
  },
  serviceType: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  applicationDate: {
    fontSize: 12,
    color: '#999',
  },
  applicationFooter: {
    alignItems: 'flex-end',
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

  // Details Styles
  detailsContainer: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  detailsHeader: {
    backgroundColor: '#fff',
    margin: 15,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  detailsTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  detailsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 15,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    letterSpacing: 0.5,
    marginBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
  },
  infoRow: {
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    color: '#333',
  },
  descriptionText: {
    lineHeight: 22,
  },
  actionsSection: {
    backgroundColor: '#fff',
    marginHorizontal: 15,
    marginBottom: 30,
    borderRadius: 12,
    padding: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 10,
    minWidth: '48%',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginLeft: 6,
  },
});

export default PartnerApplications;

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, ActivityIndicator, Modal, TextInput, Image } from 'react-native'; // ADDED: Image
import { Ionicons } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere
import { useNavigation } from '@react-navigation/native';
import { db, auth } from '../../firebase';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc,
  arrayUnion,
  arrayRemove,
  getDoc
} from 'firebase/firestore';
import DateTimePicker from '@react-native-community/datetimepicker';

// --- NEW: Import your custom icons ---
const REFRESH_ICON = require('../../assets/icons/refresh.png'); // For refresh button
const ADD_ICON_PARTNER = require('../../assets/icons/add_circle.png'); // For add partner button
const SEARCH_ICON = require('../../assets/icons/search.png'); // For search input
const BUSINESS_OUTLINE_ICON = require('../../assets/icons/business_outline.png'); // For partner icon container
const ROCKET_ICON = require('../../assets/icons/rocket.png'); // For promote button
const PERSON_REMOVE_ICON = require('../../assets/icons/remove_user.png'); // For unassign button
const PERSON_ADD_ICON = require('../../assets/icons/add_user.png'); // For assign button
const ARROW_BACK_ICON = require('../../assets/icons/back_circle.png'); // For modal back button
const INFORMATION_CIRCLE_OUTLINE_ICON = require('../../assets/icons/infos.png'); // For promotion status
const CLOSE_CIRCLE_OUTLINE_ICON = require('../../assets/icons/close_circle.png'); // For promotion status
const TIME_OUTLINE_ICON = require('../../assets/icons/sablier.png'); // For promotion status
const CHECKMARK_CIRCLE_OUTLINE_ICON = require('../../assets/icons/check_full.png'); // For promotion status
// --- END NEW IMPORTS ---

const Partners = () => {
  const navigation = useNavigation();
  const [partners, setPartners] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userLoading, setUserLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [assignModalVisible, setAssignModalVisible] = useState(false);
  const [promoteModalVisible, setPromoteModalVisible] = useState(false);
  const [currentPartner, setCurrentPartner] = useState(null);
  const [userSearchQuery, setUserSearchQuery] = useState('');
  const [promotionDuration, setPromotionDuration] = useState(14);
  const [promotionEndDate, setPromotionEndDate] = useState(null);
  const [showDatePicker, setShowDatePicker] = useState(false);

  // --- NEW: Function to send push notification with custom sound ---
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
      console.log('Push notification sent successfully from Partners.js!');
    } catch (error) {
      console.error('Failed to send push notification from Partners.js:', error);
    }
  };
  // --- END NEW ---

  // Function to fetch data (partners and users)
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [partnersQuery, usersQuery] = await Promise.all([
        getDocs(collection(db, 'partners')),
        getDocs(collection(db, 'users'))
      ]);

      // Map document snapshots to array of objects with 'id'
      setPartners(partnersQuery.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setUsers(usersQuery.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
      Alert.alert("Erreur", "Échec du chargement des données. Veuillez réessayer.");
      console.error("Erreur lors du chargement des données:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Effect to fetch data on component mount and when fetchData callback changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filter partners based on search query and updated French keys (ceo, manager)
  const filteredPartners = partners.filter(partner => {
    const searchLower = searchQuery.toLowerCase();
    return (
      partner.nom?.toLowerCase().includes(searchLower) ||
      partner.categorie?.toLowerCase().includes(searchLower) ||
      partner.ceo?.toLowerCase().includes(searchLower) ||
      partner.manager?.toLowerCase().includes(searchLower) ||
      partner.description?.toLowerCase().includes(searchLower) ||
      partner.email?.toLowerCase().includes(searchLower) ||
      partner.numeroTelephone?.toLowerCase().includes(searchLower)
    );
  });

  // Filter users for the assignment modal
  const filteredUsers = users.filter(user => {
    const searchLower = userSearchQuery.toLowerCase();
    return (
      user.name?.toLowerCase().includes(searchLower) ||
      user.email?.toLowerCase().includes(searchLower)
    );
  });

  const handleAssignUser = async (userId) => {
    if (!currentPartner || !currentPartner.id) {
        Alert.alert("Erreur", "Partenaire non sélectionné pour l'affectation.");
        return;
    }
    try {
      setUserLoading(true);
      const selectedUser = users.find(user => user.id === userId);

      // Update partner document with assigned user info
      const partnerRef = doc(db, 'partners', currentPartner.id);
      await updateDoc(partnerRef, {
        assignedUserId: userId,
        assignedUserName: selectedUser.name,
        assignedUserEmail: selectedUser.email,
        assignedUserPhotoURL: selectedUser.photoURL || null, // Ensure photoURL is saved
        assignedDate: new Date().toISOString()
      });

      // Update user document with partner info
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        role: "Partner",
        isPartner: true,
        partnerId: currentPartner.id,
        partnerName: currentPartner.nom,
        partners: arrayUnion({
          id: currentPartner.id,
          nom: currentPartner.nom,
          categorie: currentPartner.categorie,
          assignedDate: new Date().toISOString()
        })
      });

      Alert.alert("Succès", `Assigné à ${selectedUser.name} avec succès.`);
      closeModals();
      fetchData();

      if (selectedUser.expoPushToken) {
        sendPushNotification(
          selectedUser.expoPushToken,
          "Nouveau rôle de partenaire EliteReply!",
          `Félicitations ! Vous avez été assigné comme partenaire pour ${currentPartner.nom}.`,
          { type: 'partner_role_assigned', partnerId: currentPartner.id }
        );
      }

    } catch (error) {
      Alert.alert("Erreur", error.message);
      console.error("Erreur lors de l'affectation de l'utilisateur:", error);
    } finally {
      setUserLoading(false);
    }
  };

  const handleUnassignUser = async (partnerId) => {
    try {
      const partner = partners.find(p => p.id === partnerId);
      if (!partner) {
        console.warn(`Partenaire avec l'ID ${partnerId} non trouvé dans l'état.`);
        Alert.alert("Erreur", "Partenaire introuvable dans la liste. Impossible de désaffecter.");
        return;
      }
      if (!partner.assignedUserId) {
          Alert.alert("Info", `${partner.nom} n'est actuellement pas affecté à un utilisateur.`);
          return;
      }

      let unassignedUserToken = null;
      let unassignedUserName = partner.assignedUserName;
      const userToUnassignRef = doc(db, 'users', partner.assignedUserId);
      const userToUnassignSnap = await getDoc(userToUnassignRef);
      if (userToUnassignSnap.exists()) {
          unassignedUserToken = userToUnassignSnap.data().expoPushToken;
          unassignedUserName = userToUnassignSnap.data().name || partner.assignedUserName;
      }

      const partnerRef = doc(db, 'partners', partnerId);
      await updateDoc(partnerRef, {
        assignedUserId: null,
        assignedUserName: null,
        assignedUserEmail: null,
        assignedUserPhotoURL: null, // Clear photoURL on unassign
        assignedDate: null,
        estPromu: false,
        promotionStartDate: null,
        promotionEndDate: null,
        promotionDuration: null
      });

      if (userToUnassignSnap.exists()) {
        const userData = userToUnassignSnap.data();
        const userPartners = userData.partners || [];

        const itemToRemove = userPartners.find(p => p.id === partner.id);

        if (itemToRemove) {
          await updateDoc(userToUnassignRef, {
            role: "User",
            isPartner: false,
            partnerId: null,
            partnerName: null,
            partners: arrayRemove(itemToRemove)
          });
        } else {
            console.warn(`Partenaire ID ${partner.id} non trouvé dans le tableau des partenaires de l'utilisateur pour suppression. Effacement des données du partenaire de l'utilisateur.`);
            await updateDoc(userToUnassignRef, {
              role: "User",
              isPartner: false,
              partnerId: null,
              partnerName: null,
            });
        }
      } else {
          console.warn("Document utilisateur non trouvé pour la désaffectation:", partner.assignedUserId);
      }

      Alert.alert("Succès", "Désaffecté avec succès.");
      closeModals();
      fetchData();

      if (unassignedUserToken) {
        sendPushNotification(
          unassignedUserToken,
          "Mise à jour du rôle EliteReply",
          `Votre rôle de partenaire pour ${partner.nom} a été révoqué.`,
          { type: 'partner_role_unassigned', partnerId: partner.id }
        );
      }

    } catch (error) {
      Alert.alert("Erreur", error.message);
      console.error("Erreur lors de la désaffectation:", error);
    }
  };

  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setPromotionEndDate(selectedDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffTime = Math.abs(selectedDate.getTime() - today.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      setPromotionDuration(diffDays);
    }
  };

  const handlePromotePartner = async () => {
    if (!currentPartner) return;

    try {
      setUserLoading(true);
      const partnerRef = doc(db, 'partners', currentPartner.id);

      const startDate = new Date();
      startDate.setHours(0, 0, 0, 0);

      const calculatedEndDate = promotionEndDate || new Date(startDate.getTime() + promotionDuration * 24 * 60 * 60 * 1000);
      calculatedEndDate.setHours(23, 59, 59, 999);

      await updateDoc(partnerRef, {
        estPromu: true,
        promotionStartDate: startDate.toISOString(),
        promotionEndDate: calculatedEndDate.toISOString(),
        promotionDuration: promotionDuration
      });

      Alert.alert("Succès", `${currentPartner.nom} a été promu avec succès !`);
      closeModals();
      fetchData();

      if (currentPartner.assignedUserId) {
        const assignedUserDoc = await getDoc(doc(db, 'users', currentPartner.assignedUserId));
        if (assignedUserDoc.exists() && assignedUserDoc.data().expoPushToken) {
          sendPushNotification(
            assignedUserDoc.data().expoPushToken,
            "Félicitations! Partenaire Promu!",
            `Le partenaire ${currentPartner.nom} a été promu pour une durée de ${promotionDuration} jours!`,
            { type: 'partner_promoted', partnerId: currentPartner.id }
          );
        }
      }

    } catch (error) {
      Alert.alert("Erreur", error.message);
      console.error("Erreur lors de la promotion du partenaire:", error);
    } finally {
      setUserLoading(false);
    }
  };

  const renderUserItem = ({ item }) => {
    const isAssignedToCurrent = currentPartner?.assignedUserId === item.id;
    const isAssignedElsewhere = item.isPartner && !isAssignedToCurrent;

    return (
      <TouchableOpacity
        style={[
          styles.userItem,
          isAssignedToCurrent && styles.assignedUserItem,
          isAssignedElsewhere && styles.assignedElsewhereItem
        ]}
        onPress={() => {
          if (isAssignedToCurrent) {
            Alert.alert(
              "Confirmer la désaffectation",
              `Êtes-vous sûr de vouloir désaffecter ${item.name} de ${currentPartner.nom}?`,
              [
                { text: "Annuler", style: "cancel" },
                { text: "Désaffecter", onPress: () => handleUnassignUser(currentPartner.id), style: "destructive" }
              ]
            );
          } else if (!item.isPartner) {
            handleAssignUser(item.id);
          }
        }}
        disabled={userLoading || isAssignedElsewhere}
      >
        <View style={styles.userInfo}>
          <Text style={styles.userName}>{item.name}</Text>
          <Text style={styles.userEmail}>{item.email}</Text>

          {isAssignedToCurrent && (
            <Text style={styles.assignedStatus}>Actuellement assigné</Text>
          )}

          {isAssignedElsewhere && (
            <Text style={styles.otherAssignmentStatus}>
              Assigné à: {item.partnerName || 'Un autre partenaire'}
            </Text>
          )}
        </View>

        {userLoading && isAssignedToCurrent ? (
          <ActivityIndicator size="small" color="#0a8fdf" />
        ) : (
          // --- MODIFIED: Use custom image for person-add/remove icons ---
          <Image
            source={isAssignedToCurrent ? PERSON_REMOVE_ICON : PERSON_ADD_ICON}
            style={[
              styles.customUserActionIcon,
              { tintColor: isAssignedToCurrent ? "#FF3B30" : isAssignedElsewhere ? "#ccc" : "#0a8fdf" }
            ]}
          />
          // --- END MODIFIED ---
        )}
      </TouchableOpacity>
    );
  };

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
      return { color: '#FF9500', text: `Promo: ${diffDays} jours restants`, iconColor: '#FF9500', iconName: 'time-outline' };
    } else {
      return { color: '#34C759', text: `Promo: ${diffDays} jours restants`, iconColor: '#34C759', iconName: 'checkmark-circle-outline' };
    }
  };

  const renderItem = ({ item }) => {
    const promotionStatus = getPromotionStatus(item);

    return (
      <TouchableOpacity
        style={styles.partnerItem}
        onPress={() => navigation.navigate("PartnerDetails", { partnerId: item.id })}
      >
        <View style={styles.partnerIconContainer}>
            {item.assignedUserPhotoURL ? ( // Conditional rendering for assigned user photo
                <Image source={{ uri: item.assignedUserPhotoURL }} style={styles.partnerLogo} />
            ) : (
                // --- MODIFIED: Use custom image for business icon ---
                <Image source={BUSINESS_OUTLINE_ICON} style={styles.customPartnerIcon} />
                // --- END MODIFIED ---
            )}
        </View>

        <View style={styles.partnerInfo}>
          <Text style={styles.partnerName}>{item.nom}</Text>
          <Text style={styles.partnerCategory}>{item.categorie}</Text>
          {item.ceo && (
             <Text style={styles.partnerDetailsText}>CEO: {item.ceo}</Text>
          )}
          {item.manager && (
            <Text style={styles.partnerDetailsText}>Manager: {item.manager}</Text>
          )}
          {item.assignedUserName && (
            <Text style={styles.assignedUser}>Assigné à: {item.assignedUserName}</Text>
          )}
          {item.estPromu && (
            <Text style={[styles.promotionDelayText, { color: promotionStatus.color }]}>
              {/* --- MODIFIED: Use custom image for promotion status icon --- */}
              <Image
                source={
                  promotionStatus.iconName === 'information-circle-outline' ? INFORMATION_CIRCLE_OUTLINE_ICON :
                  promotionStatus.iconName === 'close-circle-outline' ? CLOSE_CIRCLE_OUTLINE_ICON :
                  promotionStatus.iconName === 'time-outline' ? TIME_OUTLINE_ICON :
                  CHECKMARK_CIRCLE_OUTLINE_ICON // Default to checkmark
                }
                style={[styles.customPromotionStatusIcon, { tintColor: promotionStatus.iconColor }]}
              />
              {/* --- END MODIFIED --- */}
              {' '}
              {promotionStatus.text}
            </Text>
          )}
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: promotionStatus.iconColor }]}
            onPress={(e) => {
              e.stopPropagation();
              setCurrentPartner(item);
              setPromotionDuration(item.promotionDuration || 14);
              setPromotionEndDate(item.promotionEndDate ? new Date(item.promotionEndDate) : null);
              setPromoteModalVisible(true);
            }}
            accessibilityLabel={`Promouvoir ${item.nom}`}
          >
            {/* --- MODIFIED: Use custom image for rocket icon --- */}
            <Image source={ROCKET_ICON} style={styles.customActionButtonIcon} />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, item.assignedUserId ? styles.unassignButton : styles.assignButton]}
            onPress={(e) => {
              e.stopPropagation();
              item.assignedUserId
                ? Alert.alert(
                    "Confirmer la désaffectation",
                    `Êtes-vous sûr de vouloir désaffecter ${item.assignedUserName} de ${item.nom}?`,
                    [
                      { text: "Annuler", style: "cancel" },
                      { text: "Désaffecter", onPress: () => handleUnassignUser(item.id), style: "destructive" }
                    ]
                  )
                : openAssignModal(item);
            }}
            accessibilityLabel={item.assignedUserId ? `Désaffecter ${item.assignedUserName} de ${item.nom}` : `Assigner un utilisateur à ${item.nom}`}
          >
            {/* --- MODIFIED: Use custom image for person-add/remove icons --- */}
            <Image
              source={item.assignedUserId ? PERSON_REMOVE_ICON : PERSON_ADD_ICON}
              style={styles.customActionButtonIcon}
            />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  const openAssignModal = (partner) => {
    setCurrentPartner(partner);
    setAssignModalVisible(true);
  };

  const closeModals = () => {
    setAssignModalVisible(false);
    setPromoteModalVisible(false);
    setCurrentPartner(null);
    setUserSearchQuery('');
    setPromotionDuration(14);
    setPromotionEndDate(null);
    setShowDatePicker(false);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>
          Partenaires ({filteredPartners.length})
        </Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={styles.refreshButton}
            onPress={fetchData}
            accessibilityLabel="Actualiser la liste des partenaires"
          >
            {/* --- MODIFIED: Use custom image for refresh icon --- */}
            <Image source={REFRESH_ICON} style={styles.customHeaderButtonIcon} />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => navigation.navigate("AddPartner")}
            accessibilityLabel="Ajouter un nouveau partenaire"
          >
            {/* --- MODIFIED: Use custom image for add icon --- */}
            <Image source={ADD_ICON_PARTNER} style={styles.customAddPartnerButtonIcon} />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        {/* --- MODIFIED: Use custom image for search icon --- */}
        <Image source={SEARCH_ICON} style={styles.customSearchIcon} />
        {/* --- END MODIFIED --- */}
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher des partenaires..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          accessibilityLabel="Champ de recherche de partenaires"
        />
      </View>

      <FlatList
        data={filteredPartners}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.listContainer}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Aucun partenaire trouvé</Text>
          </View>
        }
      />

      {/* Assign User Modal */}
      <Modal
        animationType="slide"
        transparent={false}
        visible={assignModalVisible}
        onRequestClose={closeModals}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={closeModals} accessibilityLabel="Retourner à la liste des partenaires">
              {/* --- MODIFIED: Use custom image for back arrow --- */}
              <Image source={ARROW_BACK_ICON} style={styles.customModalBackIcon} />
              {/* --- END MODIFIED --- */}
            </TouchableOpacity>
            <Text style={styles.modalTitle}>
              {currentPartner?.nom || 'Assigner un Partenaire'}
            </Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.searchContainer}>
            {/* --- MODIFIED: Use custom image for search icon --- */}
            <Image source={SEARCH_ICON} style={styles.customSearchIcon} />
            {/* --- END MODIFIED --- */}
            <TextInput
              style={styles.searchInput}
              placeholder="Rechercher des utilisateurs..."
              value={userSearchQuery}
              onChangeText={setUserSearchQuery}
              autoFocus
              accessibilityLabel="Champ de recherche d'utilisateurs"
            />
          </View>

          <View style={styles.modalSubheader}>
            <Text style={styles.modalSubtitle}>
              {currentPartner?.assignedUserName
                ? `Actuellement assigné à: ${currentPartner.assignedUserName}`
                : 'Non assigné actuellement'}
            </Text>
          </View>

          <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>Aucun utilisateur trouvé</Text>
              </View>
            }
          />
        </View>
      </Modal>

      {/* Promote Partner Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={promoteModalVisible}
        onRequestClose={closeModals}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.promotionModal}>
            <Text style={styles.modalTitle}>Promouvoir le Partenaire</Text>
            <Text style={styles.modalSubtitle}>{currentPartner?.nom}</Text>

            <View style={styles.durationOptions}>
              <TouchableOpacity
                style={[
                  styles.durationOption,
                  promotionDuration === 14 && !promotionEndDate && styles.selectedOption
                ]}
                onPress={() => {
                  setPromotionDuration(14);
                  setPromotionEndDate(null);
                }}
                accessibilityLabel="Option de promotion de 2 semaines"
              >
                <Text style={styles.optionText}>2 Semaines</Text>
                <Text style={styles.optionSubtext}>Promotion Standard</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.durationOption,
                  promotionDuration === 30 && !promotionEndDate && styles.selectedOption
                ]}
                onPress={() => {
                  setPromotionDuration(30);
                  setPromotionEndDate(null);
                }}
                accessibilityLabel="Option de promotion d'1 mois"
              >
                <Text style={styles.optionText}>1 Mois</Text>
                <Text style={styles.optionSubtext}>Promotion Étendue</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.customDateOption,
                  promotionEndDate && styles.selectedOption
                ]}
                onPress={() => setShowDatePicker(true)}
                accessibilityLabel="Sélectionner une date de promotion personnalisée"
              >
                <Text style={styles.optionText}>
                  {promotionEndDate
                    ? `Personnalisé: ${promotionDuration} jours (jusqu'au ${promotionEndDate.toLocaleDateString()})`
                    : 'Sélectionner une date personnalisée'}
                </Text>
              </TouchableOpacity>
            </View>

            {showDatePicker && (
              <DateTimePicker
                value={promotionEndDate || new Date()}
                mode="date"
                display="default"
                onChange={handleDateChange}
                minimumDate={new Date()}
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={closeModals}
                accessibilityLabel="Annuler la promotion"
              >
                <Text style={styles.buttonText}>Annuler</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton]}
                onPress={handlePromotePartner}
                disabled={userLoading}
                accessibilityLabel="Confirmer la promotion du partenaire"
              >
                {userLoading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={[styles.buttonText, { color: '#fff' }]}>Confirmer la promotion</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    flex: 1,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  refreshButton: {
    marginRight: 10,
    padding: 5,
  },
  // --- NEW STYLE for custom refresh button icon ---
  customHeaderButtonIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#0a8fdf', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  addButton: {
    backgroundColor: '#0a8fdf',
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  // --- NEW STYLE for custom add partner button icon ---
  customAddPartnerButtonIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 16,
  },
  // --- NEW STYLE for custom search icon ---
  customSearchIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#999', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 16,
  },
  listContainer: {
    paddingBottom: 20,
  },
  partnerItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  partnerIconContainer: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 16,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#E6F7FF',
    borderWidth: 1,
    borderColor: '#0a8fdf',
    overflow: 'hidden', // Crucial to clip the image to the rounded border
  },
  // --- NEW STYLE for custom partner icon (business-outline) ---
  customPartnerIcon: {
    width: 30, // Match Ionicons size
    height: 30, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#0a8fdf', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  // NEW STYLE: For the partner's logo (assigned user's photo)
  partnerLogo: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover', // Ensures the image covers the container
    borderRadius: 25, // Apply border radius to the image itself
  },
  partnerInfo: {
    flex: 1,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  partnerCategory: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  partnerDetailsText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  assignedUser: {
    fontSize: 14,
    color: '#0a8fdf',
    marginTop: 4,
    fontStyle: 'italic',
  },
  promotionDelayText: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 4,
  },
  // --- NEW STYLE for custom promotion status icons ---
  customPromotionStatusIcon: {
    width: 12, // Match Ionicons size
    height: 12, // Match Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
  actionButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  // --- NEW STYLE for custom action button icons (rocket, person-add/remove) ---
  customActionButtonIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  promoteButton: {
    backgroundColor: '#FF9500',
  },
  assignButton: {
    backgroundColor: '#0a8fdf',
  },
  unassignButton: {
    backgroundColor: '#FF3B30',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    minHeight: 150,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
    textAlign: 'center',
  },
  modalContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f8f9fa',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  modalSubheader: {
    marginBottom: 16,
    alignItems: 'center',
  },
  modalSubtitle: {
    fontSize: 16,
    color: '#666',
    fontWeight: '500',
  },
  userItem: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  assignedUserItem: {
    backgroundColor: '#e6f7ff',
    borderLeftWidth: 4,
    borderLeftColor: '#0a8fdf',
  },
  assignedElsewhereItem: {
    backgroundColor: '#f9f9f9',
    opacity: 0.6,
    borderLeftWidth: 4,
    borderLeftColor: '#ccc',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2D3748',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
  },
  assignedStatus: {
    fontSize: 12,
    color: '#0a8fdf',
    marginTop: 4,
    fontWeight: 'bold',
  },
  otherAssignmentStatus: {
    fontSize: 12,
    color: '#FF9500',
    marginTop: 4,
    fontStyle: 'italic',
  },
  // --- NEW STYLE for custom user action icons (person-add/remove in modal) ---
  customUserActionIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  promotionModal: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxWidth: 450,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 10,
  },
  durationOptions: {
    marginVertical: 15,
  },
  durationOption: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginBottom: 10,
    backgroundColor: '#fdfdff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  selectedOption: {
    borderColor: '#0a8fdf',
    backgroundColor: '#e6f7ff',
    borderWidth: 2,
  },
  customDateOption: {
    padding: 15,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    backgroundColor: '#fdfdff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  optionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  optionSubtext: {
    fontSize: 13,
    color: '#777',
    marginTop: 4,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    marginRight: 10,
  },
  confirmButton: {
    backgroundColor: '#0a8fdf',
    marginLeft: 10,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
  },
});

export default Partners;
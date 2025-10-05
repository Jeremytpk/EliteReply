import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  Image,
  Modal,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import moment from 'moment';
import 'moment/locale/fr';
import { useNavigation } from '@react-navigation/native';

// Assuming you have a way to get the current user's info
const currentUser = { isAdmin: true, name: 'Agent Smith' };

moment.locale('fr');

const TicketInfo = ({ route }) => {
  const { ticketId } = route.params;
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState(null);
  const [isConversationModalVisible, setIsConversationModalVisible] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    const fetchTicketData = async () => {
      try {
        const ticketDoc = await getDoc(doc(db, 'tickets', ticketId));
        if (ticketDoc.exists()) {
          const ticketData = ticketDoc.data();
          setTicket({
            id: ticketDoc.id,
            ...ticketData,
            createdAt: ticketData.createdAt?.toDate(),
            updatedAt: ticketData.updatedAt?.toDate(),
            termineLe: ticketData.termineLe?.toDate()
          });

          // Fetch user data if available
          if (ticketData.userId) {
            const userDoc = await getDoc(doc(db, 'users', ticketData.userId));
            if (userDoc.exists()) {
              setUserData(userDoc.data());
            }
          }
        }
      } catch (error) {
        console.error("Error fetching ticket:", error);
        Alert.alert("Erreur", "Impossible de charger les informations du ticket");
      } finally {
        setLoading(false);
      }
    };

    fetchTicketData();
  }, [ticketId]);

  const handleChangeStatus = async (newStatus) => {
    try {
      const updateData = {
        status: newStatus,
        updatedAt: new Date()
      };

      // If status is 'terminé', also save the agent's name and the completion timestamp
      if (newStatus === 'terminé') {
        updateData.termineLe = new Date();
        updateData.agentName = currentUser.name;
      }

      await updateDoc(doc(db, 'tickets', ticketId), updateData);
      setTicket(prev => ({ ...prev, ...updateData, termineLe: updateData.termineLe || prev.termineLe }));
      Alert.alert("Succès", `Statut du ticket mis à jour: ${newStatus}`);
    } catch (error) {
      console.error("Error updating status:", error);
      Alert.alert("Erreur", "Impossible de mettre à jour le statut");
    }
  };

  const confirmChangeStatus = (newStatus) => {
    Alert.alert(
      "Confirmer le changement",
      `Voulez-vous vraiment changer le statut en "${newStatus}"?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Confirmer", onPress: () => handleChangeStatus(newStatus) }
      ]
    );
  };
  
  const handleViewPartners = () => {
    navigation.navigate('PartnerList');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Chargement des informations...</Text>
      </View>
    );
  }

  if (!ticket) {
    return (
      <View style={styles.container}>
        <Image 
          source={require('../assets/images/logoFace.png')}
          style={styles.errorImage}
        />
        <Text style={styles.errorText}>Ticket non trouvé</Text>
        <Text style={styles.errorSubtext}>L'identifiant du ticket est invalide</Text>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Header Section */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Détails du Ticket</Text>
        <View style={{ width: 24 }} /> {/* Spacer for alignment */}
      </View>

      {/* Status Badge */}
      <View style={[
        styles.statusBadge,
        ticket.status === 'nouveau' && styles.statusNew,
        ticket.status === 'en-cours' && styles.statusInProgress,
        ticket.status === 'terminé' && styles.statusCompleted
      ]}>
        <Text style={styles.statusText}>{ticket.status.toUpperCase()}</Text>
      </View>

      {/* "Voir Partenaires" Button */}
      {currentUser.isAdmin && (
        <TouchableOpacity 
          style={styles.viewPartnersButton}
          onPress={handleViewPartners}
        >
          <MaterialIcons name="group" size={20} color="#fff" />
          <Text style={styles.viewPartnersButtonText}>Voir la liste des partenaires</Text>
        </TouchableOpacity>
      )}

      {/* "Read Ticket" button for admins */}
      {currentUser.isAdmin && ( // Only show if isAdmin is true
        <TouchableOpacity 
          style={styles.readTicketButton}
          onPress={() => setIsConversationModalVisible(true)} // Open modal on press
        >
          <Ionicons name="chatbubbles-outline" size={20} color="#fff" />
          <Text style={styles.readTicketButtonText}>Lire la conversation</Text>
        </TouchableOpacity>
      )}

      {/* Ticket Information Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Informations de Base</Text>
        
        <View style={styles.infoRow}>
          <MaterialIcons name="person" size={20} color="#6B7280" />
          <Text style={styles.infoLabel}>Demandeur:</Text>
          <Text style={styles.infoValue}>
            {userData?.name || ticket.userName || 'Inconnu'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="category" size={20} color="#6B7280" />
          <Text style={styles.infoLabel}>Catégorie:</Text>
          <Text style={styles.infoValue}>{ticket.category || 'Non spécifiée'}</Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="email" size={20} color="#6B7280" />
          <Text style={styles.infoLabel}>Email:</Text>
          <Text style={styles.infoValue}>
            {userData?.email || ticket.userEmail || 'Non spécifié'}
          </Text>
        </View>

        <View style={styles.infoRow}>
          <MaterialIcons name="phone" size={20} color="#6B7280" />
          <Text style={styles.infoLabel}>Téléphone:</Text>
          <Text style={styles.infoValue}>
            {userData?.phone || ticket.userPhone || 'Non spécifié'}
          </Text>
        </View>
      </View>

      {/* Request Details Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Détails de la Demande</Text>
        
        <View style={styles.messageContainer}>
          <Text style={styles.messageText}>{ticket.message}</Text>
        </View>

        {ticket.imageURL && (
          <View style={styles.imageContainer}>
            <Image 
              source={{ uri: ticket.imageURL }} 
              style={styles.ticketImage}
              resizeMode="contain"
            />
          </View>
        )}
      </View>

      {/* Timeline Card */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Historique</Text>
        
        <View style={styles.timelineItem}>
          <View style={styles.timelineDot} />
          <View style={styles.timelineContent}>
            <Text style={styles.timelineTitle}>Créé le</Text>
            <Text style={styles.timelineDate}>
              {moment(ticket.createdAt).format('LL [à] LT')}
            </Text>
          </View>
        </View>

        {ticket.updatedAt && (
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>Dernière mise à jour</Text>
              <Text style={styles.timelineDate}>
                {moment(ticket.updatedAt).format('LL [à] LT')}
              </Text>
            </View>
          </View>
        )}

        {ticket.termineLe && (
          <View style={styles.timelineItem}>
            <View style={styles.timelineDot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineTitle}>
                Terminé le
                {ticket.agentName && <Text style={styles.agentNameText}> par: {ticket.agentName}</Text>}
              </Text>
              <Text style={styles.timelineDate}>
                {moment(ticket.termineLe).format('LL [à] LT')}
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* Agent Actions (only if ticket is not completed) */}
      {ticket.status !== 'terminé' && (
        <View style={styles.actionsContainer}>
          <Text style={styles.actionsTitle}>Actions</Text>
          
          <View style={styles.buttonsRow}>
            {ticket.status !== 'en-cours' && (
              <TouchableOpacity 
                style={[styles.actionButton, styles.actionButtonPrimary]}
                onPress={() => confirmChangeStatus('en-cours')}
              >
                <Text style={styles.actionButtonText}>Prendre en charge</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity 
              style={[styles.actionButton, styles.actionButtonDanger]}
              onPress={() => confirmChangeStatus('terminé')}
            >
              <Text style={styles.actionButtonText}>Terminer le ticket</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Conversation Modal */}
      <Modal
        animationType="slide"
        transparent={true}
        visible={isConversationModalVisible}
        onRequestClose={() => {
          setIsConversationModalVisible(!isConversationModalVisible);
        }}
      >
        <View style={styles.centeredView}>
          <View style={styles.modalView}>
            <Text style={styles.modalTitle}>Conversation du Ticket</Text>
            <ScrollView style={styles.conversationScroll}>
              <View style={styles.conversationMessageContainer}>
                <Text style={styles.conversationSender}>Demandeur:</Text>
                <Text style={styles.conversationText}>{ticket.message}</Text>
                <Text style={styles.conversationTime}>
                  {moment(ticket.createdAt).format('DD/MM/YYYY HH:mm')}
                </Text>
              </View>
              <Text style={styles.noConversationText}>
                (Future: Additional messages will appear here)
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={[styles.button, styles.buttonClose]}
              onPress={() => setIsConversationModalVisible(!isConversationModalVisible)}
            >
              <Text style={styles.textStyle}>Fermer</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  contentContainer: {
    paddingBottom: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    margin: 16,
    marginBottom: 8,
  },
  statusNew: {
    backgroundColor: '#EA4335',
  },
  statusInProgress: {
    backgroundColor: '#FBBC05',
  },
  statusCompleted: {
    backgroundColor: '#34C759',
  },
  statusText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  infoLabel: {
    marginLeft: 8,
    marginRight: 4,
    color: '#6B7280',
    fontSize: 14,
  },
  infoValue: {
    flex: 1,
    color: '#2C2C2C',
    fontSize: 14,
    fontWeight: '500',
  },
  messageContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  messageText: {
    color: '#4B5563',
    fontSize: 14,
    lineHeight: 20,
  },
  imageContainer: {
    marginTop: 12,
    alignItems: 'center',
  },
  ticketImage: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  timelineItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#34C759',
    marginRight: 12,
    marginTop: 4,
  },
  timelineContent: {
    flex: 1,
  },
  timelineTitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 2,
  },
  timelineDate: {
    fontSize: 14,
    color: '#2C2C2C',
    fontWeight: '500',
  },
  agentNameText: {
    fontWeight: 'bold',
    color: '#333',
  },
  actionsContainer: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 16,
  },
  actionsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 12,
  },
  buttonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  actionButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  actionButtonPrimary: {
    backgroundColor: '#4285F4',
  },
  actionButtonDanger: {
    backgroundColor: '#EA4335',
  },
  actionButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  errorImage: {
    width: 150,
    height: 150,
    alignSelf: 'center',
    marginBottom: 20,
  },
  errorText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#2C2C2C',
    textAlign: 'center',
    marginBottom: 10,
  },
  errorSubtext: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
  },
  backButton: {
    backgroundColor: '#34C759',
    padding: 15,
    borderRadius: 8,
    alignSelf: 'center',
  },
  backButtonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
  viewPartnersButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  viewPartnersButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
  },
  readTicketButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a8fdf',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  readTicketButtonText: {
    color: '#fff',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 16,
  },
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalView: {
    margin: 20,
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#333',
  },
  conversationScroll: {
    width: '100%',
    maxHeight: 300,
    marginBottom: 20,
  },
  conversationMessageContainer: {
    backgroundColor: '#f0f2f5',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
  },
  conversationSender: {
    fontWeight: 'bold',
    color: '#0a8fdf',
    marginBottom: 5,
  },
  conversationText: {
    fontSize: 15,
    color: '#444',
  },
  conversationTime: {
    fontSize: 12,
    color: '#888',
    textAlign: 'right',
    marginTop: 5,
  },
  noConversationText: {
    textAlign: 'center',
    color: '#666',
    fontStyle: 'italic',
    marginTop: 10,
  },
  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
  },
  buttonClose: {
    backgroundColor: '#2196F3',
  },
  textStyle: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  },
});

export default TicketInfo;
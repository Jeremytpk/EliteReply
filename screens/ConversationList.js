import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Image,
  ActivityIndicator,
  RefreshControl,
  Alert
} from 'react-native';
import { collection, query, where, onSnapshot, orderBy, limit, doc, deleteDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, auth } from '../firebase';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

const ListeConversations = () => {
  const [conversations, setConversations] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [actualisation, setActualisation] = useState(false);
  const navigation = useNavigation();

  useEffect(() => {
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      setChargement(false);
      console.log("No current user, not fetching conversations.");
      return;
    }
    console.log("Logged-in user UID:", utilisateur.uid);

    const q = query(
      collection(db, 'tickets'),
      where('userId', '==', utilisateur.uid),
      orderBy('lastUpdated', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q,
      (snapshot) => {
        console.log("Firestore snapshot received. Number of documents:", snapshot.docs.length);
        const convos = snapshot.docs
          .map(doc => {
            const data = doc.data();
            console.log("Processing doc:", doc.id, "userId:", data.userId, "status:", data.status, "message:", data.message);
            return {
              id: doc.id,
              ...data,
              lastUpdated: data.lastUpdated?.toDate() || new Date(0)
            };
          })
          .filter(conv => conv.status !== 'terminé'); // <--- ADDED FILTER HERE

        console.log("Conversations array length after map and filter:", convos.length);
        setConversations(convos);
        setChargement(false);
        setActualisation(false);
      },
      (error) => {
        console.error("Erreur conversations:", error);
        Alert.alert('Erreur', 'Impossible de charger les conversations');
        setChargement(false);
        setActualisation(false);
      }
    );

    return unsubscribe;
  }, []);

  const onActualiser = () => {
    setActualisation(true);
    const utilisateur = auth.currentUser;
    if (!utilisateur) {
      setActualisation(false);
      return;
    }

    const q = query(
      collection(db, 'tickets'),
      where('userId', '==', utilisateur.uid),
      orderBy('lastUpdated', 'desc'),
      limit(50)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const convos = snapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data(),
          lastUpdated: doc.data().lastUpdated?.toDate() || new Date(0)
        }))
        .filter(conv => conv.status !== 'terminé'); // <--- ADDED FILTER HERE AGAIN

      setConversations(convos);
      setActualisation(false);
    }, (error) => {
      console.error("Erreur actualisation:", error);
      Alert.alert('Erreur', 'Impossible d\'actualiser les conversations');
      setActualisation(false);
    });

    return unsubscribe;
  };

  const supprimerConversation = async (conversationId, statut) => {
    if (statut !== 'terminé') {
      Alert.alert(
        'Action non autorisée',
        'Vous ne pouvez supprimer que les conversations terminées.',
        [{ text: 'OK' }]
      );
      return;
    }

    Alert.alert(
      'Confirmer la suppression',
      'Cette action supprimera définitivement la conversation et son historique. Continuer?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              setChargement(true);
              const functions = getFunctions();
              const deleteTicketAndMessages = httpsCallable(functions, 'deleteTicketAndMessages');

              await deleteTicketAndMessages({ ticketId: conversationId });

              try {
                // This line will now delete the conversation from the 'conversations' collection.
                // Since the ticket in 'tickets' collection is marked 'terminé' and then potentially archived by a cloud function,
                // the onSnapshot will naturally remove it from the list.
                // The actual deletion of the ticket itself (from the 'tickets' collection) is typically handled server-side
                // after archiving, or if a ticket is immediately deleted without archiving.
                // Assuming 'deleteTicketAndMessages' cloud function handles the 'tickets' collection deletion,
                // this might be redundant or for the 'conversations' shadow collection.
                await deleteDoc(doc(db, 'conversations', conversationId));
              } catch (convError) {
                console.warn("Conversation document already deleted or error deleting from 'conversations':", convError.message);
              }

              Alert.alert('Succès', 'Conversation supprimée avec succès.');
              // The onSnapshot will automatically update the conversations state
              // setConversations(prev => prev.filter(conv => conv.id !== conversationId)); // This line might become redundant due to onSnapshot

            } catch (error) {
              console.error("Erreur suppression:", error);
              let errorMessage = 'La suppression a échoué.';
              if (error.code === 'permission-denied') {
                errorMessage = 'Vous n\'êtes pas autorisé à supprimer cette conversation.';
              } else if (error.code === 'failed-precondition') {
                errorMessage = error.message;
              }
              Alert.alert('Erreur', errorMessage);
            } finally {
              setChargement(false);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const nomsParticipants = item.participantNames?.filter(
      name => name !== auth.currentUser?.displayName
    ).join(', ') || 'EliteReply';

    let statusDisplayText;
    switch (item.status) {
      case 'nouveau':
        statusDisplayText = 'NOUVEAU';
        break;
      case 'en-cours':
      case 'jey-handling':
      case 'escalated_to_agent':
        statusDisplayText = 'EN COURS';
        break;
      case 'terminé': // This case should theoretically not be hit if filter works
        statusDisplayText = 'TERMINÉ';
        break;
      default:
        statusDisplayText = item.category ? item.category.toUpperCase() : 'INCONNU';
    }

    const showSeparateCategoryTag = item.status && item.category && item.status !== 'unknown';

    return (
      <TouchableOpacity
        style={[
          styles.itemContainer,
          item.status === 'terminé' && styles.terminatedItem // This style will no longer be visible as items are filtered
        ]}
        onPress={() => navigation.navigate('Conversation', {
          ticketId: item.id,
          isITSupport: false,
          userId: auth.currentUser.uid,
          userName: auth.currentUser.displayName,
          userPhone: item.userPhone,
          ticketCategory: item.category
        })}
      >
        <View style={styles.itemHeader}>
          <Ionicons
            name="chatbubble-ellipses"
            size={24}
            color={item.status === 'nouveau' ? '#FF3B30' :
              item.status === 'terminé' ? '#6B7280' : '#34C759'}
          />
          <Text style={styles.itemTitle} numberOfLines={1}>
            {nomsParticipants}
          </Text>
          {/* The "Terminé" label and delete button will only be relevant if the item somehow slips through the filter or this component is used elsewhere without this specific filter */}
          {item.status === 'terminé' && (
            <>
              <View style={styles.terminatedLabel}>
                <Text style={styles.terminatedLabelText}>TERMINÉ</Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={(e) => {
                  e.stopPropagation();
                  supprimerConversation(item.id, item.status);
                }}
              >
                <Ionicons name="trash-outline" size={20} color="#6B7280" />
              </TouchableOpacity>
            </>
          )}
        </View>

        <Text style={styles.itemMessage} numberOfLines={2}>
          {item.lastMessage
            ? (item.lastMessage.length > 50 ? item.lastMessage.substring(0, 50) + '...' : item.lastMessage)
            : 'Aucun message'}
        </Text>

        <View style={styles.itemFooter}>
          <Text style={[
            styles.itemStatut,
            item.status === 'nouveau' && styles.statutNouveau,
            (item.status === 'en-cours' || item.status === 'jey-handling' || item.status === 'escalated_to_agent') && styles.statutEnCours,
            item.status === 'terminé' && styles.statutTermine,
            (!item.status || statusDisplayText === 'INCONNU') && styles.statutInconnuFallback
          ]}>
            {statusDisplayText}
          </Text>
          {showSeparateCategoryTag && (
            <Text style={styles.itemCategorie}>
              {item.category || 'Général'}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  if (chargement) {
    return (
      <View style={styles.chargementContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Chargement des conversations...</Text>
      </View>
    );
  }

  if (conversations.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Image
          source={require('../assets/images/logoFace.png')}
          style={styles.emptyImage}
        />
        <Text style={styles.emptyTitle}>Aucune conversation active</Text> {/* Updated text */}
        <Text style={styles.emptyText}>
          Vous n'avez pas encore de conversation active.
          Créez une nouvelle demande pour obtenir de l'aide.
        </Text>
        <TouchableOpacity
          style={styles.nouvelleDemandeButton}
          onPress={() => navigation.navigate('UserRequest')}
        >
          <Text style={styles.nouvelleDemandeButtonText}>Nouvelle Demande</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        renderItem={renderItem}
        keyExtractor={item => item.id}
        refreshControl={
          <RefreshControl
            refreshing={actualisation}
            onRefresh={onActualiser}
            colors={['#34C759']}
            tintColor="#34C759"
          />
        }
        contentContainerStyle={styles.listContainer}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  chargementContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#6B7280',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyImage: {
    width: 150,
    height: 150,
    marginBottom: 20,
    opacity: 0.8,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  nouvelleDemandeButton: {
    backgroundColor: '#34C759',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  nouvelleDemandeButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 16,
  },
  itemContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  terminatedItem: { // This style will now rarely be applied due to filtering
    opacity: 0.7,
    borderLeftWidth: 4,
    borderLeftColor: '#A0A0A0',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  itemTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
    marginLeft: 8,
    marginRight: 8,
  },
  itemMessage: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 12,
    lineHeight: 20,
  },
  itemFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemStatut: {
    fontSize: 12,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statutNouveau: {
    backgroundColor: '#FFEEEE',
    color: '#FF3B30',
  },
  statutEnCours: {
    backgroundColor: '#E6F7EE',
    color: '#34C759',
  },
  statutTermine: { // This style will now rarely be applied due to filtering
    backgroundColor: '#F0F0F0',
    color: '#6B7280',
  },
  itemCategorie: {
    fontSize: 12,
    color: '#6B7280',
    backgroundColor: '#F0F0F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  statutInconnuFallback: {
    backgroundColor: '#EFEFEF',
    color: '#888',
  },
  terminatedLabel: { // This style will now rarely be applied due to filtering
    backgroundColor: '#E0E0E0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    marginRight: 8,
  },
  terminatedLabelText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#616161',
  },
});

export default ListeConversations;
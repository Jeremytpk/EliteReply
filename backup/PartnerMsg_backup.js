import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  StyleSheet,
  Platform,
  Modal,
  TextInput,
  Animated,
  Easing,
  Dimensions
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import Swiper from 'react-native-swiper';
import { MaterialCommunityIcons, Ionicons, Feather, MaterialIcons } from '@expo/vector-icons';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  serverTimestamp,
  writeBatch,
  arrayUnion,
  getDocs,
  where,
  deleteDoc,
  addDoc,
  setDoc,
  limit
} from 'firebase/firestore'; 
import { db, auth } from '../../firebase';
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

const PartnerMsg = () => {
  const [partnerConversations, setPartnerConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  // Ref to keep track of conversations that have been processed (for UI state management)
  const notifiedPartnerConvosRef = useRef(new Set()); 

  // OLD PUSH NOTIFICATION FUNCTION REMOVED - Now using comprehensive notification system

  useEffect(() => {
    // Make sure currentUser is available
    const currentUser = auth.currentUser;
    if (!currentUser) {
        setLoading(false);
        return;
    }

    const q = query(
      collection(db, 'partnerConversations'),
      orderBy('lastMessageTimestamp', 'desc')
    );

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        const conversationsPromises = snapshot.docs.map(async (d) => {
          const conversationData = { id: d.id, ...d.data() };
          let partnerDisplayName = `Partenaire: ${d.id}`; 

          const userQuery = query(collection(db, 'users'), where('partnerId', '==', d.id));
          const userSnap = await getDocs(userQuery);

          if (!userSnap.empty) {
            const userData = userSnap.docs[0].data();
            partnerDisplayName = userData.partnerName || `Partenaire: ${d.id}`;
          } else {
            partnerDisplayName = conversationData.partnerName || `Partenaire: ${d.id}`;
          }

          // Fetch the current user's lastRead timestamp for this conversation
          const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', d.id);
          const userConvoStateSnap = await getDoc(userConvoStateRef);
          const lastReadTimestamp = userConvoStateSnap.exists()
            ? userConvoStateSnap.data().lastRead?.toDate()
            : new Date(0); // If no lastRead, treat as very old date

          const isUnreadForCurrentUser = 
            conversationData.lastMessageSender !== currentUser.uid && 
            conversationData.lastMessageSender !== 'systeme' && 
            (conversationData.lastMessageTimestamp?.toDate() > lastReadTimestamp); 

          // OLD NOTIFICATION SYSTEM DISABLED - Now handled by comprehensive notification system in SupportChat.js
          // This prevents duplicate and conflicting notifications
          console.log(`Message detected for convo: ${d.id}, sender: ${conversationData.lastMessageSender}, current user: ${currentUser.uid}`);
          if (isUnreadForCurrentUser && !notifiedPartnerConvosRef.current.has(d.id)) {
            console.log(`📝 Unread message detected for conversation ${d.id} from ${partnerDisplayName}, but notifications are now handled at message send time in SupportChat.js`);
            // Just track that we've seen this message to prevent duplicate UI updates
            notifiedPartnerConvosRef.current.add(d.id);
          }

          return {
            ...conversationData,
            partnerName: partnerDisplayName,
            unreadBySupport: isUnreadForCurrentUser // Update this flag based on fresh comparison
          };
        });

        const conversations = await Promise.all(conversationsPromises);
        setPartnerConversations(conversations);
        setLoading(false);
      },
      (error) => {
        console.error('Erreur lors de la récupération des conversations partenaires :', error);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [isFocused]);

  // Filtered conversations based on search query
  const filteredConversations = partnerConversations.filter((conversation) =>
    conversation.partnerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navigateToChat = async (partnerId, partnerName) => {
    try {
      // Mark as read in the main conversation document
      const conversationRef = doc(db, 'partnerConversations', partnerId);
      await updateDoc(conversationRef, {
        unreadBySupport: false, 
      });

      const currentUser = auth.currentUser;
      if (currentUser) {
        const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', partnerId);

        const messagesQuery = query(
          collection(db, 'partnerConversations', partnerId, 'messages'),
          orderBy('createdAt', 'desc'),
          limit(1)
        );
        const messagesSnap = await getDocs(messagesQuery);
        const lastMessageTimestamp = messagesSnap.empty ? serverTimestamp() : messagesSnap.docs[0].data().createdAt;

        // --- FIX: Use setDoc with merge: true to create if not exists, or update ---
        await setDoc(userConvoStateRef, {
          lastRead: lastMessageTimestamp,
          partnerId: partnerId, // Ensure these fields exist if creating
          partnerName: partnerName, // Ensure these fields exist if creating
        }, { merge: true }); // Crucial for creating if doc doesn't exist
        // --- END FIX ---
      }
      
      // Remove from notified tickets set once agent engages with it
      if (notifiedPartnerConvosRef.current.has(partnerId)) {
          notifiedPartnerConvosRef.current.delete(partnerId);
      }

    } catch (error) {
      console.error('Erreur lors du marquage des messages comme lus :', error);
    }
    navigation.navigate('SupportChat', { partnerId, partnerName, userType: 'support' });
  };

  const deleteConversation = async (partnerId, partnerName) => {
    Alert.alert(
      'Confirmer la suppression',
      `Êtes-vous sûr de vouloir supprimer la conversation avec ${partnerName} ? Cela supprimera tous les messages associés.`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Supprimer',
          onPress: async () => {
            try {
              // 1. Delete all messages in the subcollection
              const messagesRef = collection(db, 'partnerConversations', partnerId, 'messages');
              const messageSnap = await getDocs(messagesRef);

              if (!messageSnap.empty) {
                const deleteMessagePromises = messageSnap.docs.map((d) =>
                  deleteDoc(doc(db, 'partnerConversations', partnerId, 'messages', d.id))
                );
                await Promise.all(deleteMessagePromises);
                console.log(`All messages for conversation ${partnerId} successfully deleted.`);
              } else {
                console.log(`No messages found for conversation ${partnerId}.`);
              }

              // 2. Delete the conversation document itself
              await deleteDoc(doc(db, 'partnerConversations', partnerId));
              console.log(`Conversation document ${partnerId} deleted successfully.`);

              // 3. Optionally, also delete the user-specific conversation state for this partnerId
              const currentUser = auth.currentUser;
              if (currentUser) {
                const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', partnerId);
                const userConvoStateDoc = await getDoc(userConvoStateRef);

                if (userConvoStateDoc.exists()) {
                  await deleteDoc(userConvoStateRef);
                  console.log(`User-specific conversation state for partner ${partnerId} deleted.`);
                } else {
                  console.log(`User-specific conversation state for partner ${partnerId} not found, nothing to delete.`);
                }
              }
            } catch (error) {
              console.error('Error deleting conversation:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la conversation. Veuillez réessayer.');
            }
          },
          style: 'destructive',
        },
      ],
      { cancelable: true }
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.conversationItem}
      onPress={() => navigateToChat(item.id, item.partnerName)}
      onLongPress={() => deleteConversation(item.id, item.partnerName)}
    >
      <View style={styles.textContainer}>
        <Text style={styles.partnerName}>
          {item.partnerName}
        </Text>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage || 'Aucun message pour le moment.'}
        </Text>
      </View>
      <View style={styles.rightContainer}>
        {item.lastMessageTimestamp && (
          <Text style={styles.timestamp}>
            {new Date(item.lastMessageTimestamp.toDate()).toLocaleTimeString(
              [],
              {
                hour: '2-digit',
                minute: '2-digit',
              }
            )}
          </Text>
        )}
        {item.unreadBySupport && (
          <View style={styles.unreadDot} />
        )}
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteConversation(item.id, item.partnerName)}
        >
          <Text style={styles.deleteButtonText}>🗑️</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0A8FDF" />
        <Text style={styles.loadingText}>Chargement des conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher par nom de partenaire..."
          placeholderTextColor="#94A3B8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      {filteredConversations.length === 0 && !loading ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Aucune conversation trouvée.</Text>
          {searchQuery ? (
            <Text style={styles.emptyStateSubText}>
              Vérifiez l'orthographe ou essayez un autre nom.
            </Text>
          ) : (
            <Text style={styles.emptyStateSubText}>
              Les partenaires apparaîtront ici lorsqu'ils démarreront une discussion.
            </Text>
          )}
        </View>
      ) : (
        <FlatList
          data={filteredConversations} // Use filteredConversations here
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  searchBarContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingTop: Platform.OS === 'android' ? 40 : 10, // Adjust paddingTop for Android status bar
  },
  searchInput: {
    height: 50,
    borderColor: '#E2E8F0',
    borderWidth: 1,
    borderRadius: 25, // Make it pill-shaped
    paddingHorizontal: 20,
    fontSize: 16,
    backgroundColor: '#F1F5F9', // Light background for the input
    color: '#1E293B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#64748B',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#555',
    marginBottom: 10,
  },
  emptyStateSubText: {
    fontSize: 14,
    color: '#777',
    textAlign: 'center',
  },
  listContainer: {
    paddingHorizontal: 15,
    paddingVertical: 10,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  textContainer: {
    flex: 1,
  },
  partnerName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1E293B',
    marginBottom: 4,
  },
  lastMessage: {
    fontSize: 14,
    color: '#64748B',
  },
  rightContainer: {
    marginLeft: 15,
    flexDirection: 'row',
    alignItems: 'center',
  },
  timestamp: {
    fontSize: 12,
    color: '#94A3B8',
    marginRight: 8,
  },
  unreadDot: {
    backgroundColor: '#EF4444',
    borderRadius: 6,
    width: 12,
    height: 12,
    marginRight: 8,
  },
  deleteButton: {
    padding: 8,
    borderRadius: 5,
    backgroundColor: '#FFEEEE',
  },
  deleteButtonText: {
    color: '#EF4444',
    fontSize: 18,
    fontWeight: 'bold',
  },
});

export default PartnerMsg;
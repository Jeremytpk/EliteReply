import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  TextInput,
  Alert,
} from 'react-native';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const AdminPartnerChatList = () => {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const navigation = useNavigation();
  const currentUser = auth.currentUser;

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      return;
    }

    // Listen to all partner admin chats
    const chatsRef = collection(db, 'partnerAdminChats');
    const q = query(chatsRef, orderBy('lastMessageTimestamp', 'desc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const chats = [];
      
      snapshot.docs.forEach((doc) => {
        const data = doc.data();
        const chat = {
          id: doc.id,
          partnerId: data.partnerId,
          partnerName: data.partnerName || `Partenaire ${doc.id}`,
          lastMessage: data.lastMessage || 'Aucun message',
          lastMessageTimestamp: data.lastMessageTimestamp,
          lastMessageSender: data.lastMessageSender,
          lastMessageSenderType: data.lastMessageSenderType,
          adminUnread: data.adminUnread || false,
          partnerUnread: data.partnerUnread || false,
        };
        chats.push(chat);
      });

      setConversations(chats);
      setLoading(false);
    }, (error) => {
      console.error('Error fetching conversations:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [currentUser]);

  const filteredConversations = conversations.filter((conv) =>
    conv.partnerName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const navigateToChat = (partnerId, partnerName) => {
    navigation.navigate('PartnerAdminChat', {
      partnerId,
      partnerName,
      userType: 'admin',
    });
  };

  const deleteConversation = async (partnerId, partnerName) => {
    Alert.alert(
      'Supprimer la conversation',
      `Voulez-vous supprimer la conversation avec ${partnerName} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              // Delete all messages first
              const messagesRef = collection(db, 'partnerAdminChats', partnerId, 'messages');
              const messagesSnapshot = await getDocs(messagesRef);
              
              const deletePromises = messagesSnapshot.docs.map(messageDoc =>
                deleteDoc(doc(db, 'partnerAdminChats', partnerId, 'messages', messageDoc.id))
              );
              await Promise.all(deletePromises);

              // Delete the conversation document
              await deleteDoc(doc(db, 'partnerAdminChats', partnerId));
              
              console.log(`Conversation with ${partnerName} deleted`);
            } catch (error) {
              console.error('Error deleting conversation:', error);
              Alert.alert('Erreur', 'Impossible de supprimer la conversation.');
            }
          },
        },
      ]
    );
  };

  const renderConversationItem = ({ item }) => {
    const isUnreadForAdmin = item.adminUnread;
    const lastMessageTime = item.lastMessageTimestamp ? 
      new Date(item.lastMessageTimestamp.toDate()).toLocaleString() : '';

    return (
      <TouchableOpacity
        style={[
          styles.conversationItem,
          isUnreadForAdmin && styles.unreadConversation
        ]}
        onPress={() => navigateToChat(item.partnerId, item.partnerName)}
        onLongPress={() => deleteConversation(item.partnerId, item.partnerName)}
      >
        <View style={styles.avatarContainer}>
          <Text style={styles.avatarText}>
            {item.partnerName.charAt(0).toUpperCase()}
          </Text>
          {isUnreadForAdmin && <View style={styles.unreadBadge} />}
        </View>

        <View style={styles.contentContainer}>
          <View style={styles.headerRow}>
            <Text style={[
              styles.partnerName,
              isUnreadForAdmin && styles.unreadText
            ]}>
              {item.partnerName}
            </Text>
            <Text style={styles.timestamp}>{lastMessageTime}</Text>
          </View>
          
          <Text 
            style={[
              styles.lastMessage,
              isUnreadForAdmin && styles.unreadText
            ]} 
            numberOfLines={1}
          >
            {item.lastMessageSenderType === 'admin' ? 'Vous: ' : ''}
            {item.lastMessage}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => deleteConversation(item.partnerId, item.partnerName)}
        >
          <Ionicons name="trash-outline" size={20} color="#EF4444" />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Chargement des conversations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Messages Partenaires</Text>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Rechercher un partenaire..."
          placeholderTextColor="#999"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Conversations List */}
      {filteredConversations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="chatbubbles-outline" size={64} color="#CCC" />
          <Text style={styles.emptyTitle}>
            {searchQuery ? 'Aucun résultat' : 'Aucune conversation'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {searchQuery 
              ? 'Aucun partenaire trouvé avec ce nom'
              : 'Les conversations avec les partenaires apparaîtront ici'
            }
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          renderItem={renderConversationItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
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
  header: {
    paddingTop: Platform.OS === 'android' ? 40 : 10,
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1E293B',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginVertical: 12,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    height: 44,
    fontSize: 16,
    color: '#1E293B',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#666',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#999',
    textAlign: 'center',
    lineHeight: 22,
  },
  listContent: {
    paddingHorizontal: 16,
  },
  conversationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  unreadConversation: {
    backgroundColor: '#F0F8FF',
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatarText: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#007AFF',
    color: '#FFF',
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 50,
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    borderWidth: 2,
    borderColor: '#FFF',
  },
  contentContainer: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1E293B',
  },
  unreadText: {
    fontWeight: '700',
    color: '#007AFF',
  },
  timestamp: {
    fontSize: 12,
    color: '#999',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
  },
  deleteButton: {
    padding: 8,
    marginLeft: 8,
  },
});

export default AdminPartnerChatList;

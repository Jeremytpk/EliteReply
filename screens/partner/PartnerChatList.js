import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  SafeAreaView,
  Platform,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy,
  doc,
  getDoc,
  updateDoc,
  getDocs
} from 'firebase/firestore';
import { db } from '../../firebase';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';

const PartnerChatList = ({ route }) => {
  const { partnerId, partnerName } = route.params;
  const navigation = useNavigation();
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!partnerId) return;

    const conversationsQuery = query(
      collection(db, 'clientPartnerChats'),
      where('receiverId', '==', partnerId)
    );

    const unsubscribe = onSnapshot(conversationsQuery, async (snapshot) => {
      try {
        // Group messages by conversationId
        const conversationsMap = new Map();
        
        snapshot.docs.forEach(doc => {
          const data = doc.data();
          const conversationId = data.conversationId;
          
          if (!conversationsMap.has(conversationId)) {
            // Determine client info based on who is NOT the current partner
            const isFromClient = data.senderType === 'client';
            const clientId = isFromClient ? data.senderId : data.receiverId;
            const clientName = isFromClient ? (data.senderName || 'Client') : (data.receiverName || 'Client');
            const clientAvatar = isFromClient ? data.senderAvatar : data.receiverAvatar;
            

            
            conversationsMap.set(conversationId, {
              conversationId,
              partnerId,
              clientId,
              clientName,
              clientAvatar,
              messages: [],
              lastMessage: null,
              lastMessageTime: null,
              unreadCount: 0
            });
          }
          
          const conversation = conversationsMap.get(conversationId);
          conversation.messages.push({
            id: doc.id,
            ...data
          });
          
          // Update last message info
          if (!conversation.lastMessageTime || 
              (data.createdAt && data.createdAt.toDate() > conversation.lastMessageTime)) {
            conversation.lastMessage = data.message;
            conversation.lastMessageTime = data.createdAt?.toDate() || new Date();
            conversation.lastMessageSender = data.senderType;
          }
          
          // Count unread messages (messages from client that partner hasn't read)
          if (data.senderType === 'client' && !data.read) {
            conversation.unreadCount++;
          }
        });

        // Convert map to array and sort by last message time
        const conversationsList = Array.from(conversationsMap.values())
          .sort((a, b) => {
            const timeA = a.lastMessageTime?.getTime() || 0;
            const timeB = b.lastMessageTime?.getTime() || 0;
            return timeB - timeA; // Most recent first
          });

        // Fetch additional client data from users collection
        const enrichedConversations = await Promise.all(
          conversationsList.map(async (conversation) => {
            try {
              if (conversation.clientId) {
                const clientDoc = await getDoc(doc(db, 'users', conversation.clientId));
                if (clientDoc.exists()) {
                  const userData = clientDoc.data();
                  return {
                    ...conversation,
                    clientName: userData.nom || userData.name || conversation.clientName || 'Client',
                    clientAvatar: userData.photoURL || userData.profileImage || conversation.clientAvatar
                  };
                }
              }
              return conversation;
            } catch (error) {
              console.error('Error fetching client data for conversation:', error);
              return conversation;
            }
          })
        );

        setConversations(enrichedConversations);
        setLoading(false);
      } catch (error) {
        console.error('Error processing conversations:', error);
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [partnerId]);

  const handleConversationPress = async (conversation) => {
    // Mark messages as read when opening conversation
    try {
      const unreadMessagesQuery = query(
        collection(db, 'clientPartnerChats'),
        where('conversationId', '==', conversation.conversationId),
        where('receiverId', '==', partnerId),
        where('read', '==', false)
      );
      
      const unreadSnapshot = await getDocs(unreadMessagesQuery);
      const updatePromises = unreadSnapshot.docs.map(docSnapshot => 
        updateDoc(doc(db, 'clientPartnerChats', docSnapshot.id), { read: true })
      );
      
      await Promise.all(updatePromises);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }



    // Navigate to partner chat screen
    navigation.navigate('PartnerClientChat', {
      conversationId: conversation.conversationId,
      clientId: conversation.clientId,
      clientName: conversation.clientName,
      clientAvatar: conversation.clientAvatar,
      partnerId: partnerId,
      partnerName: partnerName
    });
  };

  const renderConversationItem = ({ item }) => {
    const timeString = item.lastMessageTime ? 
      item.lastMessageTime.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }) : '';

    const isFromClient = item.lastMessageSender === 'client';

    return (
      <TouchableOpacity
        style={[styles.conversationItem, item.unreadCount > 0 && styles.unreadConversation]}
        onPress={() => handleConversationPress(item)}
        activeOpacity={0.7}
      >
        <Image
          source={{ uri: item.clientAvatar || 'https://via.placeholder.com/50' }}
          style={styles.clientAvatar}
        />
        
        <View style={styles.conversationContent}>
          <View style={styles.conversationHeader}>
            <Text style={[styles.clientName, item.unreadCount > 0 && styles.unreadText]}>
              {item.clientName}
            </Text>
            <Text style={styles.messageTime}>{timeString}</Text>
          </View>
          
          <View style={styles.messagePreview}>
            <Text 
              style={[
                styles.lastMessage, 
                item.unreadCount > 0 && styles.unreadMessage
              ]}
              numberOfLines={1}
            >
              {isFromClient ? '' : 'Vous: '}{item.lastMessage}
            </Text>
            
            {item.unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>
                  {item.unreadCount > 99 ? '99+' : item.unreadCount}
                </Text>
              </View>
            )}
          </View>
        </View>
        
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialCommunityIcons name="chat-outline" size={80} color="#ccc" />
      <Text style={styles.emptyTitle}>Aucune conversation</Text>
      <Text style={styles.emptySubtitle}>
        Les conversations avec vos clients apparaîtront ici
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Messages Clients</Text>
          <View style={styles.headerRight} />
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#25D366" />
          <Text style={styles.loadingText}>Chargement des conversations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Messages Clients</Text>
        <View style={styles.headerRight}>
          {conversations.length > 0 && (
            <Text style={styles.conversationCount}>
              {conversations.length}
            </Text>
          )}
        </View>
      </View>

      <FlatList
        data={conversations}
        renderItem={renderConversationItem}
        keyExtractor={item => item.conversationId}
        style={styles.conversationsList}
        ListEmptyComponent={renderEmptyState}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: Platform.OS === 'ios' ? 12 : 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
  },
  headerRight: {
    width: 40,
    alignItems: 'center',
  },
  conversationCount: {
    fontSize: 16,
    fontWeight: '600',
    color: '#25D366',
    backgroundColor: '#25D36620',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
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
  conversationsList: {
    flex: 1,
  },
  conversationItem: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  unreadConversation: {
    backgroundColor: '#f8fff8',
  },
  clientAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  clientName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  unreadText: {
    color: '#25D366',
    fontWeight: '700',
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
  },
  messagePreview: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  lastMessage: {
    fontSize: 14,
    color: '#666',
    flex: 1,
    marginRight: 8,
  },
  unreadMessage: {
    color: '#333',
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '600',
    color: '#333',
    marginTop: 20,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
  },
});

export default PartnerChatList;

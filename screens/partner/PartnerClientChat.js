import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
  SafeAreaView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  getDoc,
  updateDoc,
  getDocs
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const PartnerClientChat = ({ route }) => {
  const { 
    conversationId, 
    clientId, 
    clientName, 
    clientAvatar, 
    partnerId, 
    partnerName 
  } = route.params;
  

  
  const navigation = useNavigation();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [partnerData, setPartnerData] = useState(null);
  const [clientData, setClientData] = useState(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        // Fetch partner data
        const partnerDoc = await getDoc(doc(db, 'partners', partnerId));
        if (partnerDoc.exists()) {
          setPartnerData({ id: partnerId, ...partnerDoc.data() });
        }

        // Fetch client data from users collection
        if (clientId) {
          const clientDoc = await getDoc(doc(db, 'users', clientId));
          if (clientDoc.exists()) {
            const userData = clientDoc.data();
            setClientData({ 
              id: clientId, 
              ...userData,
              // Use the actual user data for name and avatar
              displayName: userData.nom || userData.name || clientName || 'Client',
              displayAvatar: userData.photoURL || userData.profileImage || clientAvatar
            });

          } else {
            // Fallback to passed parameters
            setClientData({
              id: clientId,
              displayName: clientName || 'Client',
              displayAvatar: clientAvatar
            });
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    };

    fetchUserData();
  }, [partnerId, clientId, clientName, clientAvatar]);

  useEffect(() => {
    if (!conversationId) return;

    // Mark messages as read when component mounts
    const markMessagesAsRead = async () => {
      try {
        const unreadMessagesQuery = query(
          collection(db, 'clientPartnerChats'),
          where('conversationId', '==', conversationId),
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
    };

    markMessagesAsRead();

    const messagesQuery = query(
      collection(db, 'clientPartnerChats'),
      where('conversationId', '==', conversationId)
    );

    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messagesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort messages locally by createdAt timestamp
      messagesData.sort((a, b) => {
        const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
        const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
        return timeA - timeB; // Ascending order (oldest first)
      });
      
      setMessages(messagesData);
      setLoading(false);
      
      // Auto-mark new incoming messages as read
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          if (data.receiverId === partnerId && !data.read) {
            try {
              await updateDoc(doc(db, 'clientPartnerChats', change.doc.id), { read: true });
            } catch (error) {
              console.error('Error auto-marking message as read:', error);
            }
          }
        }
      });
      
      // Scroll to bottom when new messages arrive
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    });

    return () => unsubscribe();
  }, [conversationId, partnerId]);

  const sendMessage = async () => {
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {

      
      await addDoc(collection(db, 'clientPartnerChats'), {
        conversationId,
        senderId: partnerId,
        senderType: 'partner',
        senderName: partnerName || 'Partenaire',
        senderAvatar: partnerData?.logo || partnerData?.profileImage || null,
        receiverId: clientId,
        receiverType: 'client',
        receiverName: clientData?.displayName || clientName || 'Client',
        receiverAvatar: clientData?.displayAvatar || clientAvatar,
        message: newMessage.trim(),
        createdAt: serverTimestamp(),
        read: false
      });

      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer le message. Veuillez réessayer.');
    } finally {
      setSending(false);
    }
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.senderId === partnerId;
    const messageTime = item.createdAt?.toDate ? 
      new Date(item.createdAt.toDate()).toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }) : '';

    return (
      <View style={[
        styles.messageContainer,
        isMyMessage ? styles.myMessageContainer : styles.theirMessageContainer
      ]}>
        {!isMyMessage && (
          <Image 
            source={{ uri: item.senderAvatar || clientData?.displayAvatar || clientAvatar || 'https://via.placeholder.com/40' }}
            style={styles.messageAvatar}
          />
        )}
        <View style={[
          styles.messageBubble,
          isMyMessage ? styles.myMessageBubble : styles.theirMessageBubble
        ]}>
          <Text style={[
            styles.messageText,
            isMyMessage ? styles.myMessageText : styles.theirMessageText
          ]}>
            {item.message}
          </Text>
          <Text style={[
            styles.messageTime,
            isMyMessage ? styles.myMessageTime : styles.theirMessageTime
          ]}>
            {messageTime}
          </Text>
        </View>
        {isMyMessage && (
          <Image 
            source={{ uri: partnerData?.logo || partnerData?.profileImage || 'https://via.placeholder.com/40' }}
            style={styles.messageAvatar}
          />
        )}
      </View>
    );
  };

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
          <Text style={styles.headerTitle}>Chargement...</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#25D366" />
          <Text style={styles.loadingText}>Chargement de la conversation...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView 
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#333" />
          </TouchableOpacity>
          
          <View style={styles.headerInfo}>
            <Image 
              source={{ uri: clientData?.displayAvatar || clientAvatar || 'https://via.placeholder.com/40' }}
              style={styles.headerAvatar}
            />
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>{clientData?.displayName || clientName || 'Client'}</Text>
              <Text style={styles.headerSubtitle}>Client</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.infoButton}>
            <Ionicons name="information-circle-outline" size={24} color="#25D366" />
          </TouchableOpacity>
        </View>

        {/* Messages List */}
        <FlatList
          ref={flatListRef}
          data={messages}
          renderItem={renderMessage}
          keyExtractor={item => item.id}
          style={styles.messagesList}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
        />

        {/* Message Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.messageInput}
            placeholder="Tapez votre réponse..."
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
            maxLength={500}
          />
          <TouchableOpacity 
            style={[styles.sendButton, sending && styles.sendButtonDisabled]}
            onPress={sendMessage}
            disabled={sending || !newMessage.trim()}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <Ionicons name="send" size={20} color="#fff" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  header: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    marginTop: 30,
    height: 80
  },
  backButton: {
    padding: 8,
    marginRight: 8,
  },
  headerInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  infoButton: {
    padding: 8,
  },
  messagesList: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  messagesContent: {
    paddingVertical: 10,
  },
  messageContainer: {
    flexDirection: 'row',
    marginVertical: 4,
    marginHorizontal: 16,
    alignItems: 'flex-end',
  },
  myMessageContainer: {
    justifyContent: 'flex-end',
  },
  theirMessageContainer: {
    justifyContent: 'flex-start',
  },
  messageAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginHorizontal: 8,
  },
  messageBubble: {
    maxWidth: width * 0.7,
    padding: 12,
    borderRadius: 18,
    marginVertical: 2,
  },
  myMessageBubble: {
    backgroundColor: '#25D366',
    borderBottomRightRadius: 4,
  },
  theirMessageBubble: {
    backgroundColor: '#fff',
    borderBottomLeftRadius: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#fff',
  },
  theirMessageText: {
    color: '#333',
  },
  messageTime: {
    fontSize: 12,
    marginTop: 4,
  },
  myMessageTime: {
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'right',
  },
  theirMessageTime: {
    color: '#999',
    textAlign: 'left',
  },
  inputContainer: {
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
    paddingBottom: 20,
  },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
    fontSize: 16,
    maxHeight: 100,
    backgroundColor: '#f8f9fa',
  },
  sendButton: {
    backgroundColor: '#25D366',
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#25D366',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});

export default PartnerClientChat;

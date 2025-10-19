import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  serverTimestamp,
  doc,
  setDoc,
  getDoc,
} from 'firebase/firestore';
import { db, auth } from '../../firebase';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '@react-navigation/native';
import { 
  sendNotificationToITSupport, 
  sendNotificationToPartner,
  sendNotificationToUsersByRole,
  showInAppNotification 
} from '../../services/notifications';

const PartnerAdminChat = ({ route }) => {
  const { partnerId, partnerName, userType } = route?.params || {};
  const navigation = useNavigation();
  
  // Determine user identity
  const currentUser = auth.currentUser;
  
  // AUTO-DETECT user role based on current user ID vs partnerId
  // If current user ID matches partnerId, then current user is the partner
  // Otherwise, current user is admin/support
  const isPartner = currentUser?.uid === partnerId;
  const isAdmin = !isPartner;
  
  // Debug logging
  console.log('🔍 PartnerAdminChat Debug:', {
    userType: userType, // passed parameter (might be wrong)
    isPartner: isPartner, // auto-detected
    isAdmin: isAdmin, // auto-detected
    partnerId,
    currentUserUid: currentUser?.uid,
    currentUserName: currentUser?.displayName,
    autoDetected: currentUser?.uid === partnerId ? 'PARTNER' : 'ADMIN'
  });
  
  // Set sender info
  const senderId = isPartner ? partnerId : currentUser?.uid;
  const senderName = isPartner ? partnerName : (currentUser?.displayName || 'Support Team');
  
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef(null);
  const storage = getStorage();

  // Load messages
  useEffect(() => {
    if (!partnerId || !currentUser) {
      console.warn("Missing partnerId or currentUser");
      return;
    }

    const messagesRef = collection(db, 'partnerAdminChats', partnerId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
      
      // Auto scroll to bottom
      setTimeout(() => {
        if (flatListRef.current) {
          flatListRef.current.scrollToEnd({ animated: true });
        }
      }, 100);

      // Mark messages as read for current user
      markMessagesAsRead();
    });

    return () => unsubscribe();
  }, [partnerId, currentUser]);

  const markMessagesAsRead = async () => {
    if (!partnerId || !currentUser) return;
    
    try {
      const chatRef = doc(db, 'partnerAdminChats', partnerId);
      const readField = isPartner ? 'partnerLastRead' : 'adminLastRead';
      const unreadField = isPartner ? 'partnerUnread' : 'adminUnread';
      
      await setDoc(chatRef, {
        [readField]: serverTimestamp(),
        [unreadField]: false, // Clear unread flag
        partnerId,
        partnerName,
      }, { merge: true });
      
      console.log(`✅ Messages marked as read for ${isPartner ? 'PARTNER' : 'ADMIN'}`);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  const sendNotifications = async (messageText, messageType = 'text') => {
    try {
      const title = `Nouveau message de ${senderName}`;
      const body = messageType === 'text' ? 
        (messageText.length > 100 ? messageText.substring(0, 100) + '...' : messageText) :
        messageType === 'image' ? '📷 Image envoyée' : '📎 Fichier envoyé';

      const notificationData = {
        type: isPartner ? 'partner_admin_chat' : 'admin_partner_chat',
        partnerId,
        partnerName,
        senderId,
        senderName,
        messageType,
        timestamp: Date.now(),
      };

      console.log(`🔔 Sending notifications - Sender: ${isPartner ? 'PARTNER' : 'ADMIN'}`);

      if (isPartner) {
        // Partner sent message → notify ALL admin/support users
        console.log('📤 Partner sent message, notifying all support staff...');
        
        // Notify IT Support
        const itResults = await sendNotificationToITSupport(title, body, notificationData);
        console.log(`✅ IT Support: ${itResults.successful}/${itResults.total}`);

        // Notify Admin users
        const adminResults = await sendNotificationToUsersByRole('Admin', title, body, notificationData);
        console.log(`✅ Admin users: ${adminResults.successful}/${adminResults.total}`);

        // Notify Agent users  
        const agentResults = await sendNotificationToUsersByRole('Agent', title, body, notificationData);
        console.log(`✅ Agent users: ${agentResults.successful}/${agentResults.total}`);

        // Notify IT role users
        const itRoleResults = await sendNotificationToUsersByRole('IT', title, body, notificationData);
        console.log(`✅ IT role users: ${itRoleResults.successful}/${itRoleResults.total}`);

      } else {
        // Admin sent message → notify only the specific partner
        console.log(`📤 Admin sent message, notifying partner ${partnerId}...`);
        
        const partnerSuccess = await sendNotificationToPartner(partnerId, title, body, notificationData);
        console.log(`✅ Partner notification: ${partnerSuccess ? 'Success' : 'Failed'}`);
      }

      // Send in-app notification for immediate visibility
      showInAppNotification(title, body, notificationData);
      
    } catch (error) {
      console.error('❌ Error sending notifications:', error);
    }
  };

  const sendMessage = async () => {
    if (!inputText.trim() || !partnerId || !currentUser || uploading) {
      return;
    }

    try {
      const messagesRef = collection(db, 'partnerAdminChats', partnerId, 'messages');
      
      // Add message to chat
      await addDoc(messagesRef, {
        senderId,
        senderName,
        senderType: isPartner ? 'partner' : 'admin',
        text: inputText.trim(),
        type: 'text',
        timestamp: serverTimestamp(),
      });

      // Update chat metadata
      const chatRef = doc(db, 'partnerAdminChats', partnerId);
      await setDoc(chatRef, {
        lastMessage: inputText.trim(),
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSender: senderId,
        lastMessageSenderType: isPartner ? 'partner' : 'admin',
        partnerId,
        partnerName,
        // Mark as unread for the recipient
        partnerUnread: !isPartner,
        adminUnread: isPartner,
      }, { merge: true });

      // Send notifications to recipients (NOT to sender)
      await sendNotifications(inputText.trim(), 'text');

      // Clear input
      setInputText('');
      
      console.log(`✅ Message sent by ${isPartner ? 'PARTNER' : 'ADMIN'}: "${inputText.trim()}"`);
      console.log('🔍 Send Debug:', {
        isPartner,
        isAdmin,
        userType,
        senderId,
        senderName,
        senderType: isPartner ? 'partner' : 'admin'
      });

    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer le message. Veuillez réessayer.');
    }
  };

  const uploadFile = async (uri, fileName, fileType) => {
    try {
      setUploading(true);
      const response = await fetch(uri);
      const blob = await response.blob();
      const timestamp = Date.now();
      const storageRef = ref(storage, `partner_admin_chats/${partnerId}/${timestamp}_${fileName}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Error uploading file:', error);
      Alert.alert('Erreur', 'Échec du téléchargement du fichier.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const sendMediaMessage = async (url, type, fileName = '') => {
    if (!url || !partnerId || !currentUser) return;

    try {
      const messagesRef = collection(db, 'partnerAdminChats', partnerId, 'messages');
      
      await addDoc(messagesRef, {
        senderId,
        senderName,
        senderType: isPartner ? 'partner' : 'admin',
        content: url,
        fileName,
        type,
        timestamp: serverTimestamp(),
      });

      // Update chat metadata
      const chatRef = doc(db, 'partnerAdminChats', partnerId);
      const displayMessage = type === 'image' ? '📷 Image' : `📎 ${fileName}`;
      
      await setDoc(chatRef, {
        lastMessage: displayMessage,
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSender: senderId,
        lastMessageSenderType: isPartner ? 'partner' : 'admin',
        partnerId,
        partnerName,
        partnerUnread: !isPartner,
        adminUnread: isPartner,
      }, { merge: true });

      // Send notifications
      await sendNotifications(displayMessage, type);
      
      console.log(`✅ ${type} sent by ${isPartner ? 'PARTNER' : 'ADMIN'}: ${fileName || 'media'}`);

    } catch (error) {
      console.error('Error sending media:', error);
      Alert.alert('Erreur', 'Impossible d\'envoyer le fichier.');
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission requise', 'Permission d\'accès aux photos requise.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const uri = result.assets[0].uri;
      const fileName = uri.split('/').pop() || 'image.jpg';
      const imageUrl = await uploadFile(uri, fileName, 'image');
      if (imageUrl) {
        await sendMediaMessage(imageUrl, 'image', fileName);
      }
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        multiple: false,
      });

      if (!result.canceled && result.assets[0]) {
        const { uri, name } = result.assets[0];
        const fileUrl = await uploadFile(uri, name, 'file');
        if (fileUrl) {
          await sendMediaMessage(fileUrl, 'file', name);
        }
      }
    } catch (error) {
      console.error('Error picking document:', error);
      Alert.alert('Erreur', 'Impossible de sélectionner le fichier.');
    }
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.senderId === senderId;
    const isTextMessage = item.type === 'text';
    const isImageMessage = item.type === 'image';
    const isFileMessage = item.type === 'file';

    return (
      <View style={[
        styles.messageBubble,
        isMyMessage ? styles.myMessage : styles.theirMessage,
      ]}>
        {!isMyMessage && (
          <Text style={styles.senderName}>{item.senderName}</Text>
        )}
        
        {isTextMessage && (
          <Text style={[
            styles.messageText,
            isMyMessage ? styles.myMessageText : styles.theirMessageText
          ]}>
            {item.text}
          </Text>
        )}
        
        {isImageMessage && (
          <TouchableOpacity onPress={() => {/* Open image */}}>
            <Image source={{ uri: item.content }} style={styles.messageImage} />
          </TouchableOpacity>
        )}
        
        {isFileMessage && (
          <TouchableOpacity style={styles.fileMessage} onPress={() => {/* Open file */}}>
            <Ionicons name="document" size={24} color={isMyMessage ? "#FFF" : "#666"} />
            <Text style={[
              styles.fileName,
              isMyMessage ? styles.myMessageText : styles.theirMessageText
            ]}>
              {item.fileName || 'Fichier'}
            </Text>
          </TouchableOpacity>
        )}
        
        <Text style={[
          styles.timestamp,
          isMyMessage ? styles.myTimestamp : styles.theirTimestamp
        ]}>
          {item.timestamp ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit',
          }) : ''}
        </Text>
      </View>
    );
  };

  const headerTitle = isPartner ? 'Support EliteReply' : partnerName || 'Chat Partenaire';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        style={styles.messagesList}
        contentContainerStyle={styles.messagesContent}
      />

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TouchableOpacity onPress={pickDocument} disabled={uploading} style={styles.attachButton}>
          <Ionicons name="attach" size={24} color="#666" />
        </TouchableOpacity>
        
        <TouchableOpacity onPress={pickImage} disabled={uploading} style={styles.attachButton}>
          <Ionicons name="camera" size={24} color="#666" />
        </TouchableOpacity>
        
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Tapez votre message..."
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
          editable={!uploading}
        />
        
        <TouchableOpacity
          style={[
            styles.sendButton,
            (!inputText.trim() || uploading) && styles.sendButtonDisabled
          ]}
          onPress={sendMessage}
          disabled={!inputText.trim() || uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            <Ionicons name="send" size={20} color="#FFF" />
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? 50 : 30,
    paddingBottom: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1E293B',
  },
  messagesList: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
    borderBottomRightRadius: 4,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E2E8F0',
    borderBottomLeftRadius: 4,
  },
  senderName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
    fontWeight: '500',
  },
  messageText: {
    fontSize: 16,
    lineHeight: 20,
  },
  myMessageText: {
    color: '#FFF',
  },
  theirMessageText: {
    color: '#1E293B',
  },
  messageImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 4,
  },
  fileMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
  },
  timestamp: {
    fontSize: 11,
    marginTop: 4,
  },
  myTimestamp: {
    color: 'rgba(255,255,255,0.7)',
    alignSelf: 'flex-end',
  },
  theirTimestamp: {
    color: '#666',
    alignSelf: 'flex-start',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  attachButton: {
    padding: 8,
    marginRight: 4,
  },
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginHorizontal: 8,
    fontSize: 16,
    backgroundColor: '#F8F9FA',
    color: '#1E293B',
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
});

export default PartnerAdminChat;

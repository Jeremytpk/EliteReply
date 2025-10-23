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
  Image, // Make sure Image is imported
  ActivityIndicator,
  Alert,
  Linking, // Import Linking for opening URLs
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
import { Ionicons, MaterialIcons } from '@expo/vector-icons'; // Keep Ionicons/MaterialIcons if still used elsewhere
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { 
  sendNotificationToITSupport, 
  sendNotificationToPartner,
  sendNotificationToUsersByRole,
  scheduleLocalNotification, 
  showInAppNotification 
} from '../../services/notifications';
import { sendMessageNotification } from '../../services/notificationHelpers';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useNavigation } from '@react-navigation/native';

// --- NEW: Import your custom icons ---
const ATTACH_ICON = require('../../assets/icons/attach.png');
const IMAGE_ICON = require('../../assets/icons/image.png');
const SEND_ICON = require('../../assets/icons/send.png');
const CLOUD_DOWNLOAD_ICON = require('../../assets/icons/cloud_download.png'); // New: Download icon
const DOC_FILE_ICON = require('../../assets/icons/doc.png'); // New: Document file icon
// --- END NEW IMPORTS ---

const UnifiedChat = ({ route }) => {
  const { partnerId, partnerName, userType } = route?.params || {
    partnerId: 'defaultTestPartnerId',
    partnerName: 'Partenaire de test par défaut',
    userType: 'partner',
  };

  const supportTeamId = 'EliteReplySupportTeam';
  const supportTeamName = 'Équipe de support EliteReply';

  let myUserId = auth.currentUser?.uid; // Always use the actual Firebase user ID
  let myUserName = auth.currentUser?.displayName || auth.currentUser?.email || 'Utilisateur';

  if (userType === 'partner') {
    myUserId = partnerId; // For partners, use the partner ID
    myUserName = partnerName;
  } else if (userType === 'support') {
    // For support, keep the actual Firebase user ID but use support team name for display
    myUserName = supportTeamName;
  }

  // For determining who to send notifications TO (not used for lastMessageSender)
  const theirUserId = userType === 'partner' ? supportTeamId : partnerId;
  const theirUserName = userType === 'partner' ? supportTeamName : partnerName;


  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef(null);
  const navigation = useNavigation();
  const storage = getStorage();

  useEffect(() => {
    if (!partnerId || partnerId === 'defaultTestPartnerId') {
      console.warn("UnifiedChat: Aucun ID partenaire valide reçu, veuillez vérifier les paramètres de navigation.");
      return;
    }
    if (!auth.currentUser) {
      console.warn("UnifiedChat: Aucun utilisateur Firebase authentifié. Impossible de charger le chat ou de marquer comme lu.");
      return;
    }

    const q = query(
      collection(db, 'partnerConversations', partnerId, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setMessages(msgs);
      if (flatListRef.current) {
        flatListRef.current.scrollToEnd({ animated: true });
      }

      // Only mark messages as read when viewing the chat - don't trigger notifications here
      // The notifications should only be sent when actually SENDING a message, not when receiving
      if (auth.currentUser?.uid) {
        const userConversationStateRef = doc(
          db,
          'users',
          auth.currentUser.uid,
          'partnerConversationStates',
          partnerId
        );
        setDoc(userConversationStateRef, {
          unread: false, // Mark as read in user's individual state since they're viewing the chat
          lastReadTimestamp: serverTimestamp(),
          partnerId: partnerId,
          partnerName: partnerName,
        }, { merge: true })
          .catch((error) => console.error('Erreur lors du marquage des messages comme lus (état utilisateur) :', error));
      }

      // Mark conversation as read for the current user type when they're actively viewing
      const conversationRef = doc(db, 'partnerConversations', partnerId);
      if (userType === 'partner') {
        // Partner is viewing the chat, so mark as read for partner
        setDoc(conversationRef, { unreadByPartner: false }, { merge: true })
          .catch((error) => console.error('Erreur lors de la mise à jour du statut non lu par le partenaire :', error));
      } else if (userType === 'support') {
        // Support is viewing the chat, so mark as read for support
        setDoc(conversationRef, { unreadBySupport: false }, { merge: true })
          .catch((error) => console.error('Erreur lors de la mise à jour du statut non lu par le support :', error));
      }
    });

    return () => unsubscribe();
  }, [partnerId, userType, auth.currentUser?.uid, partnerName]);


  const uploadFile = async (uri, fileName, fileType) => {
    setUploading(true);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const storageRef = ref(storage, `chat_files/${partnerId}/${fileName}`);
      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      return downloadURL;
    } catch (error) {
      console.error('Erreur lors du téléchargement du fichier :', error);
      Alert.alert('Erreur de téléchargement', 'Échec du téléchargement du fichier. Veuillez réessayer.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission refusée', 'Désolé, nous avons besoin des autorisations d\'accès à la pellicule pour que cela fonctionne !');
      return;
    }

    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;
      const fileName = uri.split('/').pop();
      const imageUrl = await uploadFile(uri, fileName, 'image');
      if (imageUrl) {
        sendMediaMessage(imageUrl, 'image');
      }
    }
  };

  const pickDocument = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
      });

      if (!result.canceled) {
        const uri = result.assets[0].uri;
        const fileName = result.assets[0].name;
        const fileUrl = await uploadFile(uri, fileName, 'file');
        if (fileUrl) {
          sendMediaMessage(fileUrl, 'file', fileName);
        }
      }
    } catch (err) {
      console.error('Erreur lors de la sélection du document :', err);
      Alert.alert('Erreur de sélection de document', 'Échec de la sélection du document.');
    }
  };

  const sendMediaMessage = async (url, type, fileName = '') => {
    if (!partnerId || partnerId === 'defaultTestPartnerId' || !auth.currentUser) {
      Alert.alert("Erreur", "L'ID du partenaire de chat ou l'utilisateur n'est pas défini. Impossible d'envoyer le message.");
      return;
    }
    try {
      const conversationRef = doc(db, 'partnerConversations', partnerId);
      const messagesRef = collection(conversationRef, 'messages');

      await addDoc(messagesRef, {
        senderId: myUserId,
        senderName: myUserName,
        receiverId: theirUserId,
        type: type,
        content: url,
        fileName: fileName,
        timestamp: serverTimestamp(),
      });

      const updateData = {
        lastMessage: type === 'image' ? 'Image envoyée' : `Fichier envoyé : ${fileName}`,
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSender: myUserId, // Add the sender ID to track who sent the last message
      };
      if (userType === 'partner') {
        updateData.unreadBySupport = true;
      } else if (userType === 'support') {
        updateData.unreadByPartner = true;
      } else {
        updateData.unreadByPartner = true;
        updateData.unreadBySupport = true;
      }

      await setDoc(conversationRef, updateData, { merge: true });

      if (auth.currentUser?.uid) { // Ensure current user is defined
        const userConversationStateRef = doc(
          db,
          'users',
          auth.currentUser.uid,
          'partnerConversationStates',
          partnerId
        );
        await setDoc(userConversationStateRef, {
          unread: false,
          lastReadTimestamp: serverTimestamp(),
          partnerId: partnerId,
          partnerName: partnerName,
        }, { merge: true });
      }

      // Send comprehensive notifications for media message
      await sendComprehensiveNotifications(userType, {
        senderName: myUserName,
        senderId: myUserId,
        message: type === 'image' ? 'Image envoyée' : `Fichier : ${fileName}`,
        partnerId: partnerId,
        partnerName: partnerName,
        messageType: type,
        fileName: fileName
      });

      console.log(`📎 Media message sent - lastMessageSender: ${myUserId}, userType: ${userType}, currentUser: ${auth.currentUser?.uid}`);
      console.log(`🎯 Notification should be sent to: ${userType === 'partner' ? 'ALL SUPPORT STAFF' : 'PARTNER: ' + partnerId}`);

    } catch (error) {
      console.error('Erreur lors de l\'envoi du message média :', error);
      Alert.alert('Erreur d\'envoi', 'Échec de l\'envoi du média. Veuillez réessayer.');
    }
  };

  // Comprehensive notification function for all user roles
  const sendComprehensiveNotifications = async (senderType, messageData) => {
    console.log('🔔 Starting comprehensive notifications...', { senderType, messageData });
    
    try {
      const title = `Nouveau message de ${messageData.senderName}`;
      const body = messageData.messageType === 'text' ? 
        (messageData.message.length > 100 ? messageData.message.substring(0, 100) + '...' : messageData.message) : 
        messageData.messageType === 'image' ? 'Image envoyée' : 
        `Fichier envoyé: ${messageData.fileName || 'Document'}`;

      const notificationData = {
        type: senderType === 'partner' ? 'partner_chat_message' : 'admin_chat_message', 
        partnerId: messageData.partnerId,
        partnerName: messageData.partnerName,
        senderId: messageData.senderId,
        senderName: messageData.senderName,
        messageType: messageData.messageType,
        timestamp: Date.now(),
        chatType: 'partner_support_chat'
      };

      console.log('🔔 Notification data prepared:', { title, body, notificationData });

      if (senderType === 'partner') {
        // Partner sent message - notify ALL support staff regardless of their current status
        console.log('Sending notifications to IT Support for partner message...');
        
        try {
          console.log('🔔 Checking notification functions availability...');
          console.log('sendNotificationToITSupport:', typeof sendNotificationToITSupport);
          console.log('sendNotificationToUsersByRole:', typeof sendNotificationToUsersByRole);
          console.log('showInAppNotification:', typeof showInAppNotification);
          console.log('scheduleLocalNotification:', typeof scheduleLocalNotification);

          // Notify IT Support agents (isITSupport: true)
          console.log('🔔 Sending to IT Support...');
          const itResults = await sendNotificationToITSupport(title, body, notificationData);
          console.log(`✅ IT Support notifications: ${itResults.successful}/${itResults.total} sent`);

          // Notify Admin role users  
          console.log('🔔 Sending to Admin users...');
          const adminResults = await sendNotificationToUsersByRole('Admin', title, body, notificationData);
          console.log(`✅ Admin notifications: ${adminResults.successful}/${adminResults.total} sent`);

          // Notify Agent role users
          console.log('🔔 Sending to Agent users...');
          const agentResults = await sendNotificationToUsersByRole('Agent', title, body, notificationData);
          console.log(`✅ Agent notifications: ${agentResults.successful}/${agentResults.total} sent`);

          // Also notify any users with 'IT' role
          console.log('🔔 Sending to IT role users...');
          const itRoleResults = await sendNotificationToUsersByRole('IT', title, body, notificationData);
          console.log(`✅ IT role notifications: ${itRoleResults.successful}/${itRoleResults.total} sent`);

          // Send in-app notification for immediate visibility if any users are currently active
          console.log('🔔 Sending in-app notification...');
          showInAppNotification(title, body, notificationData);
          console.log('✅ In-app notification sent');

          // Also schedule a local notification as backup for devices that might be offline
          console.log('🔔 Scheduling local notification...');
          await scheduleLocalNotification(title, body, notificationData, 0);
          console.log('✅ Local notification scheduled as backup');

        } catch (error) {
          console.error('❌ Error in partner notification sending:', error);
          console.error('❌ Error stack:', error.stack);
        }

      } else if (senderType === 'support') {
        // Admin/Support sent message - notify the specific partner
        console.log(`Sending notification to partner ${messageData.partnerId}...`);
        
        try {
          console.log('🔔 Sending notification to partner...');
          const partnerSuccess = await sendNotificationToPartner(
            messageData.partnerId,
            title,
            body,
            notificationData
          );
          console.log(`✅ Partner notification sent: ${partnerSuccess ? 'Success' : 'Failed'}`);

          // Send in-app notification for immediate visibility
          console.log('🔔 Sending in-app notification for partner...');
          showInAppNotification(title, body, notificationData);
          console.log('✅ In-app notification sent for partner');

          // Schedule local notification as backup
          console.log('🔔 Scheduling local notification for partner...');
          await scheduleLocalNotification(title, body, notificationData, 0);
          console.log('✅ Local notification scheduled for partner as backup');

        } catch (error) {
          console.error('❌ Error in support notification sending:', error);
          console.error('❌ Error stack:', error.stack);
        }
      }

      console.log(`Comprehensive notifications completed for ${senderType} message`);
    } catch (error) {
      console.error('Error sending comprehensive notifications:', error);
    }
  };

  const sendMessage = async () => {
    if (inputText.trim() === '' || !partnerId || partnerId === 'defaultTestPartnerId' || !auth.currentUser) {
      Alert.alert("Erreur", "L'ID du partenaire de chat ou l'utilisateur n'est pas défini. Impossible d'envoyer le message.");
      return;
    }

    try {
      const conversationRef = doc(db, 'partnerConversations', partnerId);
      const messagesRef = collection(conversationRef, 'messages');

      await addDoc(messagesRef, {
        senderId: myUserId,
        senderName: myUserName,
        receiverId: theirUserId,
        type: 'text',
        text: inputText,
        timestamp: serverTimestamp(),
      });

      const updateData = {
        lastMessage: inputText,
        lastMessageTimestamp: serverTimestamp(),
        lastMessageSender: myUserId, // Add the sender ID to track who sent the last message
      };
      if (userType === 'partner') {
        updateData.unreadBySupport = true;
      } else if (userType === 'support') {
        updateData.unreadByPartner = true;
      } else {
        updateData.unreadByPartner = true;
        updateData.unreadBySupport = true;
      }

      await setDoc(conversationRef, updateData, { merge: true });

      if (auth.currentUser?.uid) { // Ensure current user is defined
        const userConversationStateRef = doc(
          db,
          'users',
          auth.currentUser.uid,
          'partnerConversationStates',
          partnerId
        );
        await setDoc(userConversationStateRef, {
          unread: false,
          lastReadTimestamp: serverTimestamp(),
          partnerId: partnerId,
          partnerName: partnerName,
        }, { merge: true });
      }

      setInputText('');

      // Send comprehensive notifications based on sender type
      await sendComprehensiveNotifications(userType, {
        senderName: myUserName,
        senderId: myUserId,
        message: inputText,
        partnerId: partnerId,
        partnerName: partnerName,
        messageType: 'text'
      });

      console.log(`📝 Text message sent - lastMessageSender: ${myUserId}, userType: ${userType}, currentUser: ${auth.currentUser?.uid}`);
      console.log(`🎯 Notification should be sent to: ${userType === 'partner' ? 'ALL SUPPORT STAFF' : 'PARTNER: ' + partnerId}`);

    } catch (error) {
      console.error('Erreur lors de l\'envoi du message :', error);
      Alert.alert('Erreur d\'envoi', 'Échec de l\'envoi du message. Veuillez réessayer.');
    }
  };

  const renderMessage = ({ item }) => {
    const isMyMessage = item.senderId === myUserId;

    return (
      <View
        style={[
          styles.messageBubble,
          isMyMessage ? styles.myMessage : styles.theirMessage,
        ]}
      >
        {item.type === 'image' ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.content)} style={styles.mediaContainer}>
            <Image source={{ uri: item.content }} style={styles.chatImage} />
            {/* Download icon overlay for images */}
            <View style={styles.downloadIconOverlay}>
                {/* --- MODIFIED: Use custom image for Cloud Download --- */}
                <Image source={CLOUD_DOWNLOAD_ICON} style={styles.customDownloadIcon} />
                {/* --- END MODIFIED --- */}
            </View>
          </TouchableOpacity>
        ) : item.type === 'file' ? (
          <TouchableOpacity onPress={() => Linking.openURL(item.content)} style={styles.fileMessage}>
            {/* --- MODIFIED: Use custom image for Document File --- */}
            <Image source={DOC_FILE_ICON} style={[styles.customFileIcon, { tintColor: isMyMessage ? '#FFF' : '#1E293B' }]} />
            {/* --- END MODIFIED --- */}
            <Text style={isMyMessage ? styles.myMessageText : styles.theirMessageText}>
              {item.fileName || 'Fichier'}
            </Text>
            {/* Download icon for files */}
            {/* --- MODIFIED: Use custom image for Cloud Download --- */}
            <Image source={CLOUD_DOWNLOAD_ICON} style={[styles.customDownloadIcon, { tintColor: isMyMessage ? '#FFF' : '#1E293B' }]} />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        ) : (
          <Text
            style={
              isMyMessage ? styles.myMessageText : styles.theirMessageText
            }
          >
            {item.text}
          </Text>
        )}
        <Text style={[styles.timestamp, isMyMessage ? styles.myTimestamp : styles.theirTimestamp]}>
          {item.timestamp
            ? new Date(item.timestamp.toDate()).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : ''}
        </Text>
      </View>
    );
  };

  let headerTitle;
  if (userType === 'partner') {
    headerTitle = 'EliteReply';
  } else if (userType === 'support') {
    headerTitle = partnerName;
  } else {
    headerTitle = partnerName;
  }


  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <View style={styles.headerContainer}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#1E293B" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{headerTitle}</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() =>
          flatListRef.current.scrollToEnd({ animated: true })
        }
      />
      <View style={styles.inputArea}>
        <TouchableOpacity onPress={pickDocument} disabled={uploading}>
          {/* --- MODIFIED: Use custom image for Attach icon --- */}
          <Image source={ATTACH_ICON} style={styles.customChatIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>
        <TouchableOpacity onPress={pickImage} disabled={uploading}>
          {/* --- MODIFIED: Use custom image for Image icon --- */}
          <Image source={IMAGE_ICON} style={styles.customChatIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Tapez votre message ici..."
          placeholderTextColor="#999"
          multiline
          editable={!uploading}
        />
        <TouchableOpacity
          style={[styles.sendButton, (inputText.trim() === '' || uploading) && styles.sendButtonDisabled]}
          onPress={sendMessage}
          disabled={inputText.trim() === '' || uploading}
        >
          {uploading ? (
            <ActivityIndicator color="#FFF" size="small" />
          ) : (
            // --- MODIFIED: Use custom image for Send icon ---
            <Image source={SEND_ICON} style={[styles.customSendIcon, { tintColor: '#FFF' }]} />
            // --- END MODIFIED ---
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
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 20,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingTop: Platform.OS === 'android' ? 40 : 10,
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1E293B',
  },
  messageList: {
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#0A8FDF',
    borderBottomRightRadius: 2,
  },
  theirMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E2E8F0',
    borderBottomLeftRadius: 2,
  },
  myMessageText: {
    color: '#fff',
    fontSize: 15,
  },
  theirMessageText: {
    color: '#1E293B',
    fontSize: 15,
  },
  timestamp: {
    fontSize: 10,
    marginTop: 5,
  },
  myTimestamp: {
    color: 'rgba(255,255,255,0.7)',
    alignSelf: 'flex-end',
  },
  theirTimestamp: {
    color: '#64748B',
    alignSelf: 'flex-start',
  },
  // Styles for chat images/files
  mediaContainer: {
    position: 'relative',
  },
  chatImage: {
    width: 200,
    height: 150,
    borderRadius: 8,
    marginBottom: 5,
  },
  downloadIconOverlay: {
      position: 'absolute',
      top: 5,
      right: 5,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: 15,
      padding: 5,
  },
  // --- NEW STYLE for custom download icon (used in overlay) ---
  customDownloadIcon: {
    width: 24, // Match original MaterialIcons size
    height: 24, // Match original MaterialIcons size
    resizeMode: 'contain',
    tintColor: 'white', // Original MaterialIcons color was white
  },
  // --- END NEW STYLE ---
  fileMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  // --- NEW STYLE for custom file icon ---
  customFileIcon: {
    width: 24, // Match original Ionicons size
    height: 24, // Match original Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline based on isMyMessage
  },
  // --- END NEW STYLE ---
  fileDownloadIcon: { // Original MaterialIcons style (kept for reference, but not used for custom icons)
      marginLeft: 'auto', // Push to the right
  },
  inputArea: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFF',
  },
  attachIcon: { // Original Ionicons style (kept for reference, but not used for custom icons)
    marginHorizontal: 8,
  },
  // --- NEW STYLE for Custom Chat Input Icons ---
  customChatIcon: {
    width: 26, // Match original Ionicons size
    height: 26, // Match original Ionicons size
    resizeMode: 'contain',
    tintColor: '#64748b', // Match original Ionicons color
    marginHorizontal: 8,
  },
  customSendIcon: {
    width: 24, // Increased size for better visibility
    height: 24, // Increased size for better visibility
    resizeMode: 'contain',
    tintColor: '#FFF', // Ensure it's white
  },
  // --- END NEW STYLE ---
  textInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginHorizontal: 8,
    fontSize: 16,
    backgroundColor: '#fff',
    color: '#1E293B',
  },
  sendButton: {
    backgroundColor: '#0A8FDF',
    borderRadius: 25,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#93C5FD',
  },
});

export default UnifiedChat;
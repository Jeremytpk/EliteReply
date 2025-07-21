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

  let myUserId = auth.currentUser?.uid;
  let myUserName = auth.currentUser?.displayName || auth.currentUser?.email || 'Utilisateur';

  if (userType === 'partner') {
    myUserId = partnerId;
    myUserName = partnerName;
  } else if (userType === 'support') {
    myUserId = supportTeamId;
    myUserName = supportTeamName;
  }

  const theirUserId = userType === 'partner' ? supportTeamId : partnerId;
  const theirUserName = userType === 'partner' ? supportTeamName : partnerName;


  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [uploading, setUploading] = useState(false);
  const flatListRef = useRef(null);
  const navigation = useNavigation();
  const storage = getStorage();

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
      console.log('Push notification sent successfully!');
    } catch (error) {
      console.error('Failed to send push notification:', error);
    }
  };

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

      const conversationRef = doc(db, 'partnerConversations', partnerId);

      if (userType === 'partner') {
        setDoc(conversationRef, { unreadBySupport: true }, { merge: true }) // Mark unread for support when partner sends
          .catch((error) => console.error('Erreur lors de la mise à jour du statut non lu par le support :', error));
      } else if (userType === 'support') {
        setDoc(conversationRef, { unreadByPartner: true }, { merge: true }) // Mark unread for partner when support sends
          .catch((error) => console.error('Erreur lors de la mise à jour du statut non lu par le partenaire :', error));
      }

      // This logic seems inverted for marking as read.
      // It should mark as read when the CURRENT user *receives* a message from *them*.
      // Let's assume the goal is to mark as read when the current user is viewing the chat.
      if (userType === 'partner') {
        // If current user is partner, mark unreadByPartner as false
        setDoc(conversationRef, { unreadByPartner: false }, { merge: true })
          .catch((error) => console.error('Erreur lors de la mise à jour du statut non lu par le partenaire :', error));
      } else if (userType === 'support') {
        // If current user is support, mark unreadBySupport as false
        setDoc(conversationRef, { unreadBySupport: false }, { merge: true })
          .catch((error) => console.error('Erreur lors de la mise à jour du statut non lu par le support :', error));
      }

      // This part handles user-specific conversation states, which is good.
      if (auth.currentUser?.uid) { // Ensure current user is defined
        const userConversationStateRef = doc(
          db,
          'users',
          auth.currentUser.uid,
          'partnerConversationStates',
          partnerId
        );
        setDoc(userConversationStateRef, {
          unread: false, // Mark as read in user's individual state
          lastReadTimestamp: serverTimestamp(),
          partnerId: partnerId,
          partnerName: partnerName,
        }, { merge: true })
          .catch((error) => console.error('Erreur lors du marquage des messages comme lus (état utilisateur) :', error));
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

      const recipientUserDoc = await getDoc(doc(db, 'users', theirUserId));
      if (recipientUserDoc.exists()) {
        const recipientData = recipientUserDoc.data();
        if (recipientData.expoPushToken) {
          sendPushNotification(
            recipientData.expoPushToken,
            `${myUserName} vous a envoyé un fichier !`,
            type === 'image' ? 'Image envoyée' : `Fichier : ${fileName}`,
            { type: 'partner_chat_media', partnerId: partnerId }
          );
        }
      }

    } catch (error) {
      console.error('Erreur lors de l\'envoi du message média :', error);
      Alert.alert('Erreur d\'envoi', 'Échec de l\'envoi du média. Veuillez réessayer.');
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

      const recipientUserDoc = await getDoc(doc(db, 'users', theirUserId));
      if (recipientUserDoc.exists()) {
        const recipientData = recipientUserDoc.data();
        if (recipientData.expoPushToken) {
          sendPushNotification(
            recipientData.expoPushToken,
            `${myUserName} vous a envoyé un message !`,
            inputText,
            { type: 'partner_chat_message', partnerId: partnerId }
          );
        }
      }

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
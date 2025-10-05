import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  Alert,
  Linking, // NEW: Import Linking for opening URLs
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { db, auth } from '../../firebase';
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
  orderBy,
  query,
  addDoc,
  getDoc,
  deleteDoc,
  getDocs,
} from 'firebase/firestore';

import { Dropdown } from 'react-native-element-dropdown';

const PartnerChat = ({ route, navigation }) => {
  const initialPartnerId = route.params?.partnerId;
  const initialPartnerName = route.params?.partnerName;

  const currentUser = auth.currentUser;

  const [selectedPartnerId, setSelectedPartnerId] = useState(initialPartnerId);
  const [selectedPartnerName, setSelectedPartnerName] = useState(initialPartnerName);
  const [selectedPartnerData, setSelectedPartnerData] = useState(null);

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState('');

  const [allPartnersForDropdown, setAllPartnersForDropdown] = useState([]);
  const [loadingPartnersForDropdown, setLoadingPartnersForDropdown] = useState(true);

  const flatListRef = useRef(null);

  // --- Effect for fetching all partners for the dropdown ---
  useEffect(() => {
    const partnersCollectionRef = collection(db, 'partners');
    const q = query(partnersCollectionRef, orderBy('name', 'asc'));

    const unsubscribePartners = onSnapshot(q, (snapshot) => {
      const fetchedPartners = snapshot.docs.map(doc => ({
        id: doc.id,
        label: doc.data().name,
        value: doc.id,
        ...doc.data(),
      }));
      setAllPartnersForDropdown(fetchedPartners);
      setLoadingPartnersForDropdown(false);
    }, (error) => {
      console.error("Error fetching all partners for dropdown:", error);
      setLoadingPartnersForDropdown(false);
    });

    return () => unsubscribePartners();
  }, []);

  // --- Effect for handling chat setup when a partner is selected ---
  useEffect(() => {
    let unsubscribeChat;

    if (selectedPartnerId && currentUser) {
      navigation.setOptions({ title: selectedPartnerName });

      const fetchSelectedPartnerData = async () => {
        try {
          const partnerDoc = await getDoc(doc(db, 'partners', selectedPartnerId));
          if (partnerDoc.exists()) {
            setSelectedPartnerData(partnerDoc.data());
          }
        } catch (error) {
          console.error("Error fetching selected partner data:", error);
        }
      };
      fetchSelectedPartnerData();

      const conversationId = [currentUser.uid, selectedPartnerId].sort().join('_');
      const messagesRef = collection(db, 'partnerConversations', conversationId, 'messages');
      const messagesQuery = query(messagesRef, orderBy('createdAt', 'desc'));

      unsubscribeChat = onSnapshot(messagesQuery, (snapshot) => {
        const messagesData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate()
        }));
        setMessages(messagesData);
      });

      const createConversation = async () => {
        const convoRef = doc(db, 'partnerConversations', conversationId);
        const convoSnap = await getDoc(convoRef);

        if (!convoSnap.exists()) {
          await setDoc(convoRef, {
            participants: [currentUser.uid, selectedPartnerId],
            participantNames: [currentUser.displayName || 'Current User', selectedPartnerName],
            createdAt: serverTimestamp(),
            lastUpdated: serverTimestamp(),
            lastMessage: '',
            unreadBySupport: false,
            unreadByPartner: false,
          });
        }
      };
      createConversation();
    } else {
      navigation.setOptions({ title: 'Sélectionner un Partenaire' });
      setMessages([]);
      setSelectedPartnerData(null);
    }

    return () => unsubscribeChat && unsubscribeChat();
  }, [selectedPartnerId, selectedPartnerName, currentUser, navigation]);

  // --- NEW EFFECT: Update lastRead timestamp when chat is opened/viewed ---
  useEffect(() => {
    if (currentUser && selectedPartnerId) {
      const conversationId = [currentUser.uid, selectedPartnerId].sort().join('_');
      const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', conversationId);

      const updateLastReadTimestamp = async () => {
        try {
          await setDoc(userConvoStateRef, { lastRead: serverTimestamp() }, { merge: true });
          console.log(`Last read timestamp updated for conversation ${conversationId} by user ${currentUser.uid}`);
        } catch (error) {
          console.error("Error updating last read timestamp:", error);
        }
      };

      updateLastReadTimestamp();
    }
  }, [currentUser?.uid, selectedPartnerId]);


  const handlePartnerSelect = (item) => {
    setSelectedPartnerId(item.value);
    setSelectedPartnerName(item.label);
  };

  const sendMessage = async () => {
    if (message.trim() === '' || !selectedPartnerId || !currentUser) return;

    try {
      const conversationId = [currentUser.uid, selectedPartnerId].sort().join('_');
      const messagesRef = collection(db, 'partnerConversations', conversationId, 'messages');

      await addDoc(messagesRef, {
        text: message,
        senderId: currentUser.uid,
        senderName: currentUser.displayName || 'Current User',
        createdAt: serverTimestamp(),
        type: 'text', // Explicitly set type for text messages
      });

      const convoRef = doc(db, 'partnerConversations', conversationId);
      await setDoc(convoRef, {
        lastMessage: message,
        lastUpdated: serverTimestamp(),
        unreadByPartner: true,
        unreadBySupport: false,
      }, { merge: true });

      const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', conversationId);
      await setDoc(userConvoStateRef, { lastRead: serverTimestamp() }, { merge: true });

      setMessage('');
    } catch (error) {
      console.error("Error sending message:", error);
    }
  };

  const deleteConversation = async () => {
    if (!selectedPartnerId || !currentUser) return;

    Alert.alert(
      "Supprimer la conversation",
      `Êtes-vous sûr de vouloir supprimer cette conversation avec ${selectedPartnerName} ? Cette action est irréversible et supprimera tous les messages.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          onPress: async () => {
            try {
              const conversationId = [currentUser.uid, selectedPartnerId].sort().join('_');
              const convoRef = doc(db, 'partnerConversations', conversationId);
              const messagesCollectionRef = collection(convoRef, 'messages');

              const messagesSnapshot = await getDocs(messagesCollectionRef);
              const deleteMessagePromises = messagesSnapshot.docs.map(messageDoc =>
                deleteDoc(doc(messagesCollectionRef, messageDoc.id))
              );
              await Promise.all(deleteMessagePromises);
              console.log(`All messages for conversation ${conversationId} deleted.`);

              await deleteDoc(convoRef);
              console.log(`Conversation document ${conversationId} deleted.`);

              const userConvoStateRef = doc(db, 'users', currentUser.uid, 'partnerConversationStates', conversationId);
              await deleteDoc(userConvoStateRef);
              console.log(`User conversation state for ${conversationId} deleted.`);

              setSelectedPartnerId(null);
              setSelectedPartnerName(null);
              setMessages([]);
              Alert.alert("Succès", "Conversation supprimée avec succès.");
            } catch (error) {
              console.error("Error deleting conversation:", error);
              Alert.alert("Erreur", "Impossible de supprimer la conversation.");
            }
          }
        }
      ]
    );
  };


  const renderMessage = ({ item }) => {
    const isMe = item.senderId === currentUser?.uid;

    return (
      <View style={[
        styles.messageContainer,
        isMe ? styles.myMessage : styles.theirMessage
      ]}>
        {!isMe && selectedPartnerData?.logo ? ( // Use selectedPartnerData.logo for image
          <Image
            source={{ uri: selectedPartnerData.logo }}
            style={styles.avatar}
          />
        ) : !isMe && (
          <Image
            source={require('../../assets/images/Profile.png')}
            style={styles.avatar}
          />
        )}
        <View style={[
          styles.messageBubble,
          isMe ? styles.myBubble : styles.theirBubble
        ]}>
          {!isMe && (
            <Text style={styles.senderName}>{item.senderName}</Text>
          )}

          {/* NEW: Handle different message types for display and download */}
          {item.type === 'image' ? (
            <TouchableOpacity onPress={() => Linking.openURL(item.content)}>
              <Image source={{ uri: item.content }} style={styles.chatImage} />
            </TouchableOpacity>
          ) : item.type === 'file' ? (
            <TouchableOpacity onPress={() => Linking.openURL(item.content)} style={styles.fileMessage}>
              <MaterialIcons name="insert-drive-file" size={24} color={isMe ? '#FFF' : '#111827'} />
              <Text style={[styles.messageText, isMe ? styles.myMessageText : {}]}>
                {item.fileName || 'Fichier'}
              </Text>
            </TouchableOpacity>
          ) : (
            <Text style={[styles.messageText, isMe ? styles.myMessageText : {}]}>{item.text}</Text>
          )}

          <Text style={styles.messageTime}>
            {item.createdAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
        {isMe && (
          <Image
            source={currentUser?.photoURL ? { uri: currentUser.photoURL } : require('../../assets/images/Profile.png')}
            style={styles.avatar}
          />
        )}
      </View>
    );
  };

  const customSearchFilter = useCallback((item, keyword) => {
    const searchLower = keyword.toLowerCase();
    return (
      (item.name && item.name.toLowerCase().includes(searchLower)) ||
      (item.manager && item.manager.toLowerCase().includes(searchLower)) ||
      (item.ceo && item.ceo.toLowerCase().includes(searchLower)) ||
      (item.numeroTelephone && String(item.numeroTelephone).toLowerCase().includes(searchLower))
    );
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Partner Dropdown Search/Selection */}
      <View style={styles.dropdownContainer}>
        {loadingPartnersForDropdown ? (
          <ActivityIndicator size="small" color="#34C759" />
        ) : (
          <Dropdown
            style={styles.dropdown}
            placeholderStyle={styles.placeholderStyle}
            selectedTextStyle={styles.selectedTextStyle}
            inputSearchStyle={styles.inputSearchStyle}
            iconStyle={styles.iconStyle}
            data={allPartnersForDropdown}
            search
            maxHeight={300}
            labelField="label"
            valueField="value"
            placeholder={!selectedPartnerId ? 'Sélectionner un partenaire...' : selectedPartnerName}
            searchPlaceholder="Rechercher..."
            value={selectedPartnerId}
            onChange={handlePartnerSelect}
            renderLeftIcon={() => (
              <MaterialIcons style={styles.icon} name="people" size={20} color="#666" />
            )}
            searchQuery={customSearchFilter}
            onFocus={() => {
                if (selectedPartnerId && !initialPartnerId) {
                    setSelectedPartnerId(null);
                    setSelectedPartnerName(null);
                    setSelectedPartnerData(null);
                }
            }}
          />
        )}
      </View>

      {selectedPartnerId ? (
        <>
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messagesList}
            inverted
          />

          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              value={message}
              onChangeText={setMessage}
              placeholder="Écrire un message..."
              placeholderTextColor="#999"
              multiline
            />
            <TouchableOpacity onPress={sendMessage} style={styles.sendButton}>
              <MaterialIcons name="send" size={24} color="#34C759" />
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={deleteConversation} style={styles.deleteConversationButton}>
            <Text style={styles.deleteConversationButtonText}>Supprimer cette conversation</Text>
          </TouchableOpacity>
        </>
      ) : (
        <View style={styles.selectPartnerPrompt}>
          <MaterialIcons name="chat" size={50} color="#C0C0C0" />
          <Text style={styles.selectPartnerText}>
            Veuillez sélectionner un partenaire pour commencer à discuter.
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  dropdownContainer: {
    backgroundColor: 'white',
    borderRadius: 25,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 3,
    justifyContent: 'center',
    minHeight: 50,
  },
  dropdown: {
    height: 40,
    borderColor: 'gray',
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  icon: {
    marginRight: 5,
  },
  placeholderStyle: {
    fontSize: 16,
    color: '#999',
  },
  selectedTextStyle: {
    fontSize: 16,
    color: '#333',
  },
  inputSearchStyle: {
    height: 40,
    fontSize: 16,
    color: '#333',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 10,
  },
  selectPartnerPrompt: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  selectPartnerText: {
    fontSize: 18,
    color: '#666',
    textAlign: 'center',
    marginTop: 15,
  },
  messagesList: {
    padding: 16,
  },
  messageContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    alignItems: 'flex-end',
  },
  myMessage: {
    justifyContent: 'flex-end',
  },
  theirMessage: {
    justifyContent: 'flex-start',
  },
  messageBubble: {
    maxWidth: '70%',
    padding: 12,
    borderRadius: 12,
    marginHorizontal: 8,
  },
  myBubble: {
    backgroundColor: '#34C759',
    borderBottomRightRadius: 0,
  },
  theirBubble: {
    backgroundColor: '#E5E7EB',
    borderBottomLeftRadius: 0,
  },
  messageText: {
    fontSize: 16,
    color: '#111827',
  },
  myMessageText: {
    color: 'white',
  },
  senderName: {
    fontWeight: 'bold',
    marginBottom: 4,
    fontSize: 12,
    color: '#4B5563',
  },
  messageTime: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'right',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 8,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  input: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 100,
  },
  sendButton: {
    marginLeft: 8,
    alignSelf: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteConversationButton: {
    backgroundColor: '#FF3B30',
    padding: 12,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 10,
    alignItems: 'center',
  },
  deleteConversationButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  // NEW Styles for chat images/files
  chatImage: {
    width: 200, // Or dynamic width
    height: 150, // Or dynamic height
    borderRadius: 8,
    marginBottom: 5,
  },
  fileMessage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8, // Spacing between icon and text
  },
});

export default PartnerChat;
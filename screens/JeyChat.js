import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  Modal,
  Pressable,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { db, auth, storage } from '../firebase';
import {
  collection,
  doc,
  addDoc,
  serverTimestamp,
  onSnapshot,
  query,
  orderBy,
  updateDoc,
  getDoc,
  deleteField,
  arrayUnion,
  arrayRemove,
  writeBatch,
  runTransaction,
  increment,
  getDocs,
  where,
} from 'firebase/firestore';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import PropTypes from 'prop-types';
import { useFocusEffect } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

import callJeyProxy from '../services/jeyProxy';

const Conversation = ({ route, navigation }) => {
  const {
    ticketId = '',
    isITSupport = false,
    userId: initialUserId = '',
    userName: initialUserName = '',
    userPhone = ''
  } = route.params || {};

  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isJeyTyping, setIsJeyTyping] = useState(false);
  const [ticketInfo, setTicketInfo] = useState(null);
  const [agent, setAgent] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [isTerminated, setIsTerminated] = useState(false);

  const [typingUserName, setTypingUserName] = useState(null);
  const typingTimeoutRef = useRef(null);

  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [partners, setPartners] = useState([]);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [clientNames, setClientNames] = useState([{ id: Date.now(), name: '' }]);
  const [appointmentDate, setAppointmentDate] = useState(new Date());
  const [appointmentTime, setAppointmentTime] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [partnerSearch, setPartnerSearch] = useState('');
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [currentTicketAppointments, setCurrentTicketAppointments] = useState([]);

  const [generatedCode, setGeneratedCode] = useState(null);
  const couponQrCodeRef = useRef();

  const currentUser = auth.currentUser;
  const flatListRef = useRef();

  const actualClientUid = isITSupport ? initialUserId : currentUser?.uid;
  const actualClientName = isITSupport ? initialUserName : currentUser?.displayName || 'Client';


  useFocusEffect(
    useCallback(() => {
      if (!currentUser) {
        Alert.alert('Non autorisé', 'Vous devez être connecté pour accéder aux conversations');
        navigation.navigate('Login');
      }
      return () => {
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        updateTypingStatus(false);
      };
    }, [currentUser, navigation])
  );

  useEffect(() => {
    if (!ticketId) {
      console.log("DEBUG: ticketId is missing, going back.");
      Alert.alert('Erreur', 'Identifiant de ticket manquant');
      navigation.goBack();
      return;
    }
    console.log(`DEBUG: Conversation component loaded for ticketId: ${ticketId}, isITSupport: ${isITSupport}`);

    const unsubscribeTicket = onSnapshot(doc(db, 'tickets', ticketId), async (ticketDoc) => {
      console.log("DEBUG: Ticket info snapshot received.");
      if (ticketDoc.exists()) {
        const data = ticketDoc.data();
        setTicketInfo(data);
        setIsTerminated(data.status === 'terminé');
        setCurrentTicketAppointments(data.appointments || []);
        console.log("DEBUG: Ticket status:", data.status);
        console.log("DEBUG: initialJeyMessageSent:", data.initialJeyMessageSent);


        if (data.assignedTo) {
          console.log("DEBUG: Ticket assigned to:", data.assignedToName || 'An agent');
          await notifierArriveeAgent(data);

          if (isITSupport && currentUser && currentUser.uid === data.assignedTo) {
            setAgent(currentUser.displayName || 'Agent Connecté');
          } else {
            const agentDoc = await getDoc(doc(db, 'users', data.assignedTo));
            if (agentDoc.exists()) {
              setAgent(agentDoc.data().name || 'Agent');
            } else {
              setAgent(data.assignedToName || 'Agent');
            }
          }
        } else {
          setAgent(null);
          console.log("DEBUG: Ticket is not assigned to a human agent.");
        }
      } else {
        console.log("DEBUG: Ticket does not exist.");
        setIsTerminated(true);
        setTicketInfo(null);
        Alert.alert('Conversation introuvable', 'Ce ticket a peut-être été terminé et archivé.');
      }
    }, (error) => {
      console.error("ERROR: Error fetching ticket info:", error);
      Alert.alert("Erreur", "Impossible de charger les informations du ticket");
      setIsTerminated(true);
    });

    if (isITSupport) {
      console.log("DEBUG: Current user is IT Support, fetching partners.");
      fetchPartners();
    }

    return () => {
      console.log("DEBUG: Unsubscribing from ticket info.");
      unsubscribeTicket();
    };
  }, [ticketId, isITSupport, currentUser?.uid, currentUser?.displayName, navigation]);


  useEffect(() => {
    if (!ticketId) return;
    console.log("DEBUG: Setting up messages listener.");

    const messagesQuery = query(
      collection(db, 'tickets', ticketId, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsubscribeMessages = onSnapshot(messagesQuery,
      async (querySnapshot) => {
        console.log("DEBUG: Messages snapshot received.");
        const msgs = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date()
        }));

        const shouldScroll = messages.length !== msgs.length || chargement;
        setMessages(msgs);
        if (shouldScroll) {
          setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
        }
        setChargement(false);
        setRefreshing(false);
        console.log(`DEBUG: Fetched ${msgs.length} messages.`);


        // Logic for Jey's initial welcome message
        if (ticketInfo?.status === 'jey-handling' && !isITSupport && ticketInfo?.initialJeyMessageSent !== true) {
            console.log("DEBUG: Checking condition for Jey's initial welcome message.");
            const hasJeyMessages = msgs.some(msg => msg.expediteurId === 'jey-ai');
            const hasInitialUserMessage = msgs.length === 1 && msgs[0].expediteurId === currentUser.uid;

            console.log("  hasInitialUserMessage:", hasInitialUserMessage);
            console.log("  hasJeyMessages (in snapshot):", hasJeyMessages);

            if (hasInitialUserMessage && !hasJeyMessages) {
                console.log("DEBUG: Triggering Jey's initial welcome response.");
                await getJeyResponse([msgs[0]], true);
            } else if (msgs.length > 1 && !hasJeyMessages) {
                console.log("DEBUG: Jey has no messages yet but conversation has progressed. No initial welcome.");
            }
        }

      },
      (error) => {
        console.error("ERROR: Error loading messages:", error);
        Alert.alert('Erreur', 'Impossible de charger les messages.');
        setChargement(false);
        setRefreshing(false);
      }
    );

    return () => {
      console.log("DEBUG: Unsubscribing from messages.");
      unsubscribeMessages();
    };
  }, [ticketId, chargement, messages.length, isITSupport, ticketInfo?.status, ticketInfo?.initialJeyMessageSent, currentUser?.uid, getJeyResponse]);


  useEffect(() => {
    if (!ticketId || !currentUser) return;
    console.log("DEBUG: Setting up typing status listener.");

    const conversationRef = doc(db, 'conversations', ticketId);

    const unsubscribeTyping = onSnapshot(conversationRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const typingUsers = data.typingUsers || {};
        let nameOfTyper = null;

        for (const userId in typingUsers) {
          if (userId !== currentUser.uid) {
            nameOfTyper = typingUsers[userId];
            break;
          }
        }
        if (nameOfTyper) {
            console.log("DEBUG: Typing user detected:", nameOfTyper);
        }
        setTypingUserName(nameOfTyper);
      } else {
        console.log("DEBUG: Conversation doc for typing does not exist.");
        setTypingUserName(null);
      }
    }, (error) => {
      console.error("ERROR: Error listening to typing status:", error);
    });

    return () => {
      console.log("DEBUG: Unsubscribing from typing status.");
      unsubscribeTyping();
    };
  }, [ticketId, currentUser]);

  const updateTypingStatus = async (isTyping) => {
    if (!currentUser || !ticketId || !ticketInfo) {
        console.log("DEBUG: Cannot update typing status. Missing currentUser, ticketId, or ticketInfo.");
        return;
    }
    console.log(`DEBUG: Attempting to update typing status to: ${isTyping}`);

    const conversationRef = doc(db, 'conversations', ticketId);
    const userKey = currentUser.uid;

    const isHumanTypingAllowed = !isTerminated &&
                                (isITSupport || ticketInfo.status === 'jey-handling' || ticketInfo.status === 'escalated_to_agent');

    if (!isHumanTypingAllowed) {
        console.log("DEBUG: Human typing not allowed based on ticket status or termination.");
        return;
    }

    try {
      if (isTyping) {
        await updateDoc(conversationRef, {
          [`typingUsers.${userKey}`]: currentUser.displayName || (isITSupport ? 'Agent' : 'Client')
        });
        console.log("DEBUG: Typing status set to true.");
      } else {
        await updateDoc(conversationRef, {
          [`typingUsers.${userKey}`]: deleteField()
        });
        console.log("DEBUG: Typing status set to false (field deleted).");
      }
    } catch (error) {
      console.error("ERROR: Error updating typing status:", error);
    }
  };

  const handleTextInputChange = (text) => {
    setNouveauMessage(text);
    console.log(`DEBUG: Text input changed to: "${text}"`);

    if (!currentUser || isTerminated) {
        console.log("DEBUG: User not logged in or conversation terminated. Not tracking typing.");
        updateTypingStatus(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
        return;
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (text.length > 0) {
      updateTypingStatus(true);

      typingTimeoutRef.current = setTimeout(() => {
        updateTypingStatus(false);
        typingTimeoutRef.current = null;
        console.log("DEBUG: Typing status cleared by timeout.");
      }, 3000);
    } else {
      updateTypingStatus(false);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
      console.log("DEBUG: Text input is empty, typing status cleared.");
    }
  };

  const notifierArriveeAgent = async (ticketData) => {
    console.log("DEBUG: notifierArriveeAgent called.");
  };

  const onRefresh = useCallback(() => {
    console.log("DEBUG: Refreshing conversation data.");
    setRefreshing(true);
    setChargement(true);
  }, []);


  const archiveTerminatedTicket = async (currentTicketId) => {
    console.log(`DEBUG: Archiving ticket ${currentTicketId}.`);
    try {
      const ticketDocRef = doc(db, 'tickets', currentTicketId);
      const ticketDoc = await getDoc(ticketDocRef);
      if (!ticketDoc.exists()) {
        console.log("DEBUG: Ticket not found for archiving.");
        throw new Error("Ticket non trouvé.");
      }

      let conversationData = null;
      const conversationDocRef = doc(db, 'conversations', currentTicketId);
      const conversationDoc = await getDoc(conversationDocRef);
      if (conversationDoc.exists()) {
        conversationData = conversationDoc.data();
      }

      let messagesToArchive = [];
      const messagesQuery = query(
        collection(db, 'tickets', currentTicketId, 'messages'),
        orderBy('createdAt', 'asc')
      );
      const messagesSnapshot = await getDocs(messagesQuery);
      messagesToArchive = messagesSnapshot.docs.map(msgDoc => ({
        id: msgDoc.id,
        ...msgDoc.data(),
        createdAt: msgDoc.data().createdAt && typeof msgDoc.data().createdAt.toDate === 'function'
          ? msgDoc.data().createdAt.toDate().toISOString()
          : (msgDoc.data().createdAt instanceof Date
            ? msgDoc.createdAt.toISOString()
            : null)
      }));
      console.log(`DEBUG: Found ${messagesToArchive.length} messages for archiving.`);

      const archiveData = {
        ticketData: ticketDoc.data(),
        conversationData,
        messages: messagesToArchive,
        terminatedAt: serverTimestamp(),
        terminatedBy: currentUser.uid,
        terminatedByName: currentUser.displayName || 'Agent',
        originalTicketId: currentTicketId
      };

      await addDoc(collection(db, 'terminatedTickets'), archiveData);
      console.log("DEBUG: Ticket archived in 'terminatedTickets' collection.");

      if (conversationDoc.exists()) {
        const batch = writeBatch(db);
        const messagesCollectionRef = collection(db, 'tickets', currentTicketId, 'messages');
        const messagesSnap = await getDocs(messagesCollectionRef);
        messagesSnap.docs.forEach(msgDoc => {
          batch.delete(msgDoc.ref);
        });
        batch.delete(conversationDocRef);
        await batch.commit();
        console.log("DEBUG: Active conversation and messages deleted from 'tickets' and 'conversations' collections.");
      }

      await updateDoc(ticketDocRef, {
        status: 'terminé',
        termineLe: serverTimestamp()
      });
      console.log("DEBUG: Original ticket status updated to 'terminé'.");

      const agentUserRef = doc(db, 'users', currentUser.uid);
      console.log(`DEBUG: Incrementing terminatedTicketsCount for agent: ${currentUser.uid}`);

      await runTransaction(db, async (transaction) => {
        const agentDoc = await transaction.get(agentUserRef);
        if (!agentDoc.exists()) {
          console.warn(`WARN: Agent user document with ID ${currentUser.uid} not found. Creating it and setting terminatedTicketsCount to 1.`);
          transaction.set(agentUserRef, { terminatedTicketsCount: 1 }, { merge: true });
        } else {
          transaction.update(agentUserRef, { terminatedTicketsCount: increment(1) });
        }
      });
      console.log("DEBUG: Agent's terminatedTicketsCount incremented.");

      const globalCountsRef = doc(db, '_meta_data', 'globalCounts');
      await runTransaction(db, async (transaction) => {
        const sfDoc = await transaction.get(globalCountsRef);
        if (!sfDoc.exists()) {
          transaction.set(globalCountsRef, { terminatedTickets: 1 });
        } else {
          transaction.update(globalCountsRef, { terminatedTickets: increment(1) });
        }
      });
      console.log("DEBUG: Global terminatedTickets count incremented.");

      return true;
    } catch (error) {
      console.error("ERROR: Error in archiveTerminatedTicket:", error);
      Alert.alert("Erreur d'archivage", error.message || "Une erreur est survenue lors de l'archivage du ticket.");
      return false;
    }
  };

  const terminerConversation = async () => {
    console.log("DEBUG: Terminate conversation initiated.");
    Alert.alert(
      'Terminer la conversation',
      'Êtes-vous sûr de vouloir terminer cette conversation? Elle sera archivée.',
      [
        { text: 'Annuler', style: 'cancel', onPress: () => console.log("DEBUG: Terminate conversation cancelled.") },
        {
          text: 'Terminer',
          style: 'destructive',
          onPress: async () => {
            console.log("DEBUG: User confirmed termination.");
            try {
              const archived = await archiveTerminatedTicket(ticketId);

              if (archived) {
                await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                  texte: `${currentUser.displayName || 'L\'Agent'} a terminé cette conversation.`,
                  expediteurId: 'systeme',
                  nomExpediteur: 'Système',
                  createdAt: serverTimestamp()
                });
                console.log("DEBUG: System message added about termination.");

                setIsTerminated(true);
                Alert.alert('Succès', 'La conversation a été terminée et archivée.');
                console.log("DEBUG: Conversation terminated successfully, navigating back.");
                navigation.goBack();
              } else {
                console.log("DEBUG: Archiving failed, marking as terminated without full archive.");
                Alert.alert(
                  "Avertissement",
                  "La conversation n'a pas pu être archivée correctement. Veuillez vérifier les logs. " +
                  "Elle sera tout de même marquée comme terminée."
                );
                await updateDoc(doc(db, 'tickets', ticketId), {
                  status: 'terminé',
                  termineLe: serverTimestamp()
                });
                setIsTerminated(true);
                navigation.goBack();
              }
            } catch (error) {
              console.error("ERROR: Error in terminerConversation:", error);
              Alert.alert('Erreur', 'Impossible de terminer la conversation');
            }
          }
        }
      ]
    );
  };

  const getJeyResponse = useCallback(async (conversationHistory, isInitialMessage = false) => {
    console.log(`DEBUG: getJeyResponse called. Is initial message: ${isInitialMessage}.`);
  // OpenAI requests are now proxied to the secure backend (jeyProxy). Server-side will validate API key and handle errors.

    if (isITSupport) {
        console.log("DEBUG: Current user is IT Support, Jey will not respond.");
        return;
    }
    console.log("DEBUG: Jey is now typing...");
    setIsJeyTyping(true);
    try {
      const openaiMessages = conversationHistory.map(msg => ({
        role: msg.expediteurId === 'jey-ai' ? 'assistant' : 'user',
        content: msg.texte,
      }));
      console.log("DEBUG: OpenAI messages prepared for Jey:", openaiMessages);

      let currentJeyContent;
      if (isInitialMessage && openaiMessages.length === 1 && openaiMessages[0].role === 'user') {
          console.log("DEBUG: Using short welcome prompt for initial message.");
          currentJeyContent = `Bonjour ! Je suis Jey, votre assistant virtuel. Je suis là pour vous aider avec votre demande. Comment puis-je vous assister ?`;
      } else {
          console.log("DEBUG: Using full system prompt for Jey's response.");
          // --- START: UPDATED SYSTEM PROMPT ---
          currentJeyContent = `Tu es Jey, un assistant IA de service client pour une plateforme de services EliteReply évoluant dans un pays francophone. Ton objectif est de comprendre les besoins des clients et de leur offrir une assistance complète et pertinente.

**Rôles et Compétences:**
1.  **Compréhension des besoins:** Écoute attentivement les requêtes du client, en te basant sur sa catégorie de sélection initiale et son message. Pose des questions clarifiantes si nécessaire.
    * **Catégorie de la demande du client:** ${ticketInfo?.category || 'Non spécifiée'}
2.  **Prise de rendez-vous (simulation):**
    * Si un client souhaite prendre un rendez-vous, demande toujours son **nom complet**, le **type de service** (en t'appuyant sur la catégorie si possible), la **date préférée** (jour et mois, ex: "le 16 Août"), et le **créneau horaire souhaité** (matin/après-midi ou heure précise).
    * Une fois ces informations obtenues, dis au client que tu as enregistré sa demande et qu'un agent humain le contactera sous peu pour confirmer et finaliser le rendez-vous. Ne tente pas de créer de faux rendez-vous.
    * Exemple de réponse pour confirmation: "Parfait ! J'ai noté votre demande pour un rendez-vous pour [nom complet] pour [type de service] le [date] dans le créneau [heure/période]. Un de nos agents vous contactera très vite pour finaliser et confirmer cela avec vous."
3.  **Suggestion de partenaires:**
    * Si le client exprime un besoin qui pourrait être couvert par un partenaire, **annonce-lui d'abord que tu as des suggestions dans cette catégorie et demande s'il souhaite que tu les proposes.**
    * **Si le client dit "oui", propose-lui des partenaires pertinents.**
    * **Priorité:** Toujours suggérer les partenaires avec les plus longues promotions en premier. Si tu manques d'informations sur les promotions, suggère les plus pertinents par catégorie.
    * **Ne jamais envoyer un client directement sur un site web de partenaire ou lui donner un contact direct.** Le rôle est de suggérer et de préparer le terrain pour l'agent.
    * **Exemple de liste de partenaires (pour ta connaissance, ne pas la réciter telle quelle):**
        * **Voyage Express:** Voyages de dernière minute et forfaits tout compris. (Promotion: 30% jusqu'au 31 déc. 2025)
        * **Auto Plus:** Location de véhicules, SUV, citadines, chauffeurs privés. (Promotion: 15% sur 1ère location jusqu'au 30 nov. 2025)
        * **Délice Gourmand:** Restaurants gastronomiques, traiteur, cuisine française moderne. (Promotion: Plat offert pour 2 personnes jusqu'au 15 janv. 2026)
        * **Bien-Être Santé:** Consultations médicales en ligne, suivi nutritionnel, programmes bien-être. (Promotion: 1ère consultation gratuite jusqu'au 31 oct. 2025)
    * Si le client demande plus de suggestions, propose d'autres partenaires de la catégorie (toujours les promotions d'abord).
4.  **Assistance générale et Clôture:**
    * Réponds à toutes les questions non spécifiques.
    * Lorsque tu estimes que le client a reçu toute l'assistance nécessaire et semble satisfait, demande-lui s'il souhaite terminer la conversation. Ex: "Avez-vous d'autres questions, ou pouvons-nous clôturer cette conversation ?"
5.  **Escalade vers un agent humain (pour difficultés ou demande explicite):**
    * Si tu ne peux pas résoudre le problème, si le client demande expressément à parler à un "agent", "humain", "quelqu'un", ou "transférer", informe-le que tu vas escalader sa demande.
    * **Si tu es confus ou ne peux pas comprendre la demande après plusieurs tentatives, ou si tu manques d'informations pertinentes pour aider, utilise une phrase comme "Je ne comprends pas bien votre demande, je vais escalader à un agent humain."**

**Instructions générales:**
* Parle toujours en français.
* Sois amical, professionnel et très important pour les clients.
* Ton nom est Jey.
* Le nom du client est ${actualClientName}.
* Évite de t'excuser inutilement.
* Ne génère pas d'informations fausses ou inventées. Si tu ne sais pas, dis que tu transfères à un agent.
`;
      }


      openaiMessages.unshift({
        role: 'system',
        content: currentJeyContent,
      });

      console.log("DEBUG: Sending request to backend jeyProxy...");
      let proxyResp;
      try {
        console.debug('JeyChat: calling jeyProxy, uid=', auth.currentUser && auth.currentUser.uid);
        proxyResp = await callJeyProxy(openaiMessages, {
          systemPrompt: currentJeyContent,
          max_tokens: 150,
          temperature: 0.7
        });
        console.log("DEBUG: jeyProxy response received:", proxyResp);
      } catch (err) {
        console.error('JeyChat: jeyProxy call failed:', err && (err.message || err));
        if (err && err.status) console.error('JeyChat: jeyProxy status:', err.status, 'code:', err.code, 'details:', err.details);
        // Insert a system message so the failure is visible in the conversation
        await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
          texte: 'Jey failed to respond (backend error).',
          expediteurId: 'system',
          nomExpediteur: 'System',
          createdAt: serverTimestamp(),
          type: 'system',
          meta: { jeyProxyError: { message: err && err.message, status: err && err.status, details: err && err.details } }
        });
        return;
      }
      const jeyText = proxyResp?.data?.choices?.[0]?.message?.content?.trim();
      console.log("DEBUG: Jey's raw response text:", jeyText);

      const lowerCaseJeyText = jeyText.toLowerCase();
      const shouldEscalateBasedOnKeywords = lowerCaseJeyText.includes('escalader') ||
                                             lowerCaseJeyText.includes('agent humain') ||
                                             lowerCaseJeyText.includes('prendre le relais') ||
                                             lowerCaseJeyText.includes('je ne comprends pas') ||
                                             lowerCaseJeyText.includes('je ne peux pas vous aider') ||
                                             lowerCaseJeyText.includes('je ne suis pas sûr') || // Added for more general confusion
                                             lowerCaseJeyText.includes('transfert à un agent'); // Added another common phrase

      if (shouldEscalateBasedOnKeywords) {
            console.log("DEBUG: Jey detected escalation keywords or indicated confusion!");
            await updateDoc(doc(db, 'tickets', ticketId), {
                status: 'escalated_to_agent',
                isAgentRequested: true,
                lastUpdated: serverTimestamp(),
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                status: 'escalated_to_agent',
                isAgentRequested: true,
                lastUpdated: serverTimestamp(),
            });

            if (!lowerCaseJeyText.includes('escalader') && !lowerCaseJeyText.includes('agent humain') && !lowerCaseJeyText.includes('prendre le relais') && !lowerCaseJeyText.includes('transfert à un agent')) {
                await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                    texte: `Votre demande a été escaladée à un agent humain. Un agent prendra le relais sous peu.`,
                    expediteurId: 'systeme',
                    nomExpediteur: 'Système',
                    createdAt: serverTimestamp(),
                    type: 'text'
                });
            }
            console.log("DEBUG: Ticket status updated to 'escalated_to_agent' and system message sent if needed.");
        }

      if (isInitialMessage) {
          await updateDoc(doc(db, 'tickets', ticketId), { initialJeyMessageSent: true });
          console.log("DEBUG: initialJeyMessageSent flag set to true.");
      }

      return jeyText;
    } catch (error) {
      console.error("ERROR: Error getting Jey's response from OpenAI:", error.response ? error.response.data : error.message);

      // --- START: AUTOMATIC ESCALATION ON API ERROR ---
      console.log("DEBUG: OpenAI API error detected. Escalating ticket due to difficulty.");
      await updateDoc(doc(db, 'tickets', ticketId), {
          status: 'escalated_to_agent',
          isAgentRequested: true,
          lastUpdated: serverTimestamp(),
      });
      await updateDoc(doc(db, 'conversations', ticketId), {
          status: 'escalated_to_agent',
          isAgentRequested: true,
          lastUpdated: serverTimestamp(),
      });
      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
          texte: `Jey rencontre des difficultés techniques et a escaladé votre demande à un agent humain. Un agent prendra le relais sous peu.`,
          expediteurId: 'systeme',
          nomExpediteur: 'Système',
          createdAt: serverTimestamp(),
          type: 'text'
      });
      // --- END: AUTOMATIC ESCALATION ON API ERROR ---

      if (error.response && error.response.status === 401) {
        Alert.alert("API Key Invalide", "Votre clé API OpenAI est invalide. Veuillez vérifier votre configuration.");
      } else if (error.response && error.response.status === 429) {
        Alert.alert("Limite de Débit Atteinte", "Jey est trop sollicité. Veuillez réessayer dans un instant.");
      } else {
        Alert.alert("Erreur Jey", "Jey rencontre des difficultés. Veuillez réessayer ou demander un agent.");
      }
      return "Désolé, je rencontre un problème technique pour le moment et je ne peux pas vous assister. Votre demande a été escaladée à un agent humain.";
    } finally {
      setIsJeyTyping(false);
      console.log("DEBUG: Jey typing indicator set to false.");
    }
  }, [ticketId, isITSupport, actualClientName, ticketInfo?.category]); // Added ticketInfo.category to dependencies


  const envoyerMessage = async (texte, type = 'text', additionalData = {}) => {
    console.log(`DEBUG: Sending message. Type: ${type}, Text: "${texte}"`);
    if (isTerminated) {
        console.log("DEBUG: Conversation terminated, cannot send message.");
        return;
    }

    const messageToSend = texte.trim();
    if (!messageToSend && type === 'text') {
        console.log("DEBUG: Message text is empty, not sending.");
        return;
    }
    if (!ticketId || !currentUser) {
        console.log("DEBUG: Missing ticketId or currentUser, cannot send message.");
        return;
    }

    try {
      console.log("DEBUG: Adding user/agent message to Firestore...");
      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        texte: messageToSend,
        expediteurId: currentUser.uid,
        nomExpediteur: currentUser.displayName || (isITSupport ? 'Agent' : 'Client'),
        createdAt: serverTimestamp(),
        type,
        ...additionalData,
      });
      setNouveauMessage('');
      updateTypingStatus(false);
      console.log("DEBUG: User/agent message added successfully.");

      await mettreAJourConversation(messageToSend);
      console.log("DEBUG: Conversation updated.");

      console.log("DEBUG: Checking if Jey should respond:");
      console.log("  isITSupport:", isITSupport);
      console.log("  ticketInfo?.status:", ticketInfo?.status);
      console.log("  isTerminated:", isTerminated);

      if (!isITSupport && ticketInfo?.status === 'jey-handling' && !isTerminated) {
        console.log("DEBUG: Condition met for Jey to respond to client message.");
        const messagesQueryForJey = query(
          collection(db, 'tickets', ticketId, 'messages'),
          orderBy('createdAt', 'asc')
        );
        const snapshotForJey = await getDocs(messagesQueryForJey);
        const currentMessagesForJey = snapshotForJey.docs.map(doc => ({
            id: doc.id,
            ...doc.data(),
        }));
        console.log("DEBUG: Fetched messages for Jey's context:", currentMessagesForJey.map(m => m.texte));

        const jeyResponseText = await getJeyResponse(currentMessagesForJey);

        if (jeyResponseText) {
          console.log("DEBUG: Adding Jey's response to Firestore...");
          await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
            texte: jeyResponseText,
            expediteurId: 'jey-ai',
            nomExpediteur: 'Jey',
            createdAt: serverTimestamp(),
            type: 'text',
          });
          await updateDoc(doc(db, 'tickets', ticketId), { lastMessage: jeyResponseText, lastUpdated: serverTimestamp() });
          await updateDoc(doc(db, 'conversations', ticketId), { lastMessage: jeyResponseText, lastUpdated: serverTimestamp() });
          console.log("DEBUG: Jey's message added to Firestore and ticket/conversation updated.");
        } else {
            console.log("DEBUG: Jey's response text was empty or undefined.");
        }
      } else {
          console.log("DEBUG: Jey response condition not met.");
      }
    } catch (error) {
      console.error("ERROR: Error in envoyerMessage:", error);
      Alert.alert("Erreur", "Impossible d'envoyer le message");
    }
  };


  const mettreAJourConversation = async (texte) => {
    console.log("DEBUG: Updating conversation and ticket with last message and timestamp.");
    const updates = {
      lastUpdated: serverTimestamp(),
      lastMessage: texte.substring(0, 50)
    };

    if (isITSupport && ticketInfo && ['nouveau', 'escalated_to_agent', 'jey-handling'].includes(ticketInfo.status) && !ticketInfo.assignedTo) {
      console.log("DEBUG: Agent taking over ticket (status change to in-progress).");
      updates.assignedTo = currentUser.uid;
      updates.assignedToName = currentUser.displayName || 'Agent';
      updates.status = 'in-progress';
      updates.agentJoinedNotified = true;

      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        texte: `${currentUser.displayName || 'Un Agent'} a pris en charge votre Requête.`,
        expediteurId: 'systeme',
        nomExpediteur: 'Système',
        createdAt: serverTimestamp()
      });
      console.log("DEBUG: System message added: Agent took over.");
    }

    await updateDoc(doc(db, 'conversations', ticketId), updates);
    await updateDoc(doc(db, 'tickets', ticketId), updates);
    console.log("DEBUG: Conversation and ticket documents updated.");
  };


  const selectionnerImage = async () => {
    console.log("DEBUG: Selecting image initiated.");
    if (isTerminated) {
        console.log("DEBUG: Conversation terminated, cannot select image.");
        return;
    }

    setUploading(true);
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission requise", "Veuillez accorder la permission d'accéder à la galerie pour sélectionner une image.");
        console.log("DEBUG: Media library permission denied.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8
      });

      if (!result.canceled) {
        console.log("DEBUG: Image selected, uploading...");
        await uploaderImage(result.assets[0].uri);
      } else {
        console.log("DEBUG: Image selection cancelled.");
      }
    } catch (error) {
      console.error("ERROR: Error selecting image:", error);
      Alert.alert("Erreur", "Impossible de sélectionner l'image");
    } finally {
      setUploading(false);
      console.log("DEBUG: Image selection process finished.");
    }
  };

  const uploaderImage = async (uri) => {
    console.log("DEBUG: Uploading image from URI:", uri);
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const filename = `pieces_jointes/${ticketId}/${Date.now()}.jpg`;
      const storageRef = ref(storage, filename);

      await uploadBytes(storageRef, blob);
      const downloadURL = await getDownloadURL(storageRef);
      console.log("DEBUG: Image uploaded. Download URL:", downloadURL);

      await envoyerMessage(
        'Image partagée',
        'image',
        { imageURL: downloadURL }
      );
      console.log("DEBUG: Image message sent to chat.");

    } catch (error) {
      console.error("ERROR: Error uploading image:", error);
      throw error;
    }
  };

  const downloadImage = async (imageUrl) => {
    console.log("DEBUG: Initiating image download for:", imageUrl);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission requise', 'Veuillez accorder la permission d\'accès à la galerie pour télécharger l\'image.');
        console.log("DEBUG: Media library permission denied for download.");
        return;
      }

      Alert.alert('Téléchargement', 'Téléchargement de l\'image en cours...', [{ text: 'OK' }]);

      const filename = imageUrl.split('/').pop().split('?')[0];
      const fileDest = `${FileSystem.cacheDirectory}${filename}`;

      if (!FileSystem || !FileSystem.downloadAsync) {
          console.error("ERROR: Expo FileSystem not available. Please ensure 'expo-file-system' is installed and linked.");
          Alert.alert('Erreur', 'Bibliothèque de fichiers non disponible. Impossible de télécharger.');
          return;
      }
      console.log("DEBUG: Downloading image to local cache:", fileDest);
      const { uri: localUri } = await FileSystem.downloadAsync(imageUrl, fileDest);
      console.log("DEBUG: Image downloaded to local URI:", localUri);

      console.log("DEBUG: Saving image to media library...");
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Succès', 'Image téléchargée dans votre galerie !');
      console.log("DEBUG: Image saved to gallery.");

    } catch (error) {
      console.error("ERROR: Error downloading image:", error);
      Alert.alert('Erreur', 'Échec du téléchargement de l\'image.');
    }
  };


  const renderMessage = ({ item }) => {
    const estUtilisateurCourant = item.expediteurId === currentUser?.uid;
    const estSysteme = item.expediteurId === 'systeme';
    const estJeyAI = item.expediteurId === 'jey-ai';

    const isThisClientsMessage = isITSupport && item.expediteurId === ticketInfo?.userId;

    return (
      <View style={[
        styles.messageContainer,
        estUtilisateurCourant ? styles.messageUtilisateur : styles.messageAutre,
        estSysteme && styles.messageSysteme,
        estJeyAI && styles.messageJeyAI,
      ]}>
        {!estUtilisateurCourant && !estSysteme && (
          <Text style={styles.nomExpediteur}>
            {estJeyAI ? 'Jey' : (isThisClientsMessage ? ticketInfo?.userName || 'Client' : item.nomExpediteur)}
          </Text>
        )}

        {item.type === 'image' && item.imageURL ? (
          <Image
            source={{ uri: item.imageURL }}
            style={styles.imageMessage}
            resizeMode="contain"
          />
        ) : item.type === 'coupon_qr' && item.codeType && item.codeValue ? (
          <View style={styles.generatedCodeMessageContainer}>
            <Text style={styles.generatedCodeMessageTitle}>Votre Code {item.codeType === 'qr' ? 'QR' : 'Coupon'}</Text>
            {item.codeType === 'qr' && (
              <View style={{ padding: 10, backgroundColor: '#FFF', borderRadius: 8 }}>
                <QRCode
                  value={item.codeValue}
                  size={100}
                  color="black"
                  backgroundColor="white"
                />
              </View>
            )}
            {item.codeType === 'coupon' && (
              <Text style={styles.generatedCouponValue}>{item.codeValue}</Text>
            )}
            <Text style={styles.generatedCodeMessageDetails}>
              Partenaire: {item.partnerName || 'N/A'}
            </Text>
            {item.appointmentDate && (
              <Text style={styles.generatedCodeMessageDetails}>
                Date RDV: {new Date(item.appointmentDate).toLocaleDateString('fr-FR')} à {new Date(item.appointmentDate).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
            )}
            {item.clientNames && item.clientNames.length > 0 && (
              <Text style={styles.generatedCodeMessageDetails}>
                Pour: {item.clientNames.join(', ')}
              </Text>
            )}
            {!isITSupport && item.imageURL && (
              <TouchableOpacity
                style={styles.downloadButton}
                onPress={() => downloadImage(item.imageURL)}
              >
                <Ionicons name="download" size={20} color="white" />
                <Text style={styles.downloadButtonText}>Télécharger</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          <Text style={[
            styles.texteMessage,
            estUtilisateurCourant && styles.texteUtilisateur,
            estSysteme && styles.texteSysteme,
            estJeyAI && styles.texteJeyAI,
          ]}>
            {item.texte}
          </Text>
        )}

        <Text style={[
          styles.heureMessage,
          estUtilisateurCourant ? { color: 'rgba(255,255,255,0.7)' } : { color: '#6B7280' }
        ]}>
          {moment(item.createdAt).format('HH:mm')}
        </Text>
      </View>
    );
  };

  const renderHeaderContent = () => {
    let headerText = "Chargement...";
    if (ticketInfo) {
      if (isITSupport) {
        headerText = `${ticketInfo.userName || 'Client'} - ${ticketInfo.category || 'Ticket'}`;
        if (ticketInfo.status === 'jey-handling') {
            headerText += ' (Géré par Jey)';
        } else if (ticketInfo.status === 'escalated_to_agent') {
            headerText += ' (Agent Demandé)';
        } else if (ticketInfo.status === 'in-progress' && ticketInfo.assignedTo === currentUser?.uid) {
            headerText += ' (Vous)';
        } else if (ticketInfo.status === 'in-progress') {
            headerText += ` (${ticketInfo.assignedToName || 'Agent'})`;
        }
      } else { // Client view
        if (ticketInfo.status === 'jey-handling') {
            headerText = "Jey (Assistant IA)";
        } else if (ticketInfo.status === 'escalated_to_agent') {
            headerText = "Agent Humain (Escaladé)";
        } else if (ticketInfo.status === 'in-progress') {
            headerText = agent
                ? `Agent: ${agent}`
                : "Agent Connecté";
        } else if (ticketInfo.status === 'terminé') {
            headerText = "Conversation Terminée";
        } else {
            headerText = "En attente...";
        }
      }
    }
    return (
      <View style={styles.headerInfo}>
        <Text style={styles.headerTitre} numberOfLines={1} ellipsizeMode='tail'>
          {headerText}
        </Text>
        {isITSupport && ticketInfo?.status !== 'terminé' && (ticketInfo?.status === 'jey-handling' || ticketInfo?.status === 'escalated_to_agent') && !ticketInfo.assignedTo && (
            <Text style={styles.subHeaderText}>
                Ce ticket n'est pas encore assigné.
            </Text>
        )}
      </View>
    );
  };


  const fetchPartners = async () => {
    console.log("DEBUG: Fetching partners.");
    try {
      const partnersCollectionRef = collection(db, 'partners');
      const q = query(partnersCollectionRef, orderBy('name'));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        console.log("DEBUG: No partners found in 'partners' collection.");
      }

      const fetchedPartners = querySnapshot.docs.map(doc => {
        return { id: doc.id, ...doc.data() };
      });
      setPartners(fetchedPartners);
      console.log(`DEBUG: Fetched ${fetchedPartners.length} partners.`);
    } catch (error) {
      console.error("ERROR: Error fetching partners:", error);
      Alert.alert("Erreur", "Impossible de charger les partenaires.");
    }
  };

  const addClientNameField = () => {
    setClientNames([...clientNames, { id: Date.now(), name: '' }]);
    console.log("DEBUG: Added client name field.");
  };

  const updateClientName = (id, newName) => {
    setClientNames(clientNames.map(client =>
      client.id === id ? { ...client, name: newName } : client
    ));
    console.log(`DEBUG: Updated client name for ID ${id} to: ${newName}`);
  };

  const removeClientNameField = (id) => {
    setClientNames(clientNames.filter(client => client.id !== id));
    console.log(`DEBUG: Removed client name field for ID ${id}.`);
  };

  const onDateChange = (event, selectedDate) => {
    const currentDate = selectedDate || appointmentDate;
    setShowDatePicker(Platform.OS === 'ios');
    setAppointmentDate(currentDate);
    console.log("DEBUG: Appointment date changed:", currentDate.toLocaleDateString());
  };

  const onTimeChange = (event, selectedTime) => {
    const currentTime = selectedTime || appointmentTime;
    setShowTimePicker(Platform.OS === 'ios');
    setAppointmentTime(currentTime);
    console.log("DEBUG: Appointment time changed:", currentTime.toLocaleTimeString());
  };

  const resetAppointmentForm = () => {
    setSelectedPartner(null);
    setClientNames([{ id: Date.now(), name: '' }]);
    setAppointmentDate(new Date());
    setAppointmentTime(new Date());
    setPartnerSearch('');
    setEditingAppointment(null);
    setGeneratedCode(null);
    console.log("DEBUG: Appointment form reset.");
  };

  const handleBookAppointment = async () => {
    console.log("DEBUG: Attempting to book appointment.");
    if (!selectedPartner) {
      Alert.alert("Erreur", "Veuillez sélectionner un partenaire.");
      console.log("DEBUG: Booking failed: No partner selected.");
      return;
    }
    const validClientNames = clientNames.filter(cn => cn.name.trim() !== '');
    if (validClientNames.length === 0) {
      Alert.alert("Erreur", "Veuillez ajouter au moins un nom de client.");
      console.log("DEBUG: Booking failed: No client name entered.");
      return;
    }

    const combinedDateTime = new Date(
      appointmentDate.getFullYear(),
      appointmentDate.getMonth(),
      appointmentDate.getDate(),
      appointmentTime.getHours(),
      appointmentTime.getMinutes(),
      0
    );
    console.log("DEBUG: Combined appointment datetime:", combinedDateTime);

    try {
      const partnerRef = doc(db, 'partners', selectedPartner.id);
      const rdvReservationRef = collection(partnerRef, 'rdv_reservation');

      const newAppointmentData = {
        ticketId: ticketId,
        clientId: initialUserId,
        clientName: initialUserName || 'Client',
        clientPhone: userPhone,
        appointmentDateTime: combinedDateTime,
        clientNames: validClientNames.map(cn => cn.name),
        partnerId: selectedPartner.id,
        partnerName: selectedPartner.name,
        status: 'scheduled',
        bookedByAgentId: currentUser.uid,
        bookedByAgentName: currentUser.displayName || 'Agent',
        createdAt: serverTimestamp(),
      };
      console.log("DEBUG: New appointment data:", newAppointmentData);

      const newAppointmentRef = await addDoc(rdvReservationRef, newAppointmentData);
      console.log("DEBUG: Appointment added to partner's rdv_reservation:", newAppointmentRef.id);

      const ticketDocRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketDocRef, {
        appointments: arrayUnion({
          id: newAppointmentRef.id,
          partnerId: selectedPartner.id,
          partnerName: selectedPartner.name,
          appointmentDateTime: combinedDateTime.toISOString(),
          clientNames: validClientNames.map(cn => cn.name),
          status: 'scheduled'
        })
      });
      console.log("DEBUG: Ticket appointments updated.");

      await envoyerMessage(
        `Votre rendez-vous avec ${selectedPartner.name} pour ${validClientNames.map(cn => cn.name).join(', ')} a été enregistré pour le ${combinedDateTime.toLocaleDateString('fr-FR')} à ${combinedDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`,
        'text',
        { expediteurId: 'systeme', nomExpediteur: 'Système Rendez-vous' }
      );
      console.log("DEBUG: System message sent about new appointment.");

      Alert.alert("Succès", "Rendez-vous enregistré avec succès !");
      resetAppointmentForm();
    } catch (error) {
      console.error("ERROR: Error booking appointment:", error);
      Alert.alert("Erreur", "Impossible d'enregistrer le rendez-vous.");
    }
  };

  const handleUpdateAppointment = async () => {
    console.log("DEBUG: Attempting to update appointment.");
    if (!editingAppointment) {
      Alert.alert("Erreur", "Aucun rendez-vous sélectionné pour modification.");
      return;
    }
    if (!selectedPartner) {
      Alert.alert("Erreur", "Veuillez sélectionner un partenaire.");
      return;
    }
    const validClientNames = clientNames.filter(cn => cn.name.trim() !== '');
    if (validClientNames.length === 0) {
      Alert.alert("Erreur", "Veuillez ajouter au moins un nom de client.");
      return;
    }

    const combinedDateTime = new Date(
      appointmentDate.getFullYear(),
      appointmentDate.getMonth(),
      appointmentDate.getDate(),
      appointmentTime.getHours(),
      appointmentTime.getMinutes(),
      0
    );
    console.log("DEBUG: Updated combined datetime:", combinedDateTime);

    try {
      const appointmentDocRef = doc(db, 'partners', editingAppointment.partnerId, 'rdv_reservation', editingAppointment.id);

      const updatedAppointmentFields = {
        appointmentDateTime: combinedDateTime,
        clientNames: validClientNames.map(cn => cn.name),
        partnerId: selectedPartner.id,
        partnerName: selectedPartner.name,
        lastUpdated: serverTimestamp(),
      };
      await updateDoc(appointmentDocRef, updatedAppointmentFields);
      console.log("DEBUG: Appointment updated in partner's collection.");

      const ticketDocRef = doc(db, 'tickets', ticketId);
      await updateDoc(ticketDocRef, {
        appointments: arrayRemove({
          id: editingAppointment.id,
          partnerId: editingAppointment.partnerId,
          partnerName: editingAppointment.partnerName,
          appointmentDateTime: editingAppointment.appointmentDateTime,
          clientNames: editingAppointment.clientNames,
          status: editingAppointment.status,
        })
      });
      console.log("DEBUG: Old appointment reference removed from ticket.");

      await updateDoc(ticketDocRef, {
        appointments: arrayUnion({
          id: editingAppointment.id,
          partnerId: selectedPartner.id,
          partnerName: selectedPartner.name,
          appointmentDateTime: combinedDateTime.toISOString(),
          clientNames: validClientNames.map(cn => cn.name),
          status: 'scheduled'
        })
      });
      console.log("DEBUG: New appointment reference added to ticket.");

      await envoyerMessage(
        `Votre rendez-vous avec ${selectedPartner.name} pour ${validClientNames.map(cn => cn.name).join(', ')} a été modifié au ${combinedDateTime.toLocaleDateString('fr-FR')} à ${combinedDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}.`,
        'text',
        { expediteurId: 'systeme', nomExpediteur: 'Système Rendez-vous' }
      );
      console.log("DEBUG: System message sent about updated appointment.");

      Alert.alert("Succès", "Rendez-vous mis à jour avec succès !");
      setShowAppointmentModal(false);
      resetAppointmentForm();
    } catch (error) {
      console.error("ERROR: Error updating appointment:", error);
      Alert.alert("Erreur", "Impossible de mettre à jour le rendez-vous.");
    }
  };


  const handleCancelAppointment = async (appointmentToCancel) => {
    console.log("DEBUG: Attempting to cancel appointment:", appointmentToCancel.id);
    Alert.alert(
      "Annuler Rendez-vous",
      `Êtes-vous sûr de vouloir annuler le rendez-vous avec ${appointmentToCancel.partnerName} du ${new Date(appointmentToCancel.appointmentDateTime).toLocaleDateString('fr-FR')} ?`,
      [
        { text: "Non", style: "cancel", onPress: () => console.log("DEBUG: Appointment cancellation cancelled by user.") },
        {
          text: "Oui, Annuler",
          style: "destructive",
          onPress: async () => {
            try {
              const appointmentDocRef = doc(db, 'partners', appointmentToCancel.partnerId, 'rdv_reservation', appointmentToCancel.id);
              await updateDoc(appointmentDocRef, {
                status: 'cancelled',
                cancelledAt: serverTimestamp(),
                cancelledByAgentId: currentUser.uid,
                cancelledByAgentName: currentUser.displayName || 'Agent',
              });
              console.log("DEBUG: Appointment status set to cancelled in partner's collection.");

              const ticketDocRef = doc(db, 'tickets', ticketId);
              await updateDoc(ticketDocRef, {
                appointments: arrayRemove({
                  id: appointmentToCancel.id,
                  partnerId: appointmentToCancel.partnerId,
                  partnerName: appointmentToCancel.partnerName,
                  appointmentDateTime: appointmentToCancel.appointmentDateTime,
                  clientNames: appointmentToCancel.clientNames,
                  status: appointmentToCancel.status,
                })
              });
              console.log("DEBUG: Old appointment reference removed from ticket.");

              await updateDoc(ticketDocRef, {
                appointments: arrayUnion({
                  id: appointmentToCancel.id,
                  partnerId: appointmentToCancel.partnerId,
                  partnerName: appointmentToCancel.partnerName,
                  appointmentDateTime: appointmentToCancel.appointmentDateTime,
                  clientNames: appointmentToCancel.clientNames,
                  status: 'cancelled'
                })
              });
              console.log("DEBUG: New cancelled appointment reference added to ticket.");

              await envoyerMessage(
                `Votre rendez-vous avec ${appointmentToCancel.partnerName} du ${new Date(appointmentToCancel.appointmentDateTime).toLocaleDateString('fr-FR')} a été annulé.`,
                'text',
                { expediteurId: 'systeme', nomExpediteur: 'Système Rendez-vous' }
              );
              console.log("DEBUG: System message sent about cancelled appointment.");

              Alert.alert("Succès", "Rendez-vous annulé.");
            } catch (error) {
              console.error("ERROR: Error cancelling appointment:", error);
              Alert.alert("Erreur", "Impossible d'annuler le rendez-vous.");
            }
          }
        }
      ]
    );
  };

  const editSelectedAppointment = (appointment) => {
    console.log("DEBUG: Editing appointment:", appointment.id);
    const selectedPartnerObject = partners.find(p => p.id === appointment.partnerId);
    setSelectedPartner(selectedPartnerObject || null);

    setClientNames((appointment.clientNames || []).map((name, index) => ({ id: `${appointment.id}-${index}`, name: name })));

    const apptDateTime = new Date(appointment.appointmentDateTime);
    setAppointmentDate(apptDateTime);
    setAppointmentTime(apptDateTime);
    setEditingAppointment(appointment);
    setPartnerSearch(selectedPartnerObject?.name || '');
    setGeneratedCode(null);
    console.log("DEBUG: Appointment data pre-filled for editing.");
  };

  const generateRandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
      result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
  };

  const generateCode = (type) => {
    console.log(`DEBUG: Generating code of type: ${type}.`);
    if (!selectedPartner) {
      Alert.alert("Erreur", "Veuillez sélectionner un partenaire pour générer le code.");
      return;
    }
    const currentClientNames = clientNames.filter(cn => cn.name.trim() !== '').map(cn => cn.name);
    if (currentClientNames.length === 0) {
      Alert.alert("Erreur", "Veuillez ajouter au moins un nom de client pour le code.");
      return;
    }

    const partnerFirstNameInitial = selectedPartner.name ? selectedPartner.name[0].toUpperCase() : '';
    const partnerLastNameInitial = selectedPartner.name && selectedPartner.name.split(' ').length > 1
      ? selectedPartner.name.split(' ').pop()[0].toUpperCase()
      : '';

    const randomPart = generateRandomString(7);
    const code = `ER${randomPart}${partnerFirstNameInitial}${partnerLastNameInitial}`;
    console.log("DEBUG: Generated code value:", code);

    setGeneratedCode({
      type: type,
      value: code,
      partnerName: selectedPartner.name,
      clientNames: currentClientNames,
      appointmentDate: appointmentDate.toISOString(),
      appointmentTime: appointmentTime.toISOString(),
    });
    Alert.alert("Code Généré", `Code ${type === 'qr' ? 'QR' : 'Coupon'} : ${code}\nPartenaire: ${selectedPartner.name}`);
  };

  const shareGeneratedCode = async () => {
    console.log("DEBUG: Initiating share generated code.");
    if (!generatedCode) {
      Alert.alert("Aucun code généré", "Veuillez générer un code ou un QR code d'abord.");
      return;
    }
    if (!couponQrCodeRef.current) {
      Alert.alert("Erreur", "Le composant de code n'est pas prêt. Veuillez attendre un instant ou essayer de regénérer le code.");
      console.error("ERROR: couponQrCodeRef.current is null when trying to capture.");
      return;
    }

    Alert.alert(
      "Partager le code",
      `Voulez-vous partager ce code avec ${ticketInfo?.userName || 'le client'}?`,
      [
        { text: "Annuler", style: "cancel", onPress: () => console.log("DEBUG: Share code cancelled by user.") },
        {
          text: "Partager",
          onPress: async () => {
            try {
              setUploading(true);
              console.log("DEBUG: Capturing QR/Coupon code image for sharing.");
              const uri = await couponQrCodeRef.current.capture();
              console.log("DEBUG: Image captured:", uri);

              const response = await fetch(uri);
              const blob = await response.blob();
              const filename = `shared_codes/${ticketId}/${Date.now()}.jpg`;
              const storageRef = ref(storage, filename);
              await uploadBytes(storageRef, blob);
              const downloadURL = await getDownloadURL(storageRef);
              console.log("DEBUG: Code image uploaded to storage. URL:", downloadURL);

              let messageText = `Bonjour ${ticketInfo?.userName || 'cher client'},\n\nVoici votre code ${generatedCode.type === 'qr' ? 'QR' : 'coupon'} pour votre rendez-vous :\n\n`;
              messageText += `Type: ${generatedCode.type === 'qr' ? 'QR Code' : 'Code Coupon'}\n`;
              messageText += `Code: ${generatedCode.value}\n`;
              messageText += `Partenaire: ${generatedCode.partnerName}\n`;
              messageText += `Date du rendez-vous: ${new Date(generatedCode.appointmentDate).toLocaleDateString('fr-FR')} à ${new Date(generatedCode.appointmentTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}\n`;
              if (generatedCode.clientNames && generatedCode.clientNames.length > 0) {
                messageText += `Pour: ${generatedCode.clientNames.join(', ')}\n`;
              }
              messageText += `\nVeuillez conserver ce code pour votre rendez-vous.`;

              await envoyerMessage(
                messageText,
                'coupon_qr',
                {
                  codeType: generatedCode.type,
                  codeValue: generatedCode.value,
                  partnerName: generatedCode.partnerName,
                  appointmentDate: generatedCode.appointmentDate,
                  clientNames: generatedCode.clientNames,
                  imageURL: downloadURL,
                  expediteurId: currentUser.uid,
                  nomExpediteur: currentUser.displayName || 'Agent',
                }
              );
              console.log("DEBUG: Code shared as message in chat.");

              Alert.alert("Succès", "Code partagé avec le client !");
              setGeneratedCode(null);
            } catch (error) {
              console.error("ERROR: Error sharing code:", error);
              Alert.alert("Erreur", "Impossible de partager le code.");
            } finally {
              setUploading(false);
              console.log("DEBUG: Share code process finished.");
            }
          }
        }
      ]
    );
  };


  if (chargement) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text>Chargement de la conversation...</Text>
      </View>
    );
  }

  if (!ticketId) {
    return (
      <View style={styles.container}>
        <Image
          source={require('../assets/images/logoFace.png')}
          style={styles.errorImage}
        />
        <Text style={styles.errorText}>Conversation non disponible</Text>
        <Text style={styles.errorSubtext}>Identifiant de ticket invalide</Text>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Text style={styles.backButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderAppointmentModalHeader = () => (
    <View>
      <Text style={styles.modalTitle}>{editingAppointment ? 'Modifier Rendez-vous' : 'Prendre Rendez-vous'}</Text>

      {/* Existing Appointments List for IT Support */}
      {isITSupport && currentTicketAppointments.length > 0 && (
        <View style={styles.existingAppointmentsSection}>
          <Text style={styles.modalLabel}>Rendez-vous existants pour ce ticket:</Text>
          {currentTicketAppointments.map((appt) => (
            <View key={appt.id} style={[styles.existingAppointmentItem, appt.status === 'cancelled' && styles.cancelledAppointment]}>
              <Text style={styles.existingAppointmentText}>
                <Text style={{ fontWeight: 'bold' }}>Partenaire:</Text> {appt.partnerName}
              </Text>
              <Text style={styles.existingAppointmentText}>
                <Text style={{ fontWeight: 'bold' }}>Date:</Text> {new Date(appt.appointmentDateTime).toLocaleDateString('fr-FR')} à {new Date(appt.appointmentDateTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.existingAppointmentText}>
                <Text style={{ fontWeight: 'bold' }}>Pour:</Text> {appt.clientNames.join(', ')}
              </Text>
              <Text style={[styles.existingAppointmentStatus, appt.status === 'cancelled' ? styles.statusCancelled : styles.statusScheduled]}>
                Status: {appt.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
              </Text>
              <View style={styles.appointmentActions}>
                {appt.status !== 'cancelled' && (
                  <>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.editButton]}
                      onPress={() => editSelectedAppointment(appt)}
                    >
                      <Ionicons name="create-outline" size={18} color="white" />
                      <Text style={styles.actionButtonText}>Modifier</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.actionButton, styles.cancelButton]}
                      onPress={() => handleCancelAppointment(appt)}
                    >
                      <Ionicons name="close-circle-outline" size={18} color="white" />
                      <Text style={styles.actionButtonText}>Annuler</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ))}
          <View style={styles.separator}></View>
        </View>
      )}

      <Text style={styles.modalLabel}>Partenaire:</Text>
      <TextInput
        style={styles.modalInput}
        placeholder="Rechercher un partenaire"
        value={partnerSearch}
        onChangeText={setPartnerSearch}
      />
      {partnerSearch.length > 0 && (
        <View style={styles.partnerList}>
          {partners.filter(p => p.name?.toLowerCase().includes(partnerSearch.toLowerCase())).map(p => (
            <TouchableOpacity
              key={p.id}
              style={[styles.partnerItem, selectedPartner?.id === p.id && styles.selectedPartnerItem]}
              onPress={() => {
                setSelectedPartner(p);
                setPartnerSearch(p.name);
              }}
            >
              <Text style={styles.partnerName}>{p.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );

  const renderAppointmentModalFooter = () => (
    <View>
      {selectedPartner && (
        <View>
          <Text style={styles.modalLabel}>Partenaire sélectionné: <Text style={styles.modalSelectedValue}>{selectedPartner.name}</Text></Text>

          <Text style={styles.modalLabel}>Noms des clients:</Text>
          {clientNames.map((client, index) => (
            <View key={client.id} style={styles.clientNameInputContainer}>
              <TextInput
                style={styles.modalInput}
                placeholder={`Nom du client ${index + 1}`}
                value={client.name}
                onChangeText={(text) => updateClientName(client.id, text)}
              />
              {clientNames.length > 1 && (
                <TouchableOpacity onPress={() => removeClientNameField(client.id)}>
                  <Ionicons name="close-circle" size={24} color="#FF3B30" style={{ marginLeft: 10 }} />
                </TouchableOpacity>
              )}
            </View>
          ))}
          <TouchableOpacity onPress={addClientNameField} style={styles.addClientButton}>
            <Ionicons name="add-circle" size={20} color="#34C759" />
            <Text style={styles.addClientButtonText}>Ajouter un autre nom</Text>
          </TouchableOpacity>

          <Text style={styles.modalLabel}>Date du rendez-vous:</Text>
          <Pressable onPress={() => setShowDatePicker(true)} style={styles.dateTimeDisplay}>
            <Text>{appointmentDate.toLocaleDateString('fr-FR')}</Text>
            <Ionicons name="calendar-outline" size={20} color="#34C759" />
          </Pressable>
          {showDatePicker && (
            <DateTimePicker
              value={appointmentDate}
              mode="date"
              display="default"
              onChange={onDateChange}
            />
          )}

          <Text style={styles.modalLabel}>Heure du rendez-vous:</Text>
          <Pressable onPress={() => setShowTimePicker(true)} style={styles.dateTimeDisplay}>
            <Text>{appointmentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
            <Ionicons name="time-outline" size={20} color="#34C759" />
          </Pressable>
          {showTimePicker && (
            <DateTimePicker
              value={appointmentTime}
              mode="time"
              display="default"
              onChange={onTimeChange}
            />
          )}

          <View style={styles.modalButtonContainer}>
            <TouchableOpacity
              onPress={editingAppointment ? handleUpdateAppointment : handleBookAppointment}
              style={[styles.modalButton, styles.modalButtonPrimary]}
            >
              <Text style={styles.modalButtonText}>
                {editingAppointment ? 'Mettre à jour le Rendez-vous' : 'Confirmer Rendez-vous'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => generateCode('coupon')}
              style={[styles.modalButton, styles.modalButtonSecondary]}
            >
              <Text style={styles.modalButtonText}>Générer Coupon</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => generateCode('qr')}
              style={[styles.modalButton, styles.modalButtonSecondary]}
            >
              <Text style={styles.modalButtonText}>Générer QR Code</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {generatedCode && (
        <ViewShot ref={couponQrCodeRef} options={{ format: "jpg", quality: 0.9 }} style={styles.generatedCodeContainer}>
          <Text style={styles.generatedCodeTitle}>Votre Code {generatedCode.type === 'qr' ? 'QR' : 'Coupon'}</Text>
          {generatedCode.type === 'qr' && (
            <View style={{ padding: 15, backgroundColor: '#FFF', borderRadius: 10, alignSelf: 'center', marginVertical: 10 }}>
              <QRCode
                value={generatedCode.value}
                size={150}
                color="black"
                backgroundColor="white"
              />
            </View>
          )}
          {generatedCode.type === 'coupon' && (
            <Text style={styles.generatedCouponValueDisplay}>{generatedCode.value}</Text>
          )}
          <Text style={styles.generatedCodeDetails}>Partenaire: {generatedCode.partnerName}</Text>
          <Text style={styles.generatedCodeDetails}>Date RDV: {new Date(generatedCode.appointmentDate).toLocaleDateString('fr-FR')} à {new Date(generatedCode.appointmentTime).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
          {generatedCode.clientNames && generatedCode.clientNames.length > 0 && (
            <Text style={styles.generatedCodeDetails}>Pour: {generatedCode.clientNames.join(', ')}</Text>
          )}
          <Text style={styles.generatedCodeNote}>Veuillez conserver ce code. Il peut être partagé avec le client via le bouton "Partager Code".</Text>
        </ViewShot>
      )}

      {generatedCode && (
        <TouchableOpacity
          onPress={shareGeneratedCode}
          style={[styles.modalButton, styles.modalButtonShare, { marginTop: 15 }]}
          disabled={uploading}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#FFF" />
          ) : (
            <Ionicons name="share" size={20} color="white" />
          )}
          <Text style={styles.modalButtonText}>Partager Code avec Client</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        onPress={() => {
          setShowAppointmentModal(false);
          resetAppointmentForm();
        }}
        style={styles.closeButton}
      >
        <Text style={styles.closeButtonText}>Fermer</Text>
      </TouchableOpacity>
    </View>
  );


  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 20}
    >
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View
            style={[
              styles.messageBubble,
              item.expediteurId === currentUser.uid ? styles.myMessage :
              item.expediteurId === 'jey-ai' ? styles.jeyMessage : styles.systemMessage,
            ]}
          >
            {/* Display sender name for Jey and system messages */}
            {item.expediteurId !== currentUser.uid && (
              <Text style={styles.senderName}>
                {item.expediteurId === 'jey-ai' ? 'Jey' : item.nomExpediteur || 'Système'}
              </Text>
            )}
            <Text style={item.expediteurId === currentUser.uid ? styles.myMessageText : styles.messageText}>{item.texte}</Text>
            <Text style={item.expediteurId === currentUser.uid ? styles.myMessageTime : styles.messageTime}>
              {formatTimestamp(item.createdAt)}
            </Text>
          </View>
        )}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={scrollToBottom}
      />

      {isJeyTyping && (
        <View style={styles.typingIndicatorContainer}>
          <ActivityIndicator size="small" color="#007AFF" />
          <Text style={styles.typingText}>Jey est en train d'écrire...</Text>
        </View>
      )}

      {/* Input area visible only if conversation is active */}
      {isConversationActive ? (
        <View style={styles.inputContainer}>
          {showRequestAgentButton && (
            <TouchableOpacity style={styles.requestAgentButton} onPress={handleRequestAgent}>
              <Ionicons name="person-add-outline" size={20} color="#FFF" />
              <Text style={styles.requestAgentButtonText}>Parler à un agent</Text>
            </TouchableOpacity>
          )}
          <TextInput
            style={styles.textInput}
            value={inputMessage}
            onChangeText={setInputMessage}
            placeholder="Écrivez votre message..."
            placeholderTextColor="#999"
            multiline
            maxHeight={100}
          />
          <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
            <Ionicons name="send" size={24} color="#FFF" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.inactiveConversationContainer}>
          <Text style={styles.inactiveConversationText}>
            Cette conversation n'est plus gérée par Jey. Un agent humain prend le relais ou elle est terminée.
          </Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F2F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F2F5',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 16,
    color: '#666',
  },
  messageList: {
    paddingHorizontal: 10,
    paddingVertical: 15,
  },
  messageBubble: {
    maxWidth: '80%',
    paddingVertical: 10,
    paddingHorizontal: 15,
    borderRadius: 15,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  myMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#007AFF',
  },
  jeyMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#E5E5EA',
  },
  systemMessage: {
    alignSelf: 'center',
    backgroundColor: '#D1FAE5', // Light green for system messages
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  senderName: {
    fontSize: 12,
    fontWeight: 'bold',
    marginBottom: 3,
    color: '#666',
  },
  messageText: {
    fontSize: 16,
    color: '#333',
  },
  myMessageText: { // Ensure text color is white for user's messages
    fontSize: 16,
    color: '#FFF',
  },
  myMessageTime: {
    fontSize: 10,
    color: '#FFF',
    alignSelf: 'flex-end',
    marginTop: 5,
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  typingIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 5,
    backgroundColor: '#E5E5EA',
    borderRadius: 15,
    alignSelf: 'flex-start',
    marginLeft: 10,
    marginBottom: 10,
  },
  typingText: {
    marginLeft: 8,
    color: '#666',
    fontStyle: 'italic',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    backgroundColor: '#FFF',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CCC',
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 10,
  },
  sendButton: {
    backgroundColor: '#007AFF',
    borderRadius: 20,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  requestAgentButton: {
    flexDirection: 'row',
    backgroundColor: '#FF9500', // Orange color for escalation
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAgentButtonText: {
    color: '#FFF',
    marginLeft: 5,
    fontSize: 14,
    fontWeight: 'bold',
  },
  inactiveConversationContainer: {
    padding: 20,
    alignItems: 'center',
    backgroundColor: '#E0E0E0',
    borderTopWidth: 1,
    borderTopColor: '#CCC',
  },
  inactiveConversationText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
});

export default JeyChat;
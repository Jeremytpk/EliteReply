import React, {
    useState,
    useEffect,
    useRef,
    useCallback
} from 'react';
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
    Pressable,
    LayoutAnimation,
    UIManager,
    Modal,
    Animated,
    Easing,
} from 'react-native';
import {
    collection,
    doc,
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    updateDoc,
    getDoc,
    deleteField,
    runTransaction,
    writeBatch,
    increment,
    getDocs,
    arrayUnion,
    arrayRemove,
} from 'firebase/firestore';
import {
    ref,
    uploadBytes,
    getDownloadURL
} from 'firebase/storage';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';

import {
    db,
    auth,
    storage
} from '../firebase';
import {
    Ionicons,
    MaterialIcons
} from '@expo/vector-icons';
import PropTypes from 'prop-types';
import {
    useFocusEffect
} from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

import {
    OPENAI_API_KEY
} from '../OpenAIConfig';
import OpenAI from 'openai';

import AppointmentFormModal from '../components/AppointmentFormModal';

import jeyAiProfile from '../assets/images/jeyAi1.png'; // Jey's profile image

const renderStarRating = (rating) => {
    if (typeof rating !== 'number' || rating < 0 || rating > 5) {
        return null;
    }
    const fullStars = Math.floor(rating);
    const halfStar = rating % 1 >= 0.5;
    const emptyStars = 5 - fullStars - (halfStar ? 1 : 0);

    const stars = [];
    for (let i = 0; i < fullStars; i++) {
        stars.push(<Ionicons key={`full-${i}`} name="star" size={16} color="#FFD700" />);
    }
    if (halfStar) {
        stars.push(<Ionicons key="half" name="star-half" size={16} color="#FFD700" />);
    }
    for (let i = 0; i < emptyStars; i++) {
        stars.push(<Ionicons key={`empty-${i}`} name="star-outline" size={16} color="#B0B0B0" />);
    }
    return <View style={{ flexDirection: 'row' }}>{stars}</View>;
};

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const Conversation = ({
    route,
    navigation
}) => {
    const {
        ticketId = '',
        isITSupport = false,
        userId: initialUserId = '',
        userName: initialUserName = '',
        userPhone = '',
        ticketCategory = '',
    } = route.params || {};

    const [messages, setMessages] = useState([]);
    const [nouveauMessage, setNouveauMessage] = useState('');
    const [ticketInfo, setTicketInfo] = useState(null);
    const [agent, setAgent] = useState(null);
    const [clientPhotoUrl, setClientPhotoUrl] = useState(null);
    const [currentUserPhotoUrl, setCurrentUserPhotoUrl] = useState(null);
    const [agentPhotoUrl, setAgentPhotoUrl] = useState(null); // New state for agent's photo
    const [chargement, setChargement] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [isTerminated, setIsTerminated] = useState(false);

    // Typing indicator states
    const [isJeyTyping, setIsJeyTyping] = useState(false);
    const [isOtherHumanTyping, setIsOtherHumanTyping] = useState(false); // NEW
    const [otherHumanTypingName, setOtherHumanTypingName] = useState(null); // NEW

    const typingTimeoutRef = useRef(null);

    const [allPartners, setAllPartners] = useState([]);
    const [showAppointmentFormModal, setShowAppointmentFormModal] = useState(false);
    const [selectedPartnerForBooking, setSelectedPartnerForBooking] = useState(null);

    const [currentTicketAppointments, setCurrentTicketAppointments] = useState([]);
    const [confirmedAppointmentForTicket, setConfirmedAppointmentForTicket] = useState(null);
    const currentUser = auth.currentUser;
    const flatListRef = useRef();

    const actualClientUid = isITSupport ? initialUserId : currentUser?.uid;
    const actualClientName = isITSupport ? initialUserName : currentUser?.displayName || 'Client';

    const lastJeyRespondedToMessageId = useRef(null);

    const jeyTypingPulseAnim = useRef(new Animated.Value(0)).current;
    const jeyMessagePulseAnim = useRef(new Animated.Value(0)).current;

    // --- NEW: Partner Selection Modal States ---
    const [showPartnerSelectionModal, setShowPartnerSelectionModal] = useState(false);
    const [selectedPartnersForSuggestion, setSelectedPartnersForSuggestion] = useState([]);
    const [partnerSearchQuery, setPartnerSearchQuery] = useState('');
    // --- END NEW ---

    useEffect(() => {
        if (isJeyTyping) {
            jeyTypingPulseAnim.setValue(0);
            Animated.loop(
                Animated.sequence([
                    Animated.timing(jeyTypingPulseAnim, {
                        toValue: 1,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                    Animated.timing(jeyTypingPulseAnim, {
                        toValue: 0,
                        duration: 1000,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: false,
                    }),
                ])
            ).start();
        } else {
            jeyTypingPulseAnim.stopAnimation();
        }
        return () => jeyTypingPulseAnim.stopAnimation();
    }, [isJeyTyping, jeyTypingPulseAnim]);

    useEffect(() => {
        jeyMessagePulseAnim.setValue(0);
        Animated.loop(
            Animated.sequence([
                Animated.timing(jeyMessagePulseAnim, {
                    toValue: 1,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
                Animated.timing(jeyMessagePulseAnim, {
                    toValue: 0,
                    duration: 2000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
            ])
        ).start();
        return () => jeyMessagePulseAnim.stopAnimation();
    }, [jeyMessagePulseAnim]);

    const [isJeyProfileModalVisible, setIsJeyProfileModalVisible] = useState(false);


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
                lastJeyRespondedToMessageId.current = null;
            };
        }, [currentUser, navigation])
    );

    useEffect(() => {
        const fetchPartners = async () => {
            try {
                const partnersCollectionRef = collection(db, 'partners');
                const q = query(partnersCollectionRef, orderBy('nom')); // Use 'nom' for ordering
                const querySnapshot = await getDocs(q);
                const fetchedPartners = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data(),
                    nom: doc.data().nom || '', // Ensure nom is mapped
                    categorie: doc.data().categorie || '', // Ensure categorie is mapped
                    starRating: doc.data().averageRating || 0,
                }));
                setAllPartners(fetchedPartners);
            } catch (error) {
                console.error("ERROR: Error fetching partners for Jey:", error);
            }
        };
        fetchPartners();
    }, []);

    // --- NEW: Helper to get promotion status for Partner list in modal ---
    const getPromotionStatusForPartnerItem = (partner) => {
        if (!partner.estPromu || !partner.promotionEndDate) {
            return { color: '#666', text: 'Non promu', iconName: 'information-circle-outline' };
        }

        const endDate = new Date(partner.promotionEndDate);
        const today = new Date();
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) return { color: '#FF3B30', text: 'Expirée', iconName: 'close-circle-outline' }; // Red
        if (diffDays <= 7) return { color: '#FF9500', text: `${diffDays} jours`, iconName: 'time-outline' }; // Orange
        return { color: '#34C759', text: 'Active', iconName: 'checkmark-circle-outline' }; // Green
    };

    const terminateConversationByJey = useCallback(async () => {
        try {
            await updateDoc(doc(db, 'tickets', ticketId), {
                status: 'terminé',
                termineLe: serverTimestamp()
            });
            const archived = await archiveTerminatedTicket(ticketId);

            if (archived) {
                setIsTerminated(true);
                Alert.alert('Succès', 'La conversation a été terminée et archivée par Jey.');
                navigation.goBack();
            } else {
                Alert.alert("Avertissement", "La conversation n'a pas pu être archivée correctement par Jey. Veuillez vérifier les logs.");
                setIsTerminated(true);
                navigation.goBack();
            }
        } catch (error) {
            console.error("ERROR: Jey failed to terminate conversation:", error);
            Alert.alert('Erreur Jey', 'Impossible de terminer la conversation par Jey.');
        }
    }, [ticketId, navigation]);

    // --- Function to send push notification (placeholder, copied from other files) ---
    const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
        const message = {
            to: expoPushToken,
            sound: 'ERNotification', // Using your custom sound
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
            console.log('Push notification sent successfully from Conversation.js!');
        } catch (error) {
            console.error('Failed to send push notification from Conversation.js:', error);
        }
    };
    // --- END sendPushNotification ---


    useEffect(() => {
        if (!ticketId) {
            console.log("DEBUG: ticketId is missing, going back.");
            Alert.alert('Erreur', 'Identifiant de ticket manquant');
            navigation.goBack();
            return;
        }

        lastJeyRespondedToMessageId.current = null;

        const unsubscribeTicket = onSnapshot(doc(db, 'tickets', ticketId), async (ticketDoc) => {
            if (ticketDoc.exists()) {
                const data = ticketDoc.data();
                setTicketInfo(data);
                setIsTerminated(data.status === 'terminé');

                // Fetch client's photoURL
                if (data.userId) {
                    const clientUserDoc = await getDoc(doc(db, 'users', data.userId));
                    if (clientUserDoc.exists()) {
                        setClientPhotoUrl(clientUserDoc.data().photoURL || null);
                    } else {
                        setClientPhotoUrl(null);
                    }
                } else {
                    setClientPhotoUrl(null);
                }

                // Fetch current user's photoURL
                if (currentUser?.uid) {
                    const currentUserDoc = await getDoc(doc(db, 'users', currentUser.uid));
                    if (currentUserDoc.exists()) {
                        setCurrentUserPhotoUrl(currentUserDoc.data().photoURL || null);
                    } else {
                        setCurrentUserPhotoUrl(null);
                    }
                } else {
                    setCurrentUserPhotoUrl(null);
                }

                // Fetch assigned agent's photoURL
                if (data.assignedTo && data.assignedTo !== 'jey-ai') {
                    const agentUserDoc = await getDoc(doc(db, 'users', data.assignedTo));
                    if (agentUserDoc.exists()) {
                        setAgentPhotoUrl(agentUserDoc.data().photoURL || null);
                    } else {
                        setAgentPhotoUrl(null);
                    }
                } else {
                    setAgentPhotoUrl(null);
                }


                const sortedAppointments = (data.appointments || []).sort((a, b) => {
                    const dateA = a.appointmentDateTime ? new Date(a.appointmentDateTime).getTime() : 0;
                    const dateB = b.appointmentDateTime ? new Date(b.appointmentDateTime).getTime() : 0;
                    return dateB - dateA;
                });
                setCurrentTicketAppointments(sortedAppointments);

                const activeAppointments = (sortedAppointments || []).filter(
                    appt => appt.status === 'scheduled' || appt.status === 'rescheduled'
                );
                if (activeAppointments.length > 0) {
                    activeAppointments.sort((a, b) => new Date(b.appointmentDateTime).getTime() - new Date(a.appointmentDateTime).getTime());
                    setConfirmedAppointmentForTicket(activeAppointments[0]);
                } else {
                    setConfirmedAppointmentForTicket(null);
                }

                if (data.assignedTo) {
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

        return () => {
            unsubscribeTicket();
        };
    }, [ticketId, isITSupport, currentUser?.uid, currentUser?.displayName, navigation]);

    useEffect(() => {
        if (!ticketId) return;

        const messagesQuery = query(
            collection(db, 'tickets', ticketId, 'messages'),
            orderBy('createdAt', 'asc')
        );

        const unsubscribeMessages = onSnapshot(messagesQuery,
            async (querySnapshot) => {
                let currentLocalMessages = [...messages];
                let hasChanges = false;

                querySnapshot.docChanges().forEach(change => {
                    const firestoreMessage = {
                        id: change.doc.id,
                        ...change.doc.data(),
                        createdAt: change.doc.data().createdAt?.toDate ? change.doc.data().createdAt.toDate() : new Date()
                    };

                    if (change.type === 'added') {
                        const existingOptimisticIndex = currentLocalMessages.findIndex(
                            msg => msg.optimistic &&
                            msg.expediteurId === firestoreMessage.expediteurId &&
                            msg.texte === firestoreMessage.texte &&
                            (Math.abs(msg.createdAt.getTime() - firestoreMessage.createdAt.getTime()) < 5000)
                        );

                        if (existingOptimisticIndex > -1) {
                            currentLocalMessages[existingOptimisticIndex] = firestoreMessage;
                            hasChanges = true;
                        } else {
                            if (!currentLocalMessages.some(m => m.id === firestoreMessage.id)) {
                                currentLocalMessages.push(firestoreMessage);
                                hasChanges = true;
                            }
                        }
                    } else if (change.type === 'modified') {
                        const index = currentLocalMessages.findIndex(msg => msg.id === firestoreMessage.id);
                        if (index > -1) {
                            currentLocalMessages[index] = firestoreMessage;
                            hasChanges = true;
                        }
                    } else if (change.type === 'removed') {
                        currentLocalMessages = currentLocalMessages.filter(msg => msg.id !== firestoreMessage.id);
                        hasChanges = true;
                    }
                });

                const currentMessageIds = messages.map(m => m.id).join('');
                const updatedMessageIds = currentLocalMessages.map(m => m.id).join('');

                if (hasChanges || updatedMessageIds !== currentMessageIds || currentLocalMessages.length !== messages.length) {
                    currentLocalMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
                    setMessages(currentLocalMessages);
                    if (flatListRef.current) {
                        setTimeout(() => flatListRef.current.scrollToEnd({
                            animated: true
                        }), 100);
                    }

                    if (currentUser && currentUser.uid) {
                        try {
                            const userDocRef = doc(db, 'users', currentUser.uid);
                            const userDocSnap = await getDoc(userDocRef);
                            const userLastSeen = userDocSnap.exists() ? userDocSnap.data().lastSeenMessages?.toDate() : new Date(0);
                            const latestMessageTimestamp = currentLocalMessages.length > 0 ?
                                currentLocalMessages[currentLocalMessages.length - 1].createdAt :
                                null;

                            const isCurrentUsersMessage = latestMessageTimestamp && currentLocalMessages[currentLocalMessages.length - 1].expediteurId === currentUser.uid;

                            if (latestMessageTimestamp && (latestMessageTimestamp > userLastSeen || isCurrentUsersMessage)) {
                                await updateDoc(userDocRef, {
                                    lastSeenMessages: serverTimestamp()
                                });
                            }
                        } catch (updateError) {
                            console.error("ERROR: Failed to update lastSeenMessages in Conversation.js:", updateError);
                        }
                    }
                }

                setChargement(false);

                // --- Jey's Auto-Response Logic ---
                // Only trigger Jey's response if it's not IT Support, ticket is handled by Jey, and not terminated
                if (!isITSupport && ticketInfo?.status === 'jey-handling' && !isTerminated) {
                    const lastMessage = currentLocalMessages[currentLocalMessages.length - 1];

                    // Trigger Jey if the last message is from the current user (client) and Jey hasn't responded to it yet
                    // and it's not an optimistic message (still sending) or an internal command.
                    if (lastMessage && lastMessage.expediteurId === currentUser?.uid && lastMessage.id !== lastJeyRespondedToMessageId.current) {

                        const isInternalCommand = lastMessage.texte.startsWith('/select_partner_') ||
                            lastMessage.texte === '/confirm_booking_yes' ||
                            lastMessage.texte === '/confirm_booking_no' ||
                            lastMessage.texte === '/show_appointment_form';

                        if (!lastMessage.optimistic || isInternalCommand) { // Only process if not optimistic or it's an internal command
                            lastJeyRespondedToMessageId.current = lastMessage.id; // Mark this message as responded to

                            if (lastMessage.texte.startsWith('/select_partner_')) {
                                const partnerId = lastMessage.texte.replace('/select_partner_', '');
                                const partner = allPartners.find(p => p.id === partnerId);
                                if (partner) {
                                    setSelectedPartnerForBooking(partner);
                                    await getJeyResponse(currentLocalMessages, false, 'ask_booking_confirmation', partner);
                                } else {
                                    await getJeyResponse(currentLocalMessages, false, 'general_response');
                                }
                            } else if (lastMessage.texte === '/confirm_booking_yes') {
                                setShowAppointmentFormModal(true);
                            } else if (lastMessage.texte === '/confirm_booking_no') {
                                await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                                    texte: `D'accord. Y a-t-il autre chose que je puisse faire pour vous aider ?`,
                                    expediteurId: 'jey-ai',
                                    nomExpediteur: 'Jey',
                                    createdAt: serverTimestamp(),
                                    type: 'text',
                                });
                                await updateDoc(doc(db, 'tickets', ticketId), {
                                    jeyAskedToTerminate: true
                                });
                            } else if (lastMessage.texte === '/show_appointment_form') {
                                setShowAppointmentFormModal(true);
                            }
                            else if (ticketInfo.jeyAskedToTerminate) { // Client response after Jey asked to terminate
                                const clientResponse = lastMessage.texte.toLowerCase();
                                const confirmationKeywords = ['oui', 'yes', 'ok', 'accepte', 'terminer', 'mettre fin', 'finir', 'c\'est tout'];
                                const refusalKeywords = ['non', 'pas encore', 'continue', 'encore', 'besoin', 'aide', 'non merci', 'non, merci'];

                                if (confirmationKeywords.some(keyword => clientResponse.includes(keyword))) {
                                    await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                                        texte: `Merci d'avoir choisi EliteReply, ${actualClientName}! Je vous souhaite une excellente journée. Au revoir.`,
                                        expediteurId: 'jey-ai',
                                        nomExpediteur: 'Jey',
                                        createdAt: serverTimestamp(),
                                        type: 'text',
                                    });
                                    await updateDoc(doc(db, 'tickets', ticketId), {
                                        jeyAskedToTerminate: deleteField()
                                    });
                                    setTimeout(async () => {
                                        await terminateConversationByJey();
                                    }, 1000); // Small delay before terminating
                                } else if (refusalKeywords.some(keyword => clientResponse.includes(keyword))) {
                                    await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                                        texte: `D'accord, je suis là pour vous aider. Que puis-ce faire d'autre pour vous ?`,
                                        expediteurId: 'jey-ai',
                                        nomExpediteur: 'Jey',
                                        createdAt: serverTimestamp(),
                                        type: 'text',
                                    });
                                    await updateDoc(doc(db, 'tickets', ticketId), {
                                        jeyAskedToTerminate: deleteField()
                                    });
                                } else { // Client response didn't clearly confirm or deny termination
                                    await updateDoc(doc(db, 'tickets', ticketId), {
                                        jeyAskedToTerminate: deleteField()
                                    });
                                    await getJeyResponse(currentLocalMessages, false, 'general_response');
                                }
                            } else { // General client message that's not an internal command
                                if (!isInternalCommand) { // Ensure not to double-respond to internal commands
                                    await getJeyResponse(currentLocalMessages, false, 'general_response');
                                }
                            }
                        }
                    }
                }
            },
            (error) => {
                console.error("ERROR: Error loading messages:", error);
                setChargement(false);
            }
        );

        return () => {
            unsubscribeMessages();
        };
    }, [
        ticketId, messages.length, isITSupport, ticketInfo, isTerminated,
        currentUser?.uid, getJeyResponse, ticketCategory, actualClientName,
        allPartners, terminateConversationByJey, setMessages
    ]);

    // --- TYPING STATUS LISTENER (UPDATED) ---
    useEffect(() => {
        if (!ticketId || !currentUser) return;

        const conversationRef = doc(db, 'conversations', ticketId);

        const unsubscribeTyping = onSnapshot(conversationRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const typingUsers = data.typingUsers || {};

                // Handle Jey's typing status
                if (typingUsers['jey-ai']) {
                    setIsJeyTyping(true);
                } else {
                    setIsJeyTyping(false);
                }

                // Handle other human users' typing status
                let foundAnyOtherHumanTyper = false;
                let foundOtherHumanTypingName = null;

                for (const userId in typingUsers) {
                    // Check if it's a human user AND not the current user AND not Jey
                    if (userId !== currentUser.uid && userId !== 'jey-ai') {
                        // For simplicity, we'll just show the name of the first human typer found.
                        const otherUserDoc = await getDoc(doc(db, 'users', userId));
                        if (otherUserDoc.exists()) {
                            foundOtherHumanTypingName = otherUserDoc.data().name || 'Quelqu\'un';
                            foundAnyOtherHumanTyper = true;
                            break; // Stop after finding the first one.
                        }
                    }
                }

                setIsOtherHumanTyping(foundAnyOtherHumanTyper);
                setOtherHumanTypingName(foundOtherHumanTypingName);

            } else {
                // If conversation doc doesn't exist, nobody is typing
                setIsJeyTyping(false);
                setIsOtherHumanTyping(false);
                setOtherHumanTypingName(null);
            }
        }, (error) => {
            console.error("ERROR: Error listening to typing status:", error);
        });

        return () => {
            unsubscribeTyping();
        };
    }, [ticketId, currentUser]); // Dependencies

    // --- updateTypingStatus (IMPROVED) ---
    const updateTypingStatus = async (isTyping) => {
        if (!currentUser || !ticketId || !ticketInfo) {
            return;
        }

        const conversationRef = doc(db, 'conversations', ticketId);
        const userKey = currentUser.uid;

        // A human is allowed to update typing status if:
        // 1. The conversation is NOT terminated
        // AND
        // 2. The ticket status is any state where human interaction is expected:
        //    'nouveau', 'jey-handling', 'escalated_to_agent', 'in-progress'
        const isHumanTypingAllowed = !isTerminated &&
            (ticketInfo.status === 'nouveau' || // Added 'nouveau'
                ticketInfo.status === 'jey-handling' ||
                ticketInfo.status === 'escalated_to_agent' ||
                ticketInfo.status === 'in-progress'); // Added 'in-progress'

        if (!isHumanTypingAllowed) {
            console.log(`DEBUG: Typing update NOT allowed for human. Status: ${ticketInfo.status}, isTerminated: ${isTerminated}`);
            // Ensure human's typing status is removed if they fall out of allowed states
            try {
                await updateDoc(conversationRef, {
                    [`typingUsers.${userKey}`]: deleteField()
                });
            } catch (cleanupError) {
                console.error("ERROR: Failed to clean up typing status:", cleanupError);
            }
            return;
        }

        try {
            if (isTyping) {
                await updateDoc(conversationRef, {
                    [`typingUsers.${userKey}`]: currentUser.displayName || (isITSupport ? 'Agent' : 'Client')
                });
                // console.log(`DEBUG: User ${currentUser.uid} (${currentUser.displayName || (isITSupport ? 'Agent' : 'Client')}) setting typing status to true.`);
            } else {
                await updateDoc(conversationRef, {
                    [`typingUsers.${userKey}`]: deleteField()
                });
                // console.log(`DEBUG: User ${currentUser.uid} (${currentUser.displayName || (isITSupport ? 'Agent' : 'Client')}) setting typing status to false.`);
            }
        } catch (error) {
            console.error("ERROR: Error updating typing status:", error);
        }
    };


    const archiveTerminatedTicket = async (currentTicketId) => {
        try {
            const ticketDocRef = doc(db, 'tickets', currentTicketId);
            const ticketDoc = await getDoc(ticketDocRef);
            if (!ticketDoc.exists()) {
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
                createdAt: msgDoc.data().createdAt && typeof msgDoc.data().createdAt.toDate === 'function' ?
                    msgDoc.data().createdAt.toDate().toISOString() :
                    (msgDoc.data().createdAt instanceof Date ?
                        msgDoc.createdAt.toISOString() :
                        null)
            }));

            const archiveData = {
                ticketData: ticketDoc.data(),
                conversationData,
                messages: messagesToArchive,
                terminatedAt: serverTimestamp(),
                terminatedBy: currentUser?.uid || 'unknown',
                terminatedByName: (isITSupport ? (currentUser?.displayName || 'Agent') : 'Jey'),
                originalTicketId: currentTicketId
            };

            await addDoc(collection(db, 'terminatedTickets'), archiveData);

            const batch = writeBatch(db);
            const messagesCollectionRef = collection(db, 'tickets', currentTicketId, 'messages');
            const messagesSnap = await getDocs(messagesCollectionRef);
            messagesSnap.docs.forEach(msgDoc => {
                batch.delete(msgDoc.ref);
            });
            batch.delete(conversationDocRef);

            await batch.commit();

            if (isITSupport) {
                const agentUserRef = doc(db, 'users', currentUser.uid);
                await runTransaction(db, async (transaction) => {
                    const agentDoc = await transaction.get(agentUserRef);
                    if (!agentDoc.exists()) {
                        transaction.set(agentUserRef, {
                            terminatedTicketsCount: 1
                        }, {
                            merge: true
                        });
                    } else {
                        transaction.update(agentUserRef, {
                            terminatedTicketsCount: increment(1)
                        });
                    }
                });
            }

            const globalCountsRef = doc(db, '_meta_data', 'globalCounts');
            await runTransaction(db, async (transaction) => {
                const sfDoc = await transaction.get(globalCountsRef);
                if (!sfDoc.exists()) {
                    transaction.set(globalCountsRef, {
                        terminatedTickets: 1
                    });
                } else {
                    transaction.update(globalCountsRef, {
                        terminatedTickets: increment(1)
                    });
                }
            });
            return true;
        } catch (error) {
            Alert.alert("Erreur d'archivage", error.message || "Une erreur est survenue lors de l'archivage du ticket.");
            console.error("Archive Terminated Ticket Error:", error);
            return false;
        }
    };

    const terminerConversation = async () => {
        Alert.alert(
            'Terminer la conversation',
            'Êtes-vous sûr de vouloir terminer cette conversation? Elle sera archivée.',
            [{
                text: 'Annuler',
                style: 'cancel'
            }, {
                text: 'Terminer',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await updateDoc(doc(db, 'tickets', ticketId), {
                            status: 'terminé',
                            termineLe: serverTimestamp()
                        });
                        const archived = await archiveTerminatedTicket(ticketId);

                        if (archived) {
                            setIsTerminated(true);
                            Alert.alert('Succès', 'La conversation a été terminée et archivée.');
                            navigation.goBack();
                        } else {
                            Alert.alert("Avertissement", "La conversation n'a pas pu être archivée correctement. Veuillez vérifier les logs.");
                            setIsTerminated(true);
                            navigation.goBack();
                        }
                    } catch (error) {
                        Alert.alert('Erreur', 'Impossible de terminer la conversation');
                        console.error("Terminate Conversation Error:", error);
                    }
                }
            }]
        );
    };

    const getJeyResponse = useCallback(async (conversationHistory, isInitialMessage = false, intentOverride = null, selectedPartner = null) => {
        const openai = new OpenAI({
            apiKey: OPENAI_API_KEY
        });

        if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-YOUR_ACTUAL_API_KEY_HERE') {
            Alert.alert('Erreur API', 'Clé API OpenAI non configurée. Veuillez ajouter votre clé.');
            await updateDoc(doc(db, 'tickets', ticketId), {
                status: 'escalated_to_agent',
                isAgentRequested: true,
                lastUpdated: serverTimestamp(),
                jeyAskedToTerminate: deleteField(),
                escalationReason: 'RENDEZ_VOUS EN ATTENTE (API Key manquante)',
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                status: 'escalated_to_agent',
                isAgentRequested: true,
                lastUpdated: serverTimestamp(),
            });
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: `Jey rencontre un problème de configuration interne et a escaladé votre demande à un agent humain. Un agent prendra le relais sous peu.`,
                expediteurId: 'systeme',
                nomExpediteur: 'Système',
                createdAt: serverTimestamp(),
                type: 'text'
            });
            return "Désolé, je ne suis pas configuré correctement pour le moment et je ne peux pas vous assister. Votre demande a été escaladée à un agent humain.";
        }

        if (isITSupport) {
            return;
        }
        setIsJeyTyping(true);

        try {
            const openaiMessages = conversationHistory.map(msg => ({
                role: msg.expediteurId === 'jey-ai' ? 'assistant' : 'user',
                content: msg.texte,
            }));

            const lastClientMessageText = openaiMessages[openaiMessages.length - 1]?.content.toLowerCase() || '';

            let systemPromptContent;
            let jeyMessageType = 'text';
            let jeyMessageData = {};

            const terminationKeywords = ['merci jey', 'merci beaucoup', 'c\'est tout', 'pas besoin', 'au revoir', 'bye', 'goodbye', 'rien d\'autre'];
            const clientWantsToTerminate = terminationKeywords.some(keyword => lastClientMessageText.includes(keyword));
            const clientAskedForPartnersExplicitly = ['partenaire', 'recommander', 'service', 'agence', 'hotel', 'clinique', 'restaurant', 'voyage', 'sante', 'bien-etre', 'chauffeur', 'taxi'].some(keyword => lastClientMessageText.includes(keyword));
            const appointmentKeywords = ['rendez-vous', 'prendre rendez-vous', 'reservation', 'faire une reservation', 'disponibilité'];

            const clientConfirmedPartnerSelection = lastClientMessageText.includes('j\'ai sélectionné') ||
                lastClientMessageText.includes('je choisis') ||
                lastClientMessageText.includes('mon choix est') ||
                (lastClientMessageText.includes('je voudrais') && lastClientMessageText.includes('avec'));

            const clientWantsAppointment = appointmentKeywords.some(keyword => lastClientMessageText.includes(keyword));

            const getSortedPartnersForSuggestion = (userRequestText = '') => {
                let relevantPartners = [];
                const userRequestLower = userRequestText.toLowerCase();

                let detectedCategory = '';
                if (ticketCategory) {
                    detectedCategory = ticketCategory.toLowerCase();
                } else {
                    for (const partner of allPartners) {
                        if (partner.categorie && userRequestLower.includes(partner.categorie.toLowerCase())) { // Used categorie
                            detectedCategory = partner.categorie.toLowerCase(); // Used categorie
                            break;
                        }
                    }
                }

                if (detectedCategory) {
                    relevantPartners = allPartners.filter(p =>
                        p.categorie?.toLowerCase().includes(detectedCategory) || // Used categorie
                        p.nom?.toLowerCase().includes(detectedCategory) // Used nom
                    );
                }

                if (relevantPartners.length === 0) {
                    relevantPartners = [...allPartners];
                }

                relevantPartners.sort((a, b) => {
                    const isAPromoted = a.isPromoted || false;
                    const isBPromoted = b.isPromoted || false;
                    const ratingA = a.starRating || 0;
                    const ratingB = b.starRating || 0;

                    if (isAPromoted && !isBPromoted) return -1;
                    if (!isAPromoted && isBPromoted) return 1;

                    return ratingB - ratingA;
                });

                return relevantPartners.slice(0, 3);
            };

            const partnersToSuggest = getSortedPartnersForSuggestion(ticketCategory || lastClientMessageText);
            const partnersListForPrompt = allPartners.map(p =>
                `${p.nom} (Catégorie: ${p.categorie || 'Général'}, Note: ${p.starRating?.toFixed(1) || 'Non noté'} étoiles, Promu: ${p.estPromu ? 'Oui' : 'Non'})` // Used nom, categorie, estPromu
            ).join('; ');

            let baseSystemPrompt = `
            **Directive de sécurité : Ne JAMAIS suggérer ou créer un partenaire qui n'est PAS dans la liste fournie ci-dessous. Tes suggestions DOIVENT provenir EXCLUSIVEMENT de cette liste. Ne mentionne AUCUNE entité externe comme OpenAI ou Google; tu es UNIQUEMENT l'assistant IA d'EliteReply.**
            **Liste des partenaires pour référence (ne pas toujours les lister explicitement dans la réponse sauf si demandé ou pertinent):**
            ${partnersListForPrompt}`;

            // --- JEY'S INTRODUCTION FIX ---
            let initialGreeting = "Bonjour, je suis Jey, l'assistant IA d'EliteReply.";
            if (isInitialMessage) {
                const categoryText = ticketCategory ? ` pour votre demande dans la catégorie "${ticketCategory}"` : '';
                // Ensure Jey introduces himself first, then asks how he can help with context.
                systemPromptContent = `${initialGreeting} Comment puis-je vous aider aujourd'hui avec votre demande${categoryText} ?` + baseSystemPrompt;
            } else if (intentOverride === 'ask_booking_confirmation' && selectedPartner) {
                systemPromptContent = `Tu es Jey de EliteReply. Le client vient de sélectionner le partenaire "${selectedPartner.nom}". Pose-lui la question suivante : "Excellent choix ! Souhaitez-vous que je procède à la prise de rendez-vous avec ${selectedPartner.nom} ?" Propose des options claires pour "oui" ou "non".` + baseSystemPrompt; // Used nom
                jeyMessageType = 'booking_confirmation_request';
                jeyMessageData = {
                    partnerId: selectedPartner.id,
                    partnerName: selectedPartner.nom // Used nom
                };
            } else if (intentOverride === 'show_booking_form') {
                systemPromptContent = `Tu es Jey de EliteReply. Le client a confirmé la prise de rendez-vous. Acknowledge this briefly.` + baseSystemPrompt;
            } else if (ticketInfo && ticketInfo.jeyAskedToTerminate) {
                const clientResponse = lastClientMessageText;
                const confirmationKeywords = ['oui', 'yes', 'ok', 'accepte', 'terminer', 'mettre fin', 'finir', 'c\'est tout'];
                const refusalKeywords = ['non', 'pas encore', 'continue', 'encore', 'besoin', 'aide', 'non merci', 'non, merci'];

                if (confirmationKeywords.some(keyword => clientResponse.includes(keyword))) {
                    systemPromptContent = `Tu es Jey de EliteReply. Le client a confirmé qu'il souhaite terminer la conversation. Réponds en remerciant le client d'avoir utilisé EliteReply, dis-lui au revoir, puis termine la conversation. Ton nom est Jey. Le nom du client est ${actualClientName}.` + baseSystemPrompt;
                } else if (refusalKeywords.some(keyword => clientResponse.includes(keyword))) {
                    systemPromptContent = `Tu es Jey de EliteReply. Le client ne souhaite pas terminer la conversation. Réponds-lui poliment et demande-lui comment tu peux l'aider d'autre part. Ton nom est Jey. Le nom du client est ${actualClientName}.` + baseSystemPrompt;
                    await updateDoc(doc(db, 'tickets', ticketId), {
                        jeyAskedToTerminate: deleteField()
                    });
                } else {
                    await updateDoc(doc(db, 'tickets', ticketId), {
                        jeyAskedToTerminate: deleteField()
                    });
                    await getJeyResponse(conversationHistory, false, 'general_response');
                }
            } else if (clientWantsAppointment && ticketInfo && !ticketInfo?.jeyAskedToTerminate) {
                systemPromptContent = `Tu es Jey de EliteReply. Le client a exprimé le désir de prendre un rendez-vous ou faire une réservation. Demande-lui : "Je comprends que vous souhaitez prendre un rendez-vous. Est-ce exact ?" Propose un bouton "Prendre Rendez-vous" pour le guider.` + baseSystemPrompt;
                jeyMessageType = 'appointment_request_prompt';
            } else if (clientWantsToTerminate) {
                systemPromptContent = `Tu es Jey de EliteReply. Le client a exprimé le désir de terminer la conversation (ex: "merci", "au revoir"). Réponds en demandant poliment au client s'il souhaite que tu mettes fin à la conversation en cours. Propose de terminer la conversation. Ton nom est Jey. Le nom du client est ${actualClientName}.` + baseSystemPrompt;
                await updateDoc(doc(db, 'tickets', ticketId), {
                    jeyAskedToTerminate: true
                });
            } else if (clientConfirmedPartnerSelection) {
                let identifiedPartner = null;
                for (const partner of allPartners) {
                    if (partner.nom && lastClientMessageText.includes(partner.nom.toLowerCase())) { // Used nom
                        identifiedPartner = partner;
                        break;
                    }
                }

                if (identifiedPartner) {
                    setSelectedPartnerForBooking(identifiedPartner);
                    systemPromptContent = `Tu es Jey de EliteReply. Le client vient de confirmer la sélection du partenaire "${identifiedPartner.nom}" via un message textuel. Pose-lui la question suivante : "Excellent choix ! Souhaitez-vous que je procède à la prise de rendez-vous avec ${identifiedPartner.nom} ?" Propose des options claires pour "oui" ou "non".` + baseSystemPrompt; // Used nom
                    jeyMessageType = 'booking_confirmation_request';
                    jeyMessageData = {
                        partnerId: identifiedPartner.id,
                        partnerName: identifiedPartner.nom // Used nom
                    };
                } else {
                    systemPromptContent = `Tu es Jey de EliteReply. Le client semble avoir mentionné une sélection. Réponds poliment et demande de confirmer le nom du partenaire ou s'il y a un autre service qu'il recherche.` + baseSystemPrompt;
                }
            } else if (clientAskedForPartnersExplicitly || lastClientMessageText.includes('recommander')) {
                const partnersToSuggest = getSortedPartnersForSuggestion(ticketCategory || lastClientMessageText);

                let partnersSuggestionText;
                if (partnersToSuggest.length > 0) {
                    partnersSuggestionText = `Voici quelques partenaires que je peux vous recommander : ` +
                        partnersToSuggest.map(p => `${p.nom} (Catégorie: ${p.categorie || 'Général'}, Note: ${p.starRating?.toFixed(1) || 'Non noté'} étoiles)`).join(', ') + // Used nom, categorie
                        `. Souhaitez-vous en sélectionner un ou avez-vous une autre demande ?`;
                } else {
                    partnersSuggestionText = `Je n'ai pas trouvé de partenaires correspondant à votre demande spécifique. Souhaitez-vous que je vous aide avec autre chose ou que je transfère votre demande à un agent humain ?`;
                }

                systemPromptContent = `Tu es Jey, l'assistant IA de service client pour la plateforme "EliteReply". Le client cherche des partenaires. Utilise la liste de partenaires suivante pour formuler ta réponse. Ton nom est Jey. Le nom du client est ${actualClientName}. Réponds en proposant des partenaires pertinents comme suit: "${partnersSuggestionText}".` + baseSystemPrompt;
                jeyMessageType = 'partner_suggestion_list';
                jeyMessageData = {
                    partners: partnersToSuggest
                };
            } else {
                let categorySpecificInstruction = '';
                if (ticketCategory) {
                    categorySpecificInstruction = `La catégorie principale de ce ticket est "${ticketCategory}". Priorise les suggestions de partenaires dans cette catégorie ou des catégories très similaires, sauf si le client indique clairement une nouvelle direction.`;
                }

                systemPromptContent = `Tu es Jey, l'assistant IA de service client pour la plateforme "EliteReply". Ton objectif est de comprendre les besoins des clients et de leur offrir une assistance complète. Parle toujours en français. Sois amical, concis et utile. Ton nom est Jey. Le nom du client est ${actualClientName}. Évite de t'excuser inutilement. Ne génère pas d'informations fausses ou inventées. Si tu ne sais pas, dis que tu transfères à un agent.

                **Instructions spécifiques:**
                - Si la demande du client est vague ou si elle correspond à un service que nos partenaires pourraient offrir (même si le client ne demande pas explicitement des partenaires), suggère de manière proactive 2-3 partenaires pertinents de notre liste. Mentionne leur nom, leur catégorie et leur note.
                - Si la demande du client correspond clairement à une catégorie de services que nos partenaires offrent (ex: "j'ai besoin de réparer ma voiture", "je veux organiser un voyage"), **tes suggestions de partenaires DOIVENT IMPÉRATIVEMENT correspondre à la catégorie mentionnée par le client dans sa demande actuelle.**
                - Après avoir fait ta suggestion de partenaires (proactive ou demandée), demande toujours au client s'il souhaite en sélectionner un ou si tu dois l'aider à prendre rendez-vous avec un partenaire en particulier.
                - Si tu détectes une mention claire d'un de nos partenaires suite à une suggestion précédente, confirme la sélection et demande si le client souhaite prendre rendez-vous avec ce partenaire.
                - Si un client demande à parler à un "agent", "humain", ou utilise des expressions telles que "passe moi un agent", "Je souhaite parler à un agent", "je veux parler à un agent", "un agent s'il vous plait", "un agent svp", ou si tu ne comprends pas bien la demande ou la conversation, informe-le que tu vas escalader à un agent humain.

                ${categorySpecificInstruction}
                ` + baseSystemPrompt;
            }

            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{
                    "role": "system",
                    "content": systemPromptContent
                }, ...openaiMessages],
                max_tokens: 250,
                temperature: 0.7,
            });

            const jeyText = response.choices[0]?.message?.content?.trim();

            const suggestedPartnerNames = allPartners.filter(p => p.nom && jeyText.toLowerCase().includes(p.nom.toLowerCase())); // Used nom
            if (suggestedPartnerNames.length > 0 && jeyMessageType === 'text') {
                jeyMessageType = 'partner_suggestion_list';
                jeyMessageData = {
                    partners: allPartners.filter(p => suggestedPartnerNames.some(sp => sp.id === p.id))
                };
            }


            if (jeyText && intentOverride !== 'show_booking_form') {
                const jeyMessageRef = await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                    texte: jeyText,
                    expediteurId: 'jey-ai',
                    nomExpediteur: 'Jey',
                    createdAt: serverTimestamp(),
                    type: jeyMessageType,
                    ...jeyMessageData,
                });

                await updateDoc(doc(db, 'tickets', ticketId), {
                    lastMessage: jeyText,
                    lastUpdated: serverTimestamp(),
                    lastMessageSender: 'jey-ai'
                });
                await updateDoc(doc(db, 'conversations', ticketId), {
                    lastMessage: jeyText,
                    lastUpdated: serverTimestamp(),
                    lastMessageSender: 'jey-ai'
                });

                const clientConfirmedTermination = ['merci d\'avoir choisi elitereply', 'je vous souhaite une excellente journée', 'au revoir'].some(keyword => jeyText.toLowerCase().includes(keyword));
                if (clientConfirmedTermination && ticketInfo && ticketInfo.jeyAskedToTerminate) {
                    setTimeout(async () => {
                        await terminateConversationByJey();
                    }, 1500);
                }

            }

            const lowerCaseJeyText = jeyText.toLowerCase();
            const shouldEscalateBasedOnKeywords = lowerCaseJeyText.includes('escalader') ||
                lowerCaseJeyText.includes('agent humain') ||
                lowerCaseJeyText.includes('prendre le relais') ||
                lowerCaseJeyText.includes('je ne comprends pas') ||
                lowerCaseJeyText.includes('je ne peux pas vous aider') ||
                lowerCaseJeyText.includes('je ne suis pas sûr');

            const clientExplicitlyRequestedAgent = ['passe moi un agent', 'je souhaite parler a un agent', 'je veux parler a un agent', 'un agent s\'il vous plait', 'un agent svp'].some(phrase => lastClientMessageText.includes(phrase));


            if ((shouldEscalateBasedOnKeywords || clientExplicitlyRequestedAgent) && ticketInfo && ticketInfo.status !== 'escalated_to_agent') {
                await updateDoc(doc(db, 'tickets', ticketId), {
                    status: 'escalated_to_agent',
                    isAgentRequested: true,
                    lastUpdated: serverTimestamp(),
                    jeyAskedToTerminate: deleteField(),
                    escalationReason: 'Demande Agent',
                    lastMessageSender: 'systeme',
                });
                await updateDoc(doc(db, 'conversations', ticketId), {
                    status: 'escalated_to_agent',
                    isAgentRequested: true,
                    lastUpdated: serverTimestamp(),
                });

                if (!lowerCaseJeyText.includes('escalader') && !lowerCaseJeyText.includes('agent humain') && !lowerCaseJeyText.includes('prendre le relais')) {
                    await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                        texte: `Votre demande a été escaladée à un agent humain. Un agent prendra le relais sous peu.`,
                        expediteurId: 'systeme',
                        nomExpediteur: 'Système',
                        createdAt: serverTimestamp(),
                        type: 'text'
                    });
                }
            }

            if (isInitialMessage) {
                await updateDoc(doc(db, 'tickets', ticketId), {
                    initialJeyMessageSent: true
                });
            }

            return jeyText;
        } catch (error) {
            console.error("ERROR in getJeyResponse:", error);
            Alert.alert("Erreur Jey", "Jey rencontre des difficultés. Veuillez réessayer ou demander un agent.");
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: `Désolé, je rencontre un problème technique pour le moment et je ne peux pas vous assister. Votre demande a été escaladée à un agent humain.`,
                expediteurId: 'jey-ai',
                nomExpediteur: 'Jey',
                createdAt: serverTimestamp(),
                type: 'text'
            });
            await updateDoc(doc(db, 'tickets', ticketId), {
                status: 'escalated_to_agent',
                isAgentRequested: true,
                lastUpdated: serverTimestamp(),
                escalationReason: 'Demande Agent (Erreur technique Jey)',
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                status: 'escalated_to_agent',
                isAgentRequested: true,
                lastUpdated: serverTimestamp(),
            });
            return "Désolé, je rencontre un problème technique pour le moment.";
        } finally {
            setIsJeyTyping(false);
        }
    }, [ticketId, isITSupport, actualClientName, ticketCategory, ticketInfo, allPartners, terminateConversationByJey]);


    const uploaderImage = useCallback(async (uri) => {
        try {
            const optimisticMessageId = `optimistic-image-${currentUser?.uid}-${Date.now()}-${Math.random()}`;
            const newImageMessage = {
                id: optimisticMessageId,
                texte: 'Envoi de l\'image...',
                expediteurId: currentUser?.uid,
                nomExpediteur: currentUser?.displayName || (isITSupport ? 'Agent' : 'Client'),
                createdAt: new Date(),
                type: 'image',
                imageURL: null,
                optimistic: true,
            };
            setMessages(prevMessages => [...prevMessages, newImageMessage]);

            const response = await fetch(uri);
            const blob = await response.blob();
            const filename = `pieces_jointes/${ticketId}/${Date.now()}.jpg`;
            const storageRef = ref(storage, filename);

            await uploadBytes(storageRef, blob);
            const downloadURL = await getDownloadURL(storageRef);

            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: 'Image partagée',
                expediteurId: currentUser?.uid,
                nomExpediteur: currentUser?.displayName || (isITSupport ? 'Agent' : 'Client'),
                createdAt: serverTimestamp(),
                type: 'image',
                imageURL: downloadURL
            });

            if (ticketInfo?.jeyAskedToTerminate) {
                await updateDoc(doc(db, 'tickets', ticketId), {
                    jeyAskedToTerminate: deleteField()
                });
            }

            await updateDoc(doc(db, 'conversations', ticketId), {
                lastUpdated: serverTimestamp(),
                lastMessage: 'Image partagée',
                lastMessageSender: currentUser?.uid,
            });
            await updateDoc(doc(db, 'tickets', ticketId), {
                lastUpdated: serverTimestamp(),
                lastMessage: 'Image partagée',
                lastMessageSender: currentUser?.uid,
            });

        } catch (error) {
            Alert.alert("Erreur", "Impossible de sélectionner ou d'envoyer l'image");
            setMessages(prevMessages => prevMessages.filter(msg => msg.id !== newImageMessage.id));
            throw error;
        } finally {
            setUploading(false);
        }
    }, [currentUser, isITSupport, ticketId, ticketInfo, setMessages]);

    const selectionnerImage = useCallback(async () => {
        if (isTerminated) {
            return;
        }

        setUploading(true);
        try {
            const {
                status
            } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert("Permission requise", "Veuillez accorder la permission d'accès à la galerie pour sélectionner une image.");
                return;
            }

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaType.Images,
                quality: 0.8
            });

            if (!result.canceled) {
                await uploaderImage(result.assets[0].uri);
            }
        } catch (error) {
            Alert.alert("Erreur", "Impossible de sélectionner l'image");
        } finally {
            setUploading(false);
        }
    }, [isTerminated, uploaderImage]);

    const envoyerMessage = async (texte, type = 'text', additionalData = {}, displayTexteForUI = null) => {
        if (isTerminated) {
            return;
        }

        const messageToSend = texte.trim();
        if (!messageToSend && type === 'text') {
            return;
        }
        if (!ticketId || !currentUser) {
            return;
        }

        const textToDisplay = displayTexteForUI || messageToSend;

        try {
            const optimisticMessageId = `optimistic-${currentUser?.uid}-${Date.now()}-${Math.random()}`;
            const newMessage = {
                id: optimisticMessageId,
                texte: textToDisplay,
                expediteurId: currentUser?.uid,
                nomExpediteur: currentUser?.displayName || (isITSupport ? 'Agent' : 'Client'),
                createdAt: new Date(),
                type,
                optimistic: true,
                ...additionalData,
            };
            setMessages(prevMessages => [...prevMessages, newMessage]);
            setNouveauMessage('');

            if (messageToSend.startsWith('/select_partner_') ||
                messageToSend === '/confirm_booking_yes' ||
                messageToSend === '/confirm_booking_no'
            ) {
                // These are internal commands, don't write to DB as regular messages (they trigger Jey's response)
                return;
            } else if (messageToSend === '/show_appointment_form') {
                setShowAppointmentFormModal(true); // This also just triggers the modal, no DB message
                return;
            }


            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: messageToSend,
                expediteurId: currentUser?.uid,
                nomExpediteur: currentUser?.displayName || (isITSupport ? 'Agent' : 'Client'),
                createdAt: serverTimestamp(),
                type,
                ...additionalData,
            });

            if (ticketInfo?.jeyAskedToTerminate) {
                await updateDoc(doc(db, 'tickets', ticketId), {
                    jeyAskedToTerminate: deleteField()
                });
            }

            updateTypingStatus(false); // Stop typing after sending message

            await mettreAJourConversation(messageToSend, currentUser?.uid); // Update last message on ticket/conversation

        } catch (error) {
            Alert.alert("Erreur", "Impossible d'envoyer le message");
            setMessages(prevMessages => prevMessages.filter(msg => msg.id !== newMessage.id));
        }
    };

    const handleTextInputChange = useCallback((text) => {
        setNouveauMessage(text);
        if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
        }
        updateTypingStatus(true); // Start typing when text changes
        typingTimeoutRef.current = setTimeout(() => {
            updateTypingStatus(false); // Stop typing after a delay
        }, 3000);
    }, [updateTypingStatus]); // Added updateTypingStatus to useCallback dependencies

    const mettreAJourConversation = async (texte, senderId) => {
        const updates = {
            lastUpdated: serverTimestamp(),
            lastMessage: texte.substring(0, 50),
            lastMessageSender: senderId,
        };

        if (isITSupport && ticketInfo && ['nouveau', 'escalated_to_agent', 'jey-handling'].includes(ticketInfo.status) && !ticketInfo.assignedTo) {
            updates.assignedTo = currentUser?.uid;
            updates.assignedToName = currentUser?.displayName || 'Agent';
            updates.status = 'in-progress';
            updates.agentJoinedNotified = true;

            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: `${currentUser?.displayName || 'Un Agent'} a pris en charge votre Requête.`,
                expediteurId: 'systeme',
                nomExpediteur: 'Système',
                createdAt: serverTimestamp()
            });
        }

        await updateDoc(doc(db, 'conversations', ticketId), updates);
        await updateDoc(doc(db, 'tickets', ticketId), updates);
    };

    const downloadImage = async (imageUrl) => {
        try {
            const {
                status
            } = await MediaLibrary.requestPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission requise', 'Veuillez accorder la permission d\'accès à la galerie pour télécharger l\'image.');
                return;
            }

            Alert.alert('Téléchargement', 'Téléchargement de l\'image en cours...', [{
                text: 'OK'
            }]);

            const filename = imageUrl.split('/').pop().split('?')[0];
            const fileDest = `${FileSystem.cacheDirectory}${filename}`;

            if (!FileSystem || !FileSystem.downloadAsync) {
                Alert.alert('Erreur', 'Bibliothèque de fichiers non disponible. Impossible de télécharger.');
                return;
            }
            const {
                uri: localUri
            } = await FileSystem.downloadAsync(imageUrl, fileDest);

            await MediaLibrary.saveToLibraryAsync(localUri);
            Alert.alert('Succès', 'Image téléchargée dans votre galerie !');

        } catch (error) {
            Alert.alert('Erreur', 'Échec du téléchargement de l\'image.');
        }
    };

    const handleAppointmentBookingSuccess = useCallback((newOrUpdatedAppointment) => {
        console.log("DEBUG: AppointmentFormModal reports success:", newOrUpdatedAppointment);
    }, []);

    // --- NEW: Function to send suggested partners as a message ---
    const sendSuggestedPartnersMessage = async () => {
        if (selectedPartnersForSuggestion.length === 0) {
            Alert.alert("Sélection vide", "Veuillez sélectionner au moins un partenaire à suggérer.");
            return;
        }
        if (!ticketId || !currentUser) {
            Alert.alert("Erreur", "Impossible d'envoyer la suggestion: ticket ou utilisateur non défini.");
            return;
        }

        const suggestedPartnerNamesText = selectedPartnersForSuggestion.map(p => {
            let details = `${p.nom} (Cat: ${p.categorie || 'N/A'}`;
            if (typeof p.starRating === 'number' && p.starRating > 0) {
                details += `, Note: ${p.starRating.toFixed(1)}/5`;
            }
            details += ')';
            return details;
        }).join('\n- ');

        const messageText = `Voici quelques partenaires que je peux vous suggérer :\n- ${suggestedPartnerNamesText}\n\nCliquez sur un partenaire pour voir plus de détails, ou demandez-moi si vous souhaitez prendre un rendez-vous avec l'un d'entre eux.`;

        try {
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: messageText,
                expediteurId: currentUser.uid, // Sent by the agent
                nomExpediteur: currentUser.displayName || 'Agent',
                createdAt: serverTimestamp(),
                type: 'suggested_partners', // Custom type for rendering
                partnersData: selectedPartnersForSuggestion.map(p => ({ // Store full data for client-side rendering
                    id: p.id,
                    nom: p.nom, // Use nom
                    categorie: p.categorie, // Use categorie
                    averageRating: p.starRating,
                    logo: p.logo || null,
                    estPromu: p.estPromu || false,
                    promotionEndDate: p.promotionEndDate || null,
                })),
            });

            await updateDoc(doc(db, 'tickets', ticketId), {
                lastMessage: 'Suggestion de partenaires envoyée.',
                lastUpdated: serverTimestamp(),
                lastMessageSender: currentUser.uid,
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                lastMessage: 'Suggestion de partenaires envoyée.',
                lastUpdated: serverTimestamp(),
                lastMessageSender: currentUser.uid,
            });

            // Send notification to the client that a suggestion was sent
            const clientUserDoc = await getDoc(doc(db, 'users', actualClientUid));
            if (clientUserDoc.exists() && clientUserDoc.data().expoPushToken) {
                sendPushNotification(
                    clientUserDoc.data().expoPushToken,
                    `Nouvelle suggestion de partenaire!`,
                    `${currentUser.displayName || 'Votre agent'} vous a envoyé des suggestions de partenaires.`,
                    { type: 'ticket_partner_suggestion', ticketId: ticketId }
                );
            }

            setShowPartnerSelectionModal(false);
            setSelectedPartnersForSuggestion([]); // Clear selection
            setPartnerSearchQuery(''); // Clear search
        } catch (error) {
            console.error("Error sending suggested partners message:", error);
            Alert.alert("Erreur", "Impossible d'envoyer la suggestion de partenaires.");
        }
    };

    const renderMessage = ({
        item
    }) => {
        const estUtilisateurCourant = item.expediteurId === currentUser?.uid;
        const estSysteme = item.expediteurId === 'systeme';
        const estJeyAI = item.expediteurId === 'jey-ai';

        const isThisClientsMessage = isITSupport && item.expediteurId === ticketInfo?.userId;

        return (
            <View style={[
                styles.messageRow,
                estUtilisateurCourant ? styles.messageRowRight : styles.messageRowLeft,
            ]}>
                {estJeyAI && ( // Render Jey's photo next to his messages
                    <TouchableOpacity onPress={() => setIsJeyProfileModalVisible(true)}>
                        <Image source={jeyAiProfile} style={styles.jeyMessagePhoto} />
                    </TouchableOpacity>
                )}
                {/* Render photo for other human user only if they are not the current user and not system/Jey */}
                {!estUtilisateurCourant && !estSysteme && !estJeyAI && (
                    <Image
                        source={clientPhotoUrl ? { uri: clientPhotoUrl } : require('../assets/images/Profile.png')}
                        style={styles.otherUserMessagePhoto}
                    />
                )}

                <View style={[
                    styles.messageContainer,
                    estUtilisateurCourant ? styles.messageUtilisateur : styles.messageAutre,
                    estSysteme && styles.messageSysteme,
                    estJeyAI && styles.messageJeyAI,
                    item.optimistic && styles.optimisticMessage
                ]}>
                    {!estUtilisateurCourant && !estSysteme && (
                        <Text style={styles.nomExpediteur}>
                            {estJeyAI ? 'Jey' : (isThisClientsMessage ? ticketInfo?.userName || 'Client' : item.nomExpediteur)}
                        </Text>
                    )}

                    {item.type === 'partner_suggestion_list' && item.partners && (
                        <View style={styles.partnerSuggestionListContainer}>
                            <Text style={styles.partnerSuggestionTitle}>{item.texte}</Text>
                            {item.partners.map(partner => (
                                <TouchableOpacity
                                    key={partner.id}
                                    style={styles.partnerSuggestionItem}
                                    onPress={() => envoyerMessage(
                                        `/select_partner_${partner.id}`,
                                        'text',
                                        {},
                                        `J'ai sélectionné ${partner.nom}` // Used nom
                                    )}
                                >
                                    <View style={styles.partnerDetails}>
                                        <Text style={styles.partnerNameText}>{partner.nom}</Text> {/* Used nom */}
                                        {partner.categorie && (
                                            <Text style={styles.partnerCategoryText}>{partner.categorie}</Text> 
                                        )}
                                        {typeof partner.starRating === 'number' && (
                                            <View style={styles.partnerRatingContainer}>
                                                {renderStarRating(partner.starRating)}
                                            </View>
                                        )}
                                    </View>
                                    <Ionicons name="chevron-forward-outline" size={20} color="#007AFF" />
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    {/* --- NEW: Render suggested_partners message type --- */}
                    {item.type === 'suggested_partners' && item.partnersData && (
                        <View style={styles.suggestedPartnersDisplayContainer}>
                            <Text style={styles.suggestedPartnersTitle}>{item.texte.split('\n')[0]}</Text>
                            {item.partnersData.map(partner => (
                                <TouchableOpacity
                                    key={partner.id}
                                    style={styles.suggestedPartnerItem}
                                    onPress={() => navigation.navigate("PartnerDetails", { partnerId: partner.id })}
                                >
                                    <View style={styles.partnerDetailsRow}>
                                        <Text style={styles.suggestedPartnerName}>{partner.nom}</Text>
                                        {typeof partner.averageRating === 'number' && (
                                            <View style={styles.partnerRatingContainer}>
                                                {renderStarRating(partner.averageRating)}
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.suggestedPartnerCategory}>{partner.categorie}</Text>
                                    {partner.estPromu && (
                                        <Text style={styles.suggestedPartnerPromoStatus}>
                                            Promotion: {getPromotionStatusForPartnerItem(partner).text}
                                        </Text>
                                    )}
                                    <Ionicons name="chevron-forward-outline" size={20} color="#007AFF" />
                                </TouchableOpacity>
                            ))}
                            <Text style={styles.suggestedPartnersFooter}>
                                Cliquez pour plus de détails ou demandez à Jey un rendez-vous.
                            </Text>
                        </View>
                    )}
                    {/* --- END NEW --- */}

                    {item.type === 'booking_confirmation_request' && item.partnerName && (
                        <View style={styles.bookingConfirmationContainer}>
                            <Text style={styles.bookingConfirmationText}>{item.texte}</Text>
                            <View style={styles.bookingConfirmationButtons}>
                                <TouchableOpacity
                                    style={[styles.bookingButton, styles.bookingButtonYes]}
                                    onPress={() => {
                                        const partnerObj = allPartners.find(p => p.name === item.partnerName); // Still uses name for finding
                                        setSelectedPartnerForBooking(partnerObj || null);
                                        envoyerMessage(
                                            '/confirm_booking_yes',
                                            'text',
                                            {},
                                            `Oui, je souhaite prendre rendez-vous avec ${item.partnerName} !` // Still uses name
                                        )
                                    }}
                                >
                                    <Text style={styles.bookingButtonText}>Oui</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.bookingButton, styles.bookingButtonNo]}
                                    onPress={() => envoyerMessage(
                                        '/confirm_booking_no',
                                        'text',
                                        {},
                                        `Non, pas pour le moment.`
                                    )}
                                >
                                    <Text style={styles.bookingButtonText}>Non</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    )}

                    {item.type === 'appointment_request_prompt' && estJeyAI && (
                        <View style={styles.bookingConfirmationContainer}>
                            <Text style={styles.bookingConfirmationText}>{item.texte}</Text>
                            <TouchableOpacity
                                style={[styles.bookingButton, styles.bookingButtonYes]}
                                onPress={() => {
                                    setShowAppointmentFormModal(true);
                                }}
                            >
                                <Text style={styles.bookingButtonText}>Prendre Rendez-vous</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {item.type === 'image' && item.imageURL ? (
                        <Image
                            source={{ uri: item.imageURL }}
                            style={styles.imageMessage}
                            resizeMode="contain"
                        />
                    ) : item.type === 'image' && item.optimistic ? (
                        <View style={styles.imageLoadingContainer}>
                            <ActivityIndicator size="small" color="#6B7280" />
                            <Text style={styles.imageLoadingText}>{item.texte}</Text>
                        </View>
                    ) : item.type === 'coupon_qr' && (item.codeData || item.qrCodeData || item.codeValue) ? (
                        <View style={styles.generatedCodeMessageContainer}>
                            <Text style={styles.generatedCodeMessageTitle}>Votre Code QR</Text>
                            {(() => {
                                let qrValueToEncode = null;
                                let displayedCodeValue = null;

                                if (typeof item.codeData === 'object' && item.codeData !== null) {
                                    if (typeof item.codeData.qrContent === 'string' && item.codeData.qrContent.length > 0) {
                                        qrValueToEncode = item.codeData.qrContent;
                                    } else if (typeof item.codeData.value === 'string' && item.codeData.value.length > 0) {
                                        qrValueToEncode = item.codeData.value;
                                    }
                                    if (typeof item.codeData.value === 'string' && item.codeData.value.length > 0) {
                                        displayedCodeValue = item.codeData.value;
                                    }
                                }
                                else if (typeof item.qrCodeData === 'string' && item.qrCodeData.length > 0) {
                                    qrValueToEncode = item.qrCodeData;
                                    displayedCodeValue = item.qrCodeData;
                                }
                                else if (typeof item.codeValue === 'string' && item.codeValue.length > 0 && item.codeType === 'coupon') {
                                    displayedCodeValue = item.codeValue;
                                }


                                if (qrValueToEncode) {
                                    return (
                                        <View style={styles.qrDisplayArea}>
                                            <QRCode
                                                value={qrValueToEncode}
                                                size={100}
                                                color="black"
                                                backgroundColor="white"
                                            />
                                            {displayedCodeValue && (
                                                <Text style={styles.generatedCodeValue}>{displayedCodeValue}</Text>
                                            )}
                                        </View>
                                    );
                                } else if (displayedCodeValue && item.codeType === 'coupon') {
                                    return (
                                        <Text style={styles.generatedCouponValue}>{displayedCodeValue}</Text>
                                    );
                                } else {
                                    return null;
                                }
                            })()}

                            <Text style={styles.generatedCodeMessageDetails}>
                                Partenaire: {item.partnerName || 'N/A'}
                            </Text>
                            {item.appointmentDate && (
                                <Text style={styles.generatedCodeMessageDetails}>
                                    Date RDV: {moment(item.appointmentDate).format('DD/MM/YYYY')} à {moment(item.appointmentDate).format('HH:mm')}
                                </Text>
                            )}
                            {item.clientNames && item.clientNames.length > 0 && (
                                <Text style={styles.generatedCodeMessageDetails}>
                                    Pour: {item.clientNames.join(', ')}
                                </Text>
                            )}
                            {item.description && (
                                <Text style={styles.generatedCodeMessageDetails}>
                                    Description: {item.description}
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
            </View>
        );
    };

    const renderHeaderContent = () => {
        let mainHeaderText = "Chargement...";
        let subHeaderText = null;

        if (ticketInfo) {
            if (isITSupport) {
                mainHeaderText = `${ticketInfo.userName || 'Client'} - ${ticketInfo.category || 'Ticket'}`;
                if (ticketInfo.status === 'jey-handling') {
                    subHeaderText = 'Géré par Jey';
                } else if (ticketInfo.status === 'escalated_to_agent') {
                    subHeaderText = `Agent Demandé - ${ticketInfo.escalationReason || 'Raison inconnue'}`;
                } else if (ticketInfo.status === 'in-progress') {
                    mainHeaderText = `${ticketInfo.userName || 'Client'} - ${ticketInfo.category || 'Ticket'} (${ticketInfo.assignedToName || 'Agent'})`;
                    subHeaderText = 'En cours';
                } else if (ticketInfo.status === 'terminé') {
                    mainHeaderText = `${ticketInfo.userName || 'Client'} - ${ticketInfo.category || 'Ticket'} (Terminé)`;
                    subHeaderText = `Terminé le ${moment(ticketInfo.termineLe?.toDate()).format('DD/MM/YYYY HH:mm')}`;
                }
            } else { // Client view
                if (ticketInfo.status === 'jey-handling') {
                    mainHeaderText = "Jey (Assistant IA)";
                    subHeaderText = "En ligne";
                } else if (ticketInfo.status === 'escalated_to_agent') {
                    mainHeaderText = "Agent Humain";
                    subHeaderText = `Agent demandé - ${ticketInfo.escalationReason || 'Raison inconnue'}`;
                } else if (ticketInfo.status === 'in-progress') {
                    mainHeaderText = `Agent: ${agent || 'Connecté'}`;
                    subHeaderText = "En ligne";
                } else if (ticketInfo.status === 'terminé') {
                    mainHeaderText = "Conversation Terminée";
                    subHeaderText = `Terminé le ${moment(ticketInfo.termineLe?.toDate()).format('DD/MM/YYYY HH:mm')}`;
                }
            }
        }
        return (
            <View style={styles.headerInfo}>
                <Text style={styles.headerTitre} numberOfLines={1} ellipsizeMode='tail'>
                    {mainHeaderText}
                </Text>
                {subHeaderText && (
                    <Text style={styles.subHeaderText} numberOfLines={1} ellipsizeMode='tail'>
                        {subHeaderText}
                    </Text>
                )}
            </View>
        );
    };

    if (chargement) {
        return (
            <View style={styles.chargementContainer}>
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

    // Determine which profile photo to display first based on typing status
    // The previous logic for photo1Source/photo2Source based on typingUserId is now removed
    // as we have separate isJeyTyping and isOtherHumanTyping states.
    // The profile photos in the header represent the parties in the conversation, not necessarily who is typing.
    // We can simplify this to just show current user's photo and the other party's photo.

    let displayPhotoLeftSource = null; // Left for Jey or Client (if Agent view) or Agent (if Client view)
    let displayPhotoRightSource = null; // Right for current user

    // Current User's photo (always on the right)
    displayPhotoRightSource = currentUserPhotoUrl ? { uri: currentUserPhotoUrl } : require('../assets/images/Profile.png');

    // Photo for the "other" party (left side)
    if (!isITSupport) { // Client's view
        if (ticketInfo?.status === 'jey-handling') {
            displayPhotoLeftSource = jeyAiProfile; // Jey is the other party
        } else if (ticketInfo?.assignedTo && ticketInfo.assignedTo !== 'jey-ai') {
            displayPhotoLeftSource = agentPhotoUrl ? { uri: agentPhotoUrl } : require('../assets/images/Profile.png'); // Agent is the other party
        } else {
            displayPhotoLeftSource = require('../assets/images/Profile.png'); // Default for other cases
        }
    } else { // IT Support's view
        displayPhotoLeftSource = clientPhotoUrl ? { uri: clientPhotoUrl } : require('../assets/images/Profile.png'); // Client is the other party
    }

    const conversationDate = moment().format('DD/MM/YYYY'); // Get today's date

    // --- NEW: Filtered partners for selection modal ---
    const filteredPartnersForSelection = allPartners.filter(p => {
        const queryLower = partnerSearchQuery.toLowerCase();
        return (
            p.nom?.toLowerCase().includes(queryLower) || // Filter by nom
            p.categorie?.toLowerCase().includes(queryLower) // Filter by categorie
        );
    });
    // --- END NEW ---

    // --- NEW: Render item for partner selection modal ---
    const renderPartnerSelectionItem = ({ item }) => {
        const isSelected = selectedPartnersForSuggestion.some(p => p.id === item.id);
        const promotionStatus = getPromotionStatusForPartnerItem(item);

        return (
            <TouchableOpacity
                style={[
                    styles.partnerSelectionItem,
                    isSelected && styles.partnerSelectionItemSelected,
                ]}
                onPress={() => {
                    setSelectedPartnersForSuggestion(prev =>
                        isSelected
                            ? prev.filter(p => p.id !== item.id)
                            : [...prev, item]
                    );
                }}
            >
                <View style={styles.partnerSelectionItemInfo}>
                    <Text style={styles.partnerSelectionItemName}>{item.nom}</Text> {/* Display nom */}
                    <Text style={styles.partnerSelectionItemCategory}>{item.categorie}</Text> {/* Display categorie */}
                    <View style={styles.partnerSelectionItemRatingPromo}>
                        {renderStarRating(item.starRating)}
                        <Text style={styles.partnerSelectionItemPromoText} styles={{ color: promotionStatus.color }}>
                            {promotionStatus.text !== 'Non promu' ? ` (${promotionStatus.text})` : ''}
                        </Text>
                        {promotionStatus.text !== 'Non promu' && (
                            <Ionicons name={promotionStatus.iconName} size={16} color={promotionStatus.color} style={{ marginLeft: 5 }} />
                        )}
                    </View>
                </View>
                <Ionicons
                    name={isSelected ? "checkmark-circle" : "ellipse-outline"}
                    size={24}
                    color={isSelected ? "#34C759" : "#666"}
                />
            </TouchableOpacity>
        );
    };
    // --- END NEW ---


    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
                </TouchableOpacity>
                {renderHeaderContent()}
                {isITSupport && confirmedAppointmentForTicket && (
                    <TouchableOpacity
                        style={styles.editAppointmentButton}
                        onPress={() => setShowAppointmentFormModal(true)}
                    >
                        <Ionicons name="create-outline" size={24} color="#2C2C2C" />
                    </TouchableOpacity>
                )}
                {isITSupport && !isTerminated && (
                    <>
                        <TouchableOpacity
                            onPress={terminerConversation}
                            style={styles.endButton}
                        >
                            <Text style={styles.endButtonText}>Terminer</Text>
                        </TouchableOpacity>
                    </>
                )}
            </View>

            {/* Profile Photos Below Header */}
            {!isITSupport && ( // ADDED CONDITION: Only show if NOT IT Support
                <View style={styles.profilePhotosContainer}>
                    {displayPhotoLeftSource && (
                        <Image
                            source={displayPhotoLeftSource}
                            style={styles.profilePhoto} // No typing border here for simplicity
                        />
                    )}
                    {displayPhotoRightSource && (
                        <Image
                            source={displayPhotoRightSource}
                            style={styles.profilePhoto} // No typing border here for simplicity
                        />
                    )}
                    <Text style={styles.conversationDate}>{conversationDate}</Text>
                </View>
            )}

            {isITSupport && (
                <View style={styles.itSupportControls}>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('TicketInfo', { ticketId })}
                        style={styles.infoButton}
                    >
                        <Text style={styles.infoButtonText}>Détails du ticket</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setShowAppointmentFormModal(true)}
                        style={styles.appointmentButton}
                    >
                        <Ionicons name="calendar" size={20} color="white" />
                        <Text style={styles.appointmentButtonText}>Nouveau Rendez-vous</Text>
                    </TouchableOpacity>
                    {/* --- MOVED: Suggest Partner Button here --- */}
                    <TouchableOpacity
                        style={styles.suggestPartnerControlPanelButton} // Adjusted style for control panel
                        onPress={() => setShowPartnerSelectionModal(true)}
                    >
                        <Ionicons name="people-circle-outline" size={24} color="#007AFF" />
                        <Text style={styles.suggestPartnerControlPanelButtonText}>Suggérer Partenaire</Text>
                    </TouchableOpacity>
                    {/* --- END MOVED --- */}
                </View>
            )}

            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={item => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.messagesContainer}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
                onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
                ListEmptyComponent={
                    <View style={styles.emptyContainer}>
                        <Ionicons name="chatbubbles" size={60} color="#E5E7EB" />
                        <Text style={styles.emptyText}>Aucun message</Text>
                        <Text style={styles.emptySubtext}>Commencez la conversation!</Text>
                    </View>
                }
            />

            {/* --- TYPING INDICATORS DISPLAY (UPDATED) --- */}
            {isJeyTyping && (
                <Animated.View
                    style={[
                        styles.typingIndicatorContainer,
                        styles.jeyTypingTextIndicator,
                        {
                            transform: [{
                                scale: jeyTypingPulseAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.95, 1.05] // Small pulse effect
                                })
                            }]
                        }
                    ]}
                >
                    <Image source={jeyAiProfile} style={styles.jeyTypingPhoto} />
                    <Text style={styles.typingIndicatorText}>Jey est en train d'écrire...</Text>
                    <ActivityIndicator size="small" color="#007AFF" style={styles.typingIndicatorSpinner} />
                </Animated.View>
            )}

            {isOtherHumanTyping && otherHumanTypingName && (
                <View style={[styles.typingIndicatorContainer, styles.humanTypingIndicator]}>
                    {(isITSupport ? (clientPhotoUrl ? { uri: clientPhotoUrl } : require('../assets/images/Profile.png')) : require('../assets/images/Profile.png')) && (
                        <Image
                            source={(isITSupport && clientPhotoUrl) ? { uri: clientPhotoUrl } : require('../assets/images/Profile.png')}
                            style={styles.jeyTypingPhoto} // Re-using style for size/border-radius
                        />
                    )}
                    <Text style={styles.typingIndicatorText}>{otherHumanTypingName} est en train d'écrire...</Text>
                    <ActivityIndicator size="small" color="#6B7280" style={styles.typingIndicatorSpinner} />
                </View>
            )}
            {/* --- END TYPING INDICATORS DISPLAY --- */}

            <View style={styles.inputContainer}>
                <TouchableOpacity
                    style={styles.attachmentButton}
                    onPress={selectionnerImage}
                    disabled={uploading || isTerminated || showAppointmentFormModal}
                >
                    <Ionicons
                        name="attach"
                        size={24}
                        color={uploading || isTerminated || showAppointmentFormModal ? "#CCC" : "#34C759"}
                    />
                </TouchableOpacity>

                <TextInput
                    style={[styles.input, isTerminated && styles.disabledInput]}
                    value={nouveauMessage}
                    onChangeText={handleTextInputChange}
                    placeholder={isTerminated ? "Conversation terminée" : (showAppointmentFormModal ? "Veuillez remplir le formulaire..." : "Écrivez votre message...")}
                    placeholderTextColor="#999"
                    multiline
                    editable={!uploading && !isTerminated && !showAppointmentFormModal}
                />

                <TouchableOpacity
                    style={styles.boutonEnvoyer}
                    onPress={() => envoyerMessage(nouveauMessage)}
                    disabled={!nouveauMessage.trim() || uploading || isTerminated || showAppointmentFormModal}
                >
                    {uploading ? (
                        <ActivityIndicator size="small" color="#CCC" />
                    ) : (
                        <Ionicons
                            name="send"
                            size={24}
                            color={nouveauMessage.trim() && !isTerminated && !showAppointmentFormModal ? "#34C759" : "#CCC"}
                        />
                    )}
                </TouchableOpacity>
            </View>

            <AppointmentFormModal
                isVisible={showAppointmentFormModal}
                onClose={() => {
                    setShowAppointmentFormModal(false);
                }}
                onBookingSuccess={handleAppointmentBookingSuccess}
                ticketId={ticketId}
                initialUserId={initialUserId}
                initialUserName={initialUserName}
                userPhone={userPhone}
                allPartners={allPartners}
                editingAppointment={confirmedAppointmentForTicket}
            />

            {/* Jey Profile Modal */}
            <Modal
                visible={isJeyProfileModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsJeyProfileModalVisible(false)}
            >
                <Pressable style={styles.jeyModalOverlay} onPress={() => setIsJeyProfileModalVisible(false)}>
                    <View style={styles.jeyModalContent}>
                        <Image source={jeyAiProfile} style={styles.jeyModalPhoto} />
                        <Text style={styles.jeyModalText}>Jey (Assistant IA d'EliteReply)</Text>
                    </View>
                </Pressable>
            </Modal>

            {/* --- NEW: Partner Selection Modal --- */}
            <Modal
                animationType="slide"
                transparent={false}
                visible={showPartnerSelectionModal}
                onRequestClose={() => setShowPartnerSelectionModal(false)}
            >
                <View style={styles.partnerSelectionModalContainer}>
                    <View style={styles.partnerSelectionModalHeader}>
                        <TouchableOpacity onPress={() => setShowPartnerSelectionModal(false)} style={styles.partnerSelectionModalCloseButton}>
                            <Ionicons name="close-circle-outline" size={30} color="#EF4444" />
                        </TouchableOpacity>
                        <Text style={styles.partnerSelectionModalTitle}>Suggérer des partenaires</Text>
                        <View style={{ width: 30 }} /> {/* Placeholder for alignment */}
                    </View>

                    <View style={styles.partnerSelectionSearchBar}>
                        <Ionicons name="search" size={20} color="#999" />
                        <TextInput
                            style={styles.partnerSelectionSearchInput}
                            placeholder="Rechercher par nom ou catégorie..."
                            placeholderTextColor="#999"
                            value={partnerSearchQuery}
                            onChangeText={setPartnerSearchQuery}
                        />
                    </View>

                    <FlatList
                        data={filteredPartnersForSelection}
                        renderItem={renderPartnerSelectionItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.partnerSelectionListContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>Aucun partenaire trouvé</Text>
                            </View>
                        }
                    />

                    <TouchableOpacity
                        style={[
                            styles.suggestPartnersButton,
                            selectedPartnersForSuggestion.length === 0 && styles.suggestPartnersButtonDisabled,
                        ]}
                        onPress={sendSuggestedPartnersMessage}
                        disabled={selectedPartnersForSuggestion.length === 0}
                    >
                        <Ionicons name="send" size={20} color="white" style={{ marginRight: 10 }} />
                        <Text style={styles.suggestPartnersButtonText}>
                            Suggérer ({selectedPartnersForSuggestion.length})
                        </Text>
                    </TouchableOpacity>
                </View>
            </Modal>
            {/* --- END NEW: Partner Selection Modal --- */}
        </KeyboardAvoidingView>
    );
};

Conversation.propTypes = {
    route: PropTypes.shape({
        params: PropTypes.shape({
            ticketId: PropTypes.string.isRequired,
            isITSupport: PropTypes.bool,
            userId: PropTypes.string,
            userName: PropTypes.string,
            userPhone: PropTypes.string,
            ticketCategory: PropTypes.string,
        })
    }).isRequired,
    navigation: PropTypes.object.isRequired
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#F8F9FA',
        //paddingTop: 40
    },
    chargementContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 15,
        paddingTop: 30,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        backgroundColor: '#FFF',
    },
    headerInfo: {
        flex: 1,
        marginHorizontal: 15,
    },
    headerTitre: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2C2C2C',
        textAlign: 'center',
    },
    subHeaderText: {
        fontSize: 12,
        color: '#6B7280',
        textAlign: 'center',
        marginTop: 2,
    },
    endButton: {
        backgroundColor: '#FF3B30',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
    },
    endButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    editAppointmentButton: {
        padding: 8,
        marginRight: 10,
    },
    suggestPartnerHeaderButton: { // NEW style for the suggest partner button in header
        padding: 8,
        marginRight: 10,
    },
    suggestPartnerControlPanelButton: { // NEW: Style for the button moved to control panel
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E6F7FF', // Light blue background
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 10,
        marginBottom: 5,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    suggestPartnerControlPanelButtonText: { // NEW: Text style for the button
        color: '#007AFF',
        fontWeight: 'bold',
        fontSize: 14,
        marginLeft: 5,
    },
    profilePhotosContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        backgroundColor: '#F0F4F8',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        justifyContent: 'space-between', // Distribute items
    },
    profilePhoto: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        borderWidth: 1,
        borderColor: '#CCC',
        // No background color, allowing image to fill or transparency
    },
    typingBorder: { // New style for typing indicator border
        borderColor: '#007AFF', // Blue border for typing
        borderWidth: 2,
    },
    conversationDate: {
        fontSize: 12,
        color: '#6B7280',
        marginLeft: 'auto', // Push to the right
    },
    messagesContainer: {
        padding: 15,
        flexGrow: 1,
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 40,
    },
    emptyText: {
        color: '#9CA3AF',
        fontSize: 16,
        textAlign: 'center',
        marginTop: 10,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#D1D5DB',
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 12,
        alignItems: 'flex-end',
    },
    messageRowLeft: {
        justifyContent: 'flex-start',
    },
    messageRowRight: {
        justifyContent: 'flex-end',
    },
    messageContainer: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 12,
        elevation: 1,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 1
        },
        shadowOpacity: 0.05,
        shadowRadius: 2,
    },
    messageUtilisateur: {
        alignSelf: 'flex-end',
        backgroundColor: '#34C759',
        borderTopRightRadius: 0,
    },
    messageAutre: {
        alignSelf: 'flex-start',
        backgroundColor: '#FFF',
        borderTopLeftRadius: 0,
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    messageSysteme: {
        alignSelf: 'center',
        backgroundColor: '#F0F0F0',
        borderWidth: 0,
        paddingVertical: 8,
        paddingHorizontal: 15,
        marginVertical: 5,
    },
    messageJeyAI: {
        alignSelf: 'flex-start',
        backgroundColor: '#E3F2FD',
        borderTopLeftRadius: 0,
        borderWidth: 1,
        borderColor: '#BBDEFB',
        marginLeft: 8, // Adjust for Jey's photo
    },
    optimisticMessage: {
        opacity: 0.7,
    },
    nomExpediteur: {
        fontSize: 12,
        color: '#6B7280',
        marginBottom: 4,
        fontWeight: '500',
    },
    texteMessage: {
        fontSize: 16,
    },
    texteUtilisateur: {
        color: '#FFF',
    },
    texteAutre: {
        color: '#2C2C2C',
    },
    texteSysteme: {
        color: '#666',
        fontStyle: 'italic',
        textAlign: 'center',
    },
    texteJeyAI: {
        color: '#0D47A1',
    },
    imageMessage: {
        width: 200,
        height: 200,
        borderRadius: 8,
        marginBottom: 4,
    },
    imageLoadingContainer: {
        width: 200,
        height: 200,
        borderRadius: 8,
        backgroundColor: '#E0E0E0',
        justifyContent: 'center',
        alignItems: 'center',
    },
    imageLoadingText: {
        marginTop: 5,
        fontSize: 12,
        color: '#6B7280',
    },
    heureMessage: {
        fontSize: 10,
        marginTop: 4,
        alignSelf: 'flex-end',
    },
    inputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#FFF',
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        bottom: 5
    },
    attachmentButton: {
        padding: 10,
        marginRight: 5,
    },
    input: {
        flex: 1,
        backgroundColor: '#F9FAFB',
        borderRadius: 20,
        paddingHorizontal: 15,
        paddingVertical: 10,
        maxHeight: 100,
        color: '#2C2C2C',
    },
    disabledInput: {
        backgroundColor: '#f0f0f0',
        color: '#999',
    },
    boutonEnvoyer: {
        marginLeft: 10,
        padding: 10,
    },
    errorImage: {
        width: 150,
        height: 150,
        alignSelf: 'center',
        marginBottom: 20,
    },
    errorText: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2C2C2C',
        textAlign: 'center',
        marginBottom: 10,
    },
    errorSubtext: {
        fontSize: 16,
        color: '#6B7280',
        textAlign: 'center',
        marginBottom: 20,
    },
    backButton: {
        backgroundColor: '#34C759',
        padding: 15,
        borderRadius: 8,
        alignSelf: 'center',
    },
    backButtonText: {
        color: '#FFF',
        fontWeight: 'bold',
        fontSize: 16,
    },
    itSupportControls: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        alignItems: 'center',
        padding: 10,
        backgroundColor: '#FFF',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        flexWrap: 'wrap',
    },
    infoButton: {
        backgroundColor: '#34C759',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 10,
        marginBottom: 5,
    },
    infoButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    typingIndicatorContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 8,
        backgroundColor: '#EAEAEA',
        borderRadius: 12,
        alignSelf: 'flex-start',
        marginBottom: 10,
        marginLeft: 10,
        maxWidth: '70%',
    },
    typingIndicatorText: {
        fontSize: 14,
        color: '#6B7280',
        fontStyle: 'italic',
        marginRight: 8,
    },
    typingIndicatorSpinner: {},
    appointmentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#007AFF',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 10,
        marginBottom: 5,
    },
    appointmentButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
        marginLeft: 5,
    },

    jeyTypingPhotoContainer: { // This seems unused now based on render logic
        alignSelf: 'flex-start',
        marginLeft: 10,
        marginBottom: 5,
        flexDirection: 'row',
        alignItems: 'center',
    },
    jeyTypingPhoto: { // Used for Jey and now potentially other human typing indicator
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        borderWidth: 2, // Retaining border if you want it for typing photo
        borderColor: '#007AFF', // Example color
        backgroundColor: '#E3F2FD', // Example background
    },
    jeyMessagePhoto: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        marginLeft: 5,
        borderWidth: 1,
        borderColor: '#BBDEFB',
        backgroundColor: '#E3F2FD',
    },
    otherUserMessagePhoto: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        marginLeft: 5,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        // Removed backgroundColor
    },

    generatedCodeMessageContainer: {
        backgroundColor: '#E0F7FA',
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#B2EBF2',
    },
    generatedCodeMessageTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#006064',
    },
    qrDisplayArea: {
        padding: 10,
        backgroundColor: '#FFF',
        borderRadius: 8,
        alignItems: 'center',
    },
    generatedCodeValue: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1B5E20',
        marginTop: 5,
        marginBottom: 5,
    },
    generatedCouponValue: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1B5E20',
        marginBottom: 5,
    },
    generatedCodeMessageDetails: {
        fontSize: 12,
        color: '#455A64',
        marginTop: 3,
        textAlign: 'center',
    },
    downloadButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6C757D',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 15,
        marginTop: 10,
    },
    downloadButtonText: {
        color: 'white',
        fontSize: 12,
        marginLeft: 5,
    },

    partnerSuggestionListContainer: {
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 10,
        marginTop: 5,
        marginBottom: 10,
        width: '100%',
        borderColor: '#E0E0E0',
        borderWidth: 1,
    },
    partnerSuggestionTitle: {
        fontSize: 15,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#333',
        textAlign: 'center',
    },
    partnerSuggestionItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#F0F0F0',
        backgroundColor: '#F8F8F8',
        borderRadius: 8,
        marginBottom: 5,
    },
    partnerDetails: {
        flex: 1,
    },
    partnerNameText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2C2C2C',
    },
    partnerCategoryText: {
        fontSize: 13,
        color: '#6B7280',
        fontStyle: 'italic',
        marginTop: 2,
    },
    partnerRatingContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 5,
    },
    partnerRatingText: {
        fontSize: 14,
        color: '#FFD700',
        fontWeight: 'bold',
        marginLeft: 5,
    },
    bookingConfirmationContainer: {
        backgroundColor: '#FFFBE6',
        borderRadius: 10,
        padding: 15,
        marginTop: 5,
        marginBottom: 10,
        width: '100%',
        borderColor: '#FFE0B2',
        borderWidth: 1,
        alignItems: 'center',
    },
    bookingConfirmationText: {
        fontSize: 15,
        color: '#333',
        textAlign: 'center',
        marginBottom: 15,
    },
    bookingConfirmationButtons: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        width: '100%',
    },
    bookingButton: {
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 20,
        minWidth: 80,
        alignItems: 'center',
    },
    bookingButtonYes: {
        backgroundColor: '#34C759',
    },
    bookingButtonNo: {
        backgroundColor: '#FF3B30',
    },
    bookingButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    jeyModalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    jeyModalContent: {
        backgroundColor: '#007AFF',
        borderRadius: 10,
        padding: 20,
        alignItems: 'center',
        width: 240,
        height: 260,
        justifyContent: 'center',
    },
    jeyModalPhoto: {
        width: 200,
        height: 200,
        borderRadius: 100,
        marginBottom: 10,
        borderWidth: 2,
        borderColor: '#007AFF',
    },
    jeyModalText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center'
    },
    // --- NEW: Partner Selection Modal Styles ---
    partnerSelectionModalContainer: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        backgroundColor: '#F8F9FA',
    },
    partnerSelectionModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        backgroundColor: '#FFF',
    },
    partnerSelectionModalCloseButton: {
        padding: 5,
    },
    partnerSelectionModalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2D3748',
    },
    partnerSelectionSearchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 10,
        paddingHorizontal: 15,
        margin: 15,
    },
    partnerSelectionSearchInput: {
        flex: 1,
        height: 45,
        fontSize: 16,
        color: '#333',
        marginLeft: 10,
    },
    partnerSelectionListContent: {
        paddingHorizontal: 15,
        paddingBottom: 20,
    },
    partnerSelectionItem: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#FFF',
        borderRadius: 10,
        padding: 15,
        marginBottom: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    partnerSelectionItemSelected: {
        borderColor: '#007AFF',
        borderWidth: 2,
        backgroundColor: '#E6F7FF',
    },
    partnerSelectionItemInfo: {
        flex: 1,
        marginRight: 10,
    },
    partnerSelectionItemName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2D3748',
    },
    partnerSelectionItemCategory: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    partnerSelectionItemRatingPromo: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 5,
    },
    partnerSelectionItemPromoText: {
        fontSize: 12,
        fontWeight: 'bold',
        marginLeft: 5,
    },
    suggestPartnersButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#007AFF',
        borderRadius: 10,
        paddingVertical: 15,
        margin: 15,
        shadowColor: '#007AFF',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    suggestPartnersButtonDisabled: {
        backgroundColor: '#A0C8F7',
        opacity: 0.7,
        elevation: 0,
        shadowOpacity: 0,
    },
    suggestPartnersButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    // Styles for suggested_partners message type
    suggestedPartnersDisplayContainer: {
        backgroundColor: '#E6EFFF', // Light blue background
        borderRadius: 10,
        padding: 15,
        marginTop: 5,
        marginBottom: 10,
        width: '100%',
        borderColor: '#A0C8F7',
        borderWidth: 1,
    },
    suggestedPartnersTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 10,
        color: '#0D47A1',
        textAlign: 'center',
    },
    suggestedPartnerItem: {
        backgroundColor: '#FFF',
        borderRadius: 8,
        padding: 12,
        marginBottom: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    partnerDetailsRow: {
        flex: 1,
        flexDirection: 'column',
    },
    suggestedPartnerName: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#2C2C2C',
    },
    suggestedPartnerCategory: {
        fontSize: 13,
        color: '#6B7280',
        fontStyle: 'italic',
        marginTop: 2,
    },
    suggestedPartnerPromoStatus: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#007AFF',
        marginTop: 2,
    },
    suggestedPartnersFooter: {
        fontSize: 12,
        color: '#6B7280',
        fontStyle: 'italic',
        marginTop: 10,
        textAlign: 'center',
    },
    // --- END NEW Partner Selection Modal Styles ---
});

export default Conversation;
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
import DateTimePicker from '@react-native-community/datetimepicker';
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

import {
    OPENAI_API_KEY
} from '../OpenAIConf';
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
    const [otherHumanTypingPhotoUrl, setOtherHumanTypingPhotoUrl] = useState(null); // NEW: State for other human's photo URL

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
            sound: 'er_notification', // Using your custom sound
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
                            } else if (ticketInfo.jeyAskedToTerminate) { // Client response after Jey asked to terminate
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
                let foundOtherHumanTypingPhotoUrl = null; // Initialize to null

                for (const userId in typingUsers) {
                    // Check if it's a human user AND not the current user AND not Jey
                    if (userId !== currentUser.uid && userId !== 'jey-ai') {
                        // For simplicity, we'll just show the name and photo of the first human typer found.
                        const otherUserDoc = await getDoc(doc(db, 'users', userId));
                        if (otherUserDoc.exists()) {
                            foundOtherHumanTypingName = otherUserDoc.data().name || 'Quelqu\'un';
                            foundOtherHumanTypingPhotoUrl = otherUserDoc.data().photoURL || null; // Fetch photoURL
                            foundAnyOtherHumanTyper = true;
                            break; // Stop after finding the first one.
                        }
                    }
                }

                setIsOtherHumanTyping(foundAnyOtherHumanTyper);
                setOtherHumanTypingName(foundOtherHumanTypingName);
                setOtherHumanTypingPhotoUrl(foundOtherHumanTypingPhotoUrl); // Set the photo URL
            } else {
                // If conversation doc doesn't exist, nobody is typing
                setIsJeyTyping(false);
                setIsOtherHumanTyping(false);
                setOtherHumanTypingName(null);
                setOtherHumanTypingPhotoUrl(null); // Clear photo URL
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

            const getSortedPartnersForSuggestion = (requestedCategory = '', allCategories = false) => {
                let relevantPartners = [];
                const categoryLower = requestedCategory.toLowerCase();
            
                if (categoryLower && !allCategories) {
                    relevantPartners = allPartners.filter(p =>
                        p.categorie?.toLowerCase() === categoryLower ||
                        p.nom?.toLowerCase().includes(categoryLower) ||
                        lastClientMessageText.includes(p.nom?.toLowerCase()) // Check if partner name is in the last message
                    );
                } else if (allCategories) {
                    relevantPartners = [...allPartners];
                } else {
                    return [];
                }
            
                // Enhance matching based on keywords in the last client message
                const keywords = lastClientMessageText.split(/\s+/).filter(word => word.length > 2);
                relevantPartners = relevantPartners.filter(p =>
                    keywords.some(keyword =>
                        p.nom?.toLowerCase().includes(keyword) ||
                        p.categorie?.toLowerCase().includes(keyword)
                    ) ||
                    (!requestedCategory && keywords.length === 0) // If no specific category asked and no keywords, consider all
                );

                // If after filtering, no partners, and a category was explicitly asked, try with all partners
                if (relevantPartners.length === 0 && requestedCategory && !allCategories) {
                    relevantPartners = [...allPartners]; // Fallback to all partners if category-specific yields nothing
                }
            
                relevantPartners.sort((a, b) => {
                    const isAPromoted = a.estPromu || false;
                    const isBPromoted = b.estPromoted || false; // Corrected from estPromu to estPromoted
                    const ratingA = a.averageRating || 0;
                    const ratingB = b.averageRating || 0;
            
                    // Primary sort: Promoted partners first
                    if (isAPromoted && !isBPromoted) return -1;
                    if (!isAPromoted && isBPromoted) return 1;
            
                    // Secondary sort: Higher rating first
                    return ratingB - ratingA;
                });
            
                return relevantPartners;
            };

            const baseSystemPrompt = `
            Tu es Jey, l'assistant IA de service client pour la plateforme "EliteReply". Ton rôle est d'être très professionnel, précis et utile. Parle toujours en français. Ton nom est Jey. Le nom du client est ${actualClientName}. Ne génère PAS d'informations fausses ou inventées. Si tu ne sais pas comment aider, propose d'escalader à un agent humain.
            
            **Directive de sécurité absolue:**
            - Tu ne DOIS JAMAIS suggérer ou créer un partenaire qui n'est PAS dans la liste des partenaires fournis. Tes suggestions DOIVENT provenir EXCLUSIVEMENT de cette liste.
            - Ne mentionne AUCUNE entité externe comme OpenAI ou Google. Tu es UNIQUEMENT l'assistant IA d'EliteReply.
            
            **Liste des partenaires disponibles (ne pas toujours les lister explicitement dans la réponse sauf si demandé ou pertinent):**
            ${allPartners.map(p => `${p.nom} (Catégorie: ${p.categorie || 'Général'}, Note: ${p.averageRating?.toFixed(1) || 'Non noté'} étoiles, Promu: ${p.estPromu ? 'Oui' : 'Non'})`).join('; ')}
            
            **Instructions spécifiques pour la suggestion de partenaires:**
            - Lorsque le client demande une recommandation de partenaire, tu dois STRICTEMENT te baser sur la **catégorie** de son ticket (${ticketCategory || 'non spécifiée'}) ou une catégorie clairement mentionnée dans sa demande actuelle.
            - Si des partenaires correspondent à la catégorie, liste les 3 meilleurs (promus d'abord, puis par note moyenne).
            - Si aucun partenaire ne correspond à la catégorie détectée ou demandée, réponds que tu n'as pas de partenaires pertinents à suggérer pour cette catégorie spécifique.
            - Lorsque tu suggères des partenaires, tu DOIS TOUJOURS inclure des options numériques claires (ex: "1. Nom du partenaire...") et demander au client de sélectionner un partenaire en tapant son numéro (ex: "Sélectionnez un partenaire en tapant son numéro (ex: '1')").
            
            **Instructions générales de conversation:**
            - Si un client demande à parler à un "agent", "humain", ou utilise des expressions telles que "passe moi un agent", "Je souhaite parler à un agent", "je veux parler à un agent", "un agent s'il vous plait", "un agent svp", ou si tu ne comprends pas bien la demande ou la conversation après 2-3 tentatives, informe-le que tu vas escalader à un agent humain.
            - Pour la prise de rendez-vous, si le client accepte, dis "Excellent choix ! Un instant, je prépare le formulaire de rendez-vous." et déclenche le formulaire via un message de type \`show_appointment_form\`.
            `;

            let currentSystemPromptContent = baseSystemPrompt;
            let jeyMessageType = 'text'; // Default to text
            let jeyMessageData = {};

            const terminationKeywords = ['merci jey', 'merci beaucoup', 'c\'est tout', 'pas besoin', 'au revoir', 'bye', 'goodbye', 'rien d\'autre', 'j\'ai tout ce qu\'il me faut'];
            const clientWantsToTerminate = terminationKeywords.some(keyword => lastClientMessageText.includes(keyword));
            
            const clientAskedForPartnersExplicitly = ['partenaire', 'recommander', 'service', 'agence', 'hotel', 'clinique', 'restaurant', 'voyage', 'sante', 'bien-etre', 'chauffeur', 'taxi'].some(keyword => lastClientMessageText.includes(keyword));
            
            const appointmentKeywords = ['rendez-vous', 'prendre rendez-vous', 'reservation', 'faire une reservation', 'disponibilité'];
            const clientWantsAppointment = appointmentKeywords.some(keyword => lastClientMessageText.includes(keyword));

            // Regex to capture "partner N" or "partner n°N"
            const partnerSelectionRegex = /^\s*(?:je (?:choisis|sélectionne)|mon choix est|je voudrais) le partenaire n°?\s*(\d+)\s*$/i;
            const match = lastClientMessageText.match(partnerSelectionRegex);
            let selectedPartnerByNumber = null;
            let partnersCurrentlySuggestedByJey = []; // Keep track of what Jey last suggested if it was a numbered list
            const lastJeyMessage = conversationHistory.filter(msg => msg.expediteurId === 'jey-ai').pop();

            if (lastJeyMessage && lastJeyMessage.type === 'partner_suggestion_list' && lastJeyMessage.partnersData) {
                partnersCurrentlySuggestedByJey = lastJeyMessage.partnersData;
            }

            if (match && partnersCurrentlySuggestedByJey.length > 0) {
                const partnerIndex = parseInt(match[1], 10) - 1; // Adjust for 0-based index
                if (partnersCurrentlySuggestedByJey[partnerIndex]) {
                    selectedPartnerByNumber = partnersCurrentlySuggestedByJey[partnerIndex];
                }
            }
            
            let identifiedPartnerByName = null;
            if (clientAskedForPartnersExplicitly || selectedPartnerByNumber) {
                for (const partner of allPartners) {
                    if (partner.nom && lastClientMessageText.includes(partner.nom.toLowerCase())) {
                        identifiedPartnerByName = partner;
                        break;
                    }
                }
            }

            const clientConfirmedPartnerSelection = selectedPartnerByNumber || identifiedPartnerByName;

            let categorySpecificInstruction = '';
            if (ticketCategory) {
                categorySpecificInstruction = `La catégorie principale de ce ticket est "${ticketCategory}". Tu DOIS suggérer des partenaires qui correspondent EXACTEMENT à cette catégorie si le client demande une recommandation de partenaire. Si aucun partenaire ne correspond, informe le client qu'il n'y a pas de partenaires dans cette catégorie et propose d'escalader.`;
            } else {
                categorySpecificInstruction = `Si le client demande des partenaires sans spécifier de catégorie, réponds que tu as besoin de plus d'informations sur le type de service qu'il recherche pour te permettre de suggérer des partenaires pertinents.`;
            }

            if (isInitialMessage) {
                currentSystemPromptContent += `\nBonjour, je suis Jey, l'assistant IA d'EliteReply. Comment puis-je vous aider aujourd'hui avec votre demande${ticketCategory ? ` dans la catégorie "${ticketCategory}"` : ''} ?`;
            } else if (intentOverride === 'ask_booking_confirmation' && selectedPartner) {
                currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a sélectionné le partenaire "${selectedPartner.nom}". Demande-lui : "Excellent choix ! Souhaitez-vous que je procède à la prise de rendez-vous avec ${selectedPartner.nom} ?" Propose des options claires pour "oui" ou "non".`;
                jeyMessageType = 'booking_confirmation_request';
                jeyMessageData = {
                    partnerId: selectedPartner.id,
                    partnerName: selectedPartner.nom
                };
            } else if (intentOverride === 'show_booking_form') {
                currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a confirmé la prise de rendez-vous. Réponds "Excellent choix ! Un instant, je prépare le formulaire de rendez-vous."`;
                jeyMessageType = 'appointment_form_trigger';
            } else if (ticketInfo && ticketInfo.jeyAskedToTerminate) {
                const clientResponse = lastClientMessageText;
                const confirmationKeywords = ['oui', 'yes', 'ok', 'accepte', 'terminer', 'mettre fin', 'finir', 'c\'est tout'];
                const refusalKeywords = ['non', 'pas encore', 'continue', 'encore', 'besoin', 'aide', 'non merci', 'non, merci'];

                if (confirmationKeywords.some(keyword => clientResponse.includes(keyword))) {
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a confirmé qu'il souhaite terminer la conversation. Réponds en remerciant le client d'avoir utilisé EliteReply et dis-lui au revoir. Ton nom est Jey. Le nom du client est ${actualClientName}.`;
                } else if (refusalKeywords.some(keyword => clientResponse.includes(keyword))) {
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client ne souhaite pas terminer la conversation. Réponds-lui poliment et demande-lui comment tu peux l'aider d'autre part. Ton nom est Jey. Le nom du client est ${actualClientName}.`;
                    await updateDoc(doc(db, 'tickets', ticketId), {
                        jeyAskedToTerminate: deleteField()
                    });
                } else {
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a donné une réponse ambiguë après que tu lui aies demandé s'il voulait terminer la conversation. Redemande-lui clairement s'il souhaite terminer la conversation ou s'il a une autre question.`;
                }
            } else if (clientWantsAppointment) {
                currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a exprimé le désir de prendre un rendez-vous ou faire une réservation. Demande-lui : "Je comprends que vous souhaitez prendre un rendez-vous. Est-ce exact ?" Propose un bouton "Prendre Rendez-vous" pour le guider.`;
                jeyMessageType = 'appointment_request_prompt';
            } else if (clientWantsToTerminate) {
                currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a exprimé le désir de terminer la conversation (ex: "merci", "au revoir"). Réponds en demandant poliment au client s'il souhaite que tu mettes fin à la conversation en cours. Propose des options "Oui, terminer" et "Non, continuer". Ton nom est Jey. Le nom du client est ${actualClientName}.`;
                jeyMessageType = 'termination_confirmation_request';
                await updateDoc(doc(db, 'tickets', ticketId), {
                    jeyAskedToTerminate: true
                });
            } else if (clientConfirmedPartnerSelection) {
                const partner = selectedPartnerByNumber || identifiedPartnerByName;
                if (partner) {
                    setSelectedPartnerForBooking(partner);
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client vient de confirmer la sélection du partenaire "${partner.nom}". Pose-lui la question suivante : "Excellent choix ! Souhaitez-vous que je procède à la prise de rendez-vous avec ${partner.nom} ?" Propose des options claires pour "oui" ou "non".`;
                    jeyMessageType = 'booking_confirmation_request';
                    jeyMessageData = {
                        partnerId: partner.id,
                        partnerName: partner.nom
                    };
                } else {
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a tenté de sélectionner un partenaire but le numéro/nom n'a pas été reconnu. Demande-lui de reformuler son choix ou si tu dois suggérer des partners à nouveau. Rappelle-lui comment sélectionner un partenaire ("Sélectionnez un partenaire en tapant son numéro (ex: '1')").`;
                }
            } else if (clientAskedForPartnersExplicitly || ticketCategory) {
                const filteredPartners = getSortedPartnersForSuggestion(ticketCategory || lastClientMessageText, true); // Always get potentially relevant partners and limit later

                if (filteredPartners.length > 0) {
                    const top3Partners = filteredPartners.slice(0, 3); // Get top 3
                    
                    let partnersSuggestionText = `J'ai trouvé les partenaires suivants dans la catégorie "${ticketCategory || 'que vous recherchez'}":\n\n`;
                    top3Partners.forEach((p, index) => {
                        partnersSuggestionText += `${index + 1}. **${p.nom}** (Catégorie: ${p.categorie}, Note: ${p.averageRating?.toFixed(1) || 'Non noté'} étoiles)${p.estPromu ? ' ⭐ Promotion' : ''}\n`;
                    });
                    partnersSuggestionText += `\nPour sélectionner un partenaire, veuillez taper son numéro (ex: "1").`;

                    currentSystemPromptContent += `\nTu es Jey, l'assistant IA d'EliteReply. Le client cherche des partenaires. Utilise la liste de partenaires fournie pour formuler ta réponse STRICTEMENT comme follows: "${partnersSuggestionText}". N'ajoute pas de texte générique supplémentaire autour de cette structure.`;
                    
                    jeyMessageType = 'partner_suggestion_list'; // Changed to partner_suggestion_list
                    jeyMessageData = {
                        partnersData: top3Partners.map(p => ({ // Store full data for client-side rendering
                            id: p.id,
                            nom: p.nom,
                            categorie: p.categorie,
                            averageRating: p.averageRating,
                            logo: p.logo || null,
                            estPromu: p.estPromu || false,
                            promotionEndDate: p.promotionEndDate || null,
                        }))
                    };
                } else {
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a demandé des partenaires but aucun ne correspond à la catégorie "${ticketCategory || 'spécifiée'}" ou détectée. Réponds poliment qu'aucun partenaire pertinent n'a été trouvé pour cette catégorie et demande si tu peux l'aider avec autre chose ou si il souhaite être mis en relation avec un agent humain.`;
                }
            } else {
                currentSystemPromptContent += `\n${categorySpecificInstruction}`;
            }

            const response = await openai.chat.completions.create({
                model: "gpt-3.5-turbo",
                messages: [{
                    "role": "system",
                    "content": currentSystemPromptContent
                }, ...openaiMessages],
                max_tokens: 250,
                temperature: 0.7,
            });

            const jeyText = response.choices[0]?.message?.content?.trim();

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
            } else if (jeyMessageType === 'appointment_form_trigger') {
                setShowAppointmentFormModal(true);
                // ⭐ MODIFIED: Send simple confirmation message here instead of 'Formulaire ouvert' ⭐
                const confirmationMessage = `Excellent ! Votre rendez-vous a été enregistré. Vous pouvez le retrouver à tout moment dans "Paramètres > Mes Rendez-vous". Merci d'avoir choisi EliteReply ! Y a-t-il autre chose que je puisse faire pour vous aider ?`;
                await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                    texte: confirmationMessage,
                    expediteurId: 'jey-ai',
                    nomExpediteur: 'Jey',
                    createdAt: serverTimestamp(),
                    type: 'text', // Simple text message
                });
                await updateDoc(doc(db, 'tickets', ticketId), {
                    lastMessage: confirmationMessage.substring(0, 100),
                    lastUpdated: serverTimestamp(),
                    lastMessageSender: 'jey-ai'
                });
                await updateDoc(doc(db, 'conversations', ticketId), {
                    lastMessage: confirmationMessage.substring(0, 100),
                    lastUpdated: serverTimestamp(),
                    lastMessageSender: 'jey-ai'
                });
                // No return here, as we still want the modal to show initially.
                // The conversation flow should continue to ask if they need more help.
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
    setUploading(true); // Move this here to show loading immediately
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
    // Optimistically add the message to the UI
    setMessages(prevMessages => [...prevMessages, newImageMessage]);

    try {
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

        console.log("Image uploaded successfully:", downloadURL);

    } catch (error) {
        Alert.alert("Erreur d'envoi d'image", `Impossible d'envoyer l'image: ${error.message}`);
        console.error("ERROR in uploaderImage:", error);
        setMessages(prevMessages => prevMessages.filter(msg => msg.id !== optimisticMessageId));
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

            // Special handling for internal commands that don't need to be sent to Firestore as raw text
            if (messageToSend.startsWith('/select_partner_')) {
                const partnerId = messageToSend.replace('/select_partner_', '');
                const partner = allPartners.find(p => p.id === partnerId);
                if (partner) {
                    setSelectedPartnerForBooking(partner);
                    // This will trigger Jey's getJeyResponse with intentOverride 'ask_booking_confirmation'
                    await getJeyResponse(messages.concat([newMessage]), false, 'ask_booking_confirmation', partner);
                }
                return; // Do not send this command to Firestore
            } else if (messageToSend === '/confirm_booking_yes') {
                // This triggers the modal, the actual message is sent by Jey's response or from the form
                setShowAppointmentFormModal(true);
                return; // Do not send this command to Firestore
            } else if (messageToSend === '/confirm_booking_no') {
                // This will trigger Jey's getJeyResponse to send a follow-up message
                return; // Do not send this command to Firestore
            } else if (messageToSend === '/show_appointment_form') {
                   // This triggers the modal
                setShowAppointmentFormModal(true);
                return; // Do not send this command to Firestore
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

            updateTypingStatus(false);

            await mettreAJourConversation(messageToSend, currentUser?.uid);

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
        updateTypingStatus(true);
        typingTimeoutRef.current = setTimeout(() => {
            updateTypingStatus(false);
        }, 3000);
    }, [updateTypingStatus]);

    // Simplified mettreAJourConversation: It no longer adds the system message
    const mettreAJourConversation = async (texte, senderId) => {
        const updates = {
            lastUpdated: serverTimestamp(),
            lastMessage: texte.substring(0, 50),
            lastMessageSender: senderId,
        };

        // Fetch the latest ticketInfo directly if relying on it for crucial flags
        // Although the agentJoinedNotified is now handled in ITDashboard, fetching here ensures fresh state for other checks
        const currentTicketDoc = await getDoc(doc(db, 'tickets', ticketId));
        const latestTicketInfo = currentTicketDoc.exists() ? currentTicketDoc.data() : null;

        // Ensure status is 'in-progress' if it's IT support and assigned to this agent,
        // and not already terminated. This is to ensure the status is correct
        // if the agent sends a message on an already-taken ticket, without re-adding system message.
        if (isITSupport && latestTicketInfo &&
            latestTicketInfo.assignedTo === currentUser?.uid &&
            latestTicketInfo.status !== 'terminé' &&
            latestTicketInfo.status !== 'in-progress') {
            updates.status = 'in-progress';
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

            const fullPathFromUrl = imageUrl.split('?')[0];
            const filename = fullPathFromUrl.substring(fullPathFromUrl.lastIndexOf('/') + 1);

            const baseDownloadDirectory = `${FileSystem.cacheDirectory}downloaded_qrs/`;

            await FileSystem.makeDirectoryAsync(baseDownloadDirectory, { intermediates: true });
            
            const fileDest = `${baseDownloadDirectory}${filename}`;
            
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
            Alert.alert('Erreur', 'Échec du téléchargement de l\'image: ' + error.message);
            console.error('Failed to download image:', error);
        }
    };

    const handleAppointmentBookingSuccess = useCallback(async (newOrUpdatedAppointment) => {
        console.log("DEBUG: AppointmentFormModal reports success:", newOrUpdatedAppointment);

        // Safely extract client names
        let clientNamesString = 'un client';
        if (Array.isArray(newOrUpdatedAppointment.clientNames)) {
            clientNamesString = newOrUpdatedAppointment.clientNames.map(client => {
                // Assuming client is an object like { id: ..., name: "..." }
                // or just a string if passed directly from form.
                return typeof client === 'object' && client !== null && client.name ? client.name : client;
            }).filter(name => name).join(', '); // Filter out any null/undefined names
        } else if (typeof newOrUpdatedAppointment.clientNames === 'string') {
            clientNamesString = newOrUpdatedAppointment.clientNames;
        }

        const confirmationMessage = `Excellent ! Votre rendez-vous avec ${newOrUpdatedAppointment.partnerNom || 'le partenaire'} pour ${clientNamesString} a été enregistré. Vous pouvez le retrouver à tout moment dans "Paramètres > Mes Rendez-vous". Merci d'avoir choisi EliteReply ! Y a-t-il autre chose que je puisse faire pour vous aider ?`;

        try {
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: confirmationMessage,
                expediteurId: 'jey-ai',
                nomExpediteur: 'Jey',
                createdAt: serverTimestamp(),
                type: 'text',
            });
            await updateDoc(doc(db, 'tickets', ticketId), {
                lastMessage: confirmationMessage.substring(0, 100),
                lastUpdated: serverTimestamp(),
                lastMessageSender: 'jey-ai',
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                lastMessage: confirmationMessage.substring(0, 100),
                lastUpdated: serverTimestamp(),
                lastMessageSender: 'jey-ai',
            });
        } catch (error) {
            console.error("ERROR: Failed to send Jey's direct confirmation message:", error);
            Alert.alert("Erreur", "Impossible d'envoyer le message de confirmation.");
        }
    }, [ticketId]);


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

        const messageText = `Voici quelques partenaires que je peux vous suggérer :\n- ${suggestedPartnerNamesText}\n\nCliquez sur un partenaire pour voir plus de détails, ou demandez-me si vous souhaitez prendre un rendez-vous avec l'un d'entre eux.`;

        try {
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: messageText,
                expediteurId: currentUser.uid, // Sent by the agent
                nomExpediteur: currentUser.displayName || 'Agent',
                createdAt: serverTimestamp(),
                type: 'partner_suggestion_list', // Changed type to be consistent
                partnersData: selectedPartnersForSuggestion.map(p => ({ // Store full data for client-side rendering
                    id: p.id,
                    nom: p.nom,
                    categorie: p.categorie,
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
            setSelectedPartnersForSuggestion([]);
            setPartnerSearchQuery('');
        } catch (error) {
            console.error("Error sending suggested partners message:", error);
            Alert.alert("Erreur", "Impossible d'envoyer la suggestion de partenaires.");
        }
    };

    const renderMessage = ({ item }) => {
        const estUtilisateurCourant = item.expediteurId === currentUser?.uid;
        const estSysteme = item.expediteurId === 'systeme';
        const estJeyAI = item.expediteurId === 'jey-ai';

        const isThisClientsMessage = isITSupport && item.expediteurId === ticketInfo?.userId;

        // Determine which photo to display based on the sender
        let senderPhoto = null;
        if (estJeyAI) {
            senderPhoto = jeyAiProfile;
        } else if (isThisClientsMessage) {
            senderPhoto = clientPhotoUrl ? { uri: clientPhotoUrl } : null;
        } else if (estUtilisateurCourant) {
            senderPhoto = currentUserPhotoUrl ? { uri: currentUserPhotoUrl } : null;
        } else { // This would be the other agent in IT Support view
            senderPhoto = agentPhotoUrl ? { uri: agentPhotoUrl } : null;
        }


        return (
            <View style={[
                styles.messageRow,
                estUtilisateurCourant ? styles.messageRowRight : styles.messageRowLeft,
            ]}>
                {/* Display sender's photo if not current user and not system message */}
                {!estUtilisateurCourant && !estSysteme && (
                    <TouchableOpacity onPress={() => estJeyAI && setIsJeyProfileModalVisible(true)}>
                        {senderPhoto ? (
                            <Image source={senderPhoto} style={estJeyAI ? styles.jeyMessagePhoto : styles.profilePhoto} />
                        ) : (
                            <View style={styles.profilePhotoPlaceholder}>
                                <Ionicons name="person-circle" size={30} color="#B0B0B0" />
                            </View>
                        )}
                    </TouchableOpacity>
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

                    {(item.type === 'partner_suggestion_list' || item.type === 'numbered_partner_suggestion') && item.partnersData && item.partnersData.length > 0 && (
                        <View style={styles.suggestedPartnersDisplayContainer}>
                            <Text style={styles.suggestedPartnersTitle}>
                                {estJeyAI ? "J'ai trouvé les partenaires suivants :" : "Voici quelques partenaires que je peux vous suggérer :"}
                            </Text>
                            {item.partnersData.map((partner, index) => (
                                <TouchableOpacity
                                    key={partner.id}
                                    style={styles.suggestedPartnerItem}
                                    onPress={() => envoyerMessage(
                                        `/select_partner_${partner.id}`,
                                        'command',
                                        {},
                                        `J'ai choisi le partenaire : ${partner.nom} (${partner.categorie})`
                                    )}
                                >
                                    <View style={styles.partnerDetailsRow}>
                                        {estJeyAI && <Text style={styles.partnerIndexNumber}>{index + 1}. </Text>}
                                        <Text style={styles.suggestedPartnerName}>{partner.nom}</Text>
                                        {typeof partner.averageRating === 'number' && (
                                            <View style={styles.partnerRatingContainer}>
                                                {renderStarRating(partner.averageRating)}
                                            </View>
                                        )}
                                    </View>
                                    <Text style={styles.suggestedPartnerCategory}>{partner.categorie}</Text>
                                    <Ionicons name="chevron-forward-outline" size={20} color="#007AFF" />
                                </TouchableOpacity>
                            ))}
                            {estJeyAI && (
                                <Text style={styles.suggestedPartnersFooter}>
                                    Pour sélectionner un partenaire, veuillez taper son numéro (ex: "1").
                                </Text>
                            )}
                            {!estJeyAI && (
                                <Text style={styles.suggestedPartnersFooter}>
                                    Cliquez pour plus de détails ou demandez à Jey un rendez-vous.
                                </Text>
                            )}
                        </View>
                    )}

                    {item.type === 'booking_confirmation_request' && item.partnerName && (
                        <View style={styles.bookingConfirmationContainer}>
                            <Text style={styles.bookingConfirmationText}>{item.texte}</Text>
                            <View style={styles.bookingConfirmationButtons}>
                                <TouchableOpacity
                                    style={[styles.bookingButton, styles.bookingButtonYes]}
                                    onPress={() => {
                                        const partnerObj = allPartners.find(p => p.nom === item.partnerName);
                                        setSelectedPartnerForBooking(partnerObj || null);
                                        envoyerMessage(
                                            '/confirm_booking_yes',
                                            'text',
                                            {},
                                            `Oui, je souhaite prendre rendez-vous avec ${item.partnerName} !`
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
                                    envoyerMessage(
                                        '/show_appointment_form',
                                        'command',
                                        {},
                                        `Oui, je souhaite prendre rendez-vous !`
                                    );
                                }}
                            >
                                <Text style={styles.bookingButtonText}>Prendre Rendez-vous</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {item.type === 'termination_confirmation_request' && estJeyAI && (
                        <View style={styles.bookingConfirmationContainer}>
                            <Text style={styles.bookingConfirmationText}>{item.texte}</Text>
                            <View style={styles.bookingConfirmationButtons}>
                                <TouchableOpacity
                                    style={[styles.bookingButton, styles.bookingButtonYes]}
                                    onPress={() => envoyerMessage(
                                        'Oui, je souhaite terminer la conversation.',
                                        'text'
                                    )}
                                >
                                    <Text style={styles.bookingButtonText}>Oui, terminer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.bookingButton, styles.bookingButtonNo]}
                                    onPress={() => envoyerMessage(
                                        'Non, je souhaite continuer la conversation.',
                                        'text'
                                    )}
                                >
                                    <Text style={styles.bookingButtonText}>Non, continuer</Text>
                                </TouchableOpacity>
                            </View>
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
                        <Text style={styles.texteMessage}>
                            {item.texte}
                        </Text>
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

                {/* Display sender's photo on the right if it's the current user */}
                {estUtilisateurCourant && (
                    <TouchableOpacity>
                        {senderPhoto ? (
                            <Image source={senderPhoto} style={styles.profilePhoto} />
                        ) : (
                            <View style={styles.profilePhotoPlaceholder}>
                                <Ionicons name="person-circle" size={30} color="#B0B0B0" />
                            </View>
                        )}
                    </TouchableOpacity>
                )}
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
                    subHeaderText = "En cours"; // Show "En cours" in header if agent has taken it
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

    const conversationDate = moment().format('DD/MM/YYYY');

    const filteredPartnersForSelection = allPartners.filter(p => {
        const queryLower = partnerSearchQuery.toLowerCase();
        return (
            p.nom?.toLowerCase().includes(queryLower) ||
            p.categorie?.toLowerCase().includes(queryLower)
        );
    });

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
                    <Text style={styles.partnerSelectionItemName}>{item.nom}</Text>
                    <Text style={styles.partnerSelectionItemCategory}>{item.categorie}</Text>
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

            <View style={styles.conversationDateContainer}>
                <Text style={styles.conversationDateText}>{conversationDate}</Text>
            </View>


            {isITSupport && (
                <View style={styles.itSupportControls}>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('TicketInfo', { ticketId })}
                        style={styles.infoButton}
                    >
                        <Text style={styles.infoButtonText}>Détails du ticket</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => navigation.navigate('AppointmentManager', {
                            screen: 'CreateAppointment',
                            params: {
                                ticketId: ticketId,
                                initialUserId: initialUserId,
                                initialUserName: initialUserName,
                                userPhone: userPhone,
                            }
                        })}
                        style={styles.appointmentButton}
                    >
                        <Ionicons name="calendar" size={20} color="white" />
                        <Text style={styles.appointmentButtonText}>Nouveau Rendez-vous</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={styles.suggestPartnerControlPanelButton}
                        onPress={() => setShowPartnerSelectionModal(true)}
                    >
                        <Ionicons name="people-circle-outline" size={24} color="#007AFF" />
                        <Text style={styles.suggestPartnerControlPanelButtonText}>Suggérer Partenaire</Text>
                    </TouchableOpacity>
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

            {isJeyTyping && (
                <Animated.View
                    style={[
                        styles.typingIndicatorContainer,
                        styles.jeyTypingTextIndicator,
                        {
                            transform: [{
                                scale: jeyTypingPulseAnim.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: [0.95, 1.05]
                                })
                            }]
                        }
                    ]}
                >
                    <Image source={jeyAiProfile} style={styles.typingIndicatorPhoto} />
                    <Text style={styles.typingIndicatorText}>Jey est en train d'écrire...</Text>
                    <ActivityIndicator size="small" color="#007AFF" style={styles.typingIndicatorSpinner} />
                </Animated.View>
            )}

            {isOtherHumanTyping && otherHumanTypingName && (
                <View style={[styles.typingIndicatorContainer, styles.humanTypingIndicator]}>
                    {otherHumanTypingPhotoUrl ? (
                        <Image source={{ uri: otherHumanTypingPhotoUrl }} style={styles.typingIndicatorPhoto} />
                    ) : (
                        <View style={styles.typingIndicatorPhotoPlaceholder}>
                            <Ionicons name="person-circle" size={30} color="#B0B0B0" />
                        </View>
                    )}
                    <Text style={styles.typingIndicatorText}>{otherHumanTypingName} est en train d'écrire...</Text>
                    <ActivityIndicator size="small" color="#6B7280" style={styles.typingIndicatorSpinner} />
                </View>
            )}

            <View style={styles.inputContainer}>
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
                        <View style={{ width: 30 }} />
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
    suggestPartnerHeaderButton: {
        padding: 8,
        marginRight: 10,
    },
    suggestPartnerControlPanelButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#E6F7FF',
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
    suggestPartnerControlPanelButtonText: {
        color: '#007AFF',
        fontWeight: 'bold',
        fontSize: 14,
        marginLeft: 5,
    },
    conversationDateContainer: {
        alignItems: 'center',
        paddingVertical: 10,
        backgroundColor: '#F0F4F8',
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    conversationDateText: {
        fontSize: 12,
        color: '#6B7280',
        fontWeight: '500',
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
        marginBottom: 15,
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
        marginLeft: 8,
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
        bottom: 25,
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

    jeyTypingPhotoContainer: {
        alignSelf: 'flex-start',
        marginLeft: 10,
        marginBottom: 5,
        flexDirection: 'row',
        alignItems: 'center',
    },
    typingIndicatorPhoto: { // Unified style for typing indicator photos
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        borderWidth: 2,
        borderColor: '#007AFF',
        backgroundColor: '#E3F2FD',
    },
    typingIndicatorPhotoPlaceholder: { // Placeholder for missing typing indicator photo
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#E0E0E0',
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
    profilePhoto: { // Unified style for message sender photos
        width: 30,
        height: 30,
        borderRadius: 15,
        marginHorizontal: 5,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#D1D5DB', // Default background for user profile
    },
    profilePhotoPlaceholder: { // Placeholder for missing message sender photo
        width: 30,
        height: 30,
        borderRadius: 15,
        marginHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#E0E0E0',
    },
    hiddenPhotoPlaceholder: {
        width: 30 + 8 + 5, // Width of photo + margin + padding if it were present on the left
        height: 30,
        opacity: 0,
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
        backgroundColor: '#E3F2FD',
    },
    jeyModalText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center'
    },
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
    suggestedPartnersDisplayContainer: {
        backgroundColor: '#E6EFFF',
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
        flexDirection: 'row',
        alignItems: 'center',
    },
    partnerIndexNumber: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0D47A1',
        marginRight: 5,
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
});

export default Conversation;
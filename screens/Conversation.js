// Conversation.js (Full updated file)

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
    where,
    setDoc, // Ensure setDoc is imported here
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
import { sendMessageNotification } from '../services/notificationHelpers';
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
    } = route.params || {}; // Use || {} for robust destructuring

    const [messages, setMessages] = useState([]);
    const [nouveauMessage, setNouveauMessage] = useState('');
    const [ticketInfo, setTicketInfo] = useState(null);
    const [agent, setAgent] = useState(null);
    const [clientPhotoUrl, setClientPhotoUrl] = useState(null);
    const [currentUserPhotoUrl, setCurrentUserPhotoUrl] = useState(null);
    const [agentPhotoUrl, setAgentPhotoUrl] = useState(null);
    const [chargement, setChargement] = useState(true);
    const [uploading, setUploading] = useState(false);
    const [isTerminated, setIsTerminated] = useState(false);

    const [isJeyTyping, setIsJeyTyping] = useState(false);
    const [isOtherHumanTyping, setIsOtherHumanTyping] = useState(false);
    const [otherHumanTypingName, setOtherHumanTypingName] = useState(null);
    const [otherHumanTypingPhotoUrl, setOtherHumanTypingPhotoUrl] = useState(null);

    const typingTimeoutRef = useRef(null);

    const [allPartners, setAllPartners] = useState([]);
    const [showAppointmentFormModal, setShowAppointmentFormModal] = useState(false);
    const [selectedPartnerForBooking, setSelectedPartnerForBooking] = useState(null);

    const [currentTicketAppointments, setCurrentTicketAppointments] = useState([]);
    // `confirmedAppointmentForTicket` is for the latest active appointment related to THIS ticket
    const [confirmedAppointmentForTicket, setConfirmedAppointmentForTicket] = useState(null);
    // `appointmentToEdit` is specifically used to pass to AppointmentFormModal when editing
    const [appointmentToEdit, setAppointmentToEdit] = useState(null); // Initialize as null

    const currentUser = auth.currentUser;
    const flatListRef = useRef();

    const actualClientUid = isITSupport ? initialUserId : currentUser?.uid;
    const actualClientName = isITSupport ? initialUserName : currentUser?.displayName || 'Client';

    const [modalClientInfo, setModalClientInfo] = useState(null);


    const lastJeyRespondedToMessageId = useRef(null);

    const jeyTypingPulseAnim = useRef(new Animated.Value(0)).current;
    const jeyMessagePulseAnim = useRef(new Animated.Value(0)).current;

    const [isJeyProfileModalVisible, setIsJeyProfileModalVisible] = useState(false);

    const [showPartnerSelectionModal, setShowPartnerSelectionModal] = useState(false);
    const [selectedPartnersForSuggestion, setSelectedPartnersForSuggestion] = useState([]);
    const [partnerSearchQuery, setPartnerSearchQuery] = useState('');

    const [showProductListModal, setShowProductListModal] = useState(false);
    const [allProducts, setAllProducts] = useState([]);
    const [productSearchQuery, setProductSearchQuery] = useState('');
    const [selectedProduct, setSelectedProduct] = useState(null);

    const [showFabActions, setShowFabActions] = useState(false);
    const fabRotation = useRef(new Animated.Value(0)).current;
    const fabActionTranslate = useRef(new Animated.Value(0)).current;

    // Jey typing animation
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

    // Jey message pulse animation (if used elsewhere, otherwise can be removed if only for typing indicator)
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


    // FAB animation
    useEffect(() => {
        Animated.parallel([
            Animated.timing(fabRotation, {
                toValue: showFabActions ? 1 : 0,
                duration: 300,
                useNativeDriver: true,
            }),
            Animated.timing(fabActionTranslate, {
                toValue: showFabActions ? 1 : 0,
                duration: 300,
                easing: Easing.ease,
                useNativeDriver: true,
            }),
        ]).start();
    }, [showFabActions, fabRotation, fabActionTranslate]);


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

    // Fetch partners and products
    useEffect(() => {
        const fetchPartnersAndProducts = async () => {
            try {
                const partnersCollectionRef = collection(db, 'partners');
                const q = query(partnersCollectionRef, orderBy('nom'));
                const querySnapshot = await getDocs(q);

                const fetchedPartners = [];
                for (const docSnapshot of querySnapshot.docs) {
                    const partnerData = {
                        id: docSnapshot.id,
                        ...docSnapshot.data(),
                        nom: docSnapshot.data().nom || '',
                        categorie: docSnapshot.data().categorie || '',
                        averageRating: 0,
                        ratingCount: 0,
                    };

                    const ratingsQuery = query(collection(db, 'partnerRatings'), where('partnerId', '==', partnerData.id));
                    const ratingsSnapshot = await getDocs(ratingsQuery);
                    let totalRating = 0;
                    let numberOfRatings = 0;

                    if (!ratingsSnapshot.empty) {
                        ratingsSnapshot.docs.forEach(ratingDoc => {
                            totalRating += ratingDoc.data().rating;
                            numberOfRatings++;
                        });
                        partnerData.averageRating = numberOfRatings > 0 ? (totalRating / numberOfRatings) : 0;
                        partnerData.ratingCount = numberOfRatings;
                    }
                    fetchedPartners.push(partnerData);
                }
                setAllPartners(fetchedPartners);

                let productsArray = [];
                for (const partner of fetchedPartners) {
                    const productsSnapshot = await getDocs(collection(db, 'partners', partner.id, 'products'));
                    productsSnapshot.docs.forEach(productDoc => {
                        productsArray.push({
                            id: productDoc.id,
                            partnerId: partner.id,
                            partnerName: partner.nom,
                            ...productDoc.data(),
                        });
                    });
                }
                setAllProducts(productsArray);

            } catch (error) {
                console.error("ERROR: Error fetching partners or products:", error);
            }
        };
        fetchPartnersAndProducts();
    }, []);

    const getPromotionStatusForPartnerItem = (partner) => {
        if (!partner.estPromu || !partner.promotionEndDate) {
            return { color: '#666', text: 'Non promu', iconName: 'information-circle-outline' };
        }

        const endDate = new Date(partner.promotionEndDate);
        const today = new Date();
        const diffTime = endDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 0) return { color: '#FF3B30', text: 'Expirée', iconName: 'close-circle-outline' };
        if (diffDays <= 7) return { color: '#FF9500', text: `${diffDays} jours`, iconName: 'time-outline' };
        return { color: '#34C759', text: 'Active', iconName: 'checkmark-circle-outline' };
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




    // Ticket info subscription
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
                    setConfirmedAppointmentForTicket(activeAppointments[0]); // Set the latest active appointment
                } else {
                    setConfirmedAppointmentForTicket(null); // No active appointments
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

    // Messages subscription
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
                        // Handle command from Agent to Jey for appointment
                        if (firestoreMessage.type === 'command_to_jey' && firestoreMessage.texte === '/demander_rendez_vous') {
                            if (!isITSupport && ticketInfo?.status === 'jey-handling') {
                                // Jey will respond by asking the client if they want to book
                                getJeyResponse(currentLocalMessages, false, 'appointment_request_prompt');
                            }
                        }
                        // Handle client-side modal trigger (less common now, but kept for robustness)
                        else if (firestoreMessage.type === 'initiate_appointment_form' && !isITSupport && firestoreMessage.clientId === currentUser?.uid) {
                            setModalClientInfo({
                                id: firestoreMessage.clientId,
                                name: firestoreMessage.clientName,
                                email: firestoreMessage.clientEmail,
                                phone: firestoreMessage.clientPhone,
                            });
                            setShowAppointmentFormModal(true);
                        }
                        // Handle agent-booked/deleted confirmations from system
                        else if ((firestoreMessage.type === 'appointment_booked_agent_confirmation' || firestoreMessage.type === 'appointment_deleted_agent_confirmation') && !isITSupport && firestoreMessage.clientId === currentUser?.uid) {
                            // These are just display messages for the client
                        }


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

                // Jey's Auto-Response Logic
                if (!isITSupport && ticketInfo?.status === 'jey-handling' && !isTerminated) {
                    const lastMessage = currentLocalMessages[currentLocalMessages.length - 1];

                    // Only trigger Jey if the last message is from the current user (client) and Jey hasn't responded to it yet
                    // OR if it's an agent command for Jey
                    if (lastMessage && lastMessage.id !== lastJeyRespondedToMessageId.current) {
                        const isInternalClientCommand = lastMessage.texte.startsWith('/select_partner_') ||
                            lastMessage.texte === '/confirm_booking_yes' ||
                            lastMessage.texte === '/confirm_booking_no' ||
                            lastMessage.texte === '/show_appointment_form';
                        const isAgentCommandToJey = lastMessage.expediteurId === 'systeme' && lastMessage.type === 'command_to_jey' && lastMessage.texte === '/demander_rendez_vous';

                        if ((lastMessage.expediteurId === currentUser?.uid && (!lastMessage.optimistic || isInternalClientCommand)) || isAgentCommandToJey) {
                            lastJeyRespondedToMessageId.current = lastMessage.id; // Mark this message as responded to

                            if (isAgentCommandToJey) {
                                await getJeyResponse(currentLocalMessages, false, 'appointment_request_prompt');
                            } else if (lastMessage.texte.startsWith('/select_partner_')) {
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
                            } else if (ticketInfo.jeyAskedToTerminate) {
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
                                    }, 1000);
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
                                } else {
                                    await updateDoc(doc(db, 'tickets', ticketId), {
                                        jeyAskedToTerminate: deleteField()
                                    });
                                    await getJeyResponse(currentLocalMessages, false, 'general_response');
                                }
                            } else {
                                if (!isInternalClientCommand) { // General client message that's not an internal command
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
        allPartners, terminateConversationByJey, setMessages,
    ]);

    // Typing status listener
    useEffect(() => {
        if (!ticketId || !currentUser) return;

        const conversationRef = doc(db, 'conversations', ticketId);

        const unsubscribeTyping = onSnapshot(conversationRef, async (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                const typingUsers = data.typingUsers || {};

                if (typingUsers['jey-ai']) {
                    setIsJeyTyping(true);
                } else {
                    setIsJeyTyping(false);
                }

                let foundAnyOtherHumanTyper = false;
                let foundOtherHumanTypingName = null;
                let foundOtherHumanTypingPhotoUrl = null;

                for (const userId in typingUsers) {
                    if (userId !== currentUser.uid && userId !== 'jey-ai') {
                        const otherUserDoc = await getDoc(doc(db, 'users', userId));
                        if (otherUserDoc.exists()) {
                            foundOtherHumanTypingName = otherUserDoc.data().name || 'Quelqu\'un';
                            foundOtherHumanTypingPhotoUrl = otherUserDoc.data().photoURL || null;
                            foundAnyOtherHumanTyper = true;
                            break;
                        }
                    }
                }

                setIsOtherHumanTyping(foundAnyOtherHumanTyper);
                setOtherHumanTypingName(foundOtherHumanTypingName);
                setOtherHumanTypingPhotoUrl(foundOtherHumanTypingPhotoUrl);
            } else {
                setIsJeyTyping(false);
                setIsOtherHumanTyping(false);
                setOtherHumanTypingName(null);
                setOtherHumanTypingPhotoUrl(null);
            }
        }, (error) => {
            console.error("ERROR: Error listening to typing status:", error);
        });

        return () => {
            unsubscribeTyping();
        };
    }, [ticketId, currentUser]);

    // Update typing status in Firestore
    const updateTypingStatus = async (isTyping) => {
        if (!currentUser || !ticketId || !ticketInfo) {
            return;
        }

        const conversationRef = doc(db, 'conversations', ticketId);
        const userKey = currentUser.uid;

        const isHumanTypingAllowed = !isTerminated &&
            (ticketInfo.status === 'nouveau' ||
                ticketInfo.status === 'jey-handling' ||
                ticketInfo.status === 'escalated_to_agent' ||
                ticketInfo.status === 'in-progress');

        if (!isHumanTypingAllowed) {
            console.log(`DEBUG: Typing update NOT allowed for human. Status: ${ticketInfo.status}, isTerminated: ${isTerminated}`);
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
            } else {
                await updateDoc(conversationRef, {
                    [`typingUsers.${userKey}`]: deleteField()
                });
            }
        } catch (error) {
            console.error("ERROR: Error updating typing status:", error);
        }
    };


    // Archive terminated ticket function
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

    // Terminate conversation (agent/manual trigger)
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

    // Jey's AI response logic
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
            return; // Jey doesn't respond in IT Support mode
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
                        lastClientMessageText.includes(p.nom?.toLowerCase())
                    );
                } else if (allCategories) {
                    relevantPartners = [...allPartners];
                } else {
                    return [];
                }

                const keywords = lastClientMessageText.split(/\s+/).filter(word => word.length > 2);
                relevantPartners = relevantPartners.filter(p =>
                    keywords.some(keyword =>
                        p.nom?.toLowerCase().includes(keyword) ||
                        p.categorie?.toLowerCase().includes(keyword)
                    ) ||
                    (!requestedCategory && keywords.length === 0)
                );

                if (relevantPartners.length === 0 && requestedCategory && !allCategories) {
                    relevantPartners = [...allPartners];
                }

                relevantPartners.sort((a, b) => {
                    const isAPromoted = a.estPromu || false;
                    const isBPromoted = b.estPromu || false;
                    const ratingA = a.averageRating || 0;
                    const ratingB = b.averageRating || 0;

                    if (isAPromoted && !isBPromoted) return -1;
                    if (!isAPromoted && isBPromoted) return 1;

                    return ratingB - ratingA;
                });

                return relevantPartners;
            };

            let currentSystemPromptContent = `
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
                - Lorsque tu suggères des partners, tu DOIS TOUJOURS inclure des options numériques claires (ex: "1. Nom du partenaire...") et demander au client de sélectionner un partenaire en tapant son numéro (ex: "Sélectionnez un partenaire en tapant son numéro (ex: '1')").
                
                **Instructions générales de conversation:**
                - Si un client demande à parler à un "agent", "humain", ou utilise des expressions telles que "passe moi un agent", "Je souhaite parler à un agent", "je veux parler à un agent", "un agent s'il vous plait", "un agent svp", ou si tu ne comprends pas bien la demande ou la conversation après 2-3 tentatives, informe-le que tu vas escalader à un agent humain.
                - Pour la prise de rendez-vous, si le client accepte, dis "Excellent choix ! Un instant, je prépare le formulaire de rendez-vous." et déclenche le formulaire via un message de type \`show_appointment_form\`.
            `;

            let jeyMessageType = 'text';
            let jeyMessageData = {};

            const terminationKeywords = ['merci jey', 'merci beaucoup', 'c\'est tout', 'pas besoin', 'au revoir', 'bye', 'goodbye', 'rien d\'autre', 'j\'ai tout ce qu\'il me faut'];
            const clientWantsToTerminate = terminationKeywords.some(keyword => lastClientMessageText.includes(keyword));

            const clientAskedForPartnersExplicitly = ['partenaire', 'recommander', 'service', 'agence', 'hotel', 'clinique', 'restaurant', 'voyage', 'sante', 'bien-etre', 'chauffeur', 'taxi'].some(keyword => lastClientMessageText.includes(keyword));

            const appointmentKeywords = ['rendez-vous', 'prendre rendez-vous', 'reservation', 'faire une reservation', 'disponibilité'];
            const clientWantsAppointment = appointmentKeywords.some(keyword => lastClientMessageText.includes(keyword));

            const partnerSelectionRegex = /^\s*(?:je (?:choisis|sélectionne)|mon choix est|je voudrais) le partenaire n°?\s*(\d+)\s*$/i;
            const match = lastClientMessageText.match(partnerSelectionRegex);
            let selectedPartnerByNumber = null;
            let partnersCurrentlySuggestedByJey = [];
            const lastJeyMessage = conversationHistory.filter(msg => msg.expediteurId === 'jey-ai').pop();

            if (lastJeyMessage && lastJeyMessage.type === 'partner_suggestion_list' && lastJeyMessage.partnersData) {
                partnersCurrentlySuggestedByJey = lastJeyMessage.partnersData;
            }

            if (match && partnersCurrentlySuggestedByJey.length > 0) {
                const partnerIndex = parseInt(match[1], 10) - 1;
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
                categorySpecificInstruction = `La catégorie principale de ce ticket est "${ticketCategory}". Tu DOIS suggérer des partenaires qui correspondent EXACTEMENT à cette catégorie si le client demande une recommandation de partenaire. Si aucun partenaire ne correspond, informe le client qu'il n'y a pas de partenaires dans cette catégorie et propose d'escalader à un agent humain.`;
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
            }
            // Logic for Jey to ask about booking, either from agent command or client keywords
            else if (intentOverride === 'appointment_request_prompt' || clientWantsAppointment) {
                currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a exprimé le désir de prendre un rendez-vous ou faire une réservation. Demande-lui : "Je comprends que vous souhaitez prendre un rendez-vous. Est-ce exact ?" Propose un bouton "Prendre Rendez-vous" pour le guider.`;
                jeyMessageType = 'appointment_request_prompt';
            }
            else if (clientWantsToTerminate) {
                currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a exprimé le désir de terminer la conversation (ex: "merci", "au revoir"). Réponds en demandant poliment au client s'il souhaite que tu mettes fin à la conversation en cours. Propose des options "Oui, terminer" et "Non, continuer". Ton nom est Jey. Le nom du client est ${actualClientName}.`;
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
                const filteredPartners = getSortedPartnersForSuggestion(ticketCategory || lastClientMessageText, true);

                if (filteredPartners.length > 0) {
                    const top3Partners = filteredPartners.slice(0, 3);

                    let partnersSuggestionText = `J'ai trouvé les partenaires suivants dans la catégorie "${ticketCategory || 'que vous recherchez'}":\n\n`;
                    top3Partners.forEach((p, index) => {
                        partnersSuggestionText += `${index + 1}. **${p.nom}** (Catégorie: ${p.categorie}, Note: ${p.averageRating?.toFixed(1) || 'Non noté'} étoiles)${p.estPromu ? ' ⭐ Promotion' : ''}\n`;
                    });
                    partnersSuggestionText += `\nPour sélectionner un partenaire, veuillez taper son numéro (ex: "1").`;

                    currentSystemPromptContent += `\nTu es Jey, l'assistant IA d'EliteReply. Le client cherche des partenaires. Utilise la liste de partenaires fournie pour formuler ta réponse STRICTEMENT comme follows: "${partnersSuggestionText}". N'ajoute pas de texte générique supplémentaire autour de cette structure.`;

                    jeyMessageType = 'partner_suggestion_list';
                    jeyMessageData = {
                        partnersData: top3Partners.map(p => ({
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
                    currentSystemPromptContent += `\nTu es Jey de EliteReply. Le client a demandé des partners but aucun ne correspond à la catégorie "${ticketCategory || 'spécifiée'}" ou détectée. Réponds poliment qu'aucun partenaire pertinent n'a été trouvé pour cette catégorie et demande si tu peux l'aider avec autre chose ou si il souhaite être mis en relation avec un agent humain.`;
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
                // This branch handles Jey AI explicitly triggering the appointment form
                setShowAppointmentFormModal(true);
                const confirmationMessage = `Excellent ! Votre rendez-vous a été enregistré. Vous pouvez le retrouver à tout moment dans "Paramètres > Mes Rendez-vous". Merci d'avoir choisi EliteReply ! Y a-t-il autre chose que je puisse faire pour vous aider ?`;
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


    // Image uploader
    const uploaderImage = useCallback(async (uri) => {
        setUploading(true);
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

    // Image selection handler
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

    // Send message (text, commands)
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

            // Special internal commands that do NOT get sent to Firestore directly as user messages
            if (messageToSend.startsWith('/select_partner_')) {
                const partnerId = messageToSend.replace('/select_partner_', '');
                const partner = allPartners.find(p => p.id === partnerId);
                if (partner) {
                    setSelectedPartnerForBooking(partner);
                    await getJeyResponse(messages.concat([newMessage]), false, 'ask_booking_confirmation', partner);
                }
                return;
            } else if (messageToSend === '/confirm_booking_yes') {
                // This command from client opens the form directly
                setShowAppointmentFormModal(true);
                return;
            } else if (messageToSend === '/confirm_booking_no') {
                return; // Jey handles response to this
            } else if (messageToSend === '/show_appointment_form') {
                // This command from client (or agent via FAB) opens the form directly
                setShowAppointmentFormModal(true);
                return;
            } else if (messageToSend === '/demander_rendez_vous' && type === 'command_to_jey') {
                 // This is an agent-initiated command for Jey, which is sent and handled by Jey's listener
                 // No further direct action here after sending.
            }


            // All other messages (including new system commands for Jey) get sent to Firestore
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

            // Send notification for regular text messages
            if (type === 'text' && messageToSend.trim()) {
                try {
                    const recipientId = isITSupport ? ticketInfo?.userId : ticketInfo?.assignedTo;
                    if (recipientId && recipientId !== currentUser?.uid) {
                        await sendMessageNotification.textMessage(
                            recipientId,
                            {
                                senderName: currentUser?.displayName || (isITSupport ? 'Agent' : 'Client'),
                                message: messageToSend,
                                ticketId: ticketId,
                                ticketCategory: ticketInfo?.category
                            }
                        );
                    }
                } catch (notificationError) {
                    console.error('Error sending message notification:', notificationError);
                }
            }

            await mettreAJourConversation(messageToSend, currentUser?.uid);

        } catch (error) {
            Alert.alert("Erreur", "Impossible d'envoyer le message");
            // If message failed to send, remove optimistic message
            setMessages(prevMessages => prevMessages.filter(msg => msg.id !== newMessage.id));
        }
    };

    // Text input change handler
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

    // Update conversation (last message, status)
    const mettreAJourConversation = async (texte, senderId) => {
        const updates = {
            lastUpdated: serverTimestamp(),
            lastMessage: texte.substring(0, 50),
            lastMessageSender: senderId,
        };

        const currentTicketDoc = await getDoc(doc(db, 'tickets', ticketId));
        const latestTicketInfo = currentTicketDoc.exists() ? currentTicketDoc.data() : null;

        if (isITSupport && latestTicketInfo &&
            latestTicketInfo.assignedTo === currentUser?.uid &&
            latestTicketInfo.status !== 'terminé' &&
            latestTicketInfo.status !== 'in-progress') {
            updates.status = 'in-progress';
        }

        await updateDoc(doc(db, 'conversations', ticketId), updates);
        await updateDoc(doc(db, 'tickets', ticketId), updates);
    };

    // Download image handler
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

    // Callback for when AppointmentFormModal successfully books/updates an appointment
    const handleAppointmentBookingSuccess = useCallback(async (newOrUpdatedAppointment) => {
        console.log("DEBUG: AppointmentFormModal reports success:", newOrUpdatedAppointment);

        let clientNamesString = 'un client';
        if (Array.isArray(newOrUpdatedAppointment.clientNames)) {
            clientNamesString = newOrUpdatedAppointment.clientNames.map(client => {
                return typeof client === 'object' && client !== null && client.name ? client.name : client;
            }).filter(name => name).join(', ');
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
            setShowAppointmentFormModal(false); // Close modal after success
            setModalClientInfo(null); // Clear specific client info for modal
            setSelectedPartnerForBooking(null); // Clear selected partner
            setAppointmentToEdit(null); // Clear editing state after success
        } catch (error) {
            console.error("ERROR: Failed to send Jey's direct confirmation message:", error);
            Alert.alert("Erreur", "Impossible d'envoyer le message de confirmation.");
        }
    }, [ticketId]);


    // Send suggested partners message (agent initiated)
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
            if (typeof p.averageRating === 'number' && p.averageRating > 0) {
                details += `, Note: ${p.averageRating.toFixed(1)}/5`;
            }
            details += ')';
            return details;
        }).join('\n- ');

        const messageText = `Voici quelques partenaires que je peux vous suggérer :\n- ${suggestedPartnerNamesText}\n\nCliquez sur un partenaire pour voir plus de détails, ou demandez-me si vous souhaitez prendre un rendez-vous avec l'un d'entre eux.`;

        try {
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: messageText,
                expediteurId: currentUser.uid,
                nomExpediteur: currentUser.displayName || 'Agent',
                createdAt: serverTimestamp(),
                type: 'partner_suggestion_list',
                partnersData: selectedPartnersForSuggestion.map(p => ({
                    id: p.id,
                    nom: p.nom,
                    categorie: p.categorie,
                    averageRating: p.averageRating,
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

            // Send notification about partner suggestion
            try {
                await sendMessageNotification.partnerSuggestion(
                    actualClientUid,
                    {
                        senderName: currentUser.displayName || 'Votre agent',
                        ticketId: ticketId,
                        partners: selectedPartnersForSuggestion
                    }
                );
            } catch (notificationError) {
                console.error('Error sending partner suggestion notification:', notificationError);
            }

            setShowPartnerSelectionModal(false);
            setSelectedPartnersForSuggestion([]);
            setPartnerSearchQuery('');
        } catch (error) {
            console.error("Error sending suggested partners message:", error);
            Alert.alert("Erreur", "Impossible d'envoyer la suggestion de partenaires.");
        }
    };

    // Send product details message (agent initiated)
    const sendProductDetailsAsMessage = async (product) => {
        if (!product || !ticketId || !currentUser) {
            Alert.alert("Erreur", "Impossible d'envoyer les détails du produit: données manquantes.");
            return;
        }

        const messageText = `Détails du produit/service :\n\n` +
            `Nom: **${product.name ?? 'N/A'}**\n` +
            `Partenaire: **${product.partnerName ?? 'N/A'}**\n` +
            `Catégorie: ${product.categorie ?? 'N/A'}\n` +
            `Prix: ${product.price ? `${product.price} ${product.currency ?? 'USD'}` : 'N/A'}\n` +
            `Description: ${product.description ?? 'Pas de description.'}`;
        try {
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: messageText,
                expediteurId: currentUser.uid,
                nomExpediteur: currentUser.displayName || 'Agent',
                createdAt: serverTimestamp(),
                type: 'product_details',
                productData: {
                    id: product.id,
                    name: product.name ?? '',
                    partnerName: product.partnerName ?? '',
                    partnerId: product.partnerId,
                    categorie: product.categorie ?? '',
                    price: product.price ?? null,
                    currency: product.currency ?? '',
                    description: product.description ?? '',
                }
            });

            await updateDoc(doc(db, 'tickets', ticketId), {
                lastMessage: `Détails du produit: ${product.name ?? 'Non spécifié'}`,
                lastUpdated: serverTimestamp(),
                lastMessageSender: currentUser.uid,
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                lastMessage: `Détails du produit: ${product.name ?? 'Non spécifié'}`,
                lastUpdated: serverTimestamp(),
                lastMessageSender: currentUser.uid,
            });

            setShowProductListModal(false);
            setProductSearchQuery('');
            setSelectedProduct(null);

            // Send notification about product details
            try {
                await sendMessageNotification.productDetails(
                    actualClientUid,
                    {
                        senderName: currentUser.displayName || 'Votre agent',
                        ticketId: ticketId,
                        productName: product.name,
                        partnerName: product.partnerName
                    }
                );
            } catch (notificationError) {
                console.error('Error sending product details notification:', notificationError);
            }

        } catch (error) {
            console.error("Error sending product details message:", error);
            Alert.alert("Erreur", "Impossible d'envoyer les détails du produit.");
        }
    };


    // Render individual message bubble
    const renderMessage = ({ item }) => {
        const estUtilisateurCourant = item.expediteurId === currentUser?.uid;
        const estSysteme = item.expediteurId === 'systeme';
        const estJeyAI = item.expediteurId === 'jey-ai';

        const isThisClientsMessage = isITSupport && item.expediteurId === ticketInfo?.userId;

        let senderPhoto = null;
        if (estJeyAI) {
            senderPhoto = jeyAiProfile;
        } else if (isThisClientsMessage) {
            senderPhoto = clientPhotoUrl ? { uri: clientPhotoUrl } : null;
        } else if (estUtilisateurCourant) {
            senderPhoto = currentUserPhotoUrl ? { uri: currentUserPhotoUrl } : null;
        } else {
            senderPhoto = agentPhotoUrl ? { uri: agentPhotoUrl } : null;
        }


        return (
            <View style={[
                styles.messageRow,
                estUtilisateurCourant ? styles.messageRowRight : styles.messageRowLeft,
            ]}>
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
                                    onPress={() => {
                                        navigation.navigate('PartnerPage', { partnerId: partner.id });
                                    }}
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

                    {item.type === 'product_details' && item.productData && (
                        <Pressable
                            style={styles.productDetailsMessageContainer}
                            onPress={() => {
                                if (item.productData.partnerName && item.productData.id) {
                                    navigation.navigate('ProductDetail', {
                                        partnerName: item.productData.partnerName,
                                        productId: item.productData.id,
                                        productName: item.productData.name,
                                    });
                                } else {
                                    Alert.alert("Information", "Impossible de trouver les détails du produit. Informations manquantes.");
                                }
                            }}
                        >
                            <Text style={styles.productDetailsMessageTitle}>Détails du produit/service</Text>
                            <Text style={styles.productDetailsMessageText}>**Nom:** {item.productData.name}</Text>
                            <Text style={styles.productDetailsMessageText}>**Partenaire:** {item.productData.partnerName}</Text>
                            <Text style={styles.productDetailsMessageText}>**Catégorie:** {item.productData.categorie}</Text>
                            <Text style={styles.productDetailsMessageText}>**Prix:** {item.productData.price ? `${item.productData.price} ${item.productData.currency}` : 'N/A'}</Text>
                            <Text style={styles.productDetailsMessageText}>**Description:** {item.productData.description}</Text>
                            <View style={styles.navigateToPartnerPageButton}>
                                <Text style={styles.navigateToPartnerPageButtonText}>Voir le Produit</Text>
                                <Ionicons name="chevron-forward" size={16} color="#007AFF" />
                            </View>
                        </Pressable>
                    )}

                    {/*
                        This message type is now primarily handled by Jey's response system (`appointment_request_prompt`),
                        but is kept here for backward compatibility or if the agent directly sends this type.
                    */}
                    {item.type === 'initiate_appointment_form' && !isITSupport && item.clientId === currentUser?.uid && (
                        <View style={styles.initiateAppointmentFormContainer}>
                            <Text style={styles.initiateAppointmentFormText}>
                                {item.texte}
                            </Text>
                            <TouchableOpacity
                                style={styles.openAppointmentFormButton}
                                onPress={() => {
                                    setModalClientInfo({
                                        id: item.clientId,
                                        name: item.clientName,
                                        email: item.clientEmail,
                                        phone: item.clientPhone,
                                    });
                                    setShowAppointmentFormModal(true);
                                }}
                            >
                                <Ionicons name="calendar-outline" size={20} color="white" />
                                <Text style={styles.openAppointmentFormButtonText}>Ouvrir le Formulaire de Rendez-vous</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Agent-initiated appointment confirmation/deletion messages */}
                    {(item.type === 'appointment_booked_agent_confirmation' || item.type === 'appointment_deleted_agent_confirmation') && (
                        <View style={styles.agentAppointmentConfirmationContainer}>
                            <Text style={styles.agentAppointmentConfirmationText}>{item.texte}</Text>
                            {item.type === 'appointment_booked_agent_confirmation' && item.appointmentId && (
                                <TouchableOpacity
                                    style={styles.viewAppointmentDetailsButton}
                                    onPress={() => navigation.navigate('AppointmentListScreen', {
                                        ticketId: ticketId,
                                        initialUserId: initialUserId,
                                        initialUserName: initialUserName,
                                        userPhone: userPhone,
                                        initialUserEmail: item.clientEmail || ticketInfo?.clientEmail,
                                        allPartners: allPartners,
                                        highlightAppointmentId: item.appointmentId,
                                    })}
                                >
                                    <Ionicons name="eye-outline" size={18} color="#0a8fdf" />
                                    <Text style={styles.viewAppointmentDetailsButtonText}>Voir les détails du rendez-vous</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}

                    {/* Booking confirmation request from Jey */}
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

                    {/* Appointment request prompt from Jey (with a button to open the form) */}
                    {item.type === 'appointment_request_prompt' && estJeyAI && (
                        <View style={styles.bookingConfirmationContainer}>
                            <Text style={styles.bookingConfirmationText}>{item.texte}</Text>
                            <TouchableOpacity
                                style={[styles.bookingButton, styles.bookingButtonYes]}
                                onPress={() => {
                                    // This internal command directly triggers the modal on client-side
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

                    {/* Termination confirmation request from Jey */}
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

                    {/* Generic message types or optimistic messages */}
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

    // Render header content
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
                    subHeaderText = "En cours";
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

    // Loading indicator for conversation
    if (chargement) {
        return (
            <View style={styles.chargementContainer}>
                <ActivityIndicator size="large" color="#34C759" />
                <Text>Chargement de la conversation...</Text>
            </View>
        );
    }

    // Error message if ticketId is missing
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

    // Filter partners for selection modal
    const filteredPartnersForSelection = allPartners.filter(p => {
        const queryLower = partnerSearchQuery.toLowerCase();
        return (
            p.nom?.toLowerCase().includes(queryLower) ||
            p.categorie?.toLowerCase().includes(queryLower)
        );
    });

    // Filter products for selection modal
    const filteredProductsForSelection = allProducts.filter(p => {
        const queryLower = productSearchQuery.toLowerCase();
        return (
            p.name?.toLowerCase().includes(queryLower) ||
            p.categorie?.toLowerCase().includes(queryLower) ||
            p.partnerName?.toLowerCase().includes(queryLower)
        );
    });

    // Render item for partner selection modal
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
                        {renderStarRating(item.averageRating)}
                        <Text style={[styles.partnerSelectionItemPromoText, { color: promotionStatus.color }]}>
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

    // Render item for product selection modal
    const renderProductSelectionItem = ({ item }) => {
        const isSelected = selectedProduct && selectedProduct.id === item.id;
        return (
            <TouchableOpacity
                style={[
                    styles.productSelectionItem,
                    isSelected && styles.productSelectionItemSelected,
                ]}
                onPress={() => setSelectedProduct(item)}
            >
                <View style={styles.productSelectionItemInfo}>
                    <Text style={styles.productSelectionItemName}>{item.name}</Text>
                    <Text style={styles.productSelectionItemPartner}>{item.partnerName} ({item.categorie})</Text>
                    <Text style={styles.productSelectionItemPrice}>
                        {item.price ? `${item.price} ${item.currency || 'USD'}` : 'N/A'}
                    </Text>
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
                {isITSupport && confirmedAppointmentForTicket && ( // Only show edit button if agent and there's an active appointment
                    <TouchableOpacity
                        style={styles.editAppointmentButton}
                        onPress={() => {
                            // When editing, explicitly set the appointment object to be edited
                            setAppointmentToEdit(confirmedAppointmentForTicket);
                            setShowAppointmentFormModal(true);
                        }}
                    >
                        <Ionicons name="create-outline" size={24} color="#2C2C2C" />
                    </TouchableOpacity>
                )}
                {isITSupport && !isTerminated && ( // Only show terminate button if agent and not terminated
                    <TouchableOpacity
                        onPress={terminerConversation}
                        style={styles.endButton}
                    >
                        <Text style={styles.endButtonText}>Terminer</Text>
                    </TouchableOpacity>
                )}
            </View>

            <View style={styles.conversationDateContainer}>
                <Text style={styles.conversationDateText}>{conversationDate}</Text>
            </View>

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

            {isITSupport && ( // Only show FAB actions in IT Support mode
                <View style={styles.fabContainer}>
                    {/* View Ticket Info */}
                    <Animated.View style={[styles.fabAction, {
                        transform: [{
                            translateY: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -60]
                            })
                        }, {
                            translateX: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 0]
                            })
                        }],
                        opacity: fabActionTranslate
                    }]}>
                        <TouchableOpacity
                            style={styles.fabActionButton}
                            onPress={() => {
                                navigation.navigate('TicketInfo', { ticketId });
                                setShowFabActions(false);
                            }}
                        >
                            <Ionicons name="information-circle-outline" size={24} color="#007AFF" />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Open Appointment Form (for agent to book/edit for client) */}
                    <Animated.View style={[styles.fabAction, {
                        transform: [{
                            translateY: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -120]
                            })
                        }, {
                            translateX: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 0]
                            })
                        }],
                        opacity: fabActionTranslate
                    }]}>
                        <TouchableOpacity
                            style={styles.fabActionButton}
                            onPress={() => {
                                // Agent wants to book/edit for this client.
                                // If confirmedAppointmentForTicket exists, it suggests editing that one.
                                // Otherwise, it's a new appointment, so set to null.
                                setAppointmentToEdit(confirmedAppointmentForTicket); // Pass the latest appointment or null
                                setShowAppointmentFormModal(true);
                                setShowFabActions(false);
                            }}
                        >
                            <Ionicons name="calendar-outline" size={24} color="#34C759" />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Suggest Partners */}
                    <Animated.View style={[styles.fabAction, {
                        transform: [{
                            translateY: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -180]
                            })
                        }, {
                            translateX: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 0]
                            })
                        }],
                        opacity: fabActionTranslate
                    }]}>
                        <TouchableOpacity
                            style={styles.fabActionButton}
                            onPress={() => {
                                setShowPartnerSelectionModal(true);
                                setShowFabActions(false);
                            }}
                        >
                            <Ionicons name="people-circle-outline" size={24} color="#FF9500" />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Suggest Products/Services */}
                    <Animated.View style={[styles.fabAction, {
                        transform: [{
                            translateY: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, -240]
                            })
                        }, {
                            translateX: fabActionTranslate.interpolate({
                                inputRange: [0, 1],
                                outputRange: [0, 0]
                            })
                        }],
                        opacity: fabActionTranslate
                    }]}>
                        <TouchableOpacity
                            style={styles.fabActionButton}
                            onPress={() => {
                                setShowProductListModal(true);
                                setShowFabActions(false);
                            }}
                        >
                            <Ionicons name="pricetags-outline" size={24} color="#EF4444" />
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Main FAB Button */}
                    <TouchableOpacity
                        style={styles.mainFabButton}
                        onPress={() => setShowFabActions(!showFabActions)}
                    >
                        <Animated.View style={{
                            transform: [{
                                rotate: fabRotation.interpolate({
                                    inputRange: [0, 1],
                                    outputRange: ['0deg', '45deg']
                                })
                            }]
                        }}>
                            <Ionicons name="add" size={30} color="white" />
                        </Animated.View>
                    </TouchableOpacity>
                </View>
            )}

            <View style={styles.inputContainer}>
                <TextInput
                    style={[styles.input, isTerminated && styles.disabledInput]}
                    value={nouveauMessage}
                    onChangeText={handleTextInputChange}
                    // Placeholder changes based on state
                    placeholder={isTerminated ? "Conversation terminée" : (showAppointmentFormModal && !isITSupport ? "Veuillez remplir le formulaire..." : "Écrivez votre message...")}
                    placeholderTextColor="#999"
                    multiline
                    // Editable if not uploading, not terminated, and (if client-side modal is open, only agent can type)
                    editable={!uploading && !isTerminated && (!showAppointmentFormModal || isITSupport)}
                />

                <TouchableOpacity
                    style={styles.boutonEnvoyer}
                    onPress={() => envoyerMessage(nouveauMessage)}
                    disabled={!nouveauMessage.trim() || uploading || isTerminated || (showAppointmentFormModal && !isITSupport)}
                >
                    {uploading ? (
                        <ActivityIndicator size="small" color="#CCC" />
                    ) : (
                        <Ionicons
                            name="send"
                            size={24}
                            color={nouveauMessage.trim() && !isTerminated && (!showAppointmentFormModal || isITSupport) ? "#34C759" : "#CCC"}
                        />
                    )}
                </TouchableOpacity>
            </View>

            {/* Appointment Form Modal */}
            <AppointmentFormModal
                isVisible={showAppointmentFormModal}
                onClose={() => {
                    setShowAppointmentFormModal(false);
                    setModalClientInfo(null); // Clear client info specific to modal
                    setSelectedPartnerForBooking(null); // Clear selected partner for booking
                    setAppointmentToEdit(null); // IMPORTANT: Clear editing state when modal closes
                }}
                onBookingSuccess={handleAppointmentBookingSuccess}
                ticketId={ticketId}
                allPartners={allPartners}
                // Pass editingAppointment, ensuring it's always null or an object.
                // The `|| null` handles the unlikely case of `appointmentToEdit` being `undefined`.
                editingAppointment={appointmentToEdit || null}
                // `isAgentMode` is determined by who is currently using the Conversation screen
                isAgentMode={isITSupport}
                // `ticketClientInfo` is passed differently based on `isAgentMode`
                ticketClientInfo={isITSupport ? {
                    id: initialUserId,
                    name: initialUserName,
                    email: ticketInfo?.clientEmail, // Prefer ticketInfo's clientEmail
                    phone: userPhone,
                } : modalClientInfo} // For client-side triggered forms
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

            {/* Partner Selection Modal */}
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

            {/* Product List Modal */}
            <Modal
                animationType="slide"
                transparent={false}
                visible={showProductListModal}
                onRequestClose={() => setShowProductListModal(false)}
            >
                <View style={styles.productSelectionModalContainer}>
                    <View style={styles.productSelectionModalHeader}>
                        <TouchableOpacity onPress={() => {
                            setShowProductListModal(false);
                            setProductSearchQuery('');
                            setSelectedProduct(null);
                        }} style={styles.productSelectionModalCloseButton}>
                            <Ionicons name="close-circle-outline" size={30} color="#EF4444" />
                        </TouchableOpacity>
                        <Text style={styles.productSelectionModalTitle}>Liste des Produits/Services</Text>
                        <View style={{ width: 30 }} />
                    </View>

                    <View style={styles.productSelectionSearchBar}>
                        <Ionicons name="search" size={20} color="#999" />
                        <TextInput
                            style={styles.productSelectionSearchInput}
                            placeholder="Rechercher produit, service, ou partenaire..."
                            placeholderTextColor="#999"
                            value={productSearchQuery}
                            onChangeText={setProductSearchQuery}
                        />
                    </View>

                    <FlatList
                        data={filteredProductsForSelection}
                        renderItem={renderProductSelectionItem}
                        keyExtractor={item => item.id}
                        contentContainerStyle={styles.productSelectionListContent}
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Text style={styles.emptyText}>Aucun produit/service trouvé</Text>
                            </View>
                        }
                    />

                    <TouchableOpacity
                        style={[
                            styles.sendProductButton,
                            !selectedProduct && styles.sendProductButtonDisabled,
                        ]}
                        onPress={() => sendProductDetailsAsMessage(selectedProduct)}
                        disabled={!selectedProduct}
                    >
                        <Ionicons name="send" size={20} color="white" style={{ marginRight: 10 }} />
                        <Text style={styles.sendProductButtonText}>
                            Envoyer Détails Produit
                        </Text>
                    </TouchableOpacity>
                </View>
            </Modal>

        </KeyboardAvoidingView>
    );
};

// PropTypes for component validation
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

// Stylesheet for the component
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
        marginTop: 15,
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
    productListIconButton: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 10,
        marginBottom: 5,
        backgroundColor: '#F0F0F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
    },
    shareProductButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#EBF9F1',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        marginLeft: 10,
        marginBottom: 5,
        shadowColor: '#28a745',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
        elevation: 3,
    },
    shareProductButtonText: {
        color: '#28a745',
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
    typingIndicatorPhoto: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginRight: 8,
        borderWidth: 2,
        borderColor: '#007AFF',
        backgroundColor: '#E3F2FD',
    },
    typingIndicatorPhotoPlaceholder: {
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
    profilePhoto: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginHorizontal: 5,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        backgroundColor: '#D1D5DB',
    },
    profilePhotoPlaceholder: {
        width: 30,
        height: 30,
        borderRadius: 15,
        marginHorizontal: 5,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#E0E0E0',
    },
    hiddenPhotoPlaceholder: {
        width: 30 + 8 + 5,
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
    productSelectionModalContainer: {
        flex: 1,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        backgroundColor: '#F8F9FA',
    },
    productSelectionModalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 15,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
        backgroundColor: '#FFF',
    },
    productSelectionModalCloseButton: {
        padding: 5,
    },
    productSelectionModalTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2D3748',
    },
    productSelectionSearchBar: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#F3F4F6',
        borderRadius: 10,
        paddingHorizontal: 15,
        margin: 15,
    },
    productSelectionSearchInput: {
        flex: 1,
        height: 45,
        fontSize: 16,
        color: '#333',
        marginLeft: 10,
    },
    productSelectionListContent: {
        paddingHorizontal: 15,
        paddingBottom: 20,
    },
    productSelectionItem: {
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
    productSelectionItemSelected: {
        borderColor: '#34C759',
        borderWidth: 2,
        backgroundColor: '#E6FDF3',
    },
    productSelectionItemInfo: {
        flex: 1,
        marginRight: 10,
    },
    productSelectionItemName: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#2D3748',
    },
    productSelectionItemPartner: {
        fontSize: 14,
        color: '#6B7280',
        marginTop: 2,
    },
    productSelectionItemPrice: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#007AFF',
        marginTop: 5,
    },
    sendProductButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#34C759',
        borderRadius: 10,
        paddingVertical: 15,
        margin: 15,
        shadowColor: '#34C759',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
    },
    sendProductButtonDisabled: {
        backgroundColor: '#A0D9B8',
        opacity: 0.7,
        elevation: 0,
        shadowOpacity: 0,
    },
    sendProductButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    productDetailsMessageContainer: {
        backgroundColor: '#E6F7FF',
        borderRadius: 10,
        padding: 15,
        marginTop: 5,
        marginBottom: 10,
        width: '100%',
        borderColor: '#A0C8F7',
        borderWidth: 1,
        alignItems: 'flex-start',
    },
    productDetailsMessageTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#0D47A1',
    },
    productDetailsMessageText: {
        fontSize: 14,
        color: '#333',
        marginBottom: 4,
    },
    navigateToPartnerPageButton: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        backgroundColor: '#F0F8FF',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#BBDEFB',
    },
    navigateToPartnerPageButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: '#007AFF',
        marginRight: 5,
    },
    fabContainer: {
        position: 'absolute',
        bottom: 90,
        right: 20,
        alignItems: 'center',
        zIndex: 100,
    },
    mainFabButton: {
        backgroundColor: '#007AFF',
        width: 56,
        height: 56,
        borderRadius: 28,
        justifyContent: 'center',
        alignItems: 'center',
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 4,
    },
    fabAction: {
        position: 'absolute',
        backgroundColor: '#FFF',
        width: 48,
        height: 48,
        borderRadius: 24,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 10,
        elevation: 6,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    fabActionButton: {
        width: '100%',
        height: '100%',
        justifyContent: 'center',
        alignItems: 'center',
    },
    initiateAppointmentFormContainer: {
        backgroundColor: '#e6ffe6',
        borderRadius: 10,
        padding: 15,
        marginTop: 5,
        marginBottom: 10,
        width: '100%',
        borderColor: '#80ff80',
        borderWidth: 1,
        alignItems: 'center',
    },
    initiateAppointmentFormText: {
        fontSize: 15,
        color: '#1a4d1a',
        textAlign: 'center',
        marginBottom: 10,
    },
    openAppointmentFormButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#34C759',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 20,
    },
    openAppointmentFormButtonText: {
        color: 'white',
        fontSize: 14,
        fontWeight: 'bold',
        marginLeft: 5,
    },
    agentAppointmentConfirmationContainer: {
        backgroundColor: '#f0f8ff',
        borderRadius: 10,
        padding: 15,
        marginTop: 5,
        marginBottom: 10,
        width: '100%',
        borderColor: '#bbdeff',
        borderWidth: 1,
        alignItems: 'center',
    },
    agentAppointmentConfirmationText: {
        fontSize: 15,
        color: '#004085',
        textAlign: 'center',
        marginBottom: 10,
    },
    viewAppointmentDetailsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e0f2f7',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#a7d9ed',
        marginTop: 5,
    },
    viewAppointmentDetailsButtonText: {
        color: '#0a8fdf',
        fontSize: 13,
        fontWeight: 'bold',
        marginLeft: 5,
    },
});

export default Conversation;
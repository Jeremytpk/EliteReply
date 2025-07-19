import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Modal,
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    Alert,
    Pressable,
    LayoutAnimation,
    UIManager,
    Dimensions,
    FlatList
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import {
    collection,
    doc,
    addDoc,
    updateDoc,
    serverTimestamp,
    getDoc,
    runTransaction,
    increment,
    deleteDoc,
    query,
    where,
    getDocs
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';

import { db, auth, storage } from '../firebase';
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

const generateRandomString = (length) => {
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ012B0123456789';
    let result = '';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
};

const AppointmentFormModal = ({
    isVisible,
    onClose,
    onBookingSuccess,
    ticketId,
    allPartners,
    editingAppointment,
    isAgentMode = false // NEW PROP: Default to false for client-side
}) => {
    const currentUser = auth.currentUser;

    // State to store fetched ticket data
    const [currentTicketData, setCurrentTicketData] = useState(null);
    const [isLoadingTicketData, setIsLoadingTicketData] = useState(false);

    // Derived client identity for ticket display (only relevant in agent mode)
    const actualClientUid = ticketId && currentTicketData?.clientId ? currentTicketData.clientId : currentUser?.uid;
    const actualClientName = ticketId && currentTicketData?.name ? currentTicketData.name : currentUser?.displayName || 'Client';
    const actualClientPhone = ticketId && currentTicketData?.phone ? currentTicketData.phone : null;


    const [selectedPartner, setSelectedPartner] = useState(null);
    const [formClientNames, setFormClientNames] = useState([{ id: Date.now(), name: '' }]);
    const [formAppointmentDate, setFormAppointmentDate] = useState(new Date());
    const [formAppointmentTime, setFormAppointmentTime] = useState(new Date());
    const [showFormDatePicker, setShowFormDatePicker] = useState(false);
    const [showFormTimePicker, setShowFormTimePicker] = useState(false);
    const [formAppointmentDescription, setFormAppointmentDescription] = useState('');
    const [isProcessingBooking, setIsProcessingBooking] = useState(false);

    const [generatedCode, setGeneratedCode] = useState(null);
    const qrCodeViewShotRef = useRef();

    // New State for Client Selection (Agent Mode Only)
    const [allClients, setAllClients] = useState([]);
    const [filteredClients, setFilteredClients] = useState([]);
    const [clientSearchText, setClientSearchText] = useState('');
    // Stores { id: 'uid', name: 'display name', email: 'email', phone: 'phone' }
    const [selectedClient, setSelectedClient] = useState(
        !isAgentMode && currentUser
            ? { id: currentUser.uid, name: currentUser.displayName, email: currentUser.email, phone: currentUser.phoneNumber || null }
            : null
    );
    const [isSearchingClients, setIsSearchingClients] = useState(false);
    const [debouncedClientSearchText, setDebouncedClientSearchText] = useState('');

    // Debounce effect for client search (Agent Mode Only)
    useEffect(() => {
        if (!isAgentMode) return; // Only run in agent mode
        const handler = setTimeout(() => {
            setDebouncedClientSearchText(clientSearchText);
        }, 300);

        return () => {
            clearTimeout(handler);
        };
    }, [clientSearchText, isAgentMode]);

    // Effect to fetch ticket data based on ticketId (Agent Mode relevant)
    useEffect(() => {
        const fetchTicketData = async () => {
            if (!ticketId || !isAgentMode) { // Only fetch ticket data in agent mode
                setCurrentTicketData(null);
                if (!editingAppointment) {
                    setFormClientNames([{ id: Date.now(), name: '' }]);
                    setSelectedClient(null);
                }
                return;
            }
            setIsLoadingTicketData(true);
            try {
                const ticketDocRef = doc(db, 'tickets', ticketId);
                const ticketSnap = await getDoc(ticketDocRef);
                if (ticketSnap.exists()) {
                    const data = ticketSnap.data();
                    setCurrentTicketData(data);
                    console.log("DEBUG: Fetched ticket data for ID:", ticketId, data);

                    if (!editingAppointment && data.name && formClientNames.length === 1 && formClientNames[0].name === '') {
                        setFormClientNames([{ id: Date.now(), name: data.name }]);
                        if (data.clientId && allClients.length > 0) {
                            const client = allClients.find(c => c.id === data.clientId);
                            if (client) {
                                setSelectedClient(client);
                            }
                        }
                    }
                } else {
                    console.log("DEBUG: No ticket found with ID:", ticketId);
                    setCurrentTicketData(null);
                    if (!editingAppointment) {
                        setFormClientNames([{ id: Date.now(), name: '' }]);
                        setSelectedClient(null);
                    }
                }
            } catch (error) {
                console.error("ERROR: Failed to fetch ticket data:", error);
                setCurrentTicketData(null);
                if (!editingAppointment) {
                    setFormClientNames([{ id: Date.now(), name: '' }]);
                    setSelectedClient(null);
                }
            } finally {
                setIsLoadingTicketData(false);
            }
        };

        if (isVisible) {
            fetchTicketData();
        } else {
            setCurrentTicketData(null);
        }
    }, [isVisible, ticketId, editingAppointment, allClients, isAgentMode]); // Added isAgentMode

    // Effect to fetch users with role 'user' (Agent Mode Only)
    useEffect(() => {
        const fetchClients = async () => {
            setIsSearchingClients(true);
            try {
                const q = query(collection(db, 'users'), where('role', '==', 'user'));
                const querySnapshot = await getDocs(q);
                const clientsList = querySnapshot.docs.map(doc => ({
                    id: doc.id,
                    name: doc.data().displayName || doc.data().email || 'Utilisateur Inconnu',
                    email: doc.data().email || null,
                    phone: doc.data().phone || null
                }));
                setAllClients(clientsList);
                setFilteredClients(clientsList);
                console.log("DEBUG: Fetched all clients:", clientsList);
            } catch (error) {
                console.error("ERROR: Failed to fetch clients:", error);
                setAllClients([]);
                setFilteredClients([]);
            } finally {
                setIsSearchingClients(false);
            }
        };

        if (isVisible && isAgentMode) { // Only fetch clients if in agent mode
            fetchClients();
        }
    }, [isVisible, isAgentMode]); // Added isAgentMode

    // Effect to handle client search filtering - NOW USES DEBOUNCED TEXT (Agent Mode Only)
    useEffect(() => {
        if (!isAgentMode) return; // Only run in agent mode
        if (debouncedClientSearchText.trim() === '') {
            setFilteredClients(allClients);
        } else {
            const lowerCaseSearch = debouncedClientSearchText.toLowerCase();
            const filtered = allClients.filter(client =>
                client.name.toLowerCase().includes(lowerCaseSearch) ||
                (client.email && client.email.toLowerCase().includes(lowerCaseSearch)) ||
                (client.phone && client.phone.includes(debouncedClientSearchText.trim()))
            );
            setFilteredClients(filtered);
        }
    }, [debouncedClientSearchText, allClients, isAgentMode]); // Added isAgentMode

    // Effect to handle editing mode and reset form
    useEffect(() => {
        if (editingAppointment && allPartners.length > 0) {
            console.log("AppointmentFormModal: In EDIT mode. Pre-filling form.");
            const partner = allPartners.find(p => p.id === editingAppointment.partnerId);
            setSelectedPartner(partner || null);

            setFormClientNames((editingAppointment.clientNames || []).map((name, index) => ({ id: `${editingAppointment.id}-${index}`, name: name })));

            const apptDateTime = editingAppointment.appointmentDateTime ? new Date(editingAppointment.appointmentDateTime) : new Date();
            setFormAppointmentDate(apptDateTime);
            setFormAppointmentTime(apptDateTime);
            setFormAppointmentDescription(editingAppointment.description || '');

            // Pre-select the client based on editingAppointment.clientId (Agent Mode Only)
            if (isAgentMode && editingAppointment.clientId && allClients.length > 0) {
                const client = allClients.find(c => c.id === editingAppointment.clientId);
                if (client) {
                    setSelectedClient(client);
                    setClientSearchText(client.name);
                }
            } else if (!isAgentMode && editingAppointment.clientId === currentUser?.uid) {
                // Client Mode: If editing and the appointment client is current user
                setSelectedClient(currentUser ? { id: currentUser.uid, name: currentUser.displayName, email: currentUser.email, phone: currentUser.phoneNumber || null } : null);
            }


            if (editingAppointment.codeData) {
                setGeneratedCode({
                    type: editingAppointment.codeData.type,
                    value: editingAppointment.codeData.value,
                    qrContent: editingAppointment.codeData.qrContent,
                    partnerName: editingAppointment.partnerNom,
                    clientNames: editingAppointment.clientNames,
                    appointmentDate: editingAppointment.appointmentDateTime,
                    appointmentTime: editingAppointment.appointmentDateTime,
                    imageURL: editingAppointment.codeImageUrl || null,
                    description: editingAppointment.description || '',
                });
            } else {
                setGeneratedCode(null);
            }
        } else if (!editingAppointment) {
            console.log("AppointmentFormModal: In CREATE mode. Resetting form.");
            resetForm();
        }
    }, [editingAppointment, allPartners, currentTicketData, allClients, isAgentMode, currentUser, resetForm]); // Added isAgentMode, currentUser, resetForm

    const resetForm = useCallback(() => {
        setSelectedPartner(null);
        if (!isAgentMode) {
             // For client mode, pre-fill with current user's name
             setFormClientNames([{ id: Date.now(), name: currentUser?.displayName || '' }]);
             setSelectedClient(currentUser ? { id: currentUser.uid, name: currentUser.displayName, email: currentUser.email, phone: currentUser.phoneNumber || null } : null);
        } else {
             // For agent mode, use ticket data if available, otherwise empty
             setFormClientNames(currentTicketData?.name ? [{ id: Date.now(), name: currentTicketData.name }] : [{ id: Date.now(), name: '' }]);
             setSelectedClient(null); // Agents start with no client selected by default
        }
        setFormAppointmentDate(new Date());
        setFormAppointmentTime(new Date());
        setFormAppointmentDescription('');
        setGeneratedCode(null);
        setClientSearchText('');
        setDebouncedClientSearchText('');
    }, [currentTicketData, isAgentMode, currentUser]);

    const addClientNameFormField = () => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setFormClientNames([...formClientNames, { id: Date.now(), name: '' }]);
    };

    const updateClientNameFormField = (id, newName) => {
        setFormClientNames(formClientNames.map(client =>
            client.id === id ? { ...client, name: newName } : client
        ));
    };

    const removeClientNameFormField = (id) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setFormClientNames(formClientNames.filter(client => client.id !== id));
    };

    const onFormDateChange = (event, selectedDate) => {
        const currentDate = selectedDate || formAppointmentDate;
        setShowFormDatePicker(Platform.OS === 'ios');
        setFormAppointmentDate(currentDate);
    };

    const onFormTimeChange = (event, selectedTime) => {
        const currentTime = selectedTime || formAppointmentTime;
        setShowFormTimePicker(Platform.OS === 'ios');
        setFormAppointmentTime(currentTime);
    };

    const sendSystemMessageToTicket = useCallback(async (messageText, messageType = 'text', messageData = {}) => {
        if (!ticketId) {
            console.warn("WARN: Not sending system message, no ticketId provided to AppointmentFormModal.");
            return;
        }
        try {
            await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
                texte: messageText,
                expediteurId: 'systeme',
                nomExpediteur: 'Système Rendez-vous',
                createdAt: serverTimestamp(),
                type: messageType,
                ...messageData,
            });
            await updateDoc(doc(db, 'tickets', ticketId), {
                lastMessage: messageText.substring(0, 50),
                lastUpdated: serverTimestamp(),
                lastMessageSender: 'systeme',
            });
            await updateDoc(doc(db, 'conversations', ticketId), {
                lastMessage: messageText.substring(0, 50),
                lastUpdated: serverTimestamp(),
                lastMessageSender: 'systeme',
            });
            console.log("DEBUG: System message sent to ticket from AppointmentFormModal.");
        } catch (error) {
            console.error("ERROR: Failed to send system message from AppointmentFormModal:", error);
        }
    }, [ticketId]);

    const generateQRCodeData = useCallback(() => {
        if (!selectedPartner) {
            Alert.alert("Erreur", "Veuillez sélectionner un partenaire pour générer le code.");
            return null;
        }
        const validClientNames = formClientNames.filter(cn => cn.name.trim() !== '');
        if (validClientNames.length === 0) {
            Alert.alert("Erreur", "Veuillez ajouter au moins un nom de client.");
            return null;
        }

        const partnerFirstNameInitial = selectedPartner.nom ? selectedPartner.nom[0].toUpperCase() : '';
        const partnerLastNameInitial = selectedPartner.nom && selectedPartner.nom.split(' ').length > 1
            ? selectedPartner.nom.split(' ').pop()[0].toUpperCase()
            : '';

        const randomPart = generateRandomString(7);
        const codeValue = `ER${randomPart}${partnerFirstNameInitial}${partnerLastNameInitial}`;

        const combinedDateTime = new Date(
            formAppointmentDate.getFullYear(),
            formAppointmentDate.getMonth(),
            formAppointmentDate.getDate(),
            formAppointmentTime.getHours(),
            formAppointmentTime.getMinutes(),
            0
        );

        // Prioritize selectedClient for QR content if available, otherwise use currentUser for client mode
        const qrClientName = selectedClient?.name || currentUser?.displayName || 'N/A';
        const qrClientId = selectedClient?.id || currentUser?.uid || 'N/A';
        const qrClientEmail = selectedClient?.email || currentUser?.email || 'N/A';
        const qrClientPhone = selectedClient?.phone || currentUser?.phoneNumber || 'N/A';

        const qrContent = JSON.stringify({
            code: codeValue,
            type: 'qr',
            partner: selectedPartner.nom,
            category: selectedPartner.categorie || 'N/A',
            clients: validClientNames.map(cn => cn.name),
            date: combinedDateTime.toLocaleDateString('fr-FR'),
            time: combinedDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            description: formAppointmentDescription || 'N/A',
            bookedByClientName: qrClientName,
            bookedByClientId: qrClientId,
            bookedByClientEmail: qrClientEmail,
            bookedByClientPhone: qrClientPhone,
            ticketId: ticketId || 'N/A'
        });

        const newGeneratedCode = {
            type: 'qr',
            value: codeValue,
            qrContent: qrContent,
            partnerName: selectedPartner.nom,
            clientNames: validClientNames.map(cn => cn.name),
            appointmentDate: combinedDateTime.toISOString(),
            appointmentTime: combinedDateTime.toISOString(),
            description: formAppointmentDescription,
        };

        setGeneratedCode(newGeneratedCode);
        return newGeneratedCode;
    }, [selectedPartner, formClientNames, formAppointmentDate, formAppointmentTime, formAppointmentDescription, selectedClient, currentUser, ticketId]);


    const handleBookingSubmission = async () => {
        if (!selectedPartner) {
            Alert.alert("Champs manquants", "Veuillez sélectionner un partenaire.");
            return;
        }
        const validClientNames = formClientNames.filter(client => client.name.trim() !== '');
        if (validClientNames.length === 0) {
            Alert.alert("Champs manquants", "Veuillez entrer au moins un nom de client.");
            return;
        }

        // Ensure a client is selected, especially in agent mode
        if (isAgentMode && !selectedClient) {
            Alert.alert("Champs manquants", "Veuillez sélectionner le client principal du rendez-vous.");
            return;
        }
        // If not in agent mode, selectedClient should already be the currentUser.
        // If currentUser is null (not logged in), prevent booking.
        if (!isAgentMode && !currentUser) {
             Alert.alert("Erreur", "Vous devez être connecté pour prendre un rendez-vous.");
             return;
        }

        setIsProcessingBooking(true);

        const combinedDateTime = new Date(
            formAppointmentDate.getFullYear(),
            formAppointmentDate.getMonth(),
            formAppointmentDate.getDate(),
            formAppointmentTime.getHours(),
            formAppointmentTime.getMinutes()
        );

        try {
            const newGeneratedCodeData = generateQRCodeData();
            if (!newGeneratedCodeData) {
                throw new Error("Échec de la génération du code QR. Vérifiez les informations saisies.");
            }

            await new Promise(resolve => setTimeout(resolve, 200));

            let qrCodeImageUrl = null;
            if (qrCodeViewShotRef.current) {
                try {
                    const uri = await qrCodeViewShotRef.current.capture();
                    const response = await fetch(uri);
                    const blob = await response.blob();
                    const filename = `shared_codes/${ticketId || 'global'}/${Date.now()}_qr.jpg`;
                    const storageRef = ref(storage, filename);
                    await uploadBytes(storageRef, blob);
                    qrCodeImageUrl = await getDownloadURL(storageRef);
                    setGeneratedCode(prev => ({ ...prev, imageURL: qrCodeImageUrl }));
                } catch (captureError) {
                    console.error("ERROR: Failed to capture or upload QR Code image:", captureError);
                    Alert.alert("Avertissement", "Échec de la capture ou du téléchargement du code QR. Le rendez-vous sera quand même enregistré.");
                }
            } else {
                console.warn("WARN: QR Code ref not available for capture in AppointmentFormModal.");
            }

            // Determine final client details for booking based on mode
            const finalClientId = isAgentMode ? selectedClient?.id : currentUser?.uid;
            const finalClientName = isAgentMode ? selectedClient?.name : currentUser?.displayName;
            const finalClientPhone = isAgentMode ? selectedClient?.phone || null : currentUser?.phoneNumber || null;
            const finalClientEmail = isAgentMode ? selectedClient?.email || null : currentUser?.email || null;

            if (!finalClientId || !finalClientName) {
                throw new Error("Impossible de déterminer les informations du client pour la réservation.");
            }

            const appointmentData = {
                ticketId: ticketId || null,
                clientId: finalClientId,
                clientName: finalClientName,
                clientPhone: finalClientPhone,
                clientEmail: finalClientEmail,
                appointmentDateTime: combinedDateTime.toISOString(),
                clientNames: validClientNames.map(cn => cn.name),
                partnerId: selectedPartner.id,
                partnerNom: selectedPartner.nom,
                partnerCategorie: selectedPartner.categorie,
                description: formAppointmentDescription.trim(),
                status: 'scheduled',
                // Agent specific fields
                bookedByAgentId: isAgentMode ? currentUser?.uid : null, // Only set if agent
                bookedByAgentName: isAgentMode ? (currentUser?.displayName || 'Agent') : null, // Only set if agent
                createdAt: serverTimestamp(),
                codeData: {
                    type: newGeneratedCodeData.type,
                    value: newGeneratedCodeData.value,
                    qrContent: newGeneratedCodeData.qrContent
                },
                codeImageUrl: qrCodeImageUrl,
            };

            let primaryAppointmentDocRef;

            if (editingAppointment) {
                primaryAppointmentDocRef = doc(db, 'appointments', editingAppointment.id);
                await updateDoc(primaryAppointmentDocRef, { ...appointmentData, lastUpdated: serverTimestamp() });

                if (editingAppointment.partnerId !== selectedPartner.id) {
                    const oldPartnerRdvRef = doc(db, 'partners', editingAppointment.partnerId, 'rdv_reservation', editingAppointment.appointmentId);
                    const oldPartnerRdvSnap = await getDoc(oldPartnerRdvRef);
                    if (oldPartnerRdvSnap.exists()) {
                        await deleteDoc(oldPartnerRdvRef);
                        console.log(`DEBUG: Deleted old rdv_reservation from partner ${editingAppointment.partnerId}`);
                    }

                    await addDoc(collection(db, 'partners', selectedPartner.id, 'rdv_reservation'), {
                        ...appointmentData,
                        appointmentId: editingAppointment.id
                    });
                    console.log(`DEBUG: Added new rdv_reservation to partner ${selectedPartner.id}`);
                } else {
                    const partnerApptDocRef = doc(db, 'partners', editingAppointment.partnerId, 'rdv_reservation', editingAppointment.appointmentId);
                    const partnerApptSnap = await getDoc(partnerApptDocRef);

                    if (partnerApptSnap.exists()) {
                        await updateDoc(partnerApptDocRef, { ...appointmentData, lastUpdated: serverTimestamp() });
                        console.log(`DEBUG: Updated existing rdv_reservation for partner ${selectedPartner.id}`);
                    } else {
                        await addDoc(collection(db, 'partners', selectedPartner.id, 'rdv_reservation'), {
                            ...appointmentData,
                            appointmentId: editingAppointment.id
                        });
                        console.warn(`WARN: rdv_reservation for appointment ${editingAppointment.id} not found for partner ${selectedPartner.id}, recreating.`);
                    }
                }

                Alert.alert("Succès", "Rendez-vous mis à jour et QR Code régénéré!");
            } else {
                primaryAppointmentDocRef = await addDoc(collection(db, 'appointments'), appointmentData);
                await addDoc(collection(db, 'partners', selectedPartner.id, 'rdv_reservation'), {
                    ...appointmentData,
                    appointmentId: primaryAppointmentDocRef.id
                });

                if (isAgentMode && currentUser?.uid) { // Only increment agent count if in agent mode
                    const agentUserRef = doc(db, 'users', currentUser.uid);
                    await runTransaction(db, async (transaction) => {
                        const agentDoc = await transaction.get(agentUserRef);
                        if (!agentDoc.exists()) {
                            transaction.set(agentUserRef, {
                                agentAppointmentsBookedCount: 1
                            }, { merge: true });
                        } else {
                            transaction.update(agentUserRef, {
                                agentAppointmentsBookedCount: increment(1)
                            });
                        }
                    });
                    console.log(`DEBUG: Agent ${currentUser.uid} (Appointments Booked Count) incremented.`);
                }

                Alert.alert("Succès", "Rendez-vous pris avec succès et QR Code généré!");
            }

            let message = '';
            if (editingAppointment) {
                message = `Le rendez-vous avec ${selectedPartner.nom} pour ${validClientNames.map(cn => cn.name).join(', ')} a été mis à jour pour le ${moment(combinedDateTime).format('DD/MM/YYYY')} à ${moment(combinedDateTime).format('HH:mm')}.`;
            } else {
                message = `Votre rendez-vous avec ${selectedPartner.nom} pour ${validClientNames.map(cn => cn.name).join(', ')} a été enregistré pour le ${moment(combinedDateTime).format('DD/MM/YYYY')} à ${moment(combinedDateTime).format('HH:mm')}.`;
            }
            if (formAppointmentDescription.trim()) {
                message += ` Description: ${formAppointmentDescription.trim()}.`;
            }

            if (ticketId && isAgentMode) { // Only send system message to ticket in agent mode
                await sendSystemMessageToTicket(
                    message,
                    'coupon_qr',
                    {
                        codeType: newGeneratedCodeData.type,
                        codeValue: newGeneratedCodeData.value,
                        partnerName: newGeneratedCodeData.partnerName,
                        appointmentDate: newGeneratedCodeData.appointmentDate,
                        clientNames: newGeneratedCodeData.clientNames,
                        description: newGeneratedCodeData.description,
                        imageURL: qrCodeImageUrl,
                        ticketId: ticketId
                    }
                );
            }

            onBookingSuccess({
                id: editingAppointment ? editingAppointment.id : primaryAppointmentDocRef.id,
                appointmentId: editingAppointment ? editingAppointment.id : primaryAppointmentDocRef.id,
                ...appointmentData,
                appointmentDateTime: combinedDateTime.toISOString(),
                createdAt: editingAppointment ? editingAppointment.createdAt : new Date(),
            });
            onClose();
            resetForm();
        } catch (error) {
            console.error("ERROR: Erreur lors de la prise/modification de rendez-vous:", error);
            Alert.alert("Erreur", "Impossible de traiter le rendez-vous. " + error.message);
        } finally {
            setIsProcessingBooking(false);
        }
    };

    const formatDateTime = (date) => {
        if (!date) return 'N/A';
        try {
            let d = date;
            if (date.toDate) {
                d = date.toDate();
            } else if (typeof date === 'string') {
                d = new Date(date);
            }
            return d.toLocaleDateString('fr-FR') + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        } catch (e) {
            console.error("Error formatting date/time:", e);
            return 'Date/Heure invalide';
        }
    };

    return (
        <Modal
            animationType="slide"
            transparent={true}
            visible={isVisible}
            onRequestClose={onClose}
        >
            <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                style={styles.modalBackground}
            >
                <View style={styles.modalContent}>
                    <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                        <Ionicons name="close-circle-outline" size={30} color="#EF4444" />
                    </TouchableOpacity>
                    <Text style={styles.modalTitle}>
                        {editingAppointment ? 'Modifier le Rendez-vous' : 'Prendre un Rendez-vous'}
                    </Text>
                    <Text style={styles.modalSubtitle}>
                        Veuillez remplir les détails ci-dessous.
                    </Text>

                    <FlatList
                        data={[]}
                        ListEmptyComponent={<View />}
                        ListHeaderComponent={() => (
                            <>
                                {/* Only show ticket info if in agent mode */}
                                {isAgentMode && isLoadingTicketData ? (
                                    <ActivityIndicator size="small" color="#0a8fdf" style={{ marginBottom: 15 }} />
                                ) : (
                                    isAgentMode && currentTicketData && (
                                        <View style={styles.ticketInfoContainer}>
                                            <Text style={styles.ticketInfoTitle}>Informations du Ticket Associé:</Text>
                                            <Text style={styles.ticketInfoText}>**Sujet:** {currentTicketData.subject || 'N/A'}</Text>
                                            <Text style={styles.ticketInfoText}>**Statut:** {currentTicketData.status || 'N/A'}</Text>
                                            <Text style={styles.ticketInfoText}>**Créé par:** {currentTicketData.creatorName || 'N/A'}</Text>
                                            <Text style={styles.ticketInfoText}>**Client du ticket:** {actualClientName} (ID: {actualClientUid || 'N/A'})</Text>
                                            {actualClientPhone && <Text style={styles.ticketInfoText}>**Téléphone du ticket:** {actualClientPhone}</Text>}
                                        </View>
                                    )
                                )}

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Sélectionnez un partenaire:</Text>
                                    <View style={styles.pickerContainer}>
                                        <Picker
                                            selectedValue={selectedPartner?.id || ''}
                                            onValueChange={(itemValue) => {
                                                const partner = allPartners.find(p => p.id === itemValue);
                                                setSelectedPartner(partner);
                                            }}
                                            style={styles.picker}
                                            enabled={!isProcessingBooking}
                                        >
                                            <Picker.Item label="-- Choisissez un partenaire --" value="" style={styles.pickerPlaceholder} />
                                            {allPartners.map(partner => (
                                                <Picker.Item key={partner.id} label={`${partner.nom} (${partner.categorie})`} value={partner.id} />
                                            ))}
                                        </Picker>
                                    </View>
                                    {selectedPartner && (
                                        <Text style={styles.selectedPartnerDisplay}>
                                            Vous avez sélectionné: **{selectedPartner.nom}** ({selectedPartner.categorie})
                                        </Text>
                                    )}
                                </View>

                                {/* Only show client selection dropdown in agent mode */}
                                {isAgentMode && (
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Sélectionnez le client principal du rendez-vous:</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Rechercher un client par nom, email ou téléphone"
                                            value={clientSearchText}
                                            onChangeText={(text) => {
                                                setClientSearchText(text);
                                                if (selectedClient && selectedClient.name !== text) {
                                                    setSelectedClient(null);
                                                }
                                            }}
                                            editable={!isProcessingBooking}
                                        />
                                        {isSearchingClients && <ActivityIndicator size="small" color="#0a8fdf" style={{ marginTop: 5 }} />}
                                        {clientSearchText.length > 0 && !selectedClient && filteredClients.length > 0 && (
                                            <View style={styles.clientSearchResultsContainer}>
                                                <FlatList
                                                    data={filteredClients.slice(0, 5)}
                                                    keyExtractor={(item) => item.id}
                                                    renderItem={({ item }) => (
                                                        <TouchableOpacity
                                                            style={styles.clientSearchResultItem}
                                                            onPress={() => {
                                                                setSelectedClient(item);
                                                                setClientSearchText(item.name);
                                                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                            }}
                                                        >
                                                            <Text style={styles.clientSearchResultTextBold}>{item.name}</Text>
                                                            {item.email && <Text style={styles.clientSearchResultText}>Email: {item.email}</Text>}
                                                            {item.phone && <Text style={styles.clientSearchResultText}>Tél: {item.phone}</Text>}
                                                        </TouchableOpacity>
                                                    )}
                                                    keyboardShouldPersistTaps="handled"
                                                />
                                            </View>
                                        )}
                                        {selectedClient && (
                                            <View style={styles.selectedClientDisplayContainer}>
                                                <Text style={styles.selectedClientDisplayText}>
                                                    Client sélectionné: **{selectedClient.name}**
                                                    {selectedClient.email && `\nEmail: ${selectedClient.email}`}
                                                    {selectedClient.phone && `\nTél: ${selectedClient.phone}`}
                                                </Text>
                                                <TouchableOpacity onPress={() => { setSelectedClient(null); setClientSearchText(''); }} disabled={isProcessingBooking}>
                                                    <Ionicons name="close-circle" size={20} color="#EF4444" style={{ marginLeft: 10 }} />
                                                </TouchableOpacity>
                                            </View>
                                        )}
                                        {clientSearchText.length > 0 && !selectedClient && filteredClients.length === 0 && !isSearchingClients && (
                                            <Text style={styles.noResultsText}>Aucun client trouvé.</Text>
                                        )}
                                    </View>
                                )}
                                {/* In client mode, if selectedClient exists (i.e., currentUser), display it */}
                                {!isAgentMode && selectedClient && (
                                    <View style={styles.inputGroup}>
                                        <Text style={styles.inputLabel}>Client principal du rendez-vous:</Text>
                                        <View style={styles.selectedClientDisplayContainer}>
                                            <Text style={styles.selectedClientDisplayText}>
                                                **{selectedClient.name}**
                                                {selectedClient.email && `\nEmail: ${selectedClient.email}`}
                                                {selectedClient.phone && `\nTél: ${selectedClient.phone}`}
                                            </Text>
                                        </View>
                                    </View>
                                )}

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Noms des participants supplémentaires:</Text>
                                    {formClientNames.map((client, index) => (
                                        <View key={client.id} style={styles.clientNameInputWrapper}>
                                            <TextInput
                                                style={styles.input}
                                                placeholder={`Nom du participant ${index + 1}`}
                                                value={client.name}
                                                onChangeText={(text) => updateClientNameFormField(client.id, text)}
                                                editable={!isProcessingBooking}
                                                autoCapitalize="words"
                                            />
                                            {formClientNames.length > 1 && (
                                                <TouchableOpacity onPress={() => removeClientNameFormField(client.id)} disabled={isProcessingBooking}>
                                                    <Ionicons name="close-circle" size={24} color="#FF3B30" style={{ marginLeft: 10 }} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ))}
                                    <TouchableOpacity onPress={addClientNameFormField} style={styles.addClientButton} disabled={isProcessingBooking}>
                                        <Ionicons name="add-circle-outline" size={20} color="#0a8fdf" />
                                        <Text style={styles.addClientButtonText}>Ajouter un autre participant</Text>
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Date du rendez-vous:</Text>
                                    <Pressable onPress={() => setShowFormDatePicker(true)} style={styles.dateTimeInput} disabled={isProcessingBooking}>
                                        <Text style={styles.dateTimeText}>{formAppointmentDate.toLocaleDateString('fr-FR')}</Text>
                                        <Ionicons name="calendar-outline" size={20} color="#4A5568" />
                                    </Pressable>
                                    {showFormDatePicker && (
                                        <DateTimePicker
                                            value={formAppointmentDate}
                                            mode="date"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'} // Use spinner for iOS
                                            onChange={onFormDateChange}
                                        />
                                    )}
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Heure du rendez-vous:</Text>
                                    <Pressable onPress={() => setShowFormTimePicker(true)} style={styles.dateTimeInput} disabled={isProcessingBooking}>
                                        <Text style={styles.dateTimeText}>{formAppointmentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                                        <Ionicons name="time-outline" size={20} color="#4A5568" />
                                    </Pressable>
                                    {showFormTimePicker && (
                                        <DateTimePicker
                                            value={formAppointmentTime}
                                            mode="time"
                                            display={Platform.OS === 'ios' ? 'spinner' : 'default'} // Use spinner for iOS
                                            onChange={onFormTimeChange}
                                        />
                                    )}
                                </View>

                                <View style={styles.inputGroup}>
                                    <Text style={styles.inputLabel}>Description du rendez-vous (optionnel):</Text>
                                    <TextInput
                                        style={[styles.input, styles.descriptionInput]}
                                        placeholder="Décrivez le rendez-vous (Ex: Réunion préparatoire, Suivi de projet...)"
                                        multiline
                                        numberOfLines={4}
                                        value={formAppointmentDescription}
                                        onChangeText={setFormAppointmentDescription}
                                        editable={!isProcessingBooking}
                                        textAlignVertical="top"
                                    />
                                </View>

                                {generatedCode && typeof generatedCode.qrContent === 'string' && generatedCode.qrContent.length > 0 && (
                                    <ViewShot ref={qrCodeViewShotRef} options={{ format: "jpg", quality: 0.9 }} style={styles.qrCodeSection}>
                                        <Text style={styles.qrCodeTitle}>Aperçu du Code QR</Text>
                                        <View style={styles.qrCodeWrapper}>
                                            <QRCode
                                                value={generatedCode.qrContent}
                                                size={width * 0.4}
                                                color="black"
                                                backgroundColor="white"
                                            />
                                        </View>
                                        <Text style={styles.qrCodeDetails}>Code: {generatedCode.value}</Text>
                                        <Text style={styles.qrCodeDetails}>Partenaire: {generatedCode.partnerName}</Text>
                                    </ViewShot>
                                )}
                            </>
                        )}
                        renderItem={null}
                        contentContainerStyle={styles.scrollContent}
                        scrollEnabled={true}
                        showsVerticalScrollIndicator={true}
                        keyboardShouldPersistTaps="handled" 
                    />

                    <TouchableOpacity
                        onPress={handleBookingSubmission}
                        style={[styles.submitButton, isProcessingBooking && styles.disabledButton]}
                        disabled={isProcessingBooking}
                    >
                        {isProcessingBooking ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Text style={styles.submitButtonText}>
                                {editingAppointment ? 'Mettre à jour le Rendez-vous' : 'Confirmer le Rendez-vous'}
                            </Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => { onClose(); resetForm(); }}
                        style={[styles.cancelButton, isProcessingBooking && styles.disabledButton]}
                        disabled={isProcessingBooking}
                    >
                        <Text style={styles.cancelButtonText}>Annuler</Text>
                    </TouchableOpacity>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

const styles = StyleSheet.create({
    modalBackground: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    modalContent: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        width: '90%',
        maxHeight: '85%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 6,
    },
    scrollContent: {
        flexGrow: 1,
        paddingBottom: 20,
    },
    closeButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1,
        padding: 5,
    },
    modalTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#2D3748',
        marginBottom: 8,
        textAlign: 'center',
    },
    modalSubtitle: {
        fontSize: 15,
        color: '#4A5568',
        marginBottom: 15,
        textAlign: 'center',
        fontWeight: '500',
    },
    inputGroup: {
        marginBottom: 20,
    },
    inputLabel: {
        fontSize: 15,
        color: '#4A5568',
        marginBottom: 8,
        fontWeight: '600',
    },
    input: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#CBD5E0',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 15,
        fontSize: 16,
        color: '#2D3748',
        backgroundColor: '#F7FAFC',
    },
    pickerContainer: {
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#CBD5E0',
        borderRadius: 10,
        marginBottom: 10,
        backgroundColor: '#F7FAFC',
        overflow: 'hidden',
        justifyContent: 'center',
    },
    picker: {
        height: 50,
        width: '100%',
        color: '#2D3748',
        paddingHorizontal: 10, // Added padding
    },
    pickerPlaceholder: {
        color: '#9CA3AF',
    },
    selectedPartnerDisplay: {
        fontSize: 14,
        color: '#0a8fdf',
        textAlign: 'center',
        marginTop: 5,
        fontWeight: 'bold',
    },
    clientNameInputWrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    addClientButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 10,
        backgroundColor: '#EBF3F8',
        marginTop: 5,
        borderWidth: 1,
        borderColor: '#0a8fdf',
    },
    addClientButtonText: {
        color: '#0a8fdf',
        marginLeft: 8,
        fontWeight: '600',
        fontSize: 15,
    },
    dateTimeInput: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#CBD5E0',
        borderRadius: 10,
        paddingVertical: 12,
        paddingHorizontal: 15,
        backgroundColor: '#F7FAFC',
        marginBottom: 10,
    },
    dateTimeText: {
        fontSize: 16,
        color: '#2D3748',
    },
    descriptionInput: {
        minHeight: 100,
        textAlignVertical: 'top',
    },
    submitButton: {
        backgroundColor: '#0a8fdf',
        borderRadius: 12,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#0a8fdf',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
        elevation: 10,
        marginTop: 20,
    },
    submitButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
    disabledButton: {
        opacity: 0.7,
        elevation: 0,
        shadowOpacity: 0,
    },
    cancelButton: {
        backgroundColor: '#6B7280',
        borderRadius: 12,
        paddingVertical: 12,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 10,
    },
    cancelButtonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
    qrCodeSection: {
        backgroundColor: '#F7FAFC',
        padding: 15,
        borderRadius: 12,
        marginTop: 20,
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
    },
    qrCodeTitle: {
        fontSize: 18,
        fontWeight: '700',
        marginBottom: 10,
        color: '#2D3748',
        textAlign: 'center',
    },
    qrCodeWrapper: {
        padding: 10,
        backgroundColor: '#FFFFFF',
        borderRadius: 8,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#E2E8F0',
    },
    qrCodeDetails: {
        fontSize: 14,
        color: '#4A5568',
        marginTop: 8,
        textAlign: 'center',
        fontWeight: '500',
    },
    ticketInfoContainer: {
        backgroundColor: '#e6f7ff',
        borderRadius: 10,
        padding: 15,
        marginBottom: 20,
        borderLeftWidth: 5,
        borderColor: '#0a8fdf',
    },
    ticketInfoTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#0a8fdf',
        marginBottom: 8,
    },
    ticketInfoText: {
        fontSize: 14,
        color: '#4A5568',
        marginBottom: 4,
    },
    clientSearchResultsContainer: {
        maxHeight: 150,
        borderColor: '#CBD5E0',
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: 10,
        marginTop: 5,
        backgroundColor: '#F7FAFC',
        overflow: 'hidden',
    },
    clientSearchResultItem: {
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E2E8F0',
    },
    clientSearchResultTextBold: {
        fontSize: 16,
        color: '#2D3748',
        fontWeight: '600',
    },
    clientSearchResultText: {
        fontSize: 14,
        color: '#4A5568',
        marginTop: 2,
    },
    selectedClientDisplayContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#e6f7ff',
        borderRadius: 10,
        padding: 10,
        marginTop: 10,
        borderWidth: 1,
        borderColor: '#0a8fdf',
    },
    selectedClientDisplayText: {
        flex: 1,
        fontSize: 15,
        color: '#0a8fdf',
        fontWeight: 'bold',
    },
    noResultsText: {
        fontSize: 14,
        color: '#EF4444',
        textAlign: 'center',
        marginTop: 10,
    },
});

export default AppointmentFormModal;
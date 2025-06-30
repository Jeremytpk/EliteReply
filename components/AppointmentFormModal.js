// components/AppointmentFormModal.js
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
    Dimensions, // Import Dimensions for width
    ScrollView // Import ScrollView
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
    arrayUnion,
    arrayRemove, // Keep for potential use if specific array updates are needed
    getDocs,
    query,
    orderBy,
    getDoc, // Added getDoc for ticket update logic
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import QRCode from 'react-native-qrcode-svg';
import ViewShot from 'react-native-view-shot';

import { db, auth, storage } from '../firebase'; // Adjust path if necessary
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

// Enable LayoutAnimation for Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window'); // Get window width for QR code sizing

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
    onBookingSuccess, // Callback with new/updated appointment data
    ticketId,
    initialUserId,
    initialUserName,
    userPhone,
    allPartners, // Pass the full list of partners
    editingAppointment // Pass the appointment object if in edit mode
}) => {
    const currentUser = auth.currentUser;
    // Determine actual client UID and Name based on context (from Conversation or IT Support directly)
    const actualClientUid = initialUserId || currentUser?.uid;
    const actualClientName = initialUserName || currentUser?.displayName || 'Client';

    const [selectedPartner, setSelectedPartner] = useState(null);
    const [formClientNames, setFormClientNames] = useState([{ id: Date.now(), name: '' }]);
    const [formAppointmentDate, setFormAppointmentDate] = useState(new Date());
    const [formAppointmentTime, setFormAppointmentTime] = useState(new Date());
    const [showFormDatePicker, setShowFormDatePicker] = useState(false);
    const [showFormTimePicker, setShowFormTimePicker] = useState(false);
    const [formAppointmentDescription, setFormAppointmentDescription] = useState('');
    const [isProcessingBooking, setIsProcessingBooking] = useState(false); // Indicates if booking/update is in progress

    const [generatedCode, setGeneratedCode] = useState(null); // State to hold generated QR code data
    const qrCodeViewShotRef = useRef(); // Ref for ViewShot

    // Effect to pre-fill form if editing an existing appointment
    useEffect(() => {
        if (editingAppointment && allPartners.length > 0) {
            console.log("AppointmentFormModal: In EDIT mode. Pre-filling form.");
            const partner = allPartners.find(p => p.id === editingAppointment.partnerId);
            setSelectedPartner(partner || null);

            setFormClientNames((editingAppointment.clientNames || []).map((name, index) => ({ id: `${editingAppointment.id}-${index}`, name: name })));

            // Ensure date/time are proper Date objects
            const apptDateTime = editingAppointment.appointmentDateTime ? new Date(editingAppointment.appointmentDateTime) : new Date();
            setFormAppointmentDate(apptDateTime);
            setFormAppointmentTime(apptDateTime);
            setFormAppointmentDescription(editingAppointment.description || '');

            // Pre-fill generated QR code data if available for display/re-capture
            if (editingAppointment.codeData) {
                setGeneratedCode({
                    type: editingAppointment.codeData.type,
                    value: editingAppointment.codeData.value,
                    qrContent: editingAppointment.codeData.qrContent,
                    partnerName: editingAppointment.partnerName,
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
            // Reset form when opening for new booking (no editingAppointment)
            console.log("AppointmentFormModal: In CREATE mode. Resetting form.");
            resetForm();
        }
    }, [editingAppointment, allPartners]); // Re-run if editingAppointment or allPartners change

    // Reset form fields
    const resetForm = useCallback(() => {
        setSelectedPartner(null);
        setFormClientNames([{ id: Date.now(), name: '' }]);
        setFormAppointmentDate(new Date());
        setFormAppointmentTime(new Date());
        setFormAppointmentDescription('');
        setGeneratedCode(null);
    }, []);

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

    // Helper to send system message to the ticket
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


    // Function to generate QR Code data (now returns the object)
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

        const partnerFirstNameInitial = selectedPartner.name ? selectedPartner.name[0].toUpperCase() : '';
        const partnerLastNameInitial = selectedPartner.name && selectedPartner.name.split(' ').length > 1
            ? selectedPartner.name.split(' ').pop()[0].toUpperCase()
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

        const qrContent = JSON.stringify({
            code: codeValue,
            type: 'qr',
            partner: selectedPartner.name,
            category: selectedPartner.category || 'N/A',
            clients: validClientNames.map(cn => cn.name),
            date: combinedDateTime.toLocaleDateString('fr-FR'),
            time: combinedDateTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
            description: formAppointmentDescription || 'N/A',
            bookedBy: currentUser?.displayName || 'Agent',
            ticketId: ticketId || 'N/A'
        });

        const newGeneratedCode = {
            type: 'qr',
            value: codeValue,
            qrContent: qrContent,
            partnerName: selectedPartner.name,
            clientNames: validClientNames.map(cn => cn.name),
            appointmentDate: combinedDateTime.toISOString(),
            appointmentTime: combinedDateTime.toISOString(),
            description: formAppointmentDescription,
        };

        setGeneratedCode(newGeneratedCode); // Update local state for display
        return newGeneratedCode;
    }, [selectedPartner, formClientNames, formAppointmentDate, formAppointmentTime, formAppointmentDescription, currentUser?.displayName, ticketId]);


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

        setIsProcessingBooking(true);

        const combinedDateTime = new Date(
            formAppointmentDate.getFullYear(),
            formAppointmentDate.getMonth(),
            formAppointmentDate.getDate(),
            formAppointmentTime.getHours(),
            formAppointmentTime.getMinutes()
        );

        try {
            // 1. Generate QR Code data
            const newGeneratedCodeData = generateQRCodeData();
            if (!newGeneratedCodeData) {
                // If generateQRCodeData returned null (e.g. due to missing partner/client names validation failed there)
                throw new Error("Échec de la génération du code QR. Vérifiez les informations saisies.");
            }

            // Allow UI to update and QR code to render before capturing
            // This is crucial for ViewShot to capture the rendered QR code
            // Give it a slightly longer timeout to be safe given past issues
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
                    setGeneratedCode(prev => ({ ...prev, imageURL: qrCodeImageUrl })); // Update state with actual URL
                } catch (captureError) {
                    console.error("ERROR: Failed to capture or upload QR Code image:", captureError);
                    // Continue without image if capture fails, but log the error
                    Alert.alert("Avertissement", "Échec de la capture ou du téléchargement du code QR. Le rendez-vous sera quand même enregistré.");
                }
            } else {
                console.warn("WARN: QR Code ref not available for capture in AppointmentFormModal.");
            }

            const appointmentData = {
                ticketId: ticketId || null,
                clientId: actualClientUid,
                clientName: actualClientName,
                clientPhone: userPhone || null,
                appointmentDateTime: combinedDateTime,
                clientNames: validClientNames.map(cn => cn.name),
                partnerId: selectedPartner.id, // This is already correctly here for top-level collection
                partnerName: selectedPartner.name,
                description: formAppointmentDescription.trim(),
                status: 'scheduled',
                bookedByAgentId: currentUser?.uid,
                bookedByAgentName: currentUser?.displayName || 'Agent',
                createdAt: serverTimestamp(), // Use server timestamp for new bookings
                codeData: {
                    type: newGeneratedCodeData.type,
                    value: newGeneratedCodeData.value,
                    qrContent: newGeneratedCodeData.qrContent
                },
                codeImageUrl: qrCodeImageUrl,
            };

            let primaryAppointmentDocRef; // Declare outside conditional for scope

            if (editingAppointment) {
                // UPDATE EXISTING APPOINTMENT
                const rdvDocRef = doc(db, 'appointments', editingAppointment.id);
                await updateDoc(rdvDocRef, { ...appointmentData, lastUpdated: serverTimestamp() });

                // Update in partner's subcollection (use editingAppointment.partnerId for original location if partner changed)
                const partnerApptDocRef = doc(db, 'partners', editingAppointment.partnerId, 'rdv_reservation', editingAppointment.appointmentId);
                const partnerApptSnap = await getDoc(partnerApptDocRef); // Check if it exists before updating
                if (partnerApptSnap.exists()) {
                    await updateDoc(partnerApptDocRef, { ...appointmentData, lastUpdated: serverTimestamp() });
                } else {
                    console.warn(`DEBUG: Appointment not found in original partner's (${editingAppointment.partnerId}) rdv_reservation subcollection. Attempting to add to new partner's if different.`);
                    // If partner changed, and the original wasn't found, try adding to new partner
                    if (editingAppointment.partnerId !== selectedPartner.id) {
                        await addDoc(collection(db, 'partners', selectedPartner.id, 'rdv_reservation'), {
                            ...appointmentData,
                            appointmentId: editingAppointment.id // Keep top-level ID consistent
                        });
                        console.log("DEBUG: Re-added appointment to new partner's rdv_reservation subcollection after partner change.");
                    }
                }

                // Update the ticket's appointments array
                if (ticketId) {
                    const ticketDocRef = doc(db, 'tickets', ticketId);
                    const ticketSnapshot = await getDoc(ticketDocRef);
                    if (ticketSnapshot.exists()) {
                        const currentAppointmentsInTicket = ticketSnapshot.data().appointments || [];
                        const updatedAppointments = currentAppointmentsInTicket.map(appt => {
                            if (appt.appointmentId === editingAppointment.appointmentId) {
                                return {
                                    ...appt, // Keep existing fields from the ticket's array, then update specifics
                                    partnerId: selectedPartner.id,
                                    partnerName: selectedPartner.name,
                                    appointmentDateTime: combinedDateTime.toISOString(), // Ensure ISO string for consistency
                                    clientNames: validClientNames.map(cn => cn.name),
                                    description: formAppointmentDescription.trim(),
                                    codeData: { type: newGeneratedCodeData.type, value: newGeneratedCodeData.value, qrContent: newGeneratedCodeData.qrContent },
                                    codeImageUrl: qrCodeImageUrl,
                                };
                            }
                            return appt;
                        });
                        await updateDoc(ticketDocRef, { appointments: updatedAppointments, lastUpdated: serverTimestamp() });
                    }
                }
                Alert.alert("Succès", "Rendez-vous mis à jour et QR Code régénéré!");
                primaryAppointmentDocRef = doc(db, 'appointments', editingAppointment.id); // Assign the reference for consistent onBookingSuccess
            } else {
                // BOOK NEW APPOINTMENT
                primaryAppointmentDocRef = await addDoc(collection(db, 'appointments'), appointmentData);
                await addDoc(collection(db, 'partners', selectedPartner.id, 'rdv_reservation'), {
                    ...appointmentData,
                    appointmentId: primaryAppointmentDocRef.id // Link to top-level ID
                });

                // Update ticket document (if in ticket context)
                if (ticketId) {
                    await updateDoc(doc(db, 'tickets', ticketId), {
                        appointments: arrayUnion({
                            id: primaryAppointmentDocRef.id, // Primary ID from global appointments collection
                            appointmentId: primaryAppointmentDocRef.id, // For consistency
                            // --- START FIX ---
                            partnerId: selectedPartner.id, // <-- ADDED THIS LINE!
                            // --- END FIX ---
                            partnerName: selectedPartner.name,
                            appointmentDateTime: combinedDateTime.toISOString(), // Ensure ISO string
                            status: 'scheduled',
                            clientNames: validClientNames.map(cn => cn.name),
                            description: formAppointmentDescription.trim(),
                            codeData: { type: newGeneratedCodeData.type, value: newGeneratedCodeData.value, qrContent: newGeneratedCodeData.qrContent },
                            codeImageUrl: qrCodeImageUrl,
                        }),
                        lastUpdated: serverTimestamp(),
                    });
                }
                Alert.alert("Succès", "Rendez-vous pris avec succès et QR Code généré!");
            }

            // Send system message to chat
            let message = '';
            if (editingAppointment) {
                message = `Le rendez-vous avec ${selectedPartner.name} pour ${validClientNames.join(', ')} a été mis à jour pour le ${moment(combinedDateTime).format('DD/MM/YYYY')} à ${moment(combinedDateTime).format('HH:mm')}.`;
            } else {
                message = `Votre rendez-vous avec ${selectedPartner.name} pour ${validClientNames.join(', ')} a été enregistré pour le ${moment(combinedDateTime).format('DD/MM/YYYY')} à ${moment(combinedDateTime).format('HH:mm')}.`;
            }
            if (formAppointmentDescription.trim()) {
                message += ` Description: ${formAppointmentDescription.trim()}.`;
            }

            if (ticketId) { // Only send system message if there's a ticket to send it to
                await sendSystemMessageToTicket(
                    message,
                    'coupon_qr', // Use coupon_qr type for QR messages in chat
                    {
                        codeType: newGeneratedCodeData.type,
                        codeValue: newGeneratedCodeData.value,
                        partnerName: newGeneratedCodeData.partnerName,
                        appointmentDate: newGeneratedCodeData.appointmentDate,
                        clientNames: newGeneratedCodeData.clientNames,
                        description: newGeneratedCodeData.description,
                        imageURL: qrCodeImageUrl, // This is the image of the QR code
                    }
                );
            }

            // Call onBookingSuccess with the relevant data for parent component to update its state/UI
            // Ensure the data structure passed back is consistent with what parent expects
            onBookingSuccess({
                id: editingAppointment ? editingAppointment.id : primaryAppointmentDocRef.id, // Top-level appointments ID
                appointmentId: editingAppointment ? editingAppointment.appointmentId : primaryAppointmentDocRef.id, // Subcollection ID (often same as top-level if new)
                ...appointmentData,
                // Ensure date/time are in consistent format for ticket array (ISO string usually)
                appointmentDateTime: combinedDateTime.toISOString(),
                createdAt: editingAppointment ? editingAppointment.createdAt : new Date(), // Keep original createdAt for edits
            });
            onClose(); // Close modal on success
            resetForm(); // Reset for next use
        } catch (error) {
            console.error("ERROR: Erreur lors de la prise/modification de rendez-vous:", error);
            Alert.alert("Erreur", "Impossible de traiter le rendez-vous. " + error.message);
        } finally {
            setIsProcessingBooking(false);
        }
    };


    // Helper for displaying appointment date/time (remains unchanged from previous version for consistency)
    const formatDateTime = (date) => {
        if (!date) return 'N/A';
        try {
            let d = date;
            if (date.toDate) { // Check if it's a Firestore Timestamp object
                d = date.toDate();
            } else if (typeof date === 'string') { // If it's an ISO string
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
                <View style={styles.embeddedFormContainerModal}>
                    <TouchableOpacity onPress={onClose} style={styles.closeModalButton}>
                        <Ionicons name="close-circle-outline" size={30} color="#EF4444" />
                    </TouchableOpacity>
                    <Text style={styles.embeddedFormTitle}>
                        {editingAppointment ? 'Modifier le Rendez-vous' : 'Prendre un Rendez-vous'}
                    </Text>
                    <Text style={styles.embeddedFormSubtitle}>Veuillez remplir les détails ci-dessous.</Text>

                    {/* Make content scrollable */}
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <Text style={styles.formLabel}>Sélectionnez un partenaire:</Text>
                        <View style={styles.pickerContainer}>
                            <Picker
                                selectedValue={selectedPartner?.id || ''}
                                onValueChange={(itemValue) => {
                                    const partner = allPartners.find(p => p.id === itemValue);
                                    setSelectedPartner(partner);
                                }}
                                style={styles.picker}
                                enabled={!isProcessingBooking} // Disable while booking
                            >
                                <Picker.Item label="-- Choisissez un partenaire --" value="" />
                                {allPartners.map(partner => (
                                    <Picker.Item key={partner.id} label={`${partner.name} (${partner.category})`} value={partner.id} />
                                ))}
                            </Picker>
                        </View>
                        {selectedPartner && (
                            <Text style={styles.selectedPartnerText}>
                                Vous avez sélectionné: **{selectedPartner.name}** ({selectedPartner.category})
                            </Text>
                        )}

                        <Text style={styles.formLabel}>Noms des clients:</Text>
                        {formClientNames.map((client, index) => (
                            <View key={client.id} style={styles.clientNameInputContainer}>
                                <TextInput
                                    style={styles.formInput}
                                    placeholder={`Nom du client ${index + 1}`}
                                    value={client.name}
                                    onChangeText={(text) => updateClientNameFormField(client.id, text)}
                                    editable={!isProcessingBooking}
                                />
                                {formClientNames.length > 1 && (
                                    <TouchableOpacity onPress={() => removeClientNameFormField(client.id)} disabled={isProcessingBooking}>
                                        <Ionicons name="close-circle" size={24} color="#FF3B30" style={{ marginLeft: 10 }} />
                                    </TouchableOpacity>
                                )}
                            </View>
                        ))}
                        <TouchableOpacity onPress={addClientNameFormField} style={styles.addClientButton} disabled={isProcessingBooking}>
                            <Ionicons name="add-circle" size={20} color="#34C759" />
                            <Text style={styles.addClientButtonText}>Ajouter un autre nom</Text>
                        </TouchableOpacity>

                        <Text style={styles.formLabel}>Date du rendez-vous:</Text>
                        <Pressable onPress={() => setShowFormDatePicker(true)} style={styles.dateTimeDisplay} disabled={isProcessingBooking}>
                            <Text>{formAppointmentDate.toLocaleDateString('fr-FR')}</Text>
                            <Ionicons name="calendar-outline" size={20} color="#34C759" />
                        </Pressable>
                        {showFormDatePicker && (
                            <DateTimePicker
                                value={formAppointmentDate}
                                mode="date"
                                display="default"
                                onChange={onFormDateChange}
                            />
                        )}

                        <Text style={styles.formLabel}>Heure du rendez-vous:</Text>
                        <Pressable onPress={() => setShowFormTimePicker(true)} style={styles.dateTimeDisplay} disabled={isProcessingBooking}>
                            <Text>{formAppointmentTime.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Text>
                            <Ionicons name="time-outline" size={20} color="#34C759" />
                        </Pressable>
                        {showFormTimePicker && (
                            <DateTimePicker
                                value={formAppointmentTime}
                                mode="time"
                                display="default"
                                onChange={onFormTimeChange}
                            />
                        )}

                        <Text style={styles.formLabel}>Description du rendez-vous (optionnel):</Text>
                        <TextInput
                            style={[styles.formInput, styles.descriptionInput]}
                            placeholder="Ex: Réunion préparatoire, Suivi de projet..."
                            multiline
                            numberOfLines={4}
                            value={formAppointmentDescription}
                            onChangeText={setFormAppointmentDescription}
                            editable={!isProcessingBooking}
                        />

                        {/* QR Code Preview Section - Now with robust rendering condition */}
                        {generatedCode && typeof generatedCode.qrContent === 'string' && generatedCode.qrContent.length > 0 && (
                            <ViewShot ref={qrCodeViewShotRef} options={{ format: "jpg", quality: 0.9 }} style={styles.generatedCodeContainer}>
                                <Text style={styles.generatedCodeTitle}>Aperçu du Code QR</Text>
                                <View style={styles.qrCodeWrapper}>
                                    <QRCode
                                        value={generatedCode.qrContent} // This should now always be a string
                                        size={width * 0.4}
                                        color="black"
                                        backgroundColor="white"
                                    />
                                </View>
                                <Text style={styles.generatedCodeDetails}>Code: {generatedCode.value}</Text>
                                <Text style={styles.generatedCodeDetails}>Partenaire: {generatedCode.partnerName}</Text>
                            </ViewShot>
                        )}
                    </ScrollView> {/* End ScrollView */}

                    <TouchableOpacity
                        onPress={handleBookingSubmission}
                        style={[styles.formSubmitButton, isProcessingBooking && { opacity: 0.7 }]}
                        disabled={isProcessingBooking}
                    >
                        {isProcessingBooking ? (
                            <ActivityIndicator size="small" color="#FFF" />
                        ) : (
                            <Text style={styles.formSubmitButtonText}>
                                {editingAppointment ? 'Mettre à jour le Rendez-vous' : 'Confirmer le Rendez-vous'}
                            </Text>
                        )}
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => { onClose(); resetForm(); }}
                        style={styles.formCancelButton}
                        disabled={isProcessingBooking}
                    >
                        <Text style={styles.formCancelButtonText}>Annuler</Text>
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
    embeddedFormContainerModal: {
        backgroundColor: '#E6F7FF',
        borderRadius: 10,
        padding: 20,
        width: '90%',
        maxHeight: '85%', // Allows content to scroll if it exceeds this height
        borderColor: '#B3E5FC',
        borderWidth: 1,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    scrollContent: { // Style for ScrollView content container
        flexGrow: 1, // Allows content to grow within the ScrollView
        paddingBottom: 20, // Add some padding at the bottom of the scrollable area
    },
    closeModalButton: {
        position: 'absolute',
        top: 10,
        right: 10,
        zIndex: 1,
        padding: 5,
    },
    embeddedFormTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#01579B',
        marginBottom: 8,
        textAlign: 'center',
    },
    embeddedFormSubtitle: {
        fontSize: 14,
        color: '#424242',
        marginBottom: 15,
        textAlign: 'center',
    },
    formLabel: {
        fontSize: 14,
        fontWeight: '600',
        color: '#2C2C2C',
        marginTop: 10,
        marginBottom: 5,
    },
    pickerContainer: {
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        marginBottom: 10,
        backgroundColor: '#FFF',
        overflow: 'hidden',
    },
    picker: {
        height: 50,
        width: '100%',
    },
    selectedPartnerText: {
        fontSize: 14,
        color: '#01579B',
        textAlign: 'center',
        marginBottom: 10,
        fontWeight: 'bold',
    },
    clientNameInputContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 5,
    },
    formInput: {
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 10,
        fontSize: 14,
        backgroundColor: '#FFF',
        marginBottom: 5,
        flex: 1,
    },
    addClientButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: '#E6F7ED',
        marginTop: 5,
        borderWidth: 1,
        borderColor: '#34C759',
    },
    addClientButtonText: {
        color: '#34C759',
        marginLeft: 5,
        fontWeight: 'bold',
    },
    dateTimeDisplay: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#D1D5DB',
        borderRadius: 8,
        padding: 10,
        backgroundColor: '#FFF',
        marginBottom: 10,
    },
    descriptionInput: {
        minHeight: 80,
        textAlignVertical: 'top',
    },
    formSubmitButton: {
        backgroundColor: '#007AFF',
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 20,
    },
    formSubmitButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    formCancelButton: {
        backgroundColor: '#6B7280',
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        marginTop: 10,
    },
    formCancelButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 14,
    },
    generatedCodeContainer: {
        backgroundColor: '#F0F8FF',
        padding: 10,
        borderRadius: 10,
        marginTop: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#AEE2FF',
    },
    generatedCodeTitle: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 8,
        color: '#0D47A1',
        textAlign: 'center',
    },
    qrCodeWrapper: {
        padding: 8,
        backgroundColor: '#FFF',
        borderRadius: 5,
    },
    generatedCodeDetails: {
        fontSize: 13,
        color: '#4A4A40',
        marginTop: 5,
        textAlign: 'center',
    },
});

export default AppointmentFormModal;
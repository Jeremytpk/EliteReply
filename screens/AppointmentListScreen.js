// screens/AppointmentListScreen.js
import React, { useState, useEffect, useCallback } from 'react';
import {
    View,
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    KeyboardAvoidingView,
    Platform,
    ActivityIndicator,
    FlatList,
    Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, onSnapshot, query } from 'firebase/firestore'; // Import query
import { db } from '../firebase'; // Ensure correct path to your firebase config
import moment from 'moment';
import 'moment/locale/fr';

moment.locale('fr');

const AppointmentListScreen = ({ navigation, route }) => {
    // We'll fetch all appointments here
    const [allAppointments, setAllAppointments] = useState([]);
    const [loadingAppointments, setLoadingAppointments] = useState(true);

    const [searchText, setSearchText] = useState('');
    const [filteredAppointments, setFilteredAppointments] = useState([]);
    const [loadingSearch, setLoadingSearch] = useState(false);

    // Passed partners from AppointmentManager for context if needed for editing
    const { allPartners, loggedInAgentId, loggedInAgentName, ticketId, initialUserEmail } = route.params || {};

    // Helper function to format date/time
    const formatDateTime = useCallback((dateISOString) => {
        if (!dateISOString) return 'N/A';
        try {
            const date = new Date(dateISOString);
            if (isNaN(date.getTime())) {
                return 'Date invalide';
            }
            return moment(date).format('DD/MM/YYYY [à] HH:mm');
        } catch (e) {
            console.error("Error formatting date/time:", e);
            return 'Date/Heure invalide';
        }
    }, []);

    // Fetch ALL appointments in real-time
    useEffect(() => {
        setLoadingAppointments(true);
        const appointmentsCollectionRef = collection(db, 'appointments');
        const q = query(appointmentsCollectionRef); // Query to get all appointments

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const fetched = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            })).sort((a, b) => {
                const dateA = a.appointmentDateTime ? new Date(a.appointmentDateTime).getTime() : 0;
                const dateB = b.appointmentDateTime ? new Date(b.appointmentDateTime).getTime() : 0;
                return dateB - dateA;
            });
            setAllAppointments(fetched);
            setLoadingAppointments(false);
        }, (error) => {
            console.error("ERROR: Error fetching all appointments in AppointmentListScreen:", error);
            Alert.alert("Erreur de synchronisation", "Impossible de charger les rendez-vous.");
            setLoadingAppointments(false);
        });

        return () => unsubscribe();
    }, []); // Empty dependency array as it fetches all appointments

    // Filter appointments based on search text with debouncing
    useEffect(() => {
        setLoadingSearch(true);
        const handler = setTimeout(() => {
            const lowercasedSearchText = searchText.toLowerCase();
            const filtered = allAppointments.filter(appt => {
                const clientNamesMatch = appt.clientNames && appt.clientNames.some(name =>
                    name.toLowerCase().includes(lowercasedSearchText)
                );
                const clientEmailMatch = appt.clientEmail && appt.clientEmail.toLowerCase().includes(lowercasedSearchText);
                const clientNameMatch = appt.clientName && appt.clientName.toLowerCase().includes(lowercasedSearchText);
                const partnerNameMatch = appt.partnerNom && appt.partnerNom.toLowerCase().includes(lowercasedSearchText);
                const descriptionMatch = appt.description && appt.description.toLowerCase().includes(lowercasedSearchText);

                return clientNamesMatch || clientEmailMatch || clientNameMatch || partnerNameMatch || descriptionMatch;
            });
            setFilteredAppointments(filtered);
            setLoadingSearch(false);
        }, 300);

        return () => clearTimeout(handler);
    }, [searchText, allAppointments]); // Depends on search text and the full list of appointments

    // Initial load/reset of filtered appointments when allAppointments changes
    useEffect(() => {
        if (searchText.trim() === '') {
            setFilteredAppointments(allAppointments);
        }
    }, [allAppointments]); // This ensures that if new appointments are added/deleted externally, the unfiltered list updates.

    const handleEditAppointment = useCallback((appointment) => {
        // Navigate back to AppointmentManager and pass the appointment to edit
        // AppointmentManager will then open AppointmentFormModal
        navigation.navigate('AppointmentManager', {
            editingAppointment: appointment,
            // Pass back original route params if AppointmentManager needs them
            ticketId: ticketId,
            initialUserId: route.params?.initialUserId,
            initialUserName: route.params?.initialUserName,
            userPhone: route.params?.userPhone,
            initialUserEmail: route.params?.initialUserEmail,
        });
    }, [navigation, ticketId, route.params]);


    const handleDeleteAppointment = useCallback(async (appointmentToDelete) => {
        // We'll move the actual deletion logic to AppointmentManager or a shared service
        // For now, we navigate back to AppointmentManager with a specific action.
        // A better long-term solution might be to use a context API or a global state manager
        // for deletions and updates, or directly call a Firebase function if permissions allow.
        Alert.alert(
            "Confirmer la suppression",
            "Êtes-vous sûr de vouloir supprimer ce rendez-vous ?",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    style: "destructive",
                    onPress: () => {
                        // Navigate back to AppointmentManager and trigger deletion there
                        navigation.navigate('AppointmentManager', {
                            appointmentToDelete: appointmentToDelete.id, // Pass ID to delete
                            partnerIdToDelete: appointmentToDelete.partnerId, // Also needed for partner subcollection
                            // Pass other details for the system message
                            appointmentDetailsForMessage: {
                                partnerNom: appointmentToDelete.partnerNom,
                                appointmentDateTime: appointmentToDelete.appointmentDateTime,
                                description: appointmentToDelete.description
                            },
                             // Pass back original route params
                            ticketId: ticketId,
                            initialUserId: route.params?.initialUserId,
                            initialUserName: route.params?.initialUserName,
                            userPhone: route.params?.userPhone,
                            initialUserEmail: route.params?.initialUserEmail,
                        });
                    }
                }
            ]
        );
    }, [navigation, ticketId, route.params]);


    const renderAppointmentItem = useCallback(({ item: appt }) => (
        <View style={[styles.existingAppointmentItem, appt.status === 'cancelled' && styles.cancelledAppointment]}>
            <Text style={styles.appointmentInfoText}>
                <Text style={{ fontWeight: 'bold' }}>Partenaire:</Text> {appt.partnerNom || 'N/A'}
            </Text>
            <Text style={styles.appointmentInfoText}>
                <Text style={{ fontWeight: 'bold' }}>Catégorie:</Text> {appt.partnerCategorie || 'N/A'}
            </Text>
            <Text style={styles.appointmentInfoText}>
                <Text style={{ fontWeight: 'bold' }}>Date:</Text> {formatDateTime(appt.appointmentDateTime)}
            </Text>
            <Text style={styles.appointmentInfoText}>
                <Text style={{ fontWeight: 'bold' }}>Client(s):</Text> {appt.clientNames ? appt.clientNames.join(', ') : appt.clientName || 'N/A'}
            </Text>
            {appt.clientEmail && (
                <Text style={styles.appointmentInfoText}>
                    <Text style={{ fontWeight: 'bold' }}>Email:</Text> {appt.clientEmail}
                </Text>
            )}
            {appt.description && (
                <Text style={styles.appointmentInfoText}>
                    <Text style={{ fontWeight: 'bold' }}>Description:</Text> {appt.description}
                </Text>
            )}
            <Text style={[styles.appointmentStatus, appt.status === 'cancelled' ? styles.statusCancelledText : styles.statusScheduledText]}>
                Statut: {appt.status === 'cancelled' ? 'Annulé' : 'Confirmé'}
            </Text>
            <View style={styles.appointmentActions}>
                {appt.status !== 'cancelled' && (
                    <TouchableOpacity
                        style={[styles.actionButton, styles.editButton]}
                        onPress={() => handleEditAppointment(appt)}
                    >
                        <Ionicons name="create-outline" size={18} color="white" />
                        <Text style={styles.actionButtonText}>Modifier</Text>
                    </TouchableOpacity>
                )}
                <TouchableOpacity
                    style={[styles.actionButton, styles.deleteButton]}
                    onPress={() => handleDeleteAppointment(appt)}
                >
                    <Ionicons name="trash-outline" size={18} color="white" />
                    <Text style={styles.actionButtonText}>Supprimer</Text>
                </TouchableOpacity>
            </View>
        </View>
    ), [formatDateTime, handleEditAppointment, handleDeleteAppointment]);

    if (loadingAppointments) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0a8fdf" />
                <Text style={styles.loadingText}>Chargement des rendez-vous...</Text>
            </View>
        );
    }

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
        >
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={28} color="#2D3748" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Tous les Rendez-vous</Text>
                <View style={{ width: 28 }} />{/* Spacer */}
            </View>

            <View style={styles.searchContainer}>
                <Ionicons name="search" size={20} color="#718096" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Rechercher par client, email ou partenaire..."
                    value={searchText}
                    onChangeText={setSearchText}
                    autoCapitalize="none"
                    returnKeyType="search"
                />
                {loadingSearch && <ActivityIndicator size="small" color="#0a8fdf" style={styles.searchLoader} />}
            </View>

            {filteredAppointments.length === 0 && !loadingSearch ? (
                <View style={styles.emptyContainer}>
                    <Ionicons name="calendar-outline" size={80} color="#E0F2F7" />
                    <Text style={styles.emptyText}>Aucun rendez-vous trouvé.</Text>
                    <Text style={styles.emptySubtitle}>
                        Ajustez votre recherche ou ajoutez un nouveau rendez-vous depuis le gestionnaire.
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filteredAppointments}
                    renderItem={renderAppointmentItem}
                    keyExtractor={item => item.id}
                    contentContainerStyle={styles.listContent}
                    showsVerticalScrollIndicator={true}
                    ListFooterComponent={<View style={{ height: 20 }} />}
                />
            )}
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#EBF3F8',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EBF3F8',
    },
    loadingText: {
        marginTop: 10,
        color: '#4A5568',
        fontSize: 16,
        fontWeight: '500',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 15,
        marginTop: 25,
        paddingHorizontal: 20,
    },
    backButton: {
        padding: 5,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#2D3748',
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 10,
    },
    searchContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#CBD5E0',
        borderRadius: 10,
        paddingHorizontal: 15,
        backgroundColor: '#FFFFFF', // Changed to white for search bar for better contrast
        marginHorizontal: 20, // Add horizontal margin
        marginBottom: 20,
        shadowColor: '#000', // Add subtle shadow for depth
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 2,
    },
    searchIcon: {
        marginRight: 10,
    },
    searchInput: {
        flex: 1,
        paddingVertical: 12,
        fontSize: 16,
        color: '#2D3748',
    },
    searchLoader: {
        marginLeft: 10,
    },
    listContent: {
        paddingHorizontal: 20, // Add horizontal padding for list items
        paddingBottom: 20,
    },
    emptyContainer: {
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 50,
        marginHorizontal: 20, // Add horizontal margin
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#E2E8F0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 5 },
        shadowOpacity: 0.06,
        shadowRadius: 12,
        elevation: 6,
    },
    emptyText: {
        fontSize: 18,
        color: '#4A5568',
        marginTop: 20,
        textAlign: 'center',
        fontWeight: '600',
    },
    emptySubtitle: {
        fontSize: 15,
        color: '#718096',
        marginTop: 10,
        textAlign: 'center',
        paddingHorizontal: 20,
    },
    existingAppointmentItem: {
        backgroundColor: '#FFFFFF',
        borderRadius: 12,
        padding: 18,
        marginBottom: 15,
        borderLeftWidth: 5,
        borderColor: '#A0AEC0',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 4,
    },
    cancelledAppointment: {
        borderColor: '#E53E3E',
        opacity: 0.8,
    },
    appointmentInfoText: {
        fontSize: 15,
        color: '#4A5568',
        marginBottom: 5,
        lineHeight: 22,
    },
    appointmentStatus: {
        fontSize: 15,
        fontWeight: '700',
        marginTop: 10,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E2E8F0',
    },
    statusScheduledText: {
        color: '#38A169',
    },
    statusCancelledText: {
        color: '#E53E3E',
    },
    appointmentActions: {
        flexDirection: 'row',
        marginTop: 15,
        justifyContent: 'flex-end',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E2E8F0',
        paddingTop: 10,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        marginLeft: 10,
        backgroundColor: '#4A5568',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    editButton: {
        backgroundColor: '#F6AD55',
    },
    deleteButton: {
        backgroundColor: '#E53E3E',
    },
    actionButtonText: {
        color: 'white',
        fontSize: 13,
        fontWeight: '600',
        marginLeft: 6,
    },
});

export default AppointmentListScreen;
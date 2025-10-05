import React, { useState, useEffect, useRef } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, SafeAreaView, Platform, Alert, Image } from 'react-native'; // Import Image
import { db, auth } from '../../firebase';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, addDoc, serverTimestamp, orderBy } from 'firebase/firestore'; // Added addDoc for push notification
import { useNavigation } from '@react-navigation/native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons'; // Keep if still used elsewhere

// --- NEW: Import your custom icons ---
const BACK_CIRCLE_ICON = require('../../assets/icons/back_circle.png'); // From PartnerDoc
const CLIPBOARD_OUTLINE_ICON = require('../../assets/icons/clipboard.png'); // For survey item
const CALENDAR_OUTLINE_ICON_SURVEY = require('../../assets/icons/appointment.png'); // For RDV item (renamed to avoid conflict)
const CHECKMARK_CIRCLE_OUTLINE_ICON = require('../../assets/icons/checkmark_circle.png'); // For confirm button
const INFORMATION_CIRCLE_OUTLINE_ICON = require('../../assets/icons/infos.png'); // For no data card
const STATS_CHART_OUTLINE_ICON = require('../../assets/icons/stats_chart.png'); // For section header
const CALENDAR_NUMBER_OUTLINE_ICON = require('../../assets/icons/date_apt.png'); // For section header
// --- END NEW IMPORTS ---

const COMMISSION_RATE = 0.13; // 13% commission rate

const PartnerSurvey = () => {
    const [surveys, setSurveys] = useState([]);
    const [rdvs, setRdvs] = useState([]);
    const [loading, setLoading] = useState(true);
    const navigation = useNavigation();

    // Refs to keep track of notified items to prevent duplicate notifications
    const notifiedSurveysRef = useRef(new Set());
    const notifiedRdvsRef = useRef(new Set());

    // --- NEW: Function to send push notification (placeholder) ---
    // In a real app, this would be a call to your backend/Cloud Function
    const sendPushNotification = async (expoPushToken, title, body, data = {}) => {
        // console.log("Sending push notification to token:", expoPushToken, "Title:", title, "Body:", body, "Data:", data);
        const message = {
            to: expoPushToken,
            sound: 'er_notification',
            title,
            body,
            data,
        };

        try {
            await fetch('https://exp.host/--/api/v2/push/send', { // Expo's Push Notification API
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
    // --- END NEW: Function to send push notification ---

    const formatDate = (timestamp) => {
        if (!timestamp) return 'Date inconnue';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (e) {
            console.error("Error formatting date:", e);
            return 'Date invalide';
        }
    };

    const formatTime = (timestamp) => {
        if (!timestamp) return 'Heure inconnue';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return date.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            console.error("Error formatting time:", e);
            return 'Heure invalide';
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const user = auth.currentUser;
            if (user && user.uid) {
                const partnerDocRef = doc(db, 'users', user.uid);
                const partnerDoc = await getDoc(partnerDocRef);

                if (partnerDoc.exists()) {
                    const partnerId = partnerDoc.data().partnerId;
                    const partnerExpoPushToken = partnerDoc.data().expoPushToken; // Get partner's token

                    if (!partnerId) {
                        console.warn("Current user does not have a partnerId assigned.");
                        setSurveys([]);
                        setRdvs([]);
                        setLoading(false);
                        return;
                    }

                    // --- Fetch and notify for Surveys ---
                    const surveysQuery = query(
                        collection(db, 'surveys'),
                        where('couponDetails.sponsor', '==', partnerId)
                    );
                    const surveyQuerySnapshot = await getDocs(surveysQuery);
                    const surveyList = surveyQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    surveyList.forEach(survey => {
                        if (!notifiedSurveysRef.current.has(survey.id)) {
                            // This survey is new or hasn't been notified yet
                            if (partnerExpoPushToken) {
                                sendPushNotification(
                                    partnerExpoPushToken,
                                    "Nouvelle Enquête Disponible!",
                                    `Une nouvelle enquête "${survey.title}" vous attend.`,
                                    { type: 'partner_survey', surveyId: survey.id }
                                );
                                notifiedSurveysRef.current.add(survey.id); // Mark as notified
                            }
                        }
                    });
                    setSurveys(surveyList);

                    // --- Fetch and notify for RDVs ---
                    const rdvsQuery = query(
                        collection(db, 'appointments'), // Changed to top-level 'appointments'
                        where('partnerId', '==', partnerId),
                        where('status', 'in', ['scheduled', 'rescheduled', 'confirmed']) // Show pending, rescheduled, and confirmed
                    );
                    const rdvQuerySnapshot = await getDocs(rdvsQuery);
                    const rdvList = rdvQuerySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

                    rdvList.forEach(rdv => {
                        const rdvIdentifier = `${rdv.id}-${rdv.status}`; // Include status to detect status changes
                        if (!notifiedRdvsRef.current.has(rdvIdentifier)) {
                            // This RDV or its status is new/changed
                            if (partnerExpoPushToken) {
                                let title = "Nouveau Rendez-vous!";
                                let body = `Un rendez-vous avec ${rdv.clientNames?.join(', ') || 'un client'} est prévu pour le ${formatDate(rdv.appointmentDateTime)} à ${formatTime(rdv.appointmentDateTime)}.`;
                                let rdvType = 'new_appointment';

                                if (rdv.status === 'rescheduled') {
                                    title = "Rendez-vous Reporté!";
                                    body = `Le rendez-vous avec ${rdv.clientNames?.join(', ') || 'un client'} a été reporté au ${formatDate(rdv.appointmentDateTime)} à ${formatTime(rdv.appointmentDateTime)}.`;
                                    rdvType = 'rescheduled_appointment';
                                } else if (rdv.status === 'confirmed') {
                                    title = "Rendez-vous Confirmé!";
                                    body = `Le rendez-vous avec ${rdv.clientNames?.join(', ') || 'un client'} pour le ${formatDate(rdv.appointmentDateTime)} à ${formatTime(rdv.appointmentDateTime)} est maintenant confirmé.`;
                                    rdvType = 'confirmed_appointment';
                                }
                                
                                sendPushNotification(
                                    partnerExpoPushToken,
                                    title,
                                    body,
                                    { type: 'partner_rdv', rdvId: rdv.id, rdvType: rdvType }
                                );
                                notifiedRdvsRef.current.add(rdvIdentifier); // Mark as notified
                            }
                        }
                    });
                    setRdvs(rdvList);

                } else {
                    console.log("No partner data found for the current user.");
                    setSurveys([]);
                    setRdvs([]);
                }
            } else {
                console.log("No authenticated user found.");
                Alert.alert("Non connecté", "Veuillez vous connecter pour voir les données du partenaire.");
            }
        } catch (error) {
            console.error("Error fetching partner data:", error);
            Alert.alert("Erreur", "Impossible de charger les données du partenaire. Veuillez réessayer.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Auto-update on focus: Re-fetch data whenever this screen comes into focus
        const unsubscribeFocus = navigation.addListener('focus', () => {
            fetchData();
        });
        // Initial fetch when component mounts
        fetchData(); 

        return () => {
            unsubscribeFocus(); // Clean up the listener when component unmounts
        };
    }, [navigation]); // Depend on navigation to re-attach listener if navigation object changes

    const confirmRdv = async (rdvId, partnerId) => {
        setLoading(true);
        try {
            // 1. Update in TOP-LEVEL 'appointments' collection
            const rdvRefAppointments = doc(db, 'appointments', rdvId);
            await updateDoc(rdvRefAppointments, { status: 'confirmed' });

            // 2. Also update in partner's rdv_reservation subcollection
            // Ensure partnerId is available for this path
            if (partnerId) {
                const rdvRefSubcollection = doc(db, 'partners', partnerId, 'rdv_reservation', rdvId);
                const subcollectionDocSnap = await getDoc(rdvRefSubcollection); // Check if it exists
                if (subcollectionDocSnap.exists()) {
                    await updateDoc(rdvRefSubcollection, { status: 'confirmed' });
                    console.log("PartnerSurvey: Also updated status in rdv_reservation subcollection.");
                } else {
                    console.warn("PartnerSurvey: RDV not found in rdv_reservation subcollection. Skipped updating it.");
                }
            } else {
                console.warn("PartnerSurvey: PartnerId not available, skipped updating rdv_reservation subcollection.");
            }

            Alert.alert("Succès", "Rendez-vous confirmé.");
            fetchData(); // Re-fetch all data to update the list and counts
        } catch (error) {
            console.error("Error confirming RDV:", error);
            Alert.alert("Erreur", "Impossible de confirmer le rendez-vous: " + error.message);
        } finally {
            setLoading(false);
        }
    };

    const renderSurveyItem = ({ item }) => (
        <TouchableOpacity
            style={styles.surveyItemCard}
            onPress={() => navigation.navigate('PartnerSurveyDetail', { surveyId: item.id })}
        >
            <View style={styles.itemHeader}>
                {/* --- MODIFIED: Use custom image for clipboard icon --- */}
                <Image source={CLIPBOARD_OUTLINE_ICON} style={[styles.customItemIcon, { tintColor: styles.surveyAccentColor.backgroundColor }]} />
                {/* --- END MODIFIED --- */}
                <Text style={styles.surveyItemTitle}>{item.title}</Text>
            </View>
            <Text style={styles.surveyItemDescription}>{item.description}</Text>
            {item.couponDetails?.value && (
                <Text style={styles.surveyItemCoupon}>
                    Coupon: {item.couponDetails.value}
                    {item.couponDetails.type === 'percentage' ? '%' : '$'} de réduction
                </Text>
            )}
        </TouchableOpacity>
    );

    const renderRdvItem = ({ item }) => {
        const isConfirmed = item.status === 'confirmed';
        const isCancelled = item.status === 'cancelled';
        const isScheduled = item.status === 'scheduled';
        const isRescheduled = item.status === 'rescheduled';

        return (
            <TouchableOpacity
                style={styles.rdvItemCard}
                onPress={() => navigation.navigate('PartnerRdvDetail', { rdvId: item.id, partnerId: item.partnerId })}
            >
                <View style={styles.itemHeader}>
                    {/* --- MODIFIED: Use custom image for calendar icon --- */}
                    <Image source={CALENDAR_OUTLINE_ICON_SURVEY} style={[styles.customItemIcon, { tintColor: styles.rdvAccentColor.backgroundColor }]} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.rdvItemTitle}>Rendez-vous avec {item.clientNames?.join(', ') || 'un client'}</Text>
                </View>
                <Text style={styles.rdvItemDetails}>Description: {item.description || 'Non spécifié'}</Text>
                <Text style={styles.rdvItemDetails}>Date: {formatDate(item.appointmentDateTime)}</Text>
                <Text style={styles.rdvItemDetails}>Heure: {formatTime(item.appointmentDateTime)}</Text>
                <View style={styles.rdvStatusContainer}>
                    <Text style={styles.rdvStatusLabel}>Statut:</Text>
                    <Text style={[
                        styles.rdvStatusText,
                        isConfirmed && styles.rdvStatusConfirmed,
                        isCancelled && styles.rdvStatusCancelled,
                        isScheduled && styles.rdvStatusPending,
                        isRescheduled && styles.rdvStatusRescheduled
                    ]}>
                        {isConfirmed ? 'Confirmé' :
                         isCancelled ? 'Annulé' :
                         isRescheduled ? 'Reporté' :
                         isScheduled ? 'En attente' :
                         item.status || 'Inconnu'}
                    </Text>
                </View>
                {isScheduled && (
                    <TouchableOpacity
                        style={styles.confirmButton}
                        onPress={() => confirmRdv(item.id, item.partnerId)}
                    >
                        {/* --- MODIFIED: Use custom image for checkmark icon --- */}
                        <Image source={CHECKMARK_CIRCLE_OUTLINE_ICON} style={styles.customConfirmButtonIcon} />
                        {/* --- END MODIFIED --- */}
                        <Text style={styles.confirmButtonText}>Confirmer le RDV</Text>
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0a8fdf" />
                <Text style={styles.loadingText}>Chargement de votre tableau de bord...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <ScrollView contentContainerStyle={styles.scrollViewContent}>
                <Text style={styles.globalHeaderTitle}>Management</Text>

                <View style={styles.sectionContainer}>
                    <View style={styles.sectionTitleRow}>
                        {/* --- MODIFIED: Use custom image for stats chart icon --- */}
                        <Image source={STATS_CHART_OUTLINE_ICON} style={[styles.customSectionHeaderIcon, { tintColor: '#2D3748' }]} />
                        {/* --- END MODIFIED --- */}
                        <Text style={styles.sectionHeader}>Mes Enquêtes</Text>
                    </View>
                    {surveys.length > 0 ? (
                        <FlatList
                            data={surveys}
                            keyExtractor={(item) => item.id}
                            renderItem={renderSurveyItem}
                            scrollEnabled={false}
                            contentContainerStyle={styles.listContentContainer}
                        />
                    ) : (
                        <View style={styles.noDataCard}>
                            {/* --- MODIFIED: Use custom image for information circle icon --- */}
                            <Image source={INFORMATION_CIRCLE_OUTLINE_ICON} style={[styles.customNoDataIcon, { tintColor: '#6B7280' }]} />
                            {/* --- END MODIFIED --- */}
                            <Text style={styles.noDataText}>Aucune enquête disponible pour le moment.</Text>
                        </View>
                    )}
                </View>

                <View style={styles.sectionSeparator} />

                <View style={styles.sectionContainer}>
                    <View style={styles.sectionTitleRow}>
                        {/* --- MODIFIED: Use custom image for calendar number icon --- */}
                        <Image source={CALENDAR_NUMBER_OUTLINE_ICON} style={[styles.customSectionHeaderIcon, { tintColor: '#2D3748' }]} />
                        {/* --- END MODIFIED --- */}
                        <Text style={styles.sectionHeader}>Mes Rendez-vous</Text>
                    </View>
                    {rdvs.length > 0 ? (
                        <FlatList
                            data={rdvs}
                            keyExtractor={(item) => item.id}
                            renderItem={renderRdvItem}
                            scrollEnabled={false}
                            contentContainerStyle={styles.listContentContainer}
                        />
                    ) : (
                        <View style={styles.noDataCard}>
                            {/* --- MODIFIED: Use custom image for information circle icon --- */}
                            <Image source={INFORMATION_CIRCLE_OUTLINE_ICON} style={[styles.customNoDataIcon, { tintColor: '#6B7280' }]} />
                            {/* --- END MODIFIED --- */}
                            <Text style={styles.noDataText}>Aucun rendez-vous planifié pour le moment.</Text>
                        </View>
                    )}
                </View>

                <View style={{ height: 40 }} />
            </ScrollView>
        </SafeAreaView>
    );
};

const baseCardStyles = {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F0F4F8',
    },
    scrollViewContent: {
        padding: 20,
        paddingTop: Platform.OS === 'android' ? 30 : 0,
        paddingBottom: 40,
    },
    globalHeaderTitle: {
        fontSize: 30,
        fontWeight: '800',
        color: '#2D3748',
        marginBottom: 30,
        textAlign: 'center',
    },
    sectionContainer: {
        marginBottom: 25,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 15,
        borderBottomWidth: 2,
        borderBottomColor: '#E2E8F0',
        paddingBottom: 8,
    },
    // --- NEW STYLE for custom section header icons ---
    customSectionHeaderIcon: {
        width: 28, // Match Ionicons size
        height: 28, // Match Ionicons size
        resizeMode: 'contain',
        // tintColor is applied inline
    },
    // --- END NEW STYLE ---
    sectionHeader: {
        fontSize: 24,
        fontWeight: '700',
        color: '#2D3748',
        marginLeft: 10,
    },
    sectionSeparator: {
        height: 1.5,
        backgroundColor: '#D1D9E0',
        marginVertical: 35,
        width: '90%',
        alignSelf: 'center',
        borderRadius: 1,
    },
    surveyAccentColor: {
        backgroundColor: '#0a8fdf',
    },
    surveyItemCard: {
        ...baseCardStyles,
        borderLeftWidth: 8,
        borderColor: '#0a8fdf',
    },
    itemHeader: { // Reused for both survey and RDV items
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 10,
    },
    // --- NEW STYLE for custom item icons (clipboard, calendar) ---
    customItemIcon: {
        width: 24, // Match Ionicons size
        height: 24, // Match Ionicons size
        resizeMode: 'contain',
        // tintColor is applied inline
    },
    // --- END NEW STYLE ---
    surveyItemTitle: {
        fontSize: 19,
        fontWeight: '700',
        color: '#2D3748',
        marginLeft: 10,
    },
    surveyItemDescription: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
        marginBottom: 8,
    },
    surveyItemCoupon: {
        fontSize: 14,
        fontWeight: '600',
        color: '#38A169',
        fontStyle: 'italic',
    },
    rdvAccentColor: {
        backgroundColor: '#16a085',
    },
    rdvItemCard: {
        ...baseCardStyles,
        borderLeftWidth: 8,
        borderColor: '#16a085',
    },
    rdvItemTitle: {
        fontSize: 19,
        fontWeight: '700',
        color: '#2D3748',
        marginLeft: 10,
    },
    rdvItemDetails: {
        fontSize: 15,
        color: '#6B7280',
        lineHeight: 22,
    },
    rdvStatusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 10,
        paddingTop: 8,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E2E8F0',
    },
    rdvStatusLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#4A5568',
        marginRight: 8,
    },
    rdvStatusText: {
        fontSize: 15,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    rdvStatusConfirmed: {
        color: '#28a745',
    },
    rdvStatusCancelled: {
        color: '#dc3545',
    },
    rdvStatusPending: {
        color: '#ffc107',
    },
    rdvStatusRescheduled: {
        color: '#F57C00',
    },
    confirmButton: {
        backgroundColor: '#34C759',
        paddingVertical: 10,
        paddingHorizontal: 15,
        borderRadius: 8,
        marginTop: 15,
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        elevation: 3,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.2,
        shadowRadius: 3,
    },
    // --- NEW STYLE for custom confirm button icon ---
    customConfirmButtonIcon: {
        width: 20, // Match Ionicons size
        height: 20, // Match Ionicons size
        resizeMode: 'contain',
        tintColor: 'white', // Match Ionicons color
        marginRight: 5,
    },
    // --- END NEW STYLE ---
    confirmButtonText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 15,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#F0F4F8',
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: '#4A5568',
    },
    listContentContainer: {
        paddingBottom: 10,
    },
    noDataCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 15,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
        elevation: 3,
        borderWidth: 1,
        borderColor: '#E2E8F0',
    },
    // --- NEW STYLE for custom no data icon ---
    customNoDataIcon: {
        width: 30, // Match Ionicons size
        height: 30, // Match Ionicons size
        resizeMode: 'contain',
        // tintColor is applied inline
    },
    // --- END NEW STYLE ---
    noDataText: {
        textAlign: 'center',
        color: '#6B7280',
        fontSize: 16,
        paddingTop: 10,
        fontStyle: 'italic',
    },
});

export default PartnerSurvey;
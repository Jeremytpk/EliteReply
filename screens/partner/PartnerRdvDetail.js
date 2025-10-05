import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  SafeAreaView,
  Dimensions,
  Platform,
} from 'react-native';
import { useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { db, auth } from '../../firebase';
import { doc, getDoc, updateDoc, deleteDoc, arrayRemove } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const PartnerRdvDetail = ({ navigation }) => {
    const route = useRoute();
    const { rdvId, partnerId: navigatedPartnerId } = route.params || {}; 

    const [rdv, setRdv] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentPartnerId, setCurrentPartnerId] = useState(null);
    const [loggedInPartnerName, setLoggedInPartnerName] = useState(null);

    const [scannedQrCodeRawData, setScannedQrCodeRawData] = useState(null);
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraPermission, requestPermission] = useCameraPermissions();

    // UPDATED formatDate function for robustness
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Date inconnue'; // Handles null/undefined directly
        try {
            let date;
            if (timestamp.toDate && typeof timestamp.toDate === 'function') { // Check if .toDate() exists and is a function
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) { // If it's already a Date object
                date = timestamp;
            } else { // Assume it's a string or number that can be converted
                date = new Date(timestamp);
            }

            // Check if the resulting date is valid
            if (isNaN(date.getTime())) {
                return 'Date invalide';
            }

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

    // UPDATED formatTime function for robustness
    const formatTime = (timestamp) => {
        if (!timestamp) return 'Heure inconnue'; // Handles null/undefined directly
        try {
            let date;
            if (timestamp.toDate && typeof timestamp.toDate === 'function') { // Check if .toDate() exists and is a function
                date = timestamp.toDate();
            } else if (timestamp instanceof Date) { // If it's already a Date object
                date = timestamp;
            } else { // Assume it's a string or number that can be converted
                date = new Date(timestamp);
            }

            // Check if the resulting date is valid
            if (isNaN(date.getTime())) {
                return 'Heure invalide';
            }

            return date.toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            console.error("Error formatting time:", e);
            return 'Heure invalide';
        }
    };

    useEffect(() => {
        const initializeAndFetchRdv = async () => {
            setLoading(true);
            setError(null);
            try {
                const currentUser = auth.currentUser;
                if (!currentUser) {
                    Alert.alert("Non autorisé", "Vous devez être connecté pour voir les rendez-vous.");
                    navigation.goBack();
                    return;
                }

                const userDocRef = doc(db, 'users', currentUser.uid);
                const userDocSnap = await getDoc(userDocRef);

                let actualPartnerId = null;
                let displayName = 'Partenaire Inconnu';
                if (userDocSnap.exists()) {
                    const userData = userDocSnap.data();
                    if (userData.partnerId) {
                        actualPartnerId = userData.partnerId;
                        setCurrentPartnerId(actualPartnerId);
                    }
                    if (userData.name) {
                        displayName = userData.name;
                        setLoggedInPartnerName(displayName);
                    }
                }

                if (!actualPartnerId) {
                    Alert.alert("Erreur", "Votre compte n'est pas lié à un partenaire. Accès refusé.");
                    navigation.goBack();
                    return;
                }
                
                if (!rdvId) {
                    Alert.alert("Erreur", "ID du rendez-vous manquant.");
                    navigation.goBack();
                    return;
                }

                if (navigatedPartnerId && navigatedPartnerId !== actualPartnerId) {
                    Alert.alert("Accès refusé", "Ce rendez-vous n'est pas associé à votre compte partenaire.");
                    navigation.goBack();
                    return;
                }
                
                if (!actualPartnerId) {
                    Alert.alert("Erreur", "ID du partenaire manquant pour la recherche.");
                    navigation.goBack();
                    return;
                }

                const rdvDocRef = doc(db, 'appointments', rdvId);
                const rdvDoc = await getDoc(rdvDocRef);

                if (rdvDoc.exists()) {
                    setRdv(rdvDoc.data());
                    if (rdvDoc.data().partnerId !== actualPartnerId) {
                        Alert.alert("Accès refusé", "Ce rendez-vous n'est pas associé à votre compte partenaire.");
                        navigation.goBack();
                        return;
                    }
                } else {
                    Alert.alert("Erreur", "Rendez-vous introuvable.");
                    navigation.goBack();
                }
            } catch (err) {
                console.error("Error in initializeAndFetchRdv:", err);
                setError("Impossible de charger les détails du rendez-vous.");
                Alert.alert("Erreur", "Impossible de charger les détails du rendez-vous: " + err.message);
                navigation.goBack();
            } finally {
                setLoading(false);
            }
        };

        initializeAndFetchRdv();
    }, [rdvId, navigatedPartnerId, navigation]);

    const handleScanPress = async () => {
        if (cameraPermission === null || !cameraPermission.granted) {
            const { status } = await requestPermission();
            if (status !== 'granted') {
                Alert.alert(
                    "Autorisation Requise",
                    "Veuillez accorder l'accès à la caméra pour scanner les codes QR."
                );
                return;
            }
        }
        setIsCameraActive(true);
        setScannedQrCodeRawData(null);
    };

    const handleBarCodeScanned = async ({ data }) => {
        setIsCameraActive(false);
        setScannedQrCodeRawData(data);

        console.log("DEBUG_SCAN: Scanned data (from QR code):", data);
        // Correctly access the stored QR content (assuming JSON string)
        const expectedQrContent = rdv?.codeData?.qrContent; 
        console.log("DEBUG_SCAN: Expected QR content (from Firebase):", expectedQrContent);
        console.log("DEBUG_SCAN: Does scanned data match expected QR content?", data === expectedQrContent);

        if (!rdv || !rdv.codeData) { // Adjusted to codeData
            Alert.alert("Erreur", "Détails du rendez-vous ou données QR attendues non chargées. Impossible de confirmer.");
            console.log("DEBUG_SCAN: ERROR: RDV or codeData missing from component state.");
            return;
        }

        // Compare scanned data with the expected qrContent string
        if (data !== expectedQrContent) { // Corrected comparison
            Alert.alert("Code QR Incorrect", "Ce code QR ne correspond pas au rendez-vous actuel.");
            console.log("DEBUG_SCAN: FAILED: QR Code Mismatch. Scanned:", data, "Expected:", expectedQrContent);
            return;
        }

        if (!rdv || !currentPartnerId) {
            Alert.alert("Erreur", "Détails du rendez-vous ou ID partenaire non chargés. Impossible de confirmer.");
            console.log("DEBUG_SCAN: ERROR: RDV or currentPartnerId missing.");
            return;
        }

        try {
            // Get the latest document from Firestore to ensure we have the most current status
            const rdvDocRef = doc(db, 'appointments', rdvId);
            const currentRdvDoc = await getDoc(rdvDocRef);

            if (!currentRdvDoc.exists()) {
                Alert.alert("Erreur", "Rendez-vous introuvable dans la base de données.");
                console.log("DEBUG_SCAN: ERROR: RDV document not found in appointments collection.");
                return;
            }

            const currentRdvData = currentRdvDoc.data();
            console.log("DEBUG_SCAN: Current RDV status from Firestore before update attempt:", currentRdvData.status);

            if (currentRdvData.status === 'confirmed') {
                Alert.alert("Rendez-vous Déjà Confirmé", "Ce rendez-vous a déjà été confirmé.");
                setRdv(currentRdvData);
                console.log("DEBUG_SCAN: Already confirmed. No update performed.");
            } else if (currentRdvData.status === 'cancelled') {
                 Alert.alert("Rendez-vous Annulé", "Ce rendez-vous est marqué comme annulé et ne peut être confirmé.");
                 setRdv(currentRdvData);
                 console.log("DEBUG_SCAN: Cancelled status. No update performed.");
            }
            else {
                console.log("DEBUG_SCAN: Attempting to update status to 'confirmed' in both collections...");
                
                // 1. Update in top-level 'appointments' collection
                await updateDoc(doc(db, 'appointments', rdvId), {
                    status: 'confirmed',
                    confirmedByPartner: loggedInPartnerName || auth.currentUser?.uid || 'N/A',
                    confirmedTimestamp: new Date(),
                });
                console.log("DEBUG_SCAN: Status updated to 'confirmed' in top-level appointments.");

                // 2. Also update in partner's rdv_reservation subcollection
                if (currentPartnerId) { // Ensure currentPartnerId is available
                    const partnerRdvDocRef = doc(db, 'partners', currentPartnerId, 'rdv_reservation', rdvId);
                    const partnerRdvSnap = await getDoc(partnerRdvDocRef); // Check if exists before updating
                    if (partnerRdvSnap.exists()) { // Only update if it exists in the subcollection
                        await updateDoc(partnerRdvDocRef, {
                            status: 'confirmed',
                            confirmedByPartner: loggedInPartnerName || auth.currentUser?.uid || 'N/A',
                            confirmedTimestamp: new Date(),
                        });
                        console.log("DEBUG_SCAN: Status also updated to 'confirmed' in rdv_reservation subcollection.");
                    } else {
                        console.warn("DEBUG_SCAN: RDV not found in rdv_reservation subcollection. Skipped updating it.");
                    }
                } else {
                    console.warn("DEBUG_SCAN: currentPartnerId not available. Skipped updating rdv_reservation subcollection.");
                }

                // Fetch the updated document from appointments to set local state
                const updatedRdvDoc = await getDoc(doc(db, 'appointments', rdvId));
                if (updatedRdvDoc.exists()) {
                    setRdv(updatedRdvDoc.data());
                    console.log("DEBUG_SCAN: Local RDV state updated with confirmed data.");
                }

                Alert.alert("Succès", "Rendez-vous confirmé avec succès !", [
                    { text: "OK", onPress: () => navigation.goBack() }
                ]);
                console.log("DEBUG_SCAN: Successfully updated status and navigated back.");
            }
        } catch (error) {
            console.error("DEBUG_SCAN: CRITICAL ERROR during RDV status update:", error);
            Alert.alert("Erreur", "Échec de la mise à jour du statut du rendez-vous: " + error.message);
        }
    };

    const handleCancelRdv = () => {
        if (!rdv || !currentPartnerId || !rdv.ticketId) {
            Alert.alert("Impossible", "Les informations nécessaires pour annuler le rendez-vous sont manquantes.");
            return;
        }

        Alert.alert(
            "Annuler le Rendez-vous", 
            "Voulez-vous vraiment annuler ce rendez-vous ? Il sera marqué comme 'Annulé'.", 
            [
                { text: "Non", style: "cancel" },
                {
                    text: "Oui, Annuler", 
                    onPress: async () => {
                        try {
                            // 1. Update status in top-level 'appointments' collection
                            const rdvDocRefMain = doc(db, 'appointments', rdvId);
                            await updateDoc(rdvDocRefMain, {
                                status: 'cancelled',
                                cancelledByPartner: loggedInPartnerName || auth.currentUser?.uid || 'N/A',
                                cancelledTimestamp: new Date(),
                            });
                            console.log("DEBUG_CANCEL: Status updated to 'cancelled' in top-level appointments.");
                            
                            // 2. Also update status in partner's rdv_reservation subcollection (instead of delete)
                            if (currentPartnerId) {
                                const partnerRdvDocRef = doc(db, 'partners', currentPartnerId, 'rdv_reservation', rdvId);
                                const partnerRdvSnap = await getDoc(partnerRdvDocRef);
                                if (partnerRdvSnap.exists()) { // Only update if it exists in the subcollection
                                    await updateDoc(partnerRdvDocRef, {
                                        status: 'cancelled',
                                        cancelledByPartner: loggedInPartnerName || auth.currentUser?.uid || 'N/A',
                                        cancelledTimestamp: new Date(),
                                    });
                                    console.log("DEBUG_CANCEL: Status updated to 'cancelled' in rdv_reservation subcollection.");
                                } else {
                                    console.warn("DEBUG_CANCEL: RDV not found in rdv_reservation subcollection. Skipped updating it.");
                                }
                            }
                            // 3. Update the associated ticket if it exists
                            if (rdv.ticketId) {
                                const ticketDocRef = doc(db, 'tickets', rdv.ticketId);
                                const ticketDocSnap = await getDoc(ticketDocRef);
                                if (ticketDocSnap.exists()) {
                                    const currentAppointments = ticketDocSnap.data().appointments || [];
                                    const filteredAppointments = currentAppointments.map(
                                        app => app.appointmentId === rdvId ? { ...app, status: 'cancelled' } : app // Mark as cancelled in ticket too
                                    );
                                    await updateDoc(ticketDocRef, {
                                        appointments: filteredAppointments,
                                        lastUpdated: new Date(),
                                    });
                                    console.log("DEBUG_CANCEL: Ticket appointments updated.");
                                }
                            }
                            
                            Alert.alert("Succès", "Le rendez-vous a été annulé avec succès.", [
                                { text: "OK", onPress: () => navigation.goBack() }
                            ]);
                        } catch (error) {
                            console.error("DEBUG_CANCEL: CRITICAL ERROR during RDV cancellation:", error);
                            Alert.alert("Erreur", "Impossible d'annuler le rendez-vous. Veuillez réessayer.");
                        }
                    },
                    style: "destructive",
                },
            ],
            { cancelable: true }
        );
    };

    if (loading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0a8fdf" />
                <Text style={styles.loadingText}>Chargement des détails du rendez-vous...</Text>
            </View>
        );
    }

    if (!rdv || !rdvId) {
        return (
            <View style={styles.container}>
                <Text style={styles.infoText}>Détails du rendez-vous introuvables ou accès refusé. Assurez-vous que l'ID du rendez-vous est fourni.</Text>
                <TouchableOpacity style={styles.backButtonBottom} onPress={() => navigation.goBack()}>
                    <Text style={styles.backButtonTextBottom}>Retour</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const displayIsConfirmed = rdv.status === 'confirmed';
    const displayIsCancelled = rdv.status === 'cancelled';
    const displayIsScheduled = rdv.status === 'scheduled' || rdv.status === 'rescheduled';

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#2D3748" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Détails du Rendez-vous</Text>
                {(rdv && rdv.ticketId) ? (
                    <TouchableOpacity
                        onPress={handleCancelRdv}
                        style={styles.deleteHeaderButton}
                    >
                        <Ionicons name="trash-outline" size={24} color="#EF4444" />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 24 }} />
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollViewContent}>
                <View style={styles.rdvInfoCard}>
                    <Text style={styles.rdvTitle}>Rendez-vous avec {rdv.clientNames?.join(', ') || 'un client'}</Text>
                    {rdv.description && <Text style={styles.rdvDescription}>Description: {rdv.description}</Text>}
                    <Text style={styles.rdvDescription}>Date: {formatDate(rdv.appointmentDateTime)}</Text>
                    <Text style={styles.rdvDescription}>Heure: {formatTime(rdv.appointmentDateTime)}</Text>
                    {rdv.clientNames && rdv.clientNames.length > 0 && (
                        <Text style={styles.rdvDescription}>Pour: {rdv.clientNames.join(', ')}</Text>
                    )}
                    {rdv.clientPhone && <Text style={styles.rdvDescription}>Contact Client: {rdv.clientPhone}</Text>}
                    {rdv.notes && <Text style={styles.rdvDescription}>Notes (partenaire): {rdv.notes}</Text>}

                    <View style={styles.statusContainer}>
                        <Text style={styles.statusLabel}>Statut actuel:</Text>
                        <Text style={[
                            styles.statusText,
                            displayIsConfirmed && styles.statusConfirmed,
                            displayIsCancelled && styles.statusCancelled,
                            displayIsScheduled && styles.statusPending
                        ]}>
                            {displayIsConfirmed ? 'Confirmé' : (displayIsCancelled ? 'Annulé' : 'En attente')}
                        </Text>
                    </View>
                </View>

                {isCameraActive ? (
                    <View style={styles.scannerSection}>
                        <Text style={styles.scannerPrompt}>Scannez le code QR du rendez-vous pour confirmer</Text>
                        <View style={styles.cameraContainer}>
                            {cameraPermission === null ? (
                                <ActivityIndicator size="large" color="#fff" />
                            ) : !cameraPermission.granted ? (
                                <View style={styles.permissionDeniedOverlay}>
                                    <Ionicons name="camera-off-outline" size={60} color="#fff" />
                                    <Text style={styles.permissionOverlayText}>Accès caméra refusé.</Text>
                                    <TouchableOpacity style={styles.permissionButtonOverlay} onPress={requestPermission}>
                                        <Text style={styles.permissionButtonOverlayText}>Accorder</Text>
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <CameraView
                                    style={styles.camera}
                                    barCodeScannerSettings={{ barCodeTypes: ['qr'] }}
                                    onBarcodeScanned={handleBarCodeScanned}
                                    facing="back"
                                >
                                    <View style={styles.overlay}>
                                        <View style={styles.topOverlay} />
                                        <View style={styles.middleOverlay}>
                                            <View style={styles.leftOverlay} />
                                            <View style={styles.scanAreaBorder} />
                                            <View style={styles.rightOverlay} />
                                        </View>
                                        <View style={styles.bottomOverlay} />
                                    </View>
                                </CameraView>
                            )}
                        </View>
                        <TouchableOpacity style={styles.cancelScanButton} onPress={() => setIsCameraActive(false)}>
                            <Ionicons name="close-circle-outline" size={24} color="#fff" style={styles.buttonIcon} />
                            <Text style={styles.cancelScanButtonText}>Annuler le scan</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    // Show scan button only if not confirmed or cancelled
                    !displayIsConfirmed && !displayIsCancelled && (
                        <TouchableOpacity
                            style={styles.scanButton}
                            onPress={handleScanPress}
                        >
                            <Ionicons name="qr-code-outline" size={28} color="#fff" style={styles.buttonIcon} />
                            <Text style={styles.scanButtonText}>Confirmer le Rendez-vous</Text>
                        </TouchableOpacity>
                    )
                )}

                {/* Scanned result / Confirmation Status Card */}
                {(scannedQrCodeRawData || displayIsConfirmed || displayIsCancelled) && (
                    <View style={[
                        styles.scannedResultCard,
                        displayIsConfirmed && styles.scannedResultCardConfirmed,
                        displayIsCancelled && styles.scannedResultCardCancelled
                    ]}>
                        <Text style={styles.scannedResultTitle}>Statut de Confirmation</Text>
                        {displayIsConfirmed ? (
                            <>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Statut:</Text>
                                    <Text style={[styles.scannedDataText, styles.statusConfirmedText]}>Confirmé</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Confirmé par:</Text>
                                    <Text style={styles.scannedDataText}>{rdv.confirmedByPartner || 'Inconnu'}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Date/Heure:</Text>
                                    <Text style={styles.scannedDataText}>
                                        {formatDate(rdv.confirmedTimestamp)} à {formatTime(rdv.confirmedTimestamp)}
                                    </Text>
                                </View>
                            </>
                        ) : displayIsCancelled ? (
                            <>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Statut:</Text>
                                    <Text style={[styles.scannedDataText, styles.statusCancelledText]}>Annulé</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Annulé par:</Text>
                                    <Text style={styles.scannedDataText}>{rdv.cancelledByPartner || 'Inconnu'}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Date/Heure:</Text>
                                    <Text style={styles.scannedDataText}>
                                        {formatDate(rdv.cancelledTimestamp)} à {formatTime(rdv.cancelledTimestamp)}
                                    </Text>
                                </View>
                            </>
                        ) : (
                            <Text style={styles.scannedDataText}>Aucune confirmation enregistrée.</Text>
                        )}

                        <View style={styles.actionButtonsContainer}>
                            <TouchableOpacity style={styles.scanAgainButton} onPress={handleScanPress}>
                                <Ionicons name="qr-code-outline" size={20} color="#fff" />
                                <Text style={styles.scanAgainButtonText}>
                                    {displayIsConfirmed || displayIsCancelled ? 'Re-scanner le code QR' : 'Scanner le code QR'}
                                </Text>
                            </TouchableOpacity>

                            {(rdv && rdv.ticketId) && (
                                <TouchableOpacity style={styles.deleteRdvButton} onPress={handleCancelRdv}>
                                    <Ionicons name="trash-outline" size={20} color="#fff" />
                                    <Text style={styles.deleteRdvButtonText}>Annuler le Rendez-vous</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: '#F0F4F8',
    },
    container: {
        flex: 1,
        backgroundColor: '#F0F4F8',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 15,
        paddingVertical: 12,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E2E8F0',
        paddingTop: Platform.OS === 'android' ? 30 : 0,
    },
    backButton: {
        padding: 8,
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#2D3748',
    },
    deleteHeaderButton: {
        padding: 8,
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
    infoText: {
        textAlign: 'center',
        fontSize: 16,
        color: '#6B7280',
        marginTop: 20,
    },
    backButtonBottom: {
        backgroundColor: '#0a8fdf',
        paddingVertical: 10,
        paddingHorizontal: 20,
        borderRadius: 8,
        marginTop: 20,
    },
    backButtonTextBottom: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    permissionDeniedOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.8)',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0, left: 0,
    },
    permissionOverlayText: {
        color: '#fff',
        fontSize: 16,
        textAlign: 'center',
        marginBottom: 10,
    },
    permissionButtonOverlay: {
        backgroundColor: '#0a8fdf',
        paddingVertical: 8,
        paddingHorizontal: 15,
        borderRadius: 5,
    },
    permissionButtonOverlayText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    scrollViewContent: {
        padding: 20,
        paddingBottom: 40,
    },
    rdvInfoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 6,
        borderLeftWidth: 6,
        borderColor: '#0a8fdf',
    },
    rdvTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#2D3748',
        marginBottom: 8,
    },
    rdvDescription: {
        fontSize: 16,
        color: '#6B7280',
        lineHeight: 24,
        marginBottom: 5,
    },
    statusContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 15,
        paddingTop: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E2E8F0',
    },
    statusLabel: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#4A5568',
        marginRight: 10,
    },
    statusText: {
        fontSize: 16,
        fontWeight: '700',
        textTransform: 'uppercase',
    },
    statusConfirmed: {
        color: '#28a745',
    },
    statusCancelled: {
        color: '#dc3545',
    },
    statusPending: {
        color: '#ffc107',
    },
    scanButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a8fdf',
        paddingVertical: 18,
        borderRadius: 15,
        marginBottom: 20,
        shadowColor: '#0a8fdf',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.35,
        shadowRadius: 8,
        elevation: 8,
    },
    scanButtonText: {
        color: '#fff',
        fontSize: 19,
        fontWeight: 'bold',
        marginLeft: 10,
    },
    scannerSection: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        alignItems: 'center',
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 6,
    },
    scannerPrompt: {
        fontSize: 18,
        fontWeight: '600',
        color: '#2D3748',
        marginBottom: 15,
        textAlign: 'center',
    },
    cameraContainer: {
        width: width * 0.8,
        height: width * 0.8,
        borderRadius: 15,
        overflow: 'hidden',
        backgroundColor: '#000',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 20,
    },
    camera: {
        flex: 1,
        width: '100%',
        height: '100%',
    },
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    topOverlay: {
        flex: 1,
    },
    middleOverlay: {
        flexDirection: 'row',
        height: width * 0.6,
    },
    leftOverlay: {
        flex: 1,
    },
    scanAreaBorder: {
        width: width * 0.6,
        borderWidth: 2,
        borderColor: '#0a8fdf',
        borderRadius: 5,
    },
    rightOverlay: {
        flex: 1,
    },
    bottomOverlay: {
        flex: 1,
    },
    cancelScanButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#6C757D',
        paddingVertical: 12,
        borderRadius: 10,
        width: '100%',
    },
    cancelScanButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 8,
    },
    scannedResultCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 6,
        marginBottom: 20,
        borderLeftWidth: 6,
        borderColor: '#ccc',
    },
    scannedResultCardConfirmed: {
        borderColor: '#28a745',
    },
    scannedResultCardCancelled: {
        borderColor: '#dc3545',
    },
    scannedResultTitle: {
        fontSize: 20,
        fontWeight: '700',
        color: '#2D3748',
        marginBottom: 15,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: '#E2E8F0',
        paddingBottom: 10,
    },
    detailRow: {
        flexDirection: 'row',
        marginBottom: 8,
    },
    scannedDataLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#4A5568',
        width: 120,
    },
    scannedDataText: {
        fontSize: 15,
        color: '#6B7280',
        flex: 1,
        lineHeight: 20,
    },
    statusConfirmedText: {
        color: '#28a745',
        fontWeight: 'bold',
    },
    statusCancelledText: {
        color: '#dc3545',
        fontWeight: 'bold',
    },
    actionButtonsContainer: {
        marginTop: 20,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#E2E8F0',
        paddingTop: 20,
    },
    scanAgainButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0a8fdf',
        paddingVertical: 12,
        borderRadius: 10,
        marginBottom: 10,
        shadowColor: '#0a8fdf',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    scanAgainButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 10,
    },
    deleteRdvButton: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EF4444',
        paddingVertical: 12,
        borderRadius: 10,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    deleteRdvButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 10,
    },
    buttonIcon: {
        marginRight: 8,
    }
});

export default PartnerRdvDetail;
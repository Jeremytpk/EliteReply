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
import { doc, getDoc, updateDoc, query, collection, where, getDocs, deleteDoc } from 'firebase/firestore'; // Import deleteDoc
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

const PartnerSurveyDetail = ({ navigation }) => {
    const route = useRoute();
    const { surveyId } = route.params;

    const [survey, setSurvey] = useState(null);
    const [loading, setLoading] = useState(true);
    const [scannedQrCodeRawData, setScannedQrCodeRawData] = useState(null);
    const [scannedCouponDetails, setScannedCouponDetails] = useState(null);
    // Modified to store the document ID too
    const [redeemedCouponFirestoreData, setRedeemedCouponFirestoreData] = useState(null);
    const [isCameraActive, setIsCameraActive] = useState(false);

    const [cameraPermission, requestPermission] = useCameraPermissions();

    const formatDate = (dateString) => {
        if (!dateString) return 'Date inconnue';
        try {
            if (dateString.toDate) {
                return dateString.toDate().toLocaleDateString('fr-FR', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }
            return new Date(dateString).toLocaleDateString('fr-FR', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        } catch (e) {
            console.error("Error formatting date:", e);
            return 'Date invalide';
        }
    };

    useEffect(() => {
        const fetchSurveyDetail = async () => {
            setLoading(true);
            try {
                const surveyDoc = await getDoc(doc(db, 'surveys', surveyId));
                if (surveyDoc.exists()) {
                    setSurvey(surveyDoc.data());
                } else {
                    Alert.alert("Erreur", "Enquête introuvable.");
                    navigation.goBack();
                }
            } catch (error) {
                console.error("Error fetching survey:", error);
                Alert.alert("Erreur", "Impossible de charger les détails de l'enquête.");
                navigation.goBack();
            } finally {
                setLoading(false);
            }
        };

        if (surveyId) {
            fetchSurveyDetail();
        } else {
            Alert.alert("Erreur", "ID de l'enquête manquant.");
            navigation.goBack();
        }
    }, [surveyId, navigation]);

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
        setScannedCouponDetails(null);
        setRedeemedCouponFirestoreData(null);
    };

    const handleBarCodeScanned = async ({ data }) => {
        setIsCameraActive(false);
        setScannedQrCodeRawData(data);

        let parsedData;
        try {
            parsedData = JSON.parse(data);
            setScannedCouponDetails(parsedData);
        } catch (parseError) {
            console.error("Error parsing QR code data:", parseError);
            Alert.alert("Erreur de Scan", "Le code QR scanné n'est pas au format attendu.");
            setScannedQrCodeRawData(null);
            setScannedCouponDetails(null);
            return;
        }

        try {
            const couponsQuery = query(
                collection(db, 'surveyResult'),
                where('qrCodeData', '==', data)
            );
            const querySnapshot = await getDocs(couponsQuery);

            if (querySnapshot.empty) {
                Alert.alert("Coupon Invalide", "Aucun coupon correspondant trouvé dans la base de données.");
            } else if (querySnapshot.docs.length > 1) {
                Alert.alert("Erreur", "Plusieurs coupons trouvés pour ce code QR. Contactez l'administrateur.");
            } else {
                const couponDocRef = querySnapshot.docs[0].ref;
                const couponData = querySnapshot.docs[0].data();
                // Store the document ID along with data for deletion later
                setRedeemedCouponFirestoreData({ id: querySnapshot.docs[0].id, ...couponData }); 

                if (couponData.isRedeemed) {
                    Alert.alert("Coupon Déjà Utilisé", "Ce coupon a déjà été scanné et utilisé.");
                } else {
                    await updateDoc(couponDocRef, {
                        isRedeemed: true,
                        redeemedByPartner: auth.currentUser?.uid || 'N/A',
                        redeemedTimestamp: new Date(),
                    });
                    Alert.alert("Succès", "Coupon scanné et marqué comme utilisé.");
                }
            }
        } catch (error) {
            console.error("Error updating coupon status:", error);
            Alert.alert("Erreur", "Échec de la mise à jour du statut du coupon.");
        }
    };

    const handleDeleteCoupon = () => {
        if (!redeemedCouponFirestoreData || !redeemedCouponFirestoreData.id) {
            Alert.alert("Erreur", "Aucun coupon sélectionné à supprimer.");
            return;
        }

        Alert.alert(
            "Confirmer la suppression",
            "Voulez-vous vraiment supprimer ce coupon ? Cette action est irréversible.",
            [
                { text: "Annuler", style: "cancel" },
                {
                    text: "Supprimer",
                    onPress: async () => {
                        try {
                            await deleteDoc(doc(db, 'surveyResult', redeemedCouponFirestoreData.id));
                            Alert.alert("Succès", "Le coupon a été supprimé.");
                            // Clear display and prepare for new scan
                            setScannedQrCodeRawData(null);
                            setScannedCouponDetails(null);
                            setRedeemedCouponFirestoreData(null);
                            setIsCameraActive(false); // Go back to initial state
                        } catch (error) {
                            console.error("Error deleting coupon:", error);
                            Alert.alert("Erreur", "Impossible de supprimer le coupon. Veuillez réessayer.");
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
                <Text style={styles.loadingText}>Chargement des détails de l'enquête...</Text>
            </View>
        );
    }

    if (!survey) {
        return (
            <View style={styles.container}>
                <Text style={styles.infoText}>Détails de l'enquête introuvables.</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#2D3748" />
                </TouchableOpacity>
                <Text style={styles.headerTitle}>Detail Coupon</Text>
                <View style={{ width: 24 }} />
            </View>

            <ScrollView contentContainerStyle={styles.scrollViewContent}>
                <View style={styles.surveyInfoCard}>
                    <Text style={styles.surveyTitle}>{survey.title}</Text>
                    <Text style={styles.surveyDescription}>{survey.description}</Text>
                </View>

                {isCameraActive ? (
                    <View style={styles.scannerSection}>
                        <Text style={styles.scannerPrompt}>Alignez le code QR dans le cadre</Text>
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
                                >
                                    <View style={styles.overlay}>
                                        <View style={styles.topOverlay} />
                                        <View style={styles.middleOverlay}>
                                            <View style={styles.leftOverlay} />
                                            <View style={styles.scanAreaBorder} />
                                            <View style={styles.rightOverlay} />
                                        </View>
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
                    <TouchableOpacity
                        style={styles.scanButton}
                        onPress={handleScanPress}
                    >
                        <Ionicons name="qr-code-outline" size={28} color="#fff" style={styles.buttonIcon} />
                        <Text style={styles.scanButtonText}>Scanner un Coupon</Text>
                    </TouchableOpacity>
                )}

                {scannedQrCodeRawData && ( // Only show this card if a QR code has been scanned
                    <View style={styles.scannedResultCard}>
                        <Text style={styles.scannedResultTitle}>Détails du Coupon</Text>
                        {redeemedCouponFirestoreData ? ( // Use data from Firestore for display
                            <>
                                <View style={styles.detailRow}>
                                    {/*<Text style={styles.scannedDataLabel}>Enquête:</Text>
                                    <Text style={styles.scannedDataText}>{redeemedCouponFirestoreData.surveyTitle}</Text>*/}
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Utilisateur:</Text>
                                    <Text style={styles.scannedDataText}>{redeemedCouponFirestoreData.userName}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Valeur:</Text>
                                    <Text style={styles.scannedDataText}>
                                        {redeemedCouponFirestoreData.couponDetails.type === 'percentage'
                                            ? `${redeemedCouponFirestoreData.couponDetails.value}% de réduction`
                                            : `${redeemedCouponFirestoreData.couponDetails.value}€ de réduction`}
                                    </Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.scannedDataLabel}>Expire le:</Text>
                                    <Text style={styles.scannedDataText}>
                                        {formatDate(redeemedCouponFirestoreData.couponDetails.expiryDate)}
                                    </Text>
                                </View>
                                {redeemedCouponFirestoreData.isRedeemed && (
                                    <View style={[styles.detailRow, { marginTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#E2E8F0', paddingTop: 10 }]}>
                                        <Text style={styles.scannedDataLabel}>Statut:</Text>
                                        <Text style={[styles.scannedDataText, { color: '#EF4444', fontWeight: 'bold' }]}>Utilisé</Text>
                                    </View>
                                )}
                                {redeemedCouponFirestoreData.redeemedTimestamp && (
                                    <View style={styles.detailRow}>
                                        <Text style={styles.scannedDataLabel}>Scanné le:</Text>
                                        <Text style={styles.scannedDataText}>
                                            {formatDate(redeemedCouponFirestoreData.redeemedTimestamp)}
                                        </Text>
                                    </View>
                                )}
                                {/* Action Buttons */}
                                <View style={styles.actionButtonsContainer}>
                                    <TouchableOpacity style={styles.scanAgainButton} onPress={handleScanPress}>
                                        <Ionicons name="scan-circle-outline" size={20} color="#fff" />
                                        <Text style={styles.scanAgainButtonText}>Scanner un autre code</Text>
                                    </TouchableOpacity>
                                    
                                    {/* DELETE COUPON BUTTON - Visible only after a coupon is scanned */}
                                    <TouchableOpacity style={styles.deleteCouponButton} onPress={handleDeleteCoupon}>
                                        <Ionicons name="trash-outline" size={20} color="#fff" />
                                        <Text style={styles.deleteCouponButtonText}>Supprimer le Coupon</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        ) : (
                            <Text style={styles.scannedDataText}>Analyse des données...</Text>
                        )}
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
    surveyInfoCard: {
        backgroundColor: '#FFFFFF',
        borderRadius: 15,
        padding: 20,
        marginBottom: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 10,
        elevation: 6,
    },
    surveyTitle: {
        fontSize: 22,
        fontWeight: '700',
        color: '#2D3748',
        marginBottom: 8,
    },
    surveyDescription: {
        fontSize: 16,
        color: '#6B7280',
        lineHeight: 24,
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
        backgroundColor: '#EF4444',
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
        borderColor: '#28a745',
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
        width: 100,
    },
    scannedDataText: {
        fontSize: 15,
        color: '#6B7280',
        flex: 1,
        lineHeight: 20,
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
        marginBottom: 10, // Space between buttons
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
    deleteCouponButton: { // NEW: Style for delete button
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#EF4444', // Red color for delete
        paddingVertical: 12,
        borderRadius: 10,
        shadowColor: '#EF4444',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 6,
    },
    deleteCouponButtonText: { // NEW: Style for delete button text
        color: '#fff',
        fontSize: 16,
        fontWeight: '600',
        marginLeft: 10,
    },
    buttonIcon: {
        marginRight: 8,
    }
});

export default PartnerSurveyDetail;
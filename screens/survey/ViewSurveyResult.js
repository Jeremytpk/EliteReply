import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  TouchableOpacity,
  Alert,
  Platform
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { db } from '../../firebase'; // Assuming firebase.js is two levels up
import { doc, getDoc, collection, getDocs, query, orderBy, where } from 'firebase/firestore'; // ADDED 'where'
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';

const { width } = Dimensions.get('window');

const ViewSurveyResultScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { surveyId } = route.params;

  const [survey, setSurvey] = useState(null); // This holds the main survey metadata (questions, title, etc.)
  const [responses, setResponses] = useState([]); // This holds the actual submitted user responses
  const [loading, setLoading] = useState(true);

  // Helper function to format date safely
  const formatDate = (dateString) => {
    if (!dateString) return 'Date inconnue';
    try {
      if (dateString.toDate) { // Check if it's a Firestore Timestamp object
        return dateString.toDate().toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
      }
      return new Date(dateString).toLocaleDateString('fr-FR', { // Otherwise, assume it's an ISO string or Date object
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Date invalide';
    }
  };

  useEffect(() => {
    const fetchSurveyAndResponses = async () => {
      setLoading(true);
      try {
        if (!surveyId) {
          Alert.alert('Erreur', 'ID de l\'enquête manquant.');
          navigation.goBack();
          return;
        }

        // 1. Fetch the main survey details (to get questions, general info for rendering)
        const surveyDocRef = doc(db, 'surveys', surveyId);
        const surveySnap = await getDoc(surveyDocRef);

        if (!surveySnap.exists()) {
          Alert.alert('Erreur', 'Enquête introuvable.');
          navigation.goBack();
          return;
        }
        setSurvey(surveySnap.data());

        // 2. Fetch all relevant responses from the TOP-LEVEL 'surveyResult' collection
        // Using only surveyId filter to avoid composite index requirement
        const responsesQuery = query(
          collection(db, 'surveyResult'), // Target the top-level collection
          where('surveyId', '==', surveyId) // Filter responses by the current survey's ID
        );
        const responsesSnap = await getDocs(responsesQuery);

        if (responsesSnap.empty) {
          setResponses([]); // No responses found
        } else {
          // Sort by timestamp in memory to avoid composite index
          const fetchedResponses = responsesSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .sort((a, b) => {
              const timestampA = a.timestamp?.toDate?.() || new Date(a.timestamp || 0);
              const timestampB = b.timestamp?.toDate?.() || new Date(b.timestamp || 0);
              return timestampB - timestampA; // Descending order
            });
          setResponses(fetchedResponses);
        }

      } catch (error) {
        console.error("Error fetching survey results:", error);
        // This query (where + orderBy) likely needs a new composite index.
        // The error message from Firebase will tell you exactly what index to create.
        Alert.alert('Erreur', 'Impossible de charger les résultats de l\'enquête. Veuillez réessayer ou vérifier la console pour créer un index Firestore.');
        // Decide whether to go back or display an error state here
      } finally {
        setLoading(false);
      }
    };

    fetchSurveyAndResponses();
  }, [surveyId, navigation]); // Dependency on surveyId

  // Helper to render different question types and their submitted answers for a GIVEN response
  const renderAnswer = (question, index, specificResponseAnswers) => {
    // Ensure survey data is loaded and specificResponseAnswers is provided
    if (!survey || !specificResponseAnswers) return null;

    const qId = question.id || `q_${index}`; // Consistent ID access
    const submittedAnswer = specificResponseAnswers[qId];

    return (
      <View key={qId} style={styles.questionCard}>
        <Text style={styles.questionNumber}>{index + 1}.</Text>
        <Text style={styles.questionText}>{question.text}</Text>

        {/* Display based on question type */}
        {question.type === 'text' && (
          <View style={styles.answerDisplayContainer}>
            <Text style={styles.answerText}>
              {submittedAnswer && submittedAnswer.trim() !== ''
                ? submittedAnswer
                : 'Pas de réponse fournie'
              }
            </Text>
          </View>
        )}

        {question.type === 'single-choice' && (
          <View style={styles.answerDisplayContainer}>
            <Text style={styles.answerText}>
              {submittedAnswer && submittedAnswer.trim() !== '' ? (
                <>
                  <Ionicons
                    name="checkmark-circle"
                    size={18}
                    color="#28a745"
                    style={styles.answerIcon}
                  />{' '}
                  {submittedAnswer}
                </>
              ) : (
                'Pas de réponse fournie'
              )}
            </Text>
          </View>
        )}

        {question.type === 'rating' && (
          <View style={styles.answerDisplayContainer}>
            <View style={styles.ratingDisplay}>
              {[...Array(question.ratingMax || 5)].map((_, i) => (
                <Ionicons
                  key={`star_${i}`}
                  name={i < submittedAnswer ? 'star' : 'star-outline'}
                  size={24}
                  color="#FFD700"
                />
              ))}
              <Text style={styles.ratingText}>
                ({submittedAnswer !== undefined && submittedAnswer !== null ? submittedAnswer : 0}/{question.ratingMax || 5})
              </Text>
            </View>
          </View>
        )}
      </View>
    );
  };

  // --- Conditional Rendering for Loading, No Survey ---
  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.infoText}>Chargement des résultats de l'enquête...</Text>
      </View>
    );
  }

  if (!survey) {
    return (
      <View style={styles.centeredContainer}>
        <Text style={styles.infoText}>Enquête non disponible.</Text>
        <TouchableOpacity style={styles.mainButton} onPress={() => navigation.goBack()}>
          <Text style={styles.mainButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Custom Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#2D3748" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Résultats de l'enquête</Text>
        <View style={{ width: 24 }} /> {/* Spacer to balance header */}
      </View>

      {/* Survey General Info */}
      <View style={styles.surveyHeader}>
        <Text style={styles.surveyTitle}>{survey.title}</Text>
        <Text style={styles.surveyDescription}>{survey.description}</Text>
        {survey.estimatedDurationMinutes && (
          <View style={styles.estimatedDuration}>
            <Ionicons name="timer-outline" size={18} color="#6B7280" />
            <Text style={styles.estimatedDurationText}>Durée estimée: {survey.estimatedDurationMinutes} min</Text>
          </View>
        )}
      </View>

      {/* Display all Responses */}
      {responses.length === 0 ? (
        <View style={styles.centeredContainerNoFlex}>
          <Ionicons name="information-circle-outline" size={50} color="#6B7280" />
          <Text style={styles.infoText}>Aucune réponse soumise pour cette enquête pour le moment.</Text>
        </View>
      ) : (
        responses.map((response, responseIndex) => (
          <View key={response.id} style={styles.singleResponseContainer}>
            <View style={styles.responseSummaryCard}>
              <Text style={styles.summaryTitle}>Réponse #{responseIndex + 1}</Text>
              <Text style={styles.summaryText}>
                <Text style={{ fontWeight: 'bold' }}>Répondu par:</Text>{' '}
                {response.userName || `Utilisateur Inconnu (ID: ${response.userId || 'N/A'})`}
              </Text>
              <Text style={styles.summaryText}>
                <Text style={{ fontWeight: 'bold' }}>Date de soumission:</Text>{' '}
                {response.timestamp ? formatDate(response.timestamp) : 'Date inconnue'}
              </Text>
              {response.isRedeemed !== undefined && ( // Display redemption status
                <Text style={styles.summaryText}>
                  <Text style={{ fontWeight: 'bold' }}>Statut Coupon:</Text>{' '}
                  {response.isRedeemed ? 'Utilisé' : 'Actif'}
                  {response.isRedeemed && response.redeemedTimestamp && (
                    <Text style={{ fontSize: 13, color: '#718096' }}> ({formatDate(response.redeemedTimestamp)})</Text>
                  )}
                </Text>
              )}
            </View>

            <View style={styles.questionsSection}>
              {survey.questions.map((q, qIndex) => renderAnswer(q, qIndex, response.answers))}
            </View>

            {/* Display Coupon Details if available in THIS response */}
            {response.couponDetails && (
              <View style={styles.rewardCard}>
                <Text style={styles.rewardTitle}>Récompense associée à cette réponse</Text>
                <Text style={styles.rewardDescription}>{response.couponDetails.title}</Text>
                <Text style={styles.rewardDescriptionDetail}>{response.couponDetails.description}</Text>
                <Text style={styles.rewardValue}>
                  {response.couponDetails.type === 'percentage'
                    ? `${response.couponDetails.value}% de réduction`
                    : `${response.couponDetails.value}€ de réduction`}
                </Text>
                <Text style={styles.rewardExpiry}>Valable jusqu'au: {formatDate(response.couponDetails.expiryDate)}</Text>
                <Text style={styles.rewardSponsor}>Sponsorisé par: {response.couponDetails.sponsorName || response.couponDetails.sponsor}</Text>
                
                {response.qrCodeData && (
                  <View style={styles.qrCodeContainer}>
                    <QRCode
                      value={response.qrCodeData}
                      size={width * 0.35}
                      color="#2D3748"
                      backgroundColor="#FFFFFF"
                      ecl="H"
                    />
                    <Text style={styles.qrCodeLabel}>Code de réduction original</Text>
                  </View>
                )}
              </View>
            )}
            {/* Add a separator between responses, but not after the last one */}
            {responseIndex < responses.length - 1 && <View style={styles.responseSeparator} />}
          </View>
        ))
      )}

      {/* Return Button */}
      <TouchableOpacity style={styles.mainButton} onPress={() => navigation.goBack()}>
        <Text style={styles.mainButtonText}>Retour à la liste</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} /> {/* Spacer at the bottom */}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
  },
  centeredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
    padding: 20,
  },
  centeredContainerNoFlex: { // For when content above it exists
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
    padding: 20,
  },
  infoText: {
    marginTop: 15,
    fontSize: 16,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 20,
  },
  mainButton: {
    backgroundColor: '#0a8fdf',
    paddingVertical: 14,
    paddingHorizontal: 30,
    borderRadius: 10,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
    alignSelf: 'center',
    marginVertical: 20,
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
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
  
  // Survey Header Styles
  surveyHeader: {
    backgroundColor: '#FFFFFF',
    padding: 25,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    marginBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 7,
  },
  surveyTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 10,
    textAlign: 'center',
    lineHeight: 36,
  },
  surveyDescription: {
    fontSize: 16,
    color: '#6B7280',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  estimatedDuration: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F4F8',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
  },
  estimatedDurationText: {
    fontSize: 15,
    color: '#0a8fdf',
    marginLeft: 8,
    fontWeight: '500',
  },

  // New: Container for each individual response
  singleResponseContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 10,
    marginBottom: 20,
    paddingVertical: 15, // Padding inside each response block
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 6,
    overflow: 'hidden', // Ensures border radius works with shadow
  },

  // Response Summary Card (within each singleResponseContainer)
  responseSummaryCard: {
    padding: 20,
    marginBottom: 10, // Margin before questions start
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#F8FBFD', // Slightly different background for summary
  },
  summaryTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    borderLeftWidth: 4,
    borderColor: '#4A90E2', // A nice blue for summary
    paddingLeft: 10,
  },
  summaryText: {
    fontSize: 16,
    color: '#4A5568',
    marginBottom: 5,
  },

  // Questions Section Styles (reused but within each response container)
  questionsSection: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  questionCard: {
    backgroundColor: '#FFFFFF', // Inherits parent background for clarity
    borderRadius: 15,
    padding: 18,
    marginBottom: 12, // Slightly smaller margin between questions
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 3,
  },
  questionNumber: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0a8fdf',
    marginBottom: 6,
  },
  questionText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 12,
    lineHeight: 24,
  },
  
  // Answer Display Styles
  answerDisplayContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 12,
    minHeight: 50,
    justifyContent: 'center',
  },
  answerText: {
    fontSize: 15,
    color: '#2D3748',
    lineHeight: 22,
  },
  answerIcon: {
    marginRight: 5,
  },
  ratingDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    fontSize: 15,
    color: '#4A5568',
    marginLeft: 10,
    fontWeight: '500',
  },

  // Reward Card for display (within each singleResponseContainer)
  rewardCard: {
    backgroundColor: '#F0FBF5', // Lighter green for coupon background
    borderRadius: 15,
    padding: 25,
    marginHorizontal: 20, // Keep consistent with other sections
    marginTop: 10, // Margin from questions
    marginBottom: 10, // Margin before separator
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 15,
    elevation: 8,
    borderLeftWidth: 6,
    borderColor: '#28a745',
  },
  rewardTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 10,
    textAlign: 'center',
  },
  rewardDescription: {
    fontSize: 14,
    color: '#555',
    marginBottom: 4,
    textAlign: 'center',
    lineHeight: 20,
  },
  rewardDescriptionDetail: {
    fontSize: 13,
    color: '#666',
    marginBottom: 12,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  rewardValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 10,
  },
  rewardExpiry: {
    fontSize: 14,
    color: '#777',
    marginBottom: 6,
  },
  rewardSponsor: {
    fontSize: 14,
    color: '#777',
    fontStyle: 'italic',
  },
  qrCodeContainer: {
    marginTop: 20,
    paddingTop: 15,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#CCE2D0', // Lighter border for QR code
    alignItems: 'center',
    width: '100%',
  },
  qrCodeLabel: {
    marginTop: 12,
    fontSize: 14,
    color: '#4A5568',
    textAlign: 'center',
    fontWeight: '500',
  },
  responseSeparator: {
    height: 10, // Space between responses
    backgroundColor: '#E0E7EB', // Light grey separator
    marginVertical: 15,
    marginHorizontal: 20,
    borderRadius: 5,
  }
});

export default ViewSurveyResultScreen;
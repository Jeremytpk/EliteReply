import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Dimensions,
  Platform
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import { db, auth } from '../../firebase';
import { doc, getDoc, updateDoc, arrayUnion, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import StarRating from '../StarRating';

const { width } = Dimensions.get('window');

const AnswerSurveyScreen = () => {
  const route = useRoute();
  const navigation = useNavigation();
  const { surveyId } = route.params;

  const [survey, setSurvey] = useState(null);
  const [responses, setResponses] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [alreadyCompleted, setAlreadyCompleted] = useState(false);
  const [showCoupon, setShowCoupon] = useState(false);
  const [generatedQrCodeString, setGeneratedQrCodeString] = useState('');

  const formatDate = (date) => {
    if (!date) return 'Date inconnue';
    try {
      if (date.toDate) {
        return date.toDate().toLocaleDateString('fr-FR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
      }
      return new Date(date).toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch (e) {
      console.error("Error formatting date:", e);
      return 'Date invalide';
    }
  };

  useEffect(() => {
    const fetchSurvey = async () => {
      setLoading(true);
      try {
        const surveyDocRef = doc(db, 'surveys', surveyId);
        const surveySnap = await getDoc(surveyDocRef);

        if (surveySnap.exists()) {
          const surveyData = surveySnap.data();
          setSurvey(surveyData);

          const currentUserUid = auth.currentUser?.uid;
          if (currentUserUid && surveyData.completedByUsers?.includes(currentUserUid)) {
            setAlreadyCompleted(true);
            Alert.alert(
              'Enquête déjà complétée',
              'Vous avez déjà participé à cette enquête. Merci pour votre contribution !',
              [{ text: 'OK', onPress: () => navigation.goBack() }]
            );
          } else {
            const initialResponses = {};
            surveyData.questions.forEach((q, index) => {
              const qId = q.id || `q_${index}`;
              initialResponses[qId] = q.type === 'rating' ? 0 : '';
            });
            setResponses(initialResponses);
          }
        } else {
          Alert.alert('Erreur', 'Enquête introuvable.');
          navigation.goBack();
        }
      } catch (error) {
        console.error("Error fetching survey:", error);
        Alert.alert('Erreur', 'Impossible de charger l\'enquête.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    if (surveyId) {
      fetchSurvey();
    } else {
      Alert.alert('Erreur', 'ID de l\'enquête manquant.');
      navigation.goBack();
    }
  }, [surveyId, navigation]);

  const handleResponseChange = (questionId, value) => {
    setResponses((prevResponses) => ({
      ...prevResponses,
      [questionId]: value,
    }));
  };

  const validateResponses = () => {
    if (!survey || !survey.questions) {
      Alert.alert('Erreur', 'Impossible de valider les réponses sans les questions de l\'enquête.');
      return false;
    }
    for (const q of survey.questions) {
      const qId = q.id || `q_${survey.questions.indexOf(q)}`;
      const answer = responses[qId];

      if (q.type === 'text' && (!answer || !answer.trim())) {
        Alert.alert('Réponse requise', `Veuillez répondre à la question: "${q.text}"`);
        return false;
      }
      if (q.type === 'single-choice' && !answer) {
        Alert.alert('Sélection requise', `Veuillez choisir une option pour la question: "${q.text}"`);
        return false;
      }
      if (q.type === 'rating' && (answer === undefined || answer === null || answer === 0)) {
        Alert.alert('Notation requise', `Veuillez noter la question: "${q.text}"`);
        return false;
      }
    }
    return true;
  };

  const generateQrCodeData = () => {
    const userDisplayName = auth.currentUser?.displayName || 'Utilisateur Inconnu';
    const couponValueString = survey.couponDetails.type === 'percentage'
      ? `${survey.couponDetails.value}%`
      : `${survey.couponDetails.value}€`;

    // Ensure expiryDate is handled correctly (Firestore Timestamp or Date object)
    let expiryDateForQr = 'Date inconnue';
    if (survey.couponDetails.expiryDate) {
        if (survey.couponDetails.expiryDate.toDate) {
            expiryDateForQr = survey.couponDetails.expiryDate.toDate().toISOString();
        } else if (typeof survey.couponDetails.expiryDate === 'string' || survey.couponDetails.expiryDate instanceof Date) {
            expiryDateForQr = new Date(survey.couponDetails.expiryDate).toISOString();
        }
    }

    const qrData = {
        userName: userDisplayName,
        surveyTitle: survey.title,
        couponValue: couponValueString,
        couponExpiry: expiryDateForQr, // <-- ADDED: Expiration date in ISO format
        surveyId: surveyId,
        userId: auth.currentUser?.uid,
        timestamp: new Date().toISOString()
        // The QR code itself does not "count" user engagement.
        // It's a token for an engagement (the survey submission).
        // User engagement is measured by responsesCount in the survey document
        // and by tracking coupon redemptions (e.g., isRedeemed, redeemedTimestamp).
    };
    return JSON.stringify(qrData);
  };

  const handleSubmitSurvey = async () => {
    if (alreadyCompleted) {
      Alert.alert('Attention', 'Vous avez déjà complété cette enquête.');
      return;
    }

    if (!validateResponses()) {
      return;
    }

    setSubmitting(true);
    try {
      const surveyDocRef = doc(db, 'surveys', surveyId);
      const currentUser = auth.currentUser;

      if (!currentUser) {
        Alert.alert('Erreur', 'Vous devez être connecté pour soumettre une enquête.');
        setSubmitting(false);
        return;
      }

      await updateDoc(surveyDocRef, {
        responsesCount: (survey.responsesCount || 0) + 1,
        completedByUsers: arrayUnion(currentUser.uid),
      });

      const qrCodeDataString = generateQrCodeData();
      setGeneratedQrCodeString(qrCodeDataString);

      await addDoc(collection(db, 'surveyResult'), {
        userId: currentUser.uid,
        userName: currentUser.displayName || 'N/A',
        surveyId: surveyId,
        surveyTitle: survey.title,
        answers: responses,
        qrCodeData: qrCodeDataString,
        couponDetails: survey.couponDetails,
        timestamp: serverTimestamp(),
        isRedeemed: false,
      });

      Alert.alert('Succès', 'Merci d\'avoir complété l\'enquête !');
      setShowCoupon(true);
    } catch (error) {
      console.error("Error submitting survey or storing response:", error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la soumission de l\'enquête. Veuillez réessayer.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderQuestion = (question, index) => {
    const qId = question.id || `q_${index}`;
    const currentResponse = responses[qId];

    return (
      <View key={qId} style={styles.questionCard}>
        <Text style={styles.questionNumber}>{index + 1}.</Text>
        <Text style={styles.questionText}>{question.text}</Text>

        {question.type === 'text' && (
          <TextInput
            style={styles.textInput}
            value={currentResponse}
            onChangeText={(text) => handleResponseChange(qId, text)}
            placeholder="Votre réponse..."
            multiline
            textAlignVertical="top"
          />
        )}

        {question.type === 'single-choice' && (
          <View style={styles.optionsList}>
            {question.options && question.options.map((option, optIndex) => (
              <TouchableOpacity
                key={optIndex}
                style={[
                  styles.optionButton,
                  currentResponse === option && styles.optionButtonSelected,
                ]}
                onPress={() => handleResponseChange(qId, option)}
              >
                <Ionicons
                  name={currentResponse === option ? 'radio-button-on' : 'radio-button-off'}
                  size={22}
                  color={currentResponse === option ? '#0a8fdf' : '#A0AEC0'}
                  style={styles.optionIcon}
                />
                <Text style={[
                  styles.optionText,
                  currentResponse === option && styles.optionTextSelected
                ]}>{option}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {question.type === 'rating' && (
          <StarRating
            rating={currentResponse}
            setRating={(r) => handleResponseChange(qId, r)}
            maxStars={question.ratingMax || 5}
            size={width / 10}
            color="#FFD700"
          />
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={styles.centeredContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.infoText}>Chargement de l'enquête...</Text>
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

  if (alreadyCompleted && !showCoupon) {
    return (
      <View style={styles.centeredContainer}>
        <Ionicons name="checkmark-circle-outline" size={80} color="#28a745" />
        <Text style={styles.infoText}>Vous avez déjà complété cette enquête. Merci pour votre contribution !</Text>
        <TouchableOpacity style={styles.mainButton} onPress={() => navigation.goBack()}>
          <Text style={styles.mainButtonText}>Retour</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showCoupon) {
    return (
      <ScrollView contentContainerStyle={styles.couponScreenContainer}>
        <View style={styles.couponGlobe}>
          <Ionicons name="gift-outline" size={width * 0.25} color="#FFFFFF" />
        </View>
        <Text style={styles.couponScreenTitle}>Votre Récompense !</Text>
        <Text style={styles.couponScreenSubtitle}>Merci d'avoir participé à l'enquête.</Text>

        <View style={styles.rewardCard}>
          <Text style={styles.rewardTitle}>{survey.couponDetails.title}</Text>
          <Text style={styles.rewardDescription}>{survey.couponDetails.description}</Text>
          <Text style={styles.rewardValue}>
            {survey.couponDetails.type === 'percentage'
              ? `${survey.couponDetails.value}% de réduction`
              : `${survey.couponDetails.value}€ de réduction`}
          </Text>
          <Text style={styles.rewardExpiry}>Valable jusqu'au: {formatDate(survey.couponDetails.expiryDate)}</Text>
          <Text style={styles.rewardSponsor}>Sponsorisé par: {survey.couponDetails.sponsor}</Text>
          
          <View style={styles.qrCodeContainer}>
            {generatedQrCodeString ? (
              <QRCode
                value={generatedQrCodeString}
                size={width * 0.5}
                color="#2D3748"
                backgroundColor="#FFFFFF"
                ecl="H"
              />
            ) : (
              <ActivityIndicator size="large" color="#0a8fdf" />
            )}
            <Text style={styles.qrCodeLabel}>Présentez ce code à notre partenaire</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.mainButton} onPress={() => navigation.goBack()}>
          <Text style={styles.mainButtonText}>Terminé</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.container}>
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

      <View style={styles.questionsSection}>
        {survey.questions.map((q, index) => renderQuestion(q, index))}
      </View>

      <TouchableOpacity
        style={styles.submitButton}
        onPress={handleSubmitSurvey}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="send-outline" size={24} color="#fff" style={styles.submitButtonIcon} />
            <Text style={styles.submitButtonText}>Soumettre l'enquête</Text>
          </>
        )}
      </TouchableOpacity>
      <View style={{ height: 40 }} />
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
  },
  mainButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
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

  // Questions Section Styles
  questionsSection: {
    paddingHorizontal: 20,
  },
  questionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 5,
  },
  questionNumber: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0a8fdf',
    marginBottom: 8,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2D3748',
    marginBottom: 15,
    lineHeight: 26,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 15,
    fontSize: 16,
    color: '#2D3748',
    minHeight: 100,
    textAlignVertical: 'top',
  },
  optionsList: {
    marginTop: 5,
  },
  optionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 15,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  optionButtonSelected: {
    borderColor: '#0a8fdf',
    backgroundColor: '#EBF3F8',
  },
  optionIcon: {
    marginRight: 12,
  },
  optionText: {
    fontSize: 16,
    color: '#4A5568',
    fontWeight: '500',
  },
  optionTextSelected: {
    color: '#0a8fdf',
    fontWeight: '700',
  },

  // Submit Button Styles
  submitButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#28a745',
    padding: 20,
    borderRadius: 15,
    marginTop: 30,
    marginBottom: 40,
    marginHorizontal: 20,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
  submitButtonIcon: {
    marginRight: 12,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: 'bold',
  },

  // Coupon Screen Styles
  couponScreenContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F0F4F8',
    padding: 20,
    paddingVertical: 40,
  },
  couponGlobe: {
    backgroundColor: '#28a745',
    width: width * 0.35,
    height: width * 0.35,
    borderRadius: (width * 0.35) / 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 30,
    shadowColor: '#28a745',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 10,
  },
  couponScreenTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 10,
    textAlign: 'center',
  },
  couponScreenSubtitle: {
    fontSize: 18,
    color: '#6B7280',
    marginBottom: 30,
    textAlign: 'center',
  },
  rewardCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 450,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 25,
    elevation: 12,
    marginBottom: 40,
    borderLeftWidth: 6,
    borderColor: '#28a745',
  },
  rewardTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#333',
    marginBottom: 12,
    textAlign: 'center',
  },
  rewardDescription: {
    fontSize: 15,
    color: '#555',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 24,
  },
  rewardValue: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#28a745',
    marginBottom: 12,
  },
  rewardExpiry: {
    fontSize: 15,
    color: '#777',
    marginBottom: 8,
  },
  rewardSponsor: {
    fontSize: 15,
    color: '#777',
    fontStyle: 'italic',
  },
  qrCodeContainer: {
    marginTop: 25,
    paddingTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    width: '100%',
  },
  qrCodeLabel: {
    marginTop: 15,
    fontSize: 15,
    color: '#4A5568',
    textAlign: 'center',
    fontWeight: '500',
  },
});

export default AnswerSurveyScreen;
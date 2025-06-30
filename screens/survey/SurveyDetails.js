import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Share,
} from 'react-native';
import { doc, getDoc, collection, getDocs } from 'firebase/firestore'; // Import collection and getDocs
import { db } from '../../firebase';
import { Ionicons } from '@expo/vector-icons';
import * as Animatable from 'react-native-animatable';
import { useNavigation } from '@react-navigation/native'; // Import useNavigation

const SurveyDetails = ({ route, navigation }) => {
  const { surveyId } = route.params;
  const [survey, setSurvey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [couponRedeemed, setCouponRedeemed] = useState(false);
  const [responseCount, setResponseCount] = useState(0); // New state for response count

  useEffect(() => {
    const fetchSurveyDetails = async () => {
      try {
        const docRef = doc(db, 'surveys', surveyId);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          setSurvey({ id: docSnap.id, ...docSnap.data() });

          // NEW: Fetch response count from the subcollection
          const responsesRef = collection(db, 'surveys', surveyId, 'responses');
          const responsesSnap = await getDocs(responsesRef);
          setResponseCount(responsesSnap.size); // Set the count
        } else {
          console.log("No such survey!");
        }
      } catch (error) {
        console.error("Error fetching survey details:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchSurveyDetails();
  }, [surveyId]);

  const handleRedeemCoupon = () => {
    // In a real app, you would probably make an API call to mark the coupon as used
    setCouponRedeemed(true);
  };

  const handleShareCoupon = async () => {
    try {
      await Share.share({
        message: `Check out this coupon from ${survey.sponsoredBy}: ${survey.couponCode} - ${survey.couponDescription}`,
        title: `Coupon from ${survey.sponsoredBy}`,
      });
    } catch (error) {
      console.error('Error sharing coupon:', error);
    }
  };

  const handleViewResponses = () => {
    navigation.navigate('ViewSurveyResult', { surveyId: surveyId }); // Navigate to the new screen
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  if (!survey) {
    return (
      <View style={styles.container}>
        <Text style={styles.notFoundText}>Survey not found</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#0a8fdf" />
      </TouchableOpacity>

      <Text style={styles.title}>{survey.title}</Text>

      <View style={styles.detailsContainer}>
        <Text style={styles.description}>{survey.description}</Text>

        <View style={styles.metaContainer}>
          <View style={styles.metaItem}>
            <Ionicons name="time-outline" size={18} color="#666" />
            <Text style={styles.metaText}>
              {survey.createdAt?.toDate().toLocaleDateString()}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Ionicons name={survey.active ? 'checkmark-circle' : 'close-circle'} size={18} color={survey.active ? '#4CAF50' : '#F44336'} />
            <Text style={styles.metaText}>
              {survey.active ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>

        {/* NEW: Display response count */}
        <Text style={styles.responseCount}>
          {responseCount} User(s) Engaged
        </Text>

        {/* NEW: Button to view responses */}
        <TouchableOpacity
          style={styles.viewResponsesButton}
          onPress={handleViewResponses}
        >
          <Text style={styles.viewResponsesButtonText}>View Responses</Text>
        </TouchableOpacity>
      </View>

      {survey.sponsoredBy && survey.couponCode && (
        <Animatable.View
          animation="fadeInUp"
          duration={1000}
          style={styles.couponContainer}
        >
          {/* Coupon Display (existing code) */}
        </Animatable.View>
      )}

      <View style={styles.questionsContainer}>
        <Text style={styles.sectionTitle}>Survey Questions</Text>

        {survey.questions && survey.questions.length > 0 ? (
          survey.questions.map((question, index) => (
            <View key={index} style={styles.questionItem}>
              <Text style={styles.questionText}>{index + 1}. {question.text}</Text>
              {question.options && (
                <View style={styles.optionsContainer}>
                  {question.options.map((option, optIndex) => (
                    <Text key={optIndex} style={styles.optionText}>• {option}</Text>
                  ))}
                </View>
              )}
            </View>
          ))
        ) : (
          <Text style={styles.noQuestions}>No questions available for this survey</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
    paddingTop: 60,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: 15,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  notFoundText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  detailsContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  description: {
    fontSize: 16,
    color: '#555',
    marginBottom: 15,
    lineHeight: 24,
  },
  metaContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    fontSize: 14,
    color: '#666',
    marginLeft: 5,
  },
  couponContainer: {
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 0,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#eee',
    overflow: 'hidden',
  },
  couponHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#0a8fdf',
    padding: 15,
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  couponTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  sponsorLogo: {
    width: 60,
    height: 30,
  },
  couponBody: {
    padding: 20,
    position: 'relative',
  },
  couponCodeContainer: {
    backgroundColor: '#f0f9ff',
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0a8fdf',
    borderStyle: 'dashed',
    marginBottom: 15,
    alignItems: 'center',
  },
  couponCode: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0a8fdf',
    letterSpacing: 2,
  },
  couponDescription: {
    fontSize: 16,
    color: '#555',
    marginBottom: 10,
    textAlign: 'center',
  },
  couponTerms: {
    fontSize: 12,
    color: '#888',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  couponButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  couponButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    flex: 1,
  },
  redeemButton: {
    backgroundColor: '#0a8fdf',
    marginRight: 10,
  },
  redeemedButton: {
    backgroundColor: '#4CAF50',
  },
  shareButton: {
    backgroundColor: '#6c757d',
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    marginLeft: 5,
  },
  couponDots: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    transform: [{ translateY: -5 }],
  },
  questionsContainer: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    paddingBottom: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  questionItem: {
    marginBottom: 15,
  },
  questionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#444',
    marginBottom: 8,
  },
  optionsContainer: {
    marginLeft: 15,
  },
  optionText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  noQuestions: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    marginVertical: 10,
  },
  // NEW STYLES
  responseCount: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
    color: '#0a8fdf',
    textAlign: 'center',
  },
  viewResponsesButton: {
    backgroundColor: '#0a8fdf',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignSelf: 'center',
    marginTop: 15,
  },
  viewResponsesButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});

export default SurveyDetails;
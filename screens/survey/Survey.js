import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
  Image // Import Image for custom icons
} from 'react-native';
import { collection, getDocs, query, where, onSnapshot, orderBy, doc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Ionicons } from '@expo/vector-icons'; // Keeping Ionicons import, though custom icons will replace most uses
import { useFocusEffect } from '@react-navigation/native';

// --- NEW: Import your custom icons ---
const ADD_SURVEY_ICON = require('../../assets/icons/add_circle.png'); // For create new survey button
const DOCUMENT_OUTLINE_ICON = require('../../assets/icons/doc.png'); // For empty state
const TRASH_ICON = require('../../assets/icons/delete.png'); // For delete survey button
const GIFT_ICON = require('../../assets/icons/gift.png'); // For reward icon

const SurveyScreen = ({ navigation }) => {
  const [surveys, setSurveys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newSurveysCount, setNewSurveysCount] = useState(0);

  // Helper function to format date safely
  const formatDate = (date) => {
    if (!date || !(date instanceof Date)) return 'Date inconnue';
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Function to handle survey deletion (manual via button)
  const handleDeleteSurvey = (surveyId, surveyTitle) => {
    Alert.alert(
      'Confirmer la suppression',
      `Voulez-vous vraiment supprimer l'enquête "${surveyTitle || 'Sans titre'}" ? Cette action est irréversible et supprimera également toutes ses réponses.`,
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Supprimer',
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'surveys', surveyId));
              Alert.alert('Succès', `L'enquête "${surveyTitle}" a été supprimée.`);
            } catch (error) {
              console.error("Error deleting survey:", error);
              Alert.alert('Erreur', 'Impossible de supprimer l\'enquête. Veuillez réessayer.');
            }
          },
          style: 'destructive',
        },
      ]
    );
  };

  // Real-time listener for surveys with auto-deletion for expired ones
  useEffect(() => {
    const surveysQuery = query(
      collection(db, 'surveys'),
      orderBy('createdAt', 'desc')
    );

    const deletingSurveyIds = new Set();
    
    const unsubscribe = onSnapshot(
      surveysQuery,
      (querySnapshot) => {
        const surveysList = [];
        let newCount = 0;
        const now = new Date();
        const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        
        querySnapshot.forEach(doc => {
          const surveyData = doc.data();
          
          // Safely handle createdAt and expiryDate fields and convert to Date object
          const createdAt = surveyData.createdAt?.toDate 
            ? surveyData.createdAt.toDate() 
            : null;
          // Correctly looking for 'expiryDate'
          const expiryDate = surveyData.expiryDate?.toDate 
            ? surveyData.expiryDate.toDate() 
            : null;
          
          // --- Auto-deletion logic for expired surveys ---
          // Use 'expiryDate' here
          if (expiryDate && expiryDate < now && !deletingSurveyIds.has(doc.id)) {
            console.log(`Survey "${surveyData.title || 'Sans titre'}" (ID: ${doc.id}) has expired. Attempting to delete.`);
            deletingSurveyIds.add(doc.id);
            deleteDoc(doc(db, 'surveys', doc.id))
              .then(() => {
                console.log(`Survey "${surveyData.title || 'Sans titre'}" (ID: ${doc.id}) successfully auto-deleted.`);
              })
              .catch(error => {
                console.error(`Error auto-deleting expired survey "${surveyData.title || 'Sans titre'}" (ID: ${doc.id}):`, error);
                deletingSurveyIds.delete(doc.id);
              });
            return;
          }
          // --- End auto-deletion logic ---

          const survey = { 
            id: doc.id, 
            ...surveyData,
            createdAt,
            expiryDate // Include expiryDate in the survey object for display
          };
          
          surveysList.push(survey);
          
          // Check if survey is new (created in last 24 hours)
          if (createdAt && createdAt > twentyFourHoursAgo) {
            newCount++;
          }
        });
        
        setSurveys(surveysList);
        setNewSurveysCount(newCount);
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to surveys:", error);
        setLoading(false);
        Alert.alert('Erreur', 'Impossible de charger les enquêtes.');
      }
    );

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={{ marginTop: 10 }}>Chargement des enquêtes...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Enquêtes</Text>
          {newSurveysCount > 0 && (
            <Text style={styles.newSurveysText}>
              {newSurveysCount} nouvelle(s) enquête(s) disponible(s)!
            </Text>
          )}
        </View>
        <TouchableOpacity 
          style={styles.createButton}
          onPress={() => navigation.navigate('CreateSurvey')}
        >
          {/* --- MODIFIED: Using custom add survey icon --- */}
          <Image source={ADD_SURVEY_ICON} style={styles.customCreateButtonIcon} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.createButtonText}>Nouvelle enquête</Text>
        </TouchableOpacity>
      </View>

      {surveys.length === 0 ? (
        <View style={styles.emptyContainer}>
          {/* --- MODIFIED: Using custom document outline icon for empty state --- */}
          <Image source={DOCUMENT_OUTLINE_ICON} style={styles.customEmptyIcon} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.noSurveys}>Aucune enquête disponible</Text>
          <Text style={styles.noSurveysSubtitle}>
            Créez une nouvelle enquête ou revenez plus tard
          </Text>
        </View>
      ) : (
        surveys.map(survey => {
          const isNew = survey.createdAt && survey.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000);
          
          return (
            <TouchableOpacity 
              key={survey.id} 
              style={[
                styles.surveyCard,
                isNew && styles.newSurveyCard
              ]}
              onPress={() => navigation.navigate('SurveyDetails', { surveyId: survey.id })}
            >
              <View style={styles.surveyCardHeader}>
                <Text style={styles.surveyTitleCard}>{survey.title || 'Sans titre'}</Text>
                {isNew && (
                  <View style={styles.newBadge}>
                    <Text style={styles.newBadgeText}>Nouveau</Text>
                  </View>
                )}
                <TouchableOpacity 
                  style={styles.deleteButton}
                  onPress={() => handleDeleteSurvey(survey.id, survey.title)}
                >
                  {/* --- MODIFIED: Using custom trash icon --- */}
                  <Image source={TRASH_ICON} style={styles.customDeleteButtonIcon} />
                  {/* --- END MODIFIED --- */}
                </TouchableOpacity>
              </View>
              <Text style={styles.surveyStatus}>
                Statut: {survey.active ? 'Active' : 'Inactive'}
              </Text>
              <Text style={styles.surveyDate}>
                Créé le: {formatDate(survey.createdAt)}
              </Text>
              {survey.expiryDate && ( // Display expiry date if it exists
                  <Text style={styles.surveyDate}>
                      Expire le: {formatDate(survey.expiryDate)}
                  </Text>
              )}
              {survey.reward && (
                <View style={styles.rewardContainer}>
                  {/* --- MODIFIED: Using custom gift icon --- */}
                  <Image source={GIFT_ICON} style={styles.customRewardIcon} />
                  {/* --- END MODIFIED --- */}
                  <Text style={styles.surveyReward}>
                    Récompense: {survey.reward}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </ScrollView>
  );
};

// Define baseCardStyles outside StyleSheet.create to allow spreading
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
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
    paddingTop: Platform.OS === 'android' ? 40 : 20, // Adjust padding for Android status bar
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#333',
  },
  newSurveysText: {
    fontSize: 14,
    color: '#0a8fdf',
    marginTop: 4,
    fontWeight: '600',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0a8fdf',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 4,
  },
  // --- NEW STYLE for custom create button icon ---
  customCreateButtonIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  createButtonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: 'bold',
    fontSize: 15,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 60,
  },
  // --- NEW STYLE for custom empty state icon ---
  customEmptyIcon: {
    width: 60, // Match Ionicons size
    height: 60, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#cbd5e1', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  noSurveys: {
    textAlign: 'center',
    marginTop: 15,
    fontSize: 16,
    color: '#666',
  },
  noSurveysSubtitle: {
    textAlign: 'center',
    marginTop: 5,
    fontSize: 14,
    color: '#999',
  },
  surveyCard: {
    ...baseCardStyles, // Use spread operator to include common card styles
    // Specific surveyCard shadows if needed, or rely on baseCard
  },
  newSurveyCard: {
    borderLeftWidth: 6,
    borderLeftColor: '#0a8fdf',
  },
  surveyCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  surveyTitleCard: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    flex: 1,
    marginRight: 10,
  },
  newBadge: {
    backgroundColor: '#0a8fdf',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginLeft: 10,
  },
  newBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: 'bold',
  },
  surveyStatus: {
    fontSize: 15,
    color: '#666',
    marginBottom: 5,
    fontWeight: '500',
  },
  surveyDate: {
    fontSize: 14,
    color: '#777',
    marginBottom: 10,
  },
  rewardContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  // --- NEW STYLE for custom reward icon ---
  customRewardIcon: {
    width: 16, // Match Ionicons size
    height: 16, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#25c15b', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  surveyReward: {
    fontSize: 15,
    color: '#25c15b',
    fontWeight: 'bold',
    marginLeft: 8,
  },
  deleteButton: {
    padding: 5,
    marginLeft: 10,
  },
  // --- NEW STYLE for custom delete button icon ---
  customDeleteButtonIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#EF4444', // Match Ionicons color
  },
  // --- END NEW STYLE ---
});

export default SurveyScreen;
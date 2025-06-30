import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
  FlatList,
  Image,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { collection, addDoc, setDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';

const UserRequest = ({ navigation }) => {
  const [user, setUser] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [formData, setFormData] = useState({
    category: '',
    phoneNumber: '',
    message: ''
  });
  const [errors, setErrors] = useState({
    category: false,
    message: false
  });
  const [isLoading, setIsLoading] = useState(false);
  const phoneInputRef = useRef(null);
  const messageInputRef = useRef(null);

  const categories = [
    { id: 'voyage', name: 'Voyage', icon: 'flight' },
    { id: 'transport', name: 'Transport', icon: 'directions-bus' },
    { id: 'stores', name: 'Shopping', icon: 'shopping-cart' },
    { id: 'restaurants', name: 'Restaurants', icon: 'restaurant' },
    { id: 'sante', name: 'Santé', icon: 'local-hospital' },
    { id: 'airBnB', name: 'AirBnB', icon: 'night-shelter' },
    { id: 'events', name: 'Events', icon: 'event' },
    { id: 'autre', name: 'Autres', icon: 'help' },
  ];

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (authUser) => {
      if (authUser) {
        setUser(authUser);
        try {
          const userDoc = await getDoc(doc(db, "users", authUser.uid));
          if (userDoc.exists()) {
            const data = userDoc.data();
            setUserData(data);
            setFormData(prev => ({
              ...prev,
              phoneNumber: data.phoneNumber || '',
            }));
          } else {
            // If user document doesn't exist, create it with default values
            await setDoc(doc(db, "users", authUser.uid), {
              email: authUser.email,
              name: authUser.displayName || 'Utilisateur',
              isPremium: false, // Default to false
              createdAt: serverTimestamp(),
              phoneNumber: '',
            }, { merge: true }); // Use merge: true to avoid overwriting if doc might partially exist
            setUserData({ isPremium: false, name: authUser.displayName || 'Utilisateur', phoneNumber: '' });
          }
        } catch (error) {
          console.error("Error fetching user data:", error);
          Alert.alert('Erreur', 'Impossible de charger les données utilisateur');
        }
      } else {
        setUserData(null);
        setFormData(prev => ({ ...prev, phoneNumber: '', message: '' }));
      }
      setIsAuthChecked(true);
    });

    return unsubscribe;
  }, []);

  const handleChange = (name, value) => {
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: false }));
    }
  };

  const validateFields = () => {
    const newErrors = {
      category: !formData.category,
      message: !formData.message
    };
    setErrors(newErrors);
    return !Object.values(newErrors).some(error => error);
  };

  const handleSubmit = async () => {
    if (!validateFields()) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    setIsLoading(true);
    try {
      const ticketId = doc(collection(db, "tickets")).id;

      // Use user's current phone number from form, or previously saved, or none
      const userPhoneNumber = formData.phoneNumber.trim() !== '' ? formData.phoneNumber.trim() : (userData?.phoneNumber || user?.phoneNumber || '');

      const ticketData = {
        id: ticketId,
        userId: user.uid,
        name: userData?.name || user?.displayName || 'Client',
        phone: userPhoneNumber,
        category: formData.category,
        message: formData.message,
        status: 'jey-handling',
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        userName: userData?.name || user?.displayName || 'Client',
        userPhone: userPhoneNumber,
        lastMessage: `${formData.message.substring(0, 50)}${formData.message.length > 50 ? '...' : ''}`,
        isAgentRequested: false,
        initialJeyMessageSent: false,
        // --- START OF NEW: Add userIsPremium status ---
        userIsPremium: userData?.isPremium || false,
        // --- END OF NEW ---
      };

      await setDoc(doc(db, "tickets", ticketId), ticketData);

      const conversationData = {
        ticketId: ticketId,
        participants: [user.uid],
        participantNames: [userData?.name || user?.displayName || 'Client'],
        category: formData.category,
        createdAt: serverTimestamp(),
        lastUpdated: serverTimestamp(),
        status: 'jey-handling',
        isITSupport: false,
        userId: user.uid,
        lastMessage: `${formData.message.substring(0, 50)}${formData.message.length > 50 ? '...' : ''}`,
        isAgentRequested: false,
        // --- START OF NEW: Add userIsPremium status ---
        userIsPremium: userData?.isPremium || false,
        // --- END OF NEW ---
      };

      await setDoc(doc(db, "conversations", ticketId), conversationData);

      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        texte: formData.message,
        expediteurId: user.uid,
        nomExpediteur: userData?.name || user?.displayName || 'Client',
        createdAt: serverTimestamp(),
        type: 'text'
      });

      Alert.alert(
        'Demande soumise!',
        'Votre demande a été soumise. Vous serez bientôt mis en relation avec un agent.',
        [
          {
            text: 'OK',
            onPress: () => {
              setFormData({
                category: '',
                phoneNumber: '',
                message: ''
              });
              navigation.navigate('Conversation', {
                ticketId: ticketId,
                userId: user.uid,
                userName: userData?.name || user?.displayName || 'Client',
                userPhone: userPhoneNumber,
                ticketCategory: formData.category,
              });
            }
          }
        ]
      );

    } catch (error) {
      console.error('Full Error Object:', error);
      Alert.alert(
        'Erreur',
        `Une erreur est survenue: ${error.message || 'Veuillez réessayer plus tard'}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  if (!isAuthChecked) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.authRequiredContainer}>
        <Image
          source={require('../assets/images/logoFace.png')}
          style={styles.authImage}
          resizeMode="contain"
        />
        <Text style={styles.authTitle}>Connexion Requise</Text>
        <Text style={styles.authMessage}>
          Vous devez être connecté pour soumettre une demande d'assistance.
        </Text>
        <TouchableOpacity
          style={styles.authButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.authButtonText}>Se Connecter</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.authSecondaryButton}
          onPress={() => navigation.navigate('Signup')}
        >
          <Text style={styles.authSecondaryButtonText}>Créer un Compte</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.fullScreenContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoidingContainer}
        keyboardVerticalOffset={90}
      >
        <ScrollView contentContainerStyle={styles.scrollContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>Demande d'Assistance</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Informations Personnelles</Text>

            <View style={styles.userInfoContainer}>
              <Text style={styles.userInfoLabel}>Nom:</Text>
              <Text style={styles.userInfoValue}>
                {userData?.name || user?.displayName || 'Utilisateur'}
              </Text>
            </View>

            <View style={styles.inputContainer}>
                <Text style={styles.label}>Téléphone (facultatif)</Text>
                <TextInput
                    ref={phoneInputRef}
                    style={styles.input}
                    placeholder={user?.phoneNumber || userData?.phoneNumber || "Entrez votre numéro de téléphone"}
                    keyboardType="phone-pad"
                    value={formData.phoneNumber}
                    onChangeText={(text) => handleChange('phoneNumber', text)}
                />
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Détails de la Requête</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Catégorie *</Text>
              <FlatList
                data={categories}
                numColumns={2}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                contentContainerStyle={styles.categoriesGrid}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.categoryCard,
                      formData.category === item.id && styles.categoryCardSelected,
                    ]}
                    onPress={() => handleChange('category', item.id)}
                  >
                    <MaterialIcons
                      name={item.icon}
                      size={24}
                      color={formData.category === item.id ? '#FFF' : '#34C759'}
                    />
                    <Text style={[
                      styles.categoryText,
                      formData.category === item.id && styles.categoryTextSelected
                    ]}>
                      {item.name}
                    </Text>
                  </TouchableOpacity>
                )}
              />
              {errors.category && <Text style={styles.errorText}>Veuillez sélectionner une catégorie</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Description de la Requête *</Text>
              <TextInput
                ref={messageInputRef}
                style={[styles.messageInput, errors.message && styles.inputError]}
                placeholder="Décrivez votre Requête en détail..."
                multiline
                numberOfLines={5}
                value={formData.message}
                onChangeText={(text) => handleChange('message', text)}
              />
              {errors.message && <Text style={styles.errorText}>Ce champ est obligatoire</Text>}
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleSubmit}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.submitButtonText}>Soumettre la Demande</Text>
              )}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  keyboardAvoidingContainer: {
    flex: 1,
  },
  scrollContainer: {
    padding: 20,
    paddingBottom: 100,
  },
  header: {
    marginBottom: 24,
    paddingHorizontal: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 16,
    color: '#FF3B30',
  },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  userInfoContainer: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  userInfoLabel: {
    fontWeight: '600',
    marginRight: 8,
    color: '#4B5563',
  },
  userInfoValue: {
    color: '#2C2C2C',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#2C2C2C',
  },
  inputError: {
    borderColor: '#FF3B30',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 12,
    marginTop: 4,
  },
  categoriesGrid: {
    justifyContent: 'space-between',
  },
  categoryCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryCardSelected: {
    backgroundColor: '#34C759',
    borderColor: '#34C759',
  },
  categoryText: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    color: '#4B5563',
    textAlign: 'center',
  },
  categoryTextSelected: {
    color: '#FFF',
  },
  messageInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#2C2C2C',
    minHeight: 120,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  authRequiredContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F8F9FA',
  },
  authImage: {
    width: 250,
    height: 250,
    marginBottom: 30,
    borderRadius: 100
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2C2C2C',
    marginBottom: 16,
    textAlign: 'center',
  },
  authMessage: {
    fontSize: 16,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  authButton: {
    backgroundColor: '#34C759',
    borderRadius: 8,
    padding: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  authButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  authSecondaryButton: {
    borderWidth: 1,
    borderColor: '#34C759',
    borderRadius: 8,
    padding: 16,
    width: '100%',
    alignItems: 'center',
  },
  authSecondaryButtonText: {
    color: '#34C759',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default UserRequest;
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
  Image,
  Modal,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { collection, addDoc, setDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { APP_CATEGORIES } from '../constants/APP_CATEGORIES';
import { sendTicketNotification } from '../services/notificationHelpers';

const UserRequest = ({ navigation }) => {
  // Check if the platform is web and return the message early
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <Image
          source={require('../assets/images/logoFace.png')}
          style={styles.webImage}
          resizeMode="contain"
        />
        <Text style={styles.webMessageTitle}>Fonctionnalité non disponible sur le web</Text>
        <Text style={styles.webMessage}>
          Cette fonctionnalité d'assistance est exclusivement disponible sur l'application mobile.
        </Text>
        <Text style={styles.webMessage}>
          Veuillez télécharger EliteReply depuis l'App Store ou Google Play pour soumettre votre demande.
        </Text>
      </View>
    );
  }

  // Rest of the component's state and logic
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
  const [modalVisible, setModalVisible] = useState(false);
  const phoneInputRef = useRef(null);
  const messageInputRef = useRef(null);

  const getCategoryInfo = (categoryId) => {
    return APP_CATEGORIES.find(cat => cat.id === categoryId) || { name: 'Sélectionnez une catégorie', icon: 'category' };
  };

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
            await setDoc(doc(db, "users", authUser.uid), {
              email: authUser.email,
              name: authUser.displayName || 'Utilisateur',
              isPremium: false,
              createdAt: serverTimestamp(),
              phoneNumber: '',
            }, { merge: true });
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
        userIsPremium: userData?.isPremium || false,
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
        userIsPremium: userData?.isPremium || false,
      };

      await setDoc(doc(db, "conversations", ticketId), conversationData);

      await addDoc(collection(db, 'tickets', ticketId, 'messages'), {
        texte: formData.message,
        expediteurId: user.uid,
        nomExpediteur: userData?.name || user?.displayName || 'Client',
        createdAt: serverTimestamp(),
        type: 'text'
      });

      // Send notifications to IT Support agents
      try {
        await sendTicketNotification.newTicket({
          id: ticketId,
          category: formData.category,
          message: formData.message,
          userId: user.uid,
          userName: userData?.name || user?.displayName || 'Client',
          userIsPremium: userData?.isPremium || false,
        });
      } catch (notificationError) {
        console.error('Error sending notifications:', notificationError);
        // Continue with the flow even if notifications fail
      }

      Alert.alert(
        'Demande soumise!',
        'Votre demande a été soumise. Vous serez bientôt mis en relation avec un agent.',
        [
          {
            text: 'OK',
            onPress: () => {
              setFormData(prev => ({
                ...prev,
                category: '',
                message: ''
              }));
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
        <View style={styles.authModalContent}>
          <Image
            source={require('../assets/images/logoFace.png')}
            style={styles.authImage}
            resizeMode="contain"
          />
          <MaterialIcons name="lock" size={60} color="#0a8fdf" style={styles.lockIcon} />
          <Text style={styles.authTitle}>Connexion Requise</Text>
          <Text style={styles.authMessage}>
            L'assistance est un service exclusif pour les membres EliteReply. Veuillez vous connecter pour continuer.
          </Text>
          <View style={styles.authButtonsContainer}>
            <TouchableOpacity
              style={styles.authCancelButton}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.authCancelButtonText}>Annuler</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.authLoginButton}
              onPress={() => navigation.navigate('Login')}
            >
              <MaterialIcons name="login" size={20} color="white" style={styles.buttonIcon} />
              <Text style={styles.authLoginButtonText}>Connexion</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  const selectedCategoryInfo = getCategoryInfo(formData.category);

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
              <Text style={styles.label}>Catégorie <Text style={styles.required}>*</Text></Text>
              <TouchableOpacity
                style={[styles.input, styles.categorySelectButton, errors.category && styles.inputError]}
                onPress={() => setModalVisible(true)}
              >
                <MaterialIcons name={selectedCategoryInfo.icon} size={20} color="#4B5563" style={styles.categorySelectIcon} />
                <Text style={[styles.categorySelectText, !formData.category && styles.categorySelectPlaceholder]}>
                  {selectedCategoryInfo.name}
                </Text>
                <MaterialIcons name="arrow-drop-down" size={24} color="#6B7280" />
              </TouchableOpacity>
              {errors.category && <Text style={styles.errorText}>Veuillez sélectionner une catégorie</Text>}
            </View>

            <View style={styles.inputContainer}>
              <Text style={styles.label}>Description de la Requête <Text style={styles.required}>*</Text></Text>
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

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sélectionnez une Catégorie</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <MaterialIcons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>
            <FlatList
              data={APP_CATEGORIES}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.modalCategoryItem}
                  onPress={() => {
                    handleChange('category', item.id);
                    setModalVisible(false);
                  }}
                >
                  <MaterialIcons name={item.icon} size={24} color="#34C759" style={styles.modalCategoryIcon} />
                  <Text style={styles.modalCategoryText}>{item.name}</Text>
                  {formData.category === item.id && (
                    <MaterialIcons name="check-circle" size={20} color="#34C759" style={styles.modalCheckIcon} />
                  )}
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
            />
          </View>
        </View>
      </Modal>
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
  categorySelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 50,
  },
  categorySelectIcon: {
    marginRight: 10,
  },
  categorySelectText: {
    flex: 1,
    fontSize: 16,
    color: '#2C2C2C',
  },
  categorySelectPlaceholder: {
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  modalCategoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  modalCategoryIcon: {
    marginRight: 12,
  },
  modalCategoryText: {
    flex: 1,
    fontSize: 16,
    color: '#2C2C2C',
  },
  modalCheckIcon: {
    marginLeft: 'auto',
  },
  separator: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginLeft: 16,
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
    padding: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  authModalContent: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 30,
    width: '90%',
    maxWidth: 400,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  authImage: {
    width: 120,
    height: 120,
    marginBottom: 20,
    borderRadius: 60,
  },
  lockIcon: {
    marginBottom: 20,
  },
  authTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 12,
    textAlign: 'center',
  },
  authMessage: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    marginBottom: 30,
    lineHeight: 24,
  },
  authButtonsContainer: {
    flexDirection: 'row',
    width: '100%',
    justifyContent: 'space-between',
    gap: 12,
  },
  authCancelButton: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    backgroundColor: 'white',
  },
  authCancelButtonText: {
    color: '#64748b',
    fontSize: 16,
    fontWeight: '600',
  },
  authLoginButton: {
    flex: 1,
    backgroundColor: '#0a8fdf',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  authLoginButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  buttonIcon: {
    marginRight: 4,
  },
  // NEW STYLES FOR WEB
  webContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#F8F9FA',
  },
  webImage: {
    width: 200,
    height: 200,
    borderRadius: 100,
    marginBottom: 20,
  },
  webMessageTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#2C2C2C',
    textAlign: 'center',
    marginBottom: 16,
  },
  webMessage: {
    fontSize: 18,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 10,
  },
});

export default UserRequest;
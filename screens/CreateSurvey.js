import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { db } from '../firebase';
import { collection, addDoc, serverTimestamp, getDocs, query, orderBy as fbOrderBy } from 'firebase/firestore';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';

const generateUniqueId = () => Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);

const surveyCardColors = [
  '#78BFEF', // Light Blue
  '#FFB74D', // Light Orange
  '#81C784', // Light Green
  '#A1887F', // Brownish
  '#FF8A65', // Coral
  '#BA68C8', // Lavender
  '#4DD0E1', // Cyan
  '#FFEA00', // Yellow
  '#FFD54F', // Amber
  '#90A4AE', // Blue Gray
];

const CreateSurveyScreen = ({ navigation }) => {
  // Survey Main Details
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [businessCategory, setBusinessCategory] = useState('restaurant');
  const [estimatedDurationMinutes, setEstimatedDurationMinutes] = useState('');

  // Coupon Details
  const [couponTitle, setCouponTitle] = useState('');
  const [couponDescription, setCouponDescription] = useState('');
  const [discountType, setDiscountType] = useState('percentage');
  const [discountValue, setDiscountValue] = useState('');
  const [expiryDate, setExpiryDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [sponsoredBy, setSponsoredBy] = useState(''); // Stores partnerId
  const [sponsoredByName, setSponsoredByName] = useState(''); // Stores partner 'nom' for display

  // Partners List for Selection
  const [partners, setPartners] = useState([]);
  const [filteredPartners, setFilteredPartners] = useState([]);
  const [searchPartnerQuery, setSearchPartnerQuery] = useState('');
  const [isPartnerModalVisible, setPartnerModalVisible] = useState(false);
  const [partnersLoading, setPartnersLoading] = useState(false);


  // Questions Management
  const [questions, setQuestions] = useState([]);
  const [isQuestionModalVisible, setQuestionModalVisible] = useState(false);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [qText, setQText] = useState('');
  const [qType, setQType] = useState('text');
  const [qOptions, setQOptions] = useState([{ id: generateUniqueId(), text: '' }]);

  // Global UI State
  const [loading, setLoading] = useState(false);

  const businessCategories = [
  { id: 'airBnB', name: 'AirBnB', icon: 'night-shelter' },
  { id: 'autre', name: 'Autres', icon: 'help' },
  { id: 'events', name: 'Events', icon: 'event' },
  { id: 'salon de coiffure', name: 'Salon de Coiffure', icon: 'content-cut' },
  { id: 'media', name: 'Media', icon: 'movie' },
  { id: 'technologie', name: 'Technologie', icon: 'devices' },
  { id: 'nails', name: 'Ongles', icon: 'back-hand' },
  { id: 'restaurants', name: 'Restaurants', icon: 'restaurant' },
  { id: 'sante', name: 'Santé', icon: 'local-hospital' },
  { id: 'spa', name: 'Spa', icon: 'spa' },
  { id: 'stores', name: 'Shopping', icon: 'shopping-cart' },
  { id: 'transport', name: 'Transport', icon: 'directions-bus' },
  { id: 'voyage', name: 'Voyage', icon: 'flight' },
  { id: 'justice', name: 'Justice', icon: 'balance' },
].sort((a, b) => a.name.localeCompare(b.name));

  const discountTypes = [
    { label: 'Pourcentage (%)', value: 'percentage' },
    { label: 'Montant fixe ($)', value: 'fixed' }
  ];

  const questionTypes = [
    { label: 'Texte libre', value: 'text' },
    { label: 'Choix unique', value: 'single-choice' },
    { label: 'Échelle de notation (1-5)', value: 'rating' }
  ];

  // Fetch Partners on component mount
  useEffect(() => {
    const fetchPartners = async () => {
      setPartnersLoading(true);
      try {
        // Query partners, ordering by 'nom' (name) for a sorted list
        const q = query(collection(db, 'partners'), fbOrderBy('nom'));
        const querySnapshot = await getDocs(q);
        // Store id, 'nom', and 'categorie' for selection and display
        const fetchedPartners = querySnapshot.docs.map(doc => ({
            id: doc.id,
            nom: doc.data().nom, // Using 'nom' from Firestore
            categorie: doc.data().categorie // Using 'categorie' from Firestore
        }));
        setPartners(fetchedPartners);
        setFilteredPartners(fetchedPartners); // Initially, filtered list is all partners
      } catch (error) {
        console.error("Error fetching partners:", error);
        Alert.alert("Erreur", "Impossible de charger la liste des partenaires.");
      } finally {
        setPartnersLoading(false);
      }
    };
    fetchPartners();
  }, []);

  // Filter partners based on search query
  useEffect(() => {
    if (searchPartnerQuery.trim() === '') {
      setFilteredPartners(partners);
    } else {
      setFilteredPartners(
        partners.filter(partner =>
          // Filter using 'nom' (name) field
          partner.nom.toLowerCase().includes(searchPartnerQuery.toLowerCase())
        )
      );
    }
  }, [searchPartnerQuery, partners]);

  // Handle Partner Selection
  const selectPartner = (partnerId, partnerNom, partnerCategorie) => {
    setSponsoredBy(partnerId); // Store the partner's ID
    setSponsoredByName(partnerNom); // Store the partner's 'nom' for display
    // If you need to store or display the category in the main form,
    // you would add a state for it, e.g., setSponsoredByCategory(partnerCategorie);
    setPartnerModalVisible(false); // Close the modal
    setSearchPartnerQuery(''); // Clear search query when modal closes for next open
  };

  // Question Modal Logic
  const openAddQuestionModal = () => {
    setCurrentQuestion(null);
    setQText('');
    setQType('text');
    setQOptions([{ id: generateUniqueId(), text: '' }]);
    setQuestionModalVisible(true);
  };

  const openEditQuestionModal = (question) => {
    setCurrentQuestion(question);
    setQText(question.text);
    setQType(question.type);
    if (question.type === 'single-choice' && question.options) {
      setQOptions(question.options.map(opt => ({ id: generateUniqueId(), text: opt })));
      if (question.options.length === 0) {
        setQOptions([{ id: generateUniqueId(), text: '' }]);
      }
    } else {
      setQOptions([{ id: generateUniqueId(), text: '' }]);
    }
    setQuestionModalVisible(true);
  };

  const addOption = () => {
    setQOptions([...qOptions, { id: generateUniqueId(), text: '' }]);
  };

  const removeOption = (id) => {
    if (qOptions.length > 1) {
      setQOptions(qOptions.filter(opt => opt.id !== id));
    } else {
      Alert.alert('Erreur', 'Un choix unique doit avoir au moins une option.');
    }
  };

  const updateOptionText = (id, text) => {
    setQOptions(qOptions.map(opt => opt.id === id ? { ...opt, text } : opt));
  };

  const saveQuestion = () => {
    if (!qText.trim()) {
      Alert.alert('Erreur', 'Veuillez saisir le texte de la question.');
      return;
    }

    if (qType === 'single-choice') {
      const validOptions = qOptions.filter(opt => opt.text.trim() !== '');
      if (validOptions.length === 0) {
        Alert.alert('Erreur', 'Veuillez ajouter au moins une option pour le choix unique.');
        return;
      }
    }

    const newQuestion = {
      id: currentQuestion ? currentQuestion.id : generateUniqueId(),
      text: qText.trim(),
      type: qType,
      options: qType === 'single-choice' ? qOptions.filter(opt => opt.text.trim() !== '').map(opt => opt.text.trim()) : null,
    };

    if (currentQuestion) {
      setQuestions(questions.map(q => q.id === newQuestion.id ? newQuestion : q));
    } else {
      setQuestions([...questions, newQuestion]);
    }
    setQuestionModalVisible(false);
  };

  const removeQuestion = (id) => {
    Alert.alert(
      'Supprimer la question',
      'Êtes-vous sûr de vouloir supprimer cette question ?',
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Supprimer', onPress: () => {
          if (questions.length > 0) {
            setQuestions(questions.filter(q => q.id !== id));
          }
        }, style: 'destructive' },
      ],
      { cancelable: true }
    );
  };

  // Date Picker Logic
  const handleDateChange = (event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setExpiryDate(selectedDate);
    }
  };

  const formatDateDisplay = (date) => {
    return date.toLocaleDateString('fr-FR');
  };

  // Survey Validation & Creation
  const validateSurvey = () => {
    if (!title.trim() || !description.trim()) {
      Alert.alert('Champs obligatoires', 'Veuillez remplir tous les champs principaux de l\'enquête (Titre, Description).');
      return false;
    }
    // Explicitly check if sponsoredBy (ID) is selected/filled
    if (!sponsoredBy.trim()) {
      Alert.alert('Champs obligatoires', 'Veuillez sélectionner un sponsor pour l\'enquête.');
      return false;
    }

    if (questions.length === 0) {
      Alert.alert('Questions Manquantes', 'Une enquête doit avoir au moins une question.');
      return false;
    }

    if (questions.some(q => !q.text.trim())) {
      Alert.alert('Questions Incomplètes', 'Toutes les questions doivent avoir un texte.');
      return false;
    }

    if (questions.some(q => q.type === 'single-choice' && (!q.options || q.options.length === 0 || q.options.some(opt => !opt.trim())))) {
      Alert.alert('Options Manquantes', 'Les questions à choix unique doivent avoir au moins une option valide.');
      return false;
    }

    if (!couponTitle.trim() || !discountValue.trim()) {
      Alert.alert('Récompense Incomplète', 'Veuillez remplir les détails de la récompense (Titre, Valeur).');
      return false;
    }

    if (isNaN(parseFloat(discountValue)) || parseFloat(discountValue) <= 0) {
      Alert.alert('Valeur de réduction invalide', 'La valeur de la réduction doit être un nombre positif.');
      return false;
    }

    if (estimatedDurationMinutes && (isNaN(parseInt(estimatedDurationMinutes)) || parseInt(estimatedDurationMinutes) <= 0)) {
      Alert.alert('Durée estimée invalide', 'La durée estimée doit être un nombre entier positif en minutes.');
      return false;
    }

    return true;
  };

  const handleCreateSurvey = async () => {
    if (!validateSurvey()) return;

    setLoading(true);
    try {
      const randomIndex = Math.floor(Math.random() * surveyCardColors.length);
      const assignedColor = surveyCardColors[randomIndex];

      await addDoc(collection(db, 'surveys'), {
        title: title.trim(),
        description: description.trim(),
        businessCategory,
        estimatedDurationMinutes: estimatedDurationMinutes ? parseInt(estimatedDurationMinutes) : null,
        questions: questions.map(q => ({
          id: q.id,
          text: q.text.trim(),
          type: q.type,
          options: q.type === 'single-choice' ? q.options : null,
          ratingMax: q.type === 'rating' ? 5 : null
        })),
        couponDetails: {
          title: couponTitle.trim(),
          description: couponDescription.trim(),
          type: discountType,
          value: parseFloat(discountValue),
          expiryDate: expiryDate.toISOString(), // Store as ISO string for Firebase Timestamp conversion
          sponsor: sponsoredBy.trim(),      // This is the partner ID (e.g., R03TjjqHqBfs...)
          sponsorName: sponsoredByName.trim(), // This is the 'nom' (e.g., "Jerttech")
          // Get the 'categorie' from the currently selected partner in the 'partners' state
          sponsorCategory: partners.find(p => p.id === sponsoredBy)?.categorie || '', // Store 'categorie'
        },
        active: true, // Survey is active upon creation
        createdAt: serverTimestamp(), // Firestore server timestamp
        responsesCount: 0,
        completedByUsers: [], // Initialize as empty array
        cardColor: assignedColor,
      });
      Alert.alert('Succès', 'Enquête créée avec succès');
      navigation.goBack(); // Navigate back after successful creation
    } catch (error) {
      console.error("Error creating survey:", error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la création de l\'enquête: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 64 : 0}
    >
      <ScrollView style={styles.container}>
        <Text style={styles.title}>Créer une nouvelle enquête</Text>

        {/* Survey Main Details */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Détails de l'enquête</Text>
          <Text style={styles.label}>Titre de l'enquête *</Text>
          <TextInput
            style={styles.input}
            value={title}
            onChangeText={setTitle}
            placeholder="Ex: Enquête de satisfaction client"
          />

          <Text style={styles.label}>Description *</Text>
          <TextInput
            style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez l'objectif de l'enquête..."
            multiline
          />

          <Text style={styles.label}>Catégorie d'entreprise *</Text>
<View style={styles.pickerContainer}>
  <Picker
    selectedValue={businessCategory}
    onValueChange={(itemValue) => setBusinessCategory(itemValue)}
    style={styles.picker}
  >
    {businessCategories.map((category) => ( // 'category' is an object here
      <Picker.Item
        key={category.id} // Use category.id for the key
        label={category.name} // Use category.name for the display label
        value={category.id} // Use category.id for the value
      />
    ))}
  </Picker>
</View>

          <Text style={styles.label}>Durée estimée (minutes)</Text>
          <TextInput
            style={styles.input}
            value={estimatedDurationMinutes}
            onChangeText={setEstimatedDurationMinutes}
            placeholder="Ex: 5"
            keyboardType="numeric"
          />
        </View>

        {/* Questions Section */}
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Text style={styles.cardTitle}>Questions de l'enquête *</Text>
            <TouchableOpacity onPress={openAddQuestionModal} style={styles.addButton}>
              <Ionicons name="add-circle" size={26} color="#0a8fdf" />
              <Text style={styles.addButtonText}>Ajouter question</Text>
            </TouchableOpacity>
          </View>

          {questions.length === 0 ? (
            <Text style={styles.noQuestionsText}>Aucune question ajoutée. Cliquez sur "Ajouter une question" pour commencer.</Text>
          ) : (
            <FlatList
              data={questions}
              keyExtractor={(item) => item.id.toString()}
              renderItem={({ item, index }) => (
                <View style={styles.questionListItem}>
                  <View style={styles.questionListContent}>
                    <Text style={styles.questionListNumber}>{index + 1}.</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.questionListText}>{item.text}</Text>
                      <Text style={styles.questionListType}>
                        Type: {questionTypes.find(t => t.value === item.type)?.label || item.type}
                        {item.type === 'single-choice' && ` (${item.options?.length || 0} options)`}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.questionListActions}>
                    <TouchableOpacity onPress={() => openEditQuestionModal(item)} style={styles.actionButton}>
                      <Ionicons name="create-outline" size={20} color="#6B7280" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeQuestion(item.id)} style={styles.actionButton}>
                      <Ionicons name="trash-outline" size={20} color="#EF4444" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
              scrollEnabled={false}
            />
          )}
        </View>

        {/* Reward Section */}
        <View style={styles.sectionCard}>
          <Text style={styles.cardTitle}>Récompense (Coupon/Réduction) *</Text>

          <Text style={styles.label}>Titre de la récompense *</Text>
          <TextInput
            style={styles.input}
            value={couponTitle}
            onChangeText={setCouponTitle}
            placeholder="Ex: 20% sur votre prochaine commande"
          />

          <Text style={styles.label}>Description de la récompense</Text>
          <TextInput
            style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
            value={couponDescription}
            onChangeText={setCouponDescription}
            placeholder="Détails : Valable sur tout, non cumulable..."
            multiline
          />

          <Text style={styles.label}>Type de réduction *</Text>
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={discountType}
              onValueChange={(itemValue) => setDiscountType(itemValue)}
              style={styles.picker}
            >
              {discountTypes.map((type, index) => (
                <Picker.Item key={index} label={type.label} value={type.value} />
              ))}
            </Picker>
          </View>

          <Text style={styles.label}>Valeur de la réduction *</Text>
          <TextInput
            style={styles.input}
            value={discountValue}
            onChangeText={setDiscountValue}
            placeholder={discountType === 'percentage' ? 'Ex: 20 (pour 20%)' : 'Ex: 10 (pour 10€)'}
            keyboardType="numeric"
          />

          <Text style={styles.label}>Date d'expiration *</Text>
          <TouchableOpacity
            style={[styles.input, styles.datePickerButton]}
            onPress={() => setShowDatePicker(true)}
          >
            <Text style={styles.datePickerText}>{formatDateDisplay(expiryDate)}</Text>
            <Ionicons name="calendar-outline" size={20} color="#6B7280" />
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={expiryDate}
              mode="date"
              display="default"
              onChange={handleDateChange}
              minimumDate={new Date()} // Prevent setting past dates
            />
          )}

          {/* Sponsor selection */}
          <Text style={styles.label}>Sponsorisé par *</Text>
          <TouchableOpacity
            style={[styles.input, styles.sponsorSelectButton]}
            onPress={() => setPartnerModalVisible(true)}
          >
            <Text style={styles.sponsorSelectText}>
              {sponsoredByName ? sponsoredByName : "Sélectionner un partenaire..."}
            </Text>
            <Ionicons name="search" size={20} color="#6B7280" />
          </TouchableOpacity>
        </View>

        {/* Create Button */}
        <TouchableOpacity
          style={styles.createButton}
          onPress={handleCreateSurvey}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="cloud-upload-outline" size={22} color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.createButtonText}>Créer l'enquête</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Question Creation/Edit Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isQuestionModalVisible}
          onRequestClose={() => setQuestionModalVisible(false)}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>{currentQuestion ? 'Modifier la question' : 'Ajouter une question'}</Text>

              <Text style={styles.label}>Texte de la question *</Text>
              <TextInput
                style={[styles.input, { height: 80, textAlignVertical: 'top' }]}
                value={qText}
                onChangeText={setQText}
                placeholder="Saisissez votre question ici..."
                multiline
              />

              <Text style={styles.label}>Type de question *</Text>
              <View style={styles.pickerContainer}>
                <Picker
                  selectedValue={qType}
                  onValueChange={(itemValue) => {
                    setQType(itemValue);
                    if (itemValue !== 'single-choice') {
                      setQOptions([{ id: generateUniqueId(), text: '' }]); // Reset options if not single-choice
                    }
                  }}
                  style={styles.picker}
                >
                  {questionTypes.map((type, index) => (
                    <Picker.Item key={index} label={type.label} value={type.value} />
                  ))}
                </Picker>
              </View>

              {qType === 'single-choice' && (
                <View style={styles.optionsContainer}>
                  <View style={styles.sectionHeader}>
                    <Text style={styles.label}>Options de choix unique *</Text>
                    <TouchableOpacity onPress={addOption} style={styles.addButton}>
                      <Ionicons name="add-circle-outline" size={20} color="#0a8fdf" />
                      <Text style={styles.addButtonText}>Ajouter une option</Text>
                    </TouchableOpacity>
                  </View>
                  <FlatList
                    data={qOptions}
                    keyExtractor={(item) => item.id.toString()}
                    renderItem={({ item, index }) => (
                      <View style={styles.optionInputContainer}>
                        <TextInput
                          style={[styles.input, styles.optionInput]}
                          value={item.text}
                          onChangeText={(text) => updateOptionText(item.id, text)}
                          placeholder={`Option ${index + 1}`}
                        />
                        <TouchableOpacity onPress={() => removeOption(item.id)} style={styles.deleteButton}>
                          <Ionicons name="close-circle-outline" size={24} color="#EF4444" />
                        </TouchableOpacity>
                      </View>
                    )}
                    scrollEnabled={false}
                  />
                </View>
              )}

              {qType === 'rating' && (
                <View style={styles.infoBox}>
                  <Ionicons name="information-circle-outline" size={20} color="#0a8fdf" />
                  <Text style={styles.infoText}>Cette question sera une échelle de notation de 1 à 5 étoiles (par défaut).</Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity onPress={() => setQuestionModalVisible(false)} style={[styles.modalButton, styles.cancelButton]}>
                  <Text style={styles.modalButtonText}>Annuler</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={saveQuestion} style={[styles.modalButton, styles.saveButton]}>
                  <Text style={styles.modalButtonText}>Enregistrer</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>

        {/* Partner Selection Modal */}
        <Modal
          animationType="slide"
          transparent={true}
          visible={isPartnerModalVisible}
          onRequestClose={() => {
            setPartnerModalVisible(false);
            setSearchPartnerQuery(''); // Clear search on close
          }}
        >
          <KeyboardAvoidingView
            style={styles.modalOverlay}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Sélectionner un Sponsor</Text>
              <TextInput
                style={styles.input}
                placeholder="Rechercher un partenaire..."
                value={searchPartnerQuery}
                onChangeText={setSearchPartnerQuery}
              />
              {partnersLoading ? (
                <ActivityIndicator size="large" color="#0a8fdf" />
              ) : (
                <FlatList
                  data={filteredPartners}
                  keyExtractor={(item) => item.id}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.partnerListItem}
                      // Pass both 'nom' and 'categorie' to selectPartner
                      onPress={() => selectPartner(item.id, item.nom, item.categorie)}
                    >
                      <Text style={styles.partnerListItemText}>
                        {item.nom} (Catégorie: {item.categorie}) {/* Display 'nom' and 'categorie' */}
                      </Text>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={
                    <Text style={styles.emptyListText}>Aucun partenaire trouvé.</Text>
                  }
                />
              )}
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton, { marginTop: 20 }]}
                onPress={() => {
                  setPartnerModalVisible(false);
                  setSearchPartnerQuery(''); // Clear search query when modal closes
                }}
              >
                <Text style={styles.modalButtonText}>Fermer</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </Modal>

      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0F4F8',
    padding: 15,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 25,
    textAlign: 'center',
    paddingTop: 10,
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 10,
  },
  label: {
    fontSize: 15,
    marginBottom: 8,
    color: '#4A5568',
    fontWeight: '500',
  },
  input: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
    fontSize: 16,
    color: '#2D3748',
  },
  pickerContainer: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    marginBottom: 15,
    overflow: 'hidden', // Ensures picker content stays within bounds
    justifyContent: 'center',
  },
  picker: {
    height: 50, // Standard height for pickers
    width: '100%',
    color: '#2D3748',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F4F8',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 20,
    top: 25, // Adjust positioning to align with card title
    right: 60, // Adjust positioning
  },
  addButtonText: {
    color: '#0a8fdf',
    marginLeft: 8,
    fontWeight: '600',
    fontSize: 14,
  },
  noQuestionsText: {
    fontStyle: 'italic',
    color: '#718096',
    textAlign: 'center',
    marginTop: 10,
    paddingVertical: 20,
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
  },
  questionListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#E2E8F0',
  },
  questionListContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginRight: 10,
  },
  questionListNumber: {
    fontSize: 15,
    fontWeight: 'bold',
    color: '#6B7280',
    marginRight: 10,
    marginTop: 2,
  },
  questionListText: {
    fontSize: 16,
    color: '#2D3748',
    flexShrink: 1,
    fontWeight: '500',
  },
  questionListType: {
    fontSize: 12,
    color: '#718096',
    marginTop: 4,
    fontStyle: 'italic',
  },
  questionListActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionButton: {
    padding: 5,
    marginLeft: 10,
  },
  datePickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  datePickerText: {
    fontSize: 16,
    color: '#2D3748',
  },
  createButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0a8fdf',
    padding: 15,
    borderRadius: 10,
    marginTop: 25,
    marginBottom: 40,
    shadowColor: '#0a8fdf',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 6,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    padding: 25,
    width: '90%',
    maxHeight: '85%', // Limit height to prevent overflow on smaller screens
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
    // Dynamic height based on content or fixed if preferred, currently fixed from previous code
    // Consider using 'flex: 1' inside KeyboardAvoidingView for better modal sizing
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 20,
    textAlign: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 15,
  },
  optionsContainer: {
    marginTop: 5,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    padding: 10,
    backgroundColor: '#FDFEFE',
  },
  optionInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  optionInput: {
    flex: 1,
    marginRight: 10,
    marginBottom: 0, // Override default input marginBottom
  },
  deleteButton: {
    padding: 5,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    paddingTop: 15,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  cancelButton: {
    backgroundColor: '#A0AEC0',
  },
  saveButton: {
    backgroundColor: '#0a8fdf',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E0F4F8',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    marginBottom: 15,
  },
  infoText: {
    marginLeft: 10,
    fontSize: 14,
    color: '#0a8fdf',
    flexShrink: 1, // Allow text to wrap
  },
  // NEW STYLES FOR PARTNER MODAL
  sponsorSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sponsorSelectText: {
    fontSize: 16,
    color: '#2D3748',
  },
  partnerListItem: {
    padding: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  partnerListItemText: {
    fontSize: 16,
    color: '#334155',
  },
  emptyListText: {
    fontSize: 15,
    color: '#718096',
    textAlign: 'center',
    marginTop: 20,
  },
});

export default CreateSurveyScreen;
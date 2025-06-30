import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert, 
  TextInput, 
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  FlatList
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getAuth } from 'firebase/auth';
import { doc, setDoc, addDoc, getDoc, getFirestore, serverTimestamp, collection, query, orderBy, limit, onSnapshot, where, getDocs, updateDoc } from 'firebase/firestore';
import { app } from '../firebase';

const EvaluerService = ({ navigation }) => {
  const [note, setNote] = useState(0);
  const [survol, setSurvol] = useState(0);
  const [commentaire, setCommentaire] = useState('');
  const [envoiEnCours, setEnvoiEnCours] = useState(false);
  const [evaluationsRecentes, setEvaluationsRecentes] = useState([]);
  const [evaluationsFiltrees, setEvaluationsFiltrees] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [userData, setUserData] = useState(null);
  const [recherche, setRecherche] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [evaluationATransferer, setEvaluationATransferer] = useState(null);
  const [partenaires, setPartenaires] = useState([]);
  const [chargementPartenaires, setChargementPartenaires] = useState(false);
  const [partenaireSelectionne, setPartenaireSelectionne] = useState(null);
  const [recherchePartenaire, setRecherchePartenaire] = useState('');
  const [totalEvaluations, setTotalEvaluations] = useState(0);

  const auth = getAuth(app);
  const db = getFirestore(app);

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          setUserData(userDoc.data());
        }
      }
    };

    const q = query(
      collection(db, 'evaluations'),
      orderBy('dateCreation', 'desc'),
      limit(10)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const evaluations = [];
      querySnapshot.forEach((doc) => {
        evaluations.push({ id: doc.id, ...doc.data() });
      });
      setEvaluationsRecentes(evaluations);
      setEvaluationsFiltrees(evaluations);
      setChargement(false);
      
      getDocs(collection(db, 'evaluations')).then((snapshot) => {
        setTotalEvaluations(snapshot.size);
      });
    });

    fetchUserData();
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (recherche.trim() === '') {
      setEvaluationsFiltrees(evaluationsRecentes);
    } else {
      const filtrees = evaluationsRecentes.filter(item => 
        item.commentaire?.toLowerCase().includes(recherche.toLowerCase()) ||
        item.nomUtilisateur?.toLowerCase().includes(recherche.toLowerCase()) ||
        item.note.toString().includes(recherche)
      );
      setEvaluationsFiltrees(filtrees);
    }
  }, [recherche, evaluationsRecentes]);

  const chargerPartenaires = async () => {
    setChargementPartenaires(true);
    try {
      const q = query(collection(db, 'partners'));
      const querySnapshot = await getDocs(q);
      const partenairesList = [];
      querySnapshot.forEach((doc) => {
        partenairesList.push({ id: doc.id, ...doc.data() });
      });
      setPartenaires(partenairesList);
    } catch (error) {
      console.error("Erreur lors du chargement des partenaires:", error);
      Alert.alert("Erreur", "Impossible de charger la liste des partenaires");
    } finally {
      setChargementPartenaires(false);
    }
  };

  const demanderAffichageNom = () => {
    Alert.alert(
      'Confidentialité',
      'Souhaitez-vous afficher votre nom dans les évaluations publiques ?',
      [
        {
          text: 'Oui',
          onPress: () => soumettreEvaluation(true)
        },
        {
          text: 'Non',
          onPress: () => soumettreEvaluation(false),
          style: 'cancel'
        }
      ]
    );
  };

  const soumettreEvaluation = async (afficherNom) => {
    if (note === 0) {
      Alert.alert('Attention', 'Veuillez donner une note avant de soumettre');
      return;
    }

    setEnvoiEnCours(true);
    
    try {
      const utilisateur = auth.currentUser;
      
      if (!utilisateur) {
        Alert.alert('Erreur', 'Vous devez être connecté pour évaluer notre service');
        navigation.navigate('Connexion');
        return;
      }

      const donneesEvaluation = {
        utilisateurId: utilisateur.uid,
        note,
        commentaire,
        dateCreation: serverTimestamp(),
        affichagePublic: afficherNom,
        emailUtilisateur: utilisateur.email,
      };

      if (afficherNom && userData) {
        donneesEvaluation.nomUtilisateur = userData.name || 'Utilisateur';
        donneesEvaluation.photoUtilisateur = userData.photoURL || null;
      } else {
        donneesEvaluation.nomUtilisateur = 'Anonyme';
        donneesEvaluation.photoUtilisateur = null;
      }

      await addDoc(collection(db, 'evaluations'), donneesEvaluation);

      Alert.alert(
        'Merci!', 
        'Votre évaluation a été enregistrée avec succès',
        [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]
      );
    } catch (erreur) {
      console.error('Erreur lors de l\'envoi:', erreur);
      Alert.alert('Erreur', 'Une erreur est survenue lors de l\'envoi de votre évaluation');
    } finally {
      setEnvoiEnCours(false);
    }
  };

  const renderEtoiles = (nombre) => {
    return (
      <View style={styles.conteneurEtoiles}>
        {[1, 2, 3, 4, 5].map((etoile) => (
          <Ionicons
            key={etoile}
            name={etoile <= nombre ? 'star' : 'star-outline'}
            size={16}
            color={etoile <= nombre ? '#FFD700' : '#CCC'}
          />
        ))}
      </View>
    );
  };

  const ouvrirModalTransfert = (evaluation) => {
    setEvaluationATransferer(evaluation);
    chargerPartenaires();
    setModalVisible(true);
  };

  const transfererEvaluation = async () => {
  if (!partenaireSelectionne || !evaluationATransferer) return;

  try {
    // Vérifier si l'évaluation existe déjà chez le partenaire
    const existingReview = await getDoc(
      doc(db, 'partners', partenaireSelectionne.id, 'evaluations', evaluationATransferer.id)
    );

    if (existingReview.exists()) {
      Alert.alert("Attention", "Cette évaluation a déjà été transférée à ce partenaire");
      return;
    }

    // Ajouter à la sous-collection du partenaire
    await setDoc(
      doc(db, 'partners', partenaireSelectionne.id, 'evaluations', evaluationATransferer.id),
      {
        ...evaluationATransferer,
        partnerId: partenaireSelectionne.id,
        transferredAt: serverTimestamp(),
        transferredBy: auth.currentUser.uid,
        originalEvaluationId: evaluationATransferer.id
      }
    );

    // Mettre à jour l'original
    await updateDoc(
      doc(db, 'evaluations', evaluationATransferer.id),
      {
        partnerId: partenaireSelectionne.id,
        isTransferred: true,
        transferredAt: serverTimestamp()
      }
    );

    Alert.alert("Succès", `Évaluation transférée à ${partenaireSelectionne.name}`);
    setModalVisible(false);
    
  } catch (error) {
    console.error("Erreur de transfert:", error);
    Alert.alert(
      "Erreur", 
      error.code === 'failed-precondition'
        ? "Configuration Firestore manquante. Contactez le support."
        : "Échec du transfert de l'évaluation"
    );
  }
};

  const partenairesFiltres = partenaires.filter(partenaire =>
    partenaire.name.toLowerCase().includes(recherchePartenaire.toLowerCase())
  );

  return (
    <View style={styles.conteneur}>
      <ScrollView style={styles.scrollConteneur}>
        <Text style={styles.titreSection}>Évaluations récentes ({totalEvaluations} au total)</Text>
        {chargement ? (
          <ActivityIndicator size="small" color="#34C759" style={styles.indicateurChargement} />
        ) : evaluationsFiltrees.length === 0 ? (
          <Text style={styles.aucuneEvaluation}>Aucune évaluation trouvée</Text>
        ) : (
          <View style={styles.listeEvaluations}>
            {evaluationsFiltrees.map((item) => (
              <View key={item.id} style={styles.itemEvaluation}>
                <View style={styles.infoUtilisateur}>
                  {item.photoUtilisateur ? (
                    <Image source={{ uri: item.photoUtilisateur }} style={styles.avatar} />
                  ) : (
                    <View style={styles.avatarParDefaut}>
                      <Ionicons name="person" size={20} color="#FFF" />
                    </View>
                  )}
                  <Text style={styles.nomUtilisateur}>{item.nomUtilisateur}</Text>
                  {(userData?.isAdmin || userData?.isITSupport) && (
                    <TouchableOpacity 
                      style={styles.transferButton}
                      onPress={() => ouvrirModalTransfert(item)}
                    >
                      <Ionicons name="send" size={20} color="#34C759" />
                    </TouchableOpacity>
                  )}
                </View>
                {renderEtoiles(item.note)}
                {item.commentaire && <Text style={styles.commentaireUtilisateur}>{item.commentaire}</Text>}
                <Text style={styles.dateEvaluation}>
                  {item.dateCreation?.toDate().toLocaleDateString('fr-FR')}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.formulaireEvaluation}>
          <Text style={styles.titre}>Évaluez notre service</Text>
          <Text style={styles.sousTitre}>Votre avis nous aide à nous améliorer</Text>

          <View style={styles.conteneurNote}>
            {[1, 2, 3, 4, 5].map((etoile) => (
              <TouchableOpacity
                key={etoile}
                onPress={() => setNote(etoile)}
                onPressIn={() => setSurvol(etoile)}
                onPressOut={() => setSurvol(0)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name={etoile <= (survol || note) ? 'star' : 'star-outline'}
                  size={40}
                  color={etoile <= (survol || note) ? '#FFD700' : '#CCC'}
                />
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.texteNote}>
            {note === 0 ? 'Sélectionnez une note' : `Vous avez donné ${note} étoile${note > 1 ? 's' : ''}`}
          </Text>

          <TextInput
            style={styles.champCommentaire}
            placeholder="Décrivez votre expérience (optionnel)"
            value={commentaire}
            onChangeText={setCommentaire}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            editable={!envoiEnCours}
          />

          <TouchableOpacity
            style={[styles.boutonSoumettre, envoiEnCours && styles.boutonDesactive]}
            onPress={demanderAffichageNom}
            disabled={envoiEnCours || note === 0}
          >
            {envoiEnCours ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <Text style={styles.texteBouton}>Envoyer mon évaluation</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Transférer l'évaluation</Text>
            
            <View style={styles.searchBarContainer}>
              <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInput}
                placeholder="Rechercher un partenaire..."
                value={recherchePartenaire}
                onChangeText={setRecherchePartenaire}
              />
            </View>

            {chargementPartenaires ? (
              <ActivityIndicator size="small" color="#34C759" style={styles.indicateurChargement} />
            ) : (
              <FlatList
                data={partenairesFiltres}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[
                      styles.partnerItem,
                      partenaireSelectionne?.id === item.id && styles.selectedPartnerItem
                    ]}
                    onPress={() => setPartenaireSelectionne(item)}
                  >
                    <Text style={styles.partnerName}>{item.name}</Text>
                    <Text style={styles.partnerEmail}>{item.email}</Text>
                  </TouchableOpacity>
                )}
                style={styles.partnerList}
              />
            )}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.confirmButton, !partenaireSelectionne && styles.disabledButton]}
                onPress={transfererEvaluation}
                disabled={!partenaireSelectionne}
              >
                <Text style={styles.modalButtonText}>Confirmer</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  conteneur: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    //bottom: 60
  },
  scrollConteneur: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  transferButton: {
    marginLeft: 'auto',
    padding: 5,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 20,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
    textAlign: 'center',
    color: '#333',
  },
  partnerList: {
    maxHeight: 200,
    marginBottom: 15,
  },
  partnerItem: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  selectedPartnerItem: {
    backgroundColor: '#E8F5E9',
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  partnerEmail: {
    fontSize: 14,
    color: '#666',
    marginTop: 5,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  modalButton: {
    padding: 12,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
  },
  confirmButton: {
    backgroundColor: '#34C759',
  },
  disabledButton: {
    backgroundColor: '#A5D6A7',
  },
  modalButtonText: {
    color: '#FFF',
    fontWeight: '600',
  },
  boutonRetour: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
  },
  titreSection: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    marginTop: 10,
  },
  indicateurChargement: {
    marginVertical: 20,
  },
  aucuneEvaluation: {
    color: '#666',
    textAlign: 'center',
    marginVertical: 20,
  },
  listeEvaluations: {
    marginBottom: 30,
  },
  itemEvaluation: {
    backgroundColor: '#FFF',
    borderRadius: 10,
    padding: 15,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  infoUtilisateur: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    marginRight: 10,
  },
  avatarParDefaut: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#34C759',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  nomUtilisateur: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  conteneurEtoiles: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  commentaireUtilisateur: {
    fontSize: 14,
    color: '#555',
    lineHeight: 20,
    marginBottom: 8,
  },
  dateEvaluation: {
    fontSize: 12,
    color: '#999',
  },
  formulaireEvaluation: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  titre: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 8,
    textAlign: 'center',
  },
  sousTitre: {
    fontSize: 16,
    color: '#666',
    marginBottom: 30,
    textAlign: 'center',
  },
  conteneurNote: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 20,
  },
  texteNote: {
    fontSize: 16,
    color: '#555',
    marginBottom: 30,
    textAlign: 'center',
  },
  champCommentaire: {
    width: '100%',
    minHeight: 120,
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#EEE',
    borderRadius: 10,
    padding: 15,
    marginBottom: 30,
    fontSize: 16,
    textAlign: 'left',
  },
  boutonSoumettre: {
    backgroundColor: '#34C759',
    paddingVertical: 15,
    borderRadius: 25,
    width: '100%',
    alignItems: 'center',
    marginBottom: 40
  },
  boutonDesactive: {
    backgroundColor: '#A5D6A7',
  },
  texteBouton: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});

export default EvaluerService;
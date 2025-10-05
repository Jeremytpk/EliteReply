import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image } from 'react-native'; // Import Image
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere or for chevron
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

// --- NEW: Import your custom icons ---
const USERS_ICON_DATAS = require('../assets/icons/users.png');
const TICKET_ICON_DATAS = require('../assets/icons/ticket.png');
const DONE_TICKET_ICON = require('../assets/icons/done_ticket.png');
const SURVEY_CHECK_ICON_DATAS = require('../assets/icons/survey_check.png');
const POST_ICON = require('../assets/icons/post.png');
const PARTNERS_ICON_DATAS = require('../assets/icons/partners.png');
const PROMOS_ICON_DATAS = require('../assets/icons/promos.png');
const RATE_ICON_DATAS = require('../assets/icons/rate.png');
const MONEY_BILL_ICON_DATAS = require('../assets/icons/money_bill.png');
const CREDIT_CARD_ICON_DATAS = require('../assets/icons/credit_card.png');
const ADD_USER_ICON_DATAS = require('../assets/icons/add_user.png');
const RIGHT_ENTER_ICON = require('../assets/icons/right_enter.png');
// --- END NEW IMPORTS ---

const Datas = () => {
  const navigation = useNavigation();
  const [dataCounts, setDataCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchDataCounts = async () => {
    setLoading(true);
    try {
      // List all your collection names
      const collectionsToFetch = [
        'users', 'tickets', 'surveys', 'posts', 'terminatedTickets',
        'partners', 'news', 'evaluations', 'payments', 'applications'
      ];

      const counts = {};
      for (const collectionName of collectionsToFetch) {
        const querySnapshot = await getDocs(collection(db, collectionName));
        counts[collectionName] = querySnapshot.size;
      }
      setDataCounts(counts);
    } catch (error) {
      console.error("Error fetching data counts:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDataCounts();
  }, []);

  const handlePress = (dataType, displayName) => {
    navigation.navigate('Graphic', { dataType: dataType, displayName: displayName });
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Statistiques des Données</Text>

      <View style={styles.dataList}>
        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('users', 'Utilisateurs')}>
          {/* --- MODIFIED: Use custom image for Utilisateurs --- */}
          <Image source={USERS_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#0a8fdf' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Utilisateurs</Text>
          <Text style={styles.dataCardCount}>{dataCounts.users !== undefined ? dataCounts.users : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('tickets', 'Tickets')}>
          {/* --- MODIFIED: Use custom image for Tickets --- */}
          <Image source={TICKET_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#4CAF50' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Tickets</Text>
          <Text style={styles.dataCardCount}>{dataCounts.tickets !== undefined ? dataCounts.tickets : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('terminatedTickets', 'Tickets Terminés')}>
          {/* --- MODIFIED: Use custom image for Tickets Terminés --- */}
          <Image source={DONE_TICKET_ICON} style={[styles.customDataCardIcon, { tintColor: '#2196F3' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Tickets Terminés</Text>
          <Text style={styles.dataCardCount}>{dataCounts.terminatedTickets !== undefined ? dataCounts.terminatedTickets : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('surveys', 'Enquêtes')}>
          {/* --- MODIFIED: Use custom image for Enquêtes --- */}
          <Image source={SURVEY_CHECK_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#FFC107' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Enquêtes</Text>
          <Text style={styles.dataCardCount}>{dataCounts.surveys !== undefined ? dataCounts.surveys : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('posts', 'Posts')}>
          {/* --- MODIFIED: Use custom image for Posts --- */}
          <Image source={POST_ICON} style={[styles.customDataCardIcon, { tintColor: '#795548' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Posts</Text>
          <Text style={styles.dataCardCount}>{dataCounts.posts !== undefined ? dataCounts.posts : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('partners', 'Partenaires')}>
          {/* --- MODIFIED: Use custom image for Partenaires --- */}
          <Image source={PARTNERS_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#9C27B0' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Partenaires</Text>
          <Text style={styles.dataCardCount}>{dataCounts.partners !== undefined ? dataCounts.partners : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('news', 'Promos')}> {/* Text changed to Promos */}
          {/* --- MODIFIED: Use custom image for Promos --- */}
          <Image source={PROMOS_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#F44336' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Promos</Text> {/* Text changed from Actualités to Promos */}
          <Text style={styles.dataCardCount}>{dataCounts.news !== undefined ? dataCounts.news : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('evaluations', 'Évaluations')}>
          {/* --- MODIFIED: Use custom image for Évaluations --- */}
          <Image source={RATE_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#FF5722' }]} />
          {/* --- END MODIFIED --- */}
          <Text style={styles.dataCardText}>Évaluations</Text>
          <Text style={styles.dataCardCount}>{dataCounts.evaluations !== undefined ? dataCounts.evaluations : '--'}</Text>
          {/* --- MODIFIED: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('payments', 'Paiements')}>
          {/* --- NEW: Use custom image for Paiements --- */}
          <Image source={MONEY_BILL_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#4CAF50' }]} />
          {/* --- END NEW --- */}
          <Text style={styles.dataCardText}>Paiements</Text>
          <Text style={styles.dataCardCount}>{dataCounts.payments !== undefined ? dataCounts.payments : '--'}</Text>
          {/* --- NEW: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END NEW --- */}
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('applications', 'Candidatures')}>
          {/* --- NEW: Use custom image for Candidatures --- */}
          <Image source={ADD_USER_ICON_DATAS} style={[styles.customDataCardIcon, { tintColor: '#607D8B' }]} />
          {/* --- END NEW --- */}
          <Text style={styles.dataCardText}>Candidatures</Text>
          <Text style={styles.dataCardCount}>{dataCounts.applications !== undefined ? dataCounts.applications : '--'}</Text>
          {/* --- NEW: Use custom image for right arrow --- */}
          <Image source={RIGHT_ENTER_ICON} style={styles.customArrowIcon} />
          {/* --- END NEW --- */}
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 15,
    marginTop: 30,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    color: '#333',
    textAlign: 'center',
  },
  dataList: {
    // No specific styles needed here, children will handle their layout
  },
  dataCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // --- NEW STYLE for Custom Data Card Icons ---
  customDataCardIcon: {
    width: 28, // Match original Ionicons size
    height: 28, // Match original Ionicons size
    resizeMode: 'contain',
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
  // --- NEW STYLE for Custom Arrow Icon ---
  customArrowIcon: {
    width: 24, // Match original Ionicons size
    height: 24, // Match original Ionicons size
    resizeMode: 'contain',
    tintColor: '#555', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  dataCardText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginLeft: 15,
  },
  dataCardCount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0a8fdf',
    marginRight: 10,
  },
});

export default Datas;
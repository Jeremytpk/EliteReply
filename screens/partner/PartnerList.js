import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  TextInput, // <-- ADDED: Import TextInput
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';

const PartnerList = () => {
  const [partners, setPartners] = useState([]);
  const [filteredPartners, setFilteredPartners] = useState([]); // <-- ADDED: State for filtered list
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState(''); // <-- ADDED: State for search query
  const navigation = useNavigation();

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const partnersCollection = collection(db, 'partners');
        const partnerSnapshot = await getDocs(partnersCollection);
        const partnersList = partnerSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
        }));
        setPartners(partnersList);
        setFilteredPartners(partnersList); // <-- Initially set filtered list to all partners
      } catch (error) {
        console.error("Error fetching partners:", error);
        Alert.alert("Erreur", "Impossible de charger la liste des partenaires.");
      } finally {
        setLoading(false);
      }
    };
    
    fetchPartners();
  }, []);

  // <-- ADDED: useEffect to filter partners based on search query
  useEffect(() => {
    if (searchQuery === '') {
      setFilteredPartners(partners);
    } else {
      const lowercasedQuery = searchQuery.toLowerCase();
      const newFilteredList = partners.filter(partner => {
        // You can search by 'nom' or 'categorie' or any other field
        const partnerName = partner.nom?.toLowerCase() || '';
        const partnerCategory = partner.categorie?.toLowerCase() || '';
        return partnerName.includes(lowercasedQuery) || partnerCategory.includes(lowercasedQuery);
      });
      setFilteredPartners(newFilteredList);
    }
  }, [searchQuery, partners]);

  const renderPartnerItem = ({ item }) => (
    <TouchableOpacity
      style={styles.partnerItem}
      onPress={() => navigation.navigate('PartnerPage', { partnerId: item.id })}
    >
      <View style={styles.partnerInfo}>
        <Text style={styles.partnerName}>{item.nom || 'Nom Inconnu'}</Text>
        <Text style={styles.partnerCategory}>{item.categorie || 'Catégorie non spécifiée'}</Text>
      </View>
      <MaterialIcons name="chevron-right" size={24} color="#C4C4C4" />
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#34C759" />
        <Text style={styles.loadingText}>Chargement des partenaires...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Liste des Partenaires</Text>
        <View style={{ width: 24 }} />
      </View>
      
      {/* <-- ADDED: Search Bar Input */}
      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchBar}
          placeholder="Rechercher un partenaire..."
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>
      
      {filteredPartners.length > 0 ? (
        <FlatList
          data={filteredPartners} // <-- Use the filtered list here
          renderItem={renderPartnerItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContent}
        />
      ) : (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Aucun partenaire trouvé.</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
  },
  loadingText: {
    marginTop: 16,
    color: '#6B7280',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  listContent: {
    padding: 16,
  },
  partnerItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  partnerInfo: {
    flex: 1,
    marginRight: 10,
  },
  partnerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C2C2C',
  },
  partnerCategory: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
  },
  // <-- ADDED: New styles for the search bar
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 12,
    margin: 16,
    marginTop: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchBar: {
    flex: 1,
    height: 40,
    fontSize: 16,
    color: '#2C2C2C',
  },
});

export default PartnerList;
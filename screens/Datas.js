import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

const Datas = () => {
  const navigation = useNavigation();
  const [dataCounts, setDataCounts] = useState({});
  const [loading, setLoading] = useState(true);

  const fetchDataCounts = async () => {
    setLoading(true);
    try {
      const collectionsToFetch = [
        'users', 
        'tickets', 
        'surveys', 
        'posts', 
        'terminatedTickets', 
        'partners', 
        'news', 
        'evaluations'
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
          <Ionicons name="people-outline" size={28} color="#0a8fdf" />
          <Text style={styles.dataCardText}>Utilisateurs</Text>
          <Text style={styles.dataCardCount}>{dataCounts.users !== undefined ? dataCounts.users : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('tickets', 'Tickets')}>
          <Ionicons name="ticket-outline" size={28} color="#4CAF50" />
          <Text style={styles.dataCardText}>Tickets</Text>
          <Text style={styles.dataCardCount}>{dataCounts.tickets !== undefined ? dataCounts.tickets : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('terminatedTickets', 'Tickets Terminés')}>
          <Ionicons name="checkmark-done-outline" size={28} color="#2196F3" />
          <Text style={styles.dataCardText}>Tickets Terminés</Text>
          <Text style={styles.dataCardCount}>{dataCounts.terminatedTickets !== undefined ? dataCounts.terminatedTickets : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('surveys', 'Enquêtes')}>
          <Ionicons name="list-outline" size={28} color="#FFC107" />
          <Text style={styles.dataCardText}>Enquêtes</Text>
          <Text style={styles.dataCardCount}>{dataCounts.surveys !== undefined ? dataCounts.surveys : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('posts', 'Posts')}>
          <Ionicons name="crop" size={28} color="#795548" />
          <Text style={styles.dataCardText}>Posts</Text>
          <Text style={styles.dataCardCount}>{dataCounts.posts !== undefined ? dataCounts.posts : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('partners', 'Partenaires')}>
          <Ionicons name="business" size={28} color="#9C27B0" />
          <Text style={styles.dataCardText}>Partenaires</Text>
          <Text style={styles.dataCardCount}>{dataCounts.partners !== undefined ? dataCounts.partners : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('news', 'Actualités')}>
          <Ionicons name="newspaper-outline" size={28} color="#F44336" />
          <Text style={styles.dataCardText}>Actualités</Text>
          <Text style={styles.dataCardCount}>{dataCounts.news !== undefined ? dataCounts.news : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.dataCard} onPress={() => handlePress('evaluations', 'Évaluations')}>
          <Ionicons name="star-half-outline" size={28} color="#FF5722" />
          <Text style={styles.dataCardText}>Évaluations</Text>
          <Text style={styles.dataCardCount}>{dataCounts.evaluations !== undefined ? dataCounts.evaluations : '--'}</Text>
          <Ionicons name="chevron-forward-outline" size={24} color="#555" />
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
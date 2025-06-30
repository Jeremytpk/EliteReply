import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

const ListeDemandes = ({ navigation }) => {
  const [demandes, setDemandes] = useState([
    {
      id: '1',
      client: 'Jean Dupont',
      date: '2023-06-15',
      service: 'Chambre standard',
      status: 'en attente',
      photo: require('../../assets/images/Profile.png')
    },
    {
      id: '2',
      client: 'Marie Lambert',
      date: '2023-06-20',
      service: 'Suite luxe',
      status: 'en attente',
      photo: require('../../assets/images/Profile.png')
    },
    {
      id: '3',
      client: 'Paul Martin',
      date: '2023-06-22',
      service: 'Chambre familiale',
      status: 'en attente',
      photo: require('../../assets/images/Profile.png')
    }
  ]);

  const renderItem = ({ item }) => (
    <TouchableOpacity style={styles.card}>
      <Image source={item.photo} style={styles.photo} />
      <View style={styles.infoContainer}>
        <Text style={styles.clientName}>{item.client}</Text>
        <Text style={styles.service}>{item.service}</Text>
        <Text style={styles.date}>{item.date}</Text>
      </View>
      <View style={[styles.status, item.status === 'acceptée' ? styles.accepted : styles.pending]}>
        <Text style={styles.statusText}>{item.status}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {demandes.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="document-text-outline" size={60} color="#ccc" />
          <Text style={styles.emptyText}>Aucune demande reçue pour le moment</Text>
        </View>
      ) : (
        <FlatList
          data={demandes}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#666',
    marginTop: 20,
  },
  list: {
    padding: 15,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  photo: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 15,
  },
  infoContainer: {
    flex: 1,
  },
  clientName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  service: {
    fontSize: 14,
    color: '#555',
    marginBottom: 3,
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  pending: {
    backgroundColor: '#FFF3CD',
  },
  accepted: {
    backgroundColor: '#D4EDDA',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
});

export default ListeDemandes;
import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const Confirm = ({ navigation }) => {
  const [confirmedClients, setConfirmedClients] = useState([
    {
      id: '1',
      name: 'Sophie Martin',
      date: '2023-06-10',
      amount: 120,
      room: 'Chambre Deluxe',
      paymentMethod: 'Carte de crédit'
    },
    {
      id: '2',
      name: 'Pierre Dubois',
      date: '2023-06-12',
      amount: 150,
      room: 'Suite Présidentielle',
      paymentMethod: 'Espèces'
    },
    {
      id: '3',
      name: 'Lucie Bernard',
      date: '2023-06-15',
      amount: 95,
      room: 'Chambre Standard',
      paymentMethod: 'Virement'
    }
  ]);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.clientName}>{item.name}</Text>
        <Text style={styles.amount}>${item.amount}</Text>
      </View>
      <Text style={styles.room}>{item.room}</Text>
      <View style={styles.footer}>
        <Text style={styles.date}>{item.date}</Text>
        <Text style={styles.payment}>{item.paymentMethod}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {confirmedClients.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="payment" size={60} color="#ccc" />
          <Text style={styles.emptyText}>Aucun client confirmé pour le moment</Text>
        </View>
      ) : (
        <FlatList
          data={confirmedClients}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  clientName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  room: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  payment: {
    fontSize: 12,
    color: '#888',
  },
});

export default Confirm;
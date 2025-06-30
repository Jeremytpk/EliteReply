import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const Rdv = ({ navigation }) => {
  const [appointments, setAppointments] = useState([
    {
      id: '1',
      client: 'Emma Johnson',
      date: '2023-06-15',
      time: '14:00',
      service: 'Consultation initiale'
    },
    {
      id: '2',
      client: 'Thomas Wilson',
      date: '2023-06-16',
      time: '10:30',
      service: 'Suivi mensuel'
    },
    {
      id: '3',
      client: 'Sophie Garcia',
      date: '2023-06-18',
      time: '16:15',
      service: 'Evaluation finale'
    }
  ]);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.timeContainer}>
        <Text style={styles.time}>{item.time}</Text>
      </View>
      <View style={styles.details}>
        <Text style={styles.client}>{item.client}</Text>
        <Text style={styles.service}>{item.service}</Text>
        <Text style={styles.date}>{item.date}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {appointments.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="calendar-blank" size={60} color="#ccc" />
          <Text style={styles.emptyText}>Aucun rendez-vous prévu</Text>
        </View>
      ) : (
        <FlatList
          data={appointments}
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  timeContainer: {
    backgroundColor: '#4a6bff',
    borderRadius: 8,
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 15,
  },
  time: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  details: {
    flex: 1,
  },
  client: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  service: {
    fontSize: 14,
    color: '#555',
    marginBottom: 5,
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
});

export default Rdv;
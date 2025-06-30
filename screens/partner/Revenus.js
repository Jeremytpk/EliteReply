import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Modal, TextInput } from 'react-native';
import { FontAwesome, MaterialIcons } from '@expo/vector-icons';

const Revenus = ({ navigation }) => {
  const [revenues, setRevenues] = useState([
    {
      id: '1',
      client: 'Client A',
      amount: 200,
      reason: 'Chambre Deluxe - 2 nuits',
      date: '2023-06-01'
    },
    {
      id: '2',
      client: 'Client B',
      amount: 150,
      reason: 'Suite - 1 nuit',
      date: '2023-06-05'
    },
    {
      id: '3',
      client: 'Client C',
      amount: 300,
      reason: 'Événement spécial',
      date: '2023-06-10'
    }
  ]);

  const [modalVisible, setModalVisible] = useState(false);
  const [newRevenue, setNewRevenue] = useState({
    client: '',
    amount: '',
    reason: '',
    date: new Date().toISOString().split('T')[0]
  });

  const handleAddRevenue = () => {
    if (newRevenue.client && newRevenue.amount && newRevenue.reason) {
      setRevenues([
        ...revenues,
        {
          id: (revenues.length + 1).toString(),
          client: newRevenue.client,
          amount: parseFloat(newRevenue.amount),
          reason: newRevenue.reason,
          date: newRevenue.date
        }
      ]);
      setNewRevenue({
        client: '',
        amount: '',
        reason: '',
        date: new Date().toISOString().split('T')[0]
      });
      setModalVisible(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.client}>{item.client}</Text>
        <Text style={styles.amount}>${item.amount.toFixed(2)}</Text>
      </View>
      <Text style={styles.reason}>{item.reason}</Text>
      <Text style={styles.date}>{item.date}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={styles.addButton}
        onPress={() => setModalVisible(true)}
      >
        <FontAwesome name="plus" size={20} color="white" />
        <Text style={styles.addButtonText}>Ajouter Revenu</Text>
      </TouchableOpacity>

      {revenues.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="attach-money" size={60} color="#ccc" />
          <Text style={styles.emptyText}>Aucun revenu enregistré</Text>
        </View>
      ) : (
        <FlatList
          data={revenues}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal
        animationType="slide"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Ajouter un Revenu</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Nom du client"
              value={newRevenue.client}
              onChangeText={text => setNewRevenue({...newRevenue, client: text})}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Montant ($)"
              keyboardType="numeric"
              value={newRevenue.amount}
              onChangeText={text => setNewRevenue({...newRevenue, amount: text})}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Raison"
              value={newRevenue.reason}
              onChangeText={text => setNewRevenue({...newRevenue, reason: text})}
            />
            
            <TextInput
              style={styles.input}
              placeholder="Date (YYYY-MM-DD)"
              value={newRevenue.date}
              onChangeText={text => setNewRevenue({...newRevenue, date: text})}
            />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.modalButtonText}>Annuler</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleAddRevenue}
              >
                <Text style={styles.modalButtonText}>Ajouter</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  addButton: {
    flexDirection: 'row',
    backgroundColor: '#4a6bff',
    padding: 15,
    borderRadius: 8,
    margin: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
    marginLeft: 10,
    fontSize: 16,
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
  client: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#28a745',
  },
  reason: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  date: {
    fontSize: 12,
    color: '#888',
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    padding: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 12,
    marginBottom: 15,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modalButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f5f5f5',
  },
  submitButton: {
    backgroundColor: '#4a6bff',
  },
  modalButtonText: {
    fontWeight: '600',
  },
});

export default Revenus;
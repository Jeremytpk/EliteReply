import React, { useState } from 'react';
import { View, Text, StyleSheet, FlatList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

const Commission = ({ navigation }) => {
  const [commissions, setCommissions] = useState([
    {
      id: '1',
      date: '2023-05-31',
      amount: 174,
      revenue: 200,
      status: 'payée'
    },
    {
      id: '2',
      date: '2023-04-30',
      amount: 130.5,
      revenue: 150,
      status: 'payée'
    },
    {
      id: '3',
      date: '2023-03-31',
      amount: 261,
      revenue: 300,
      status: 'payée'
    }
  ]);

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.date}>{item.date}</Text>
        <View style={[styles.status, item.status === 'payée' ? styles.paid : styles.pending]}>
          <Text style={styles.statusText}>{item.status}</Text>
        </View>
      </View>
      <View style={styles.amountContainer}>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Revenu:</Text>
          <Text style={styles.revenue}>${item.revenue.toFixed(2)}</Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Commission (13%):</Text>
          <Text style={styles.commission}>-${(item.revenue * 0.13).toFixed(2)}</Text>
        </View>
        <View style={styles.amountItem}>
          <Text style={styles.amountLabel}>Total:</Text>
          <Text style={styles.total}>${item.amount.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {commissions.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="money-off" size={60} color="#ccc" />
          <Text style={styles.emptyText}>Aucune commission à afficher</Text>
        </View>
      ) : (
        <FlatList
          data={commissions}
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
    marginBottom: 15,
  },
  date: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  status: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 15,
  },
  paid: {
    backgroundColor: '#D4EDDA',
  },
  pending: {
    backgroundColor: '#FFF3CD',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  amountContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  amountItem: {
    alignItems: 'center',
  },
  amountLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  revenue: {
    fontSize: 14,
    color: '#28a745',
    fontWeight: 'bold',
  },
  commission: {
    fontSize: 14,
    color: '#dc3545',
    fontWeight: 'bold',
  },
  total: {
    fontSize: 16,
    color: '#007bff',
    fontWeight: 'bold',
  },
});

export default Commission;
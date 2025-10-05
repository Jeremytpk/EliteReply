import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

const OrderTracking = ({ paymentId, initialStatus = 'pending', isPartner = false, onStatusUpdate }) => {
  const [currentStatus, setCurrentStatus] = useState(initialStatus);
  const [animatedValues, setAnimatedValues] = useState({});
  const [loading, setLoading] = useState(false);

  // Define tracking statuses
  const trackingStatuses = [
    {
      key: 'pending',
      label: 'En Attente',
      icon: 'time-outline',
      color: '#FFC107',
      description: 'Commande reçue et en cours de traitement'
    },
    {
      key: 'processing',
      label: 'En Traitement',
      icon: 'cog-outline',
      color: '#2196F3',
      description: 'Préparation de votre commande'
    },
    {
      key: 'shipped',
      label: 'Expédiée',
      icon: 'car-outline',
      color: '#FF9800',
      description: 'Commande expédiée vers la destination'
    },
    {
      key: 'delivered',
      label: 'Livrée',
      icon: 'checkmark-circle-outline',
      color: '#4CAF50',
      description: 'Commande livrée avec succès'
    }
  ];

  useEffect(() => {
    // Initialize animated values
    const initialAnimatedValues = {};
    trackingStatuses.forEach((status, index) => {
      initialAnimatedValues[status.key] = new Animated.Value(0);
    });
    setAnimatedValues(initialAnimatedValues);

    // Listen to real-time updates for this payment
    if (paymentId) {
      const unsubscribe = onSnapshot(doc(db, 'payments', paymentId), (doc) => {
        if (doc.exists()) {
          const data = doc.data();
          const newStatus = data.trackingStatus || 'pending';
          setCurrentStatus(newStatus);
          animateToStatus(newStatus);
        }
      });

      return () => unsubscribe();
    }
  }, [paymentId]);

  useEffect(() => {
    animateToStatus(currentStatus);
  }, [currentStatus, animatedValues]);

  const animateToStatus = (status) => {
    const currentIndex = trackingStatuses.findIndex(s => s.key === status);
    
    trackingStatuses.forEach((trackingStatus, index) => {
      const animatedValue = animatedValues[trackingStatus.key];
      if (animatedValue) {
        Animated.timing(animatedValue, {
          toValue: index <= currentIndex ? 1 : 0,
          duration: 800,
          useNativeDriver: false,
        }).start();
      }
    });
  };

  const updateOrderStatus = async (newStatus) => {
    if (!isPartner) return;

    setLoading(true);
    try {
      await updateDoc(doc(db, 'payments', paymentId), {
        trackingStatus: newStatus,
        lastStatusUpdate: new Date(),
        updatedAt: new Date()
      });

      setCurrentStatus(newStatus);
      onStatusUpdate && onStatusUpdate(newStatus);
      
      Alert.alert(
        'Statut Mis à Jour',
        `Le statut de la commande a été mis à jour vers: ${trackingStatuses.find(s => s.key === newStatus)?.label}`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Error updating order status:', error);
      Alert.alert('Erreur', 'Impossible de mettre à jour le statut de la commande');
    } finally {
      setLoading(false);
    }
  };

  const renderTrackingStep = (status, index) => {
    const isActive = trackingStatuses.findIndex(s => s.key === currentStatus) >= index;
    const animatedValue = animatedValues[status.key] || new Animated.Value(0);

    const animatedStyle = {
      transform: [{
        scale: animatedValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.8, 1],
        })
      }],
      opacity: animatedValue.interpolate({
        inputRange: [0, 1],  
        outputRange: [0.3, 1],
      })
    };

    const lineStyle = {
      backgroundColor: animatedValue.interpolate({
        inputRange: [0, 1],
        outputRange: ['#E0E0E0', status.color],
      })
    };

    return (
      <View key={status.key} style={styles.trackingStep}>
        <View style={styles.stepContainer}>
          <Animated.View style={[styles.stepCircle, animatedStyle, { borderColor: status.color }]}>
            <Ionicons
              name={isActive ? status.icon.replace('-outline', '') : status.icon}
              size={24}
              color={isActive ? '#fff' : status.color}
            />
            <Animated.View 
              style={[
                styles.stepCircleBackground, 
                { backgroundColor: status.color },
                animatedStyle
              ]} 
            />
          </Animated.View>
          
          {index < trackingStatuses.length - 1 && (
            <Animated.View style={[styles.stepLine, lineStyle]} />
          )}
        </View>
        
        <View style={styles.stepContent}>
          <Text style={[styles.stepLabel, { color: isActive ? status.color : '#666' }]}>
            {status.label}
          </Text>
          <Text style={styles.stepDescription}>{status.description}</Text>
          
          {isPartner && (
            <TouchableOpacity
              style={[
                styles.updateButton,
                { backgroundColor: status.color + '20', borderColor: status.color }
              ]}
              onPress={() => updateOrderStatus(status.key)}
              disabled={loading}
            >
              <Text style={[styles.updateButtonText, { color: status.color }]}>
                Marquer comme {status.label}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Ionicons name="location-outline" size={24} color="#667eea" />
        <Text style={styles.headerTitle}>Suivi de Commande</Text>
      </View>

      <View style={styles.trackingContainer}>
        {trackingStatuses.map((status, index) => renderTrackingStep(status, index))}
      </View>

      {isPartner && (
        <View style={styles.partnerActions}>
          <Text style={styles.partnerActionsTitle}>Actions Partenaire</Text>
          <Text style={styles.partnerActionsSubtitle}>
            Cliquez sur un statut ci-dessus pour mettre à jour la commande
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginLeft: 10,
  },
  trackingContainer: {
    padding: 20,
  },
  trackingStep: {
    flexDirection: 'row',
    marginBottom: 30,
  },
  stepContainer: {
    alignItems: 'center',
    marginRight: 15,
  },
  stepCircle: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    zIndex: 2,
  },
  stepCircleBackground: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    zIndex: -1,
  },
  stepLine: {
    width: 4,
    height: 40,
    marginTop: 10,
    borderRadius: 2,
  },
  stepContent: {
    flex: 1,
    paddingTop: 5,
  },
  stepLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 10,
  },
  updateButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 15,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  updateButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
  partnerActions: {
    backgroundColor: '#fff',
    margin: 20,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  partnerActionsTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
  },
  partnerActionsSubtitle: {
    fontSize: 14,
    color: '#666',
  },
});

export default OrderTracking;

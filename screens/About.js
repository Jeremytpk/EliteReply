import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { MaterialIcons } from '@expo/vector-icons';

const About = ({ navigation }) => {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/*
      <TouchableOpacity 
        style={styles.backButton} 
        onPress={() => navigation.goBack()}
      >
        <Ionicons name="arrow-back" size={24} color="#2C2C2C" />
      </TouchableOpacity>
        */}
        
      <View style={styles.header}>
        <Image 
          source={require('../assets/images/Logo.png')} 
          style={styles.logo} 
          resizeMode="contain"
        />
        <Text style={styles.title}>EliteReply</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.text}>
          Notre mission est de simplifier l'accès aux services locaux pour les Africains, où qu'ils soient. En fusionnant l'intelligence artificielle et le contact humain, nous créons une expérience de service client unique, efficace et personnalisée.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="business-center" size={24} color="#34C759" />
          <Text style={styles.sectionTitle}>Notre Mission</Text>
        </View>
        <Text style={styles.text}>
          Révolutionner l'expérience client en Afrique francophone grâce à des réponses instantanées, personnalisées et accessibles 24h/24.
        </Text>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <MaterialIcons name="build" size={24} color="#34C759" />
          <Text style={styles.sectionTitle}>La Technologie Derrière EliteReply</Text>
        </View>
        <Text style={styles.text}>
          Nous utilisons une plateforme puissante développée par notre partenaire technologique Jerttech, une entreprise spécialisée dans les solutions logicielles intelligentes pour les entreprises.
        </Text>
      </View>

      <View style={styles.contactSection}>
        <Text style={styles.contactTitle}>Contactez-nous - Kinshasa</Text>
        <View style={styles.contactItem}>
          <Ionicons name="mail" size={20} color="#34C759" />
          <Text style={styles.contactText}>contact@elitereply.info</Text>
        </View>
        {/*
        <View style={styles.contactItem}>
          <Ionicons name="call" size={20} color="#34C759" />
          <Text style={styles.contactText}>+243 000 000 000</Text>
        </View>
        */}
        <View style={styles.contactItem}>
          <Ionicons name="location" size={20} color="#34C759" />
          <Text style={styles.contactText}>Kinshasa, République Démocratique du Congo</Text>
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    paddingHorizontal: 20,
    bottom: 40
  },
  contentContainer: {
    paddingTop: 60,
    paddingBottom: 40,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 20,
    zIndex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    width: 120,
    height: 120,
    borderRadius: 30,
    bottom: 10
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#2C2C2C',
    textAlign: 'center',
  },
  section: {
    marginBottom: 30,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C2C2C',
    marginLeft: 10,
  },
  text: {
    fontSize: 16,
    lineHeight: 24,
    color: '#4B5563',
  },
  contactSection: {
    marginTop: 20,
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  contactTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#2C2C2C',
    marginBottom: 15,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  contactText: {
    fontSize: 16,
    color: '#4B5563',
    marginLeft: 10,
  },
});

export default About;
// Deconnection.js
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { auth } from '../firebase'; // Adjust path as needed
import { signOut } from 'firebase/auth';

const byebyeImage = require('../assets/icons/byebye.png'); // Make sure this path is correct

const Deconnection = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = React.useState(false); // State for loading indicator

  const handleConfirmLogout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      console.log("User signed out!");
      // Reset navigation stack to Dashboard for guest browsing
      navigation.reset({
        index: 0,
        routes: [{ name: 'Dashboard' }],
      });
    } catch (error) {
      console.error("Error signing out:", error);
      Alert.alert("Erreur", "Impossible de se déconnecter. Veuillez réessayer.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Image
        source={byebyeImage}
        style={styles.byebyeImage}
        resizeMode="contain"
      />
      <Text style={styles.messageText}>
        Merci d'avoir utilisé EliteReply. Nous espérons vous revoir bientôt !
      </Text>
      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleConfirmLogout}
        disabled={loading} // Disable button while loading
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.logoutButtonText}>Déconnexion</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'white',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  byebyeImage: {
    width: '80%', // Adjust size as needed
    height: 250, // Adjust height as needed
    marginBottom: 30,
  },
  messageText: {
    fontSize: 18,
    color: '#4A5568',
    textAlign: 'center',
    marginBottom: 40,
    lineHeight: 26,
    fontWeight: '500',
  },
  logoutButton: {
    backgroundColor: '#EF4444', // Red color for logout
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default Deconnection;
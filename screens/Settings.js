import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Image, ActivityIndicator, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { auth, db } from '../firebase';
import { signOut } from 'firebase/auth';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { doc, getDoc } from 'firebase/firestore';

const Paramètres = () => {
  const navigation = useNavigation();
  const isFocused = useIsFocused(); // Hook to detect when the screen is focused
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUserData = async () => {
      setLoading(true);
      try {
        const user = auth.currentUser;
        if (user) {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserData({
              name: userDoc.data().name,
              email: user.email,
              photoURL: user.photoURL || userDoc.data().photoURL,
              role: userDoc.data().role,
              department: userDoc.data().department,
              position: userDoc.data().position
            });
          } else {
            console.warn("No user data found in Firestore for UID:", user.uid);
            setUserData(null); // Clear data if doc doesn't exist
          }
        } else {
          setUserData(null); // Clear data if no user is logged in
        }
      } catch (error) {
        console.error("Error fetching user data:", error);
        Alert.alert("Erreur", "Impossible de charger les données utilisateur. Veuillez réessayer.");
      } finally {
        setLoading(false);
      }
    };

    // Re-fetch data whenever the screen becomes focused
    if (isFocused) {
      fetchUserData();
    }
  }, [isFocused]); // Depend on isFocused to re-fetch

  const handleLogout = async () => {
    Alert.alert(
      'Déconnexion',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      [
        {
          text: 'Annuler',
          style: 'cancel',
        },
        {
          text: 'Oui',
          onPress: async () => {
            try {
              await signOut(auth);
              Alert.alert(
                'Déconnexion réussie',
                'Vous avez été déconnecté avec succès',
                [
                  {
                    text: 'OK',
                    onPress: () => navigation.reset({
                      index: 0,
                      routes: [{ name: 'Login' }],
                    }),
                  },
                ],
                { cancelable: false }
              );
            } catch (error) {
              Alert.alert(
                'Erreur',
                'Une erreur est survenue lors de la déconnexion'
              );
              console.error("Erreur de déconnexion:", error);
            }
          },
        },
      ],
      { cancelable: true }
    );
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Chargement du profil...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      {/* Enhanced Profile Section */}
      <View style={styles.profileCard}>
        {userData?.photoURL ? (
          <Image
            source={{ uri: userData.photoURL }}
            style={styles.profileImage}
          />
        ) : (
          <View style={styles.profileImagePlaceholder}>
            <Ionicons name="person" size={70} color="#E0F2F7" />
          </View>
        )}

        <View style={styles.userInfoContainer}>
          <Text style={styles.userName}>{userData?.name || 'Utilisateur Inconnu'}</Text>
          {userData?.email && <Text style={styles.userEmail}>{userData.email}</Text>}

          {(userData?.role === 'ITSupport' || userData?.role === 'Admin') && (
            <View style={styles.roleDetailsContainer}>
              {userData?.department && (
                <Text style={styles.userDetail}>
                  <Ionicons name="briefcase-outline" size={14} color="#6B7280" /> {userData.department}
                </Text>
              )}
              {userData?.position && (
                <Text style={styles.userDetail}>
                  <Ionicons name="cube-outline" size={14} color="#6B7280" /> {userData.position}
                </Text>
              )}
            </View>
          )}
        </View>
      </View>

      {/* Account Settings Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Mon Compte</Text>

        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('EditProfile', { userData: userData })}
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="person-outline" size={22} color="#0a8fdf" style={styles.settingIcon} />
            <Text style={styles.settingText}>Modifier le profil</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>

        {/* Mes Coupons Button */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('UserCoupons')} // Navigate to UserCoupons screen
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="ticket-outline" size={22} color="#28a745" style={styles.settingIcon} /> {/* Green icon for coupons */}
            <Text style={styles.settingText}>Mes Coupons</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>

        {/* NEW: Mes Rendez-vous Button */}
        <TouchableOpacity
          style={styles.settingItem}
          onPress={() => navigation.navigate('UserRdv')} // Navigate to UserRdv screen
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="calendar-outline" size={22} color="#FF9500" style={styles.settingIcon} /> {/* Orange icon for appointments */}
            <Text style={styles.settingText}>Mes Rendez-vous</Text>
          </View>
          <Ionicons name="chevron-forward-outline" size={20} color="#A0AEC0" />
        </TouchableOpacity>

      </View>

      {/* Security Section */}
      <View style={styles.settingsSection}>
        <Text style={styles.sectionTitle}>Sécurité</Text>

        <TouchableOpacity
          style={[styles.settingItem, styles.logoutButton]}
          onPress={handleLogout}
        >
          <View style={styles.settingItemContent}>
            <Ionicons name="log-out-outline" size={22} color="#EF4444" style={styles.settingIcon} />
            <Text style={[styles.settingText, styles.logoutText]}>Déconnexion</Text>
          </View>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>Version 1.0.0</Text>
    </ScrollView>
  );
};


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#EBF3F8',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#EBF3F8',
  },
  loadingText: {
    marginTop: 15,
    fontSize: 16,
    color: '#64748b',
  },
  profileCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 30,
    paddingHorizontal: 25,
    alignItems: 'center',
    marginBottom: 35,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 8,
  },
  profileImage: {
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 4,
    borderColor: '#0a8fdf',
    marginBottom: 20,
  },
  profileImagePlaceholder: {
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: '#0a8fdf',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  userInfoContainer: {
    alignItems: 'center',
    width: '100%',
  },
  userName: {
    fontSize: 26,
    fontWeight: '800',
    color: '#2D3748',
    marginBottom: 8,
    textAlign: 'center',
  },
  userEmail: {
    fontSize: 16,
    color: '#718096',
    marginBottom: 12,
    textAlign: 'center',
  },
  roleDetailsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
    width: '80%',
    alignItems: 'center',
  },
  userDetail: {
    fontSize: 14,
    color: '#4A5568',
    marginBottom: 5,
    textAlign: 'center',
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingsSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    marginBottom: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
    padding: 20,
  },
  sectionTitle: {
    fontSize: 19,
    fontWeight: '700',
    color: '#2D3748',
    marginBottom: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EDF2F7',
  },
  settingItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingIcon: {
    marginRight: 18,
  },
  settingText: {
    fontSize: 17,
    color: '#4A5568',
    fontWeight: '500',
  },
  logoutButton: {
    borderBottomWidth: 0,
    marginTop: 5,
  },
  logoutText: {
    color: '#EF4444',
    fontWeight: '600',
  },
  version: {
    textAlign: 'center',
    color: '#A0AEC0',
    marginTop: 30,
    fontSize: 13,
    marginBottom: 20,
  },
});

export default Paramètres;
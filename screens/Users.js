import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  TextInput,
  Image // Import Image component
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere
import { LinearGradient } from 'expo-linear-gradient';
import { auth, db } from '../firebase';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';

// --- NEW: Import your custom icons ---
const ARROW_UP_ICON = require('../assets/icons/arrow_up.png');
const APPS_MENU_ICON = require('../assets/icons/apps_menu.png');
const DELETE_ICON = require('../assets/icons/delete.png');
// --- END NEW IMPORTS ---

const Users = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('asc'); // 'asc' for ascending, 'desc' for descending

  useEffect(() => {
    const checkAdminStatus = async () => {
      try {
        const user = auth.currentUser;
        if (!user) {
          navigation.navigate('Login');
          return;
        }

        // Force token refresh to get latest claims
        await user.getIdToken(true);
        const token = await user.getIdTokenResult();

        // Check for both 'role' and 'isAdmin' claims
        if (!token.claims.role === 'admin' && !token.claims.isAdmin) {
          Alert.alert(
            "Access Denied",
            "Admin privileges required",
            [{ text: "OK", onPress: () => navigation.goBack() }]
          );
          return;
        }

        setIsAdmin(true);
        fetchUsers();
      } catch (error) {
        console.error("Error checking admin status:", error);
        Alert.alert("Error", "Failed to verify permissions");
        navigation.goBack();
      }
    };

    const fetchUsers = async () => {
      try {
        const querySnapshot = await getDocs(collection(db, 'users'));
        const usersData = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setUsers(usersData);
        setFilteredUsers(usersData);
      } catch (error) {
        console.error("Error fetching users:", error);
        Alert.alert("Error", "Failed to load users");
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [navigation]);

  useEffect(() => {
    let currentUsers = [...users];

    // Apply search filter
    if (searchQuery.trim() !== '') {
      currentUsers = currentUsers.filter(user =>
        user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.role?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply sorting
    currentUsers.sort((a, b) => {
      const nameA = (a.name || '').toLowerCase();
      const nameB = (b.name || '').toLowerCase();
      if (sortOrder === 'asc') {
        return nameA.localeCompare(nameB);
      } else {
        return nameB.localeCompare(nameA);
      }
    });

    setFilteredUsers(currentUsers);
  }, [searchQuery, users, sortOrder]); // Re-run effect when sortOrder changes

  const handleDeleteUser = async (userId) => {
    if (!isAdmin) return;

    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to delete this user?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'users', userId));
              setUsers(prev => prev.filter(u => u.id !== userId));
              setFilteredUsers(prev => prev.filter(u => u.id !== userId));
            } catch (error) {
              console.error("Error deleting user:", error);
              Alert.alert("Error", "Failed to delete user");
            }
          }
        }
      ]
    );
  };

  const navigateToUserDetails = (user) => {
    navigation.navigate('DetailsUser', { user });
  };

  const toggleSortOrder = () => {
    setSortOrder(prevOrder => prevOrder === 'asc' ? 'desc' : 'asc');
  };

  const navigateToUsersDashboard = () => {
    // Assuming 'UsersDashboard' is the route name for your dashboard
    navigation.navigate('UsersDashboard');
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  if (!isAdmin) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Admin privileges required</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.headerContainer}
      >
        <Text style={styles.header}>Users Management ({filteredUsers.length})</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={toggleSortOrder} style={styles.iconButton}>
            {/* --- MODIFIED: Use custom image for sort arrow --- */}
            <Image
              source={sortOrder === 'asc' ? ARROW_UP_ICON : ARROW_UP_ICON} // Use ARROW_UP_ICON for both, rely on rotation for down
              style={[styles.customHeaderIcon, sortOrder === 'desc' && { transform: [{ rotate: '180deg' }] }]}
            />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
          <TouchableOpacity onPress={navigateToUsersDashboard} style={styles.iconButton}>
            {/* --- MODIFIED: Use custom image for apps menu icon --- */}
            <Image source={APPS_MENU_ICON} style={styles.customHeaderIcon} />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search users..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
      </View>

      {filteredUsers.length === 0 ? (
        <Text style={styles.emptyText}>No users found</Text>
      ) : (
        <FlatList
          data={filteredUsers}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => navigateToUserDetails(item)}>
              <View style={styles.userItem}>
                <View style={styles.userInfo}>
                  <Text style={styles.userName}>{item.name || 'No Name'}</Text>
                  <Text style={styles.userEmail}>{item.email}</Text>
                  <Text style={styles.userRole}>Role: {item.role || 'user'}</Text>
                  {item.isITSupport && (
                    <Text style={styles.itSupportBadge}>IT Support</Text>
                  )}
                </View>
                <TouchableOpacity
                  onPress={() => handleDeleteUser(item.id)}
                >
                  <LinearGradient
                    colors={['#ef4444', '#dc2626']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.deleteButton}
                  >
                    {/* --- MODIFIED: Use custom image for delete icon --- */}
                    <Image source={DELETE_ICON} style={styles.customDeleteIcon} />
                    {/* --- END MODIFIED --- */}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          keyExtractor={item => item.id}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f7fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f7fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
    padding: 20,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    fontSize: 20,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  // --- NEW STYLE for Custom Header Icons ---
  customHeaderIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#ffffff',
  },
  // --- END NEW STYLE ---
  emptyText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#64748b',
    fontSize: 16,
    fontWeight: '500',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 40,
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '600',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  searchIcon: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#1e293b',
    fontWeight: '500',
  },
  userItem: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 6,
    color: '#1e293b',
    letterSpacing: -0.2,
  },
  userEmail: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 6,
    fontWeight: '500',
  },
  userRole: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  itSupportBadge: {
    fontSize: 12,
    color: '#ffffff',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 8,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  deleteButton: {
    padding: 12,
    borderRadius: 12,
    marginLeft: 16,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  // --- NEW STYLE for Custom Delete Icon ---
  customDeleteIcon: {
    width: 18,
    height: 18,
    resizeMode: 'contain',
    tintColor: '#ffffff',
  },
  // --- END NEW STYLE ---
});

export default Users;
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
        <ActivityIndicator size="large" color="#0a8fdf" />
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
      <View style={styles.headerContainer}>
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
      </View>

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
                  style={styles.deleteButton}
                  onPress={() => handleDeleteUser(item.id)}
                >
                  {/* --- MODIFIED: Use custom image for delete icon --- */}
                  <Image source={DELETE_ICON} style={styles.customDeleteIcon} />
                  {/* --- END MODIFIED --- */}
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
    padding: 20,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  header: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  iconButton: {
    marginLeft: 15,
  },
  // --- NEW STYLE for Custom Header Icons ---
  customHeaderIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#0a8fdf', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  errorText: {
    textAlign: 'center',
    marginTop: 20,
    color: 'red',
    fontSize: 18,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingHorizontal: 15,
    paddingVertical: 10,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  userItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 5,
    color: '#333',
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  userRole: {
    fontSize: 14,
    color: '#555',
  },
  itSupportBadge: {
    fontSize: 12,
    color: '#fff',
    backgroundColor: '#4285F4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 5,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
    padding: 8,
    borderRadius: 5,
    marginLeft: 10,
  },
  // --- NEW STYLE for Custom Delete Icon ---
  customDeleteIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
});

export default Users;
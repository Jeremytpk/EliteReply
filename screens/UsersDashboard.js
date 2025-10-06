import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  FlatList,
  TextInput,
  ActivityIndicator,
  Image, // Import Image
  Dimensions,
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere
import { LinearGradient } from 'expo-linear-gradient';
import { db, auth } from '../firebase';
import {
  collection,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  query,
  where,
  deleteField,
  setDoc // Keeping this, though not used in your current snippet for setDoc
} from 'firebase/firestore';

// --- NEW: Import your custom icons ---
const FILTER_LIST_ICON = require('../assets/icons/filter_list.png');
const EDIT_ICON = require('../assets/icons/edit.png');
const REMOVE_USER_ICON = require('../assets/icons/remove_user.png');
const PREMIUM_ICON = require('../assets/icons/premium.png');
const TRANSFER_USER_ICON = require('../assets/icons/transfer_user.png');
const RATE_HALF_ICON = require('../assets/icons/rate_half.png');
const DELETE_ICON_DASH = require('../assets/icons/delete.png'); // Renamed to avoid conflict if 'delete.png' is used elsewhere
const ARROW_DOWN_SHORT_ICON = require('../assets/icons/arrow_downShort.png'); // New
const ARROW_UP_SHORT_ICON = require('../assets/icons/arrow_upShort.png'); // New
// --- END NEW IMPORTS ---

const UsersDashboard = ({ navigation }) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingUserId, setEditingUserId] = useState(null);
  const [tempUserName, setTempUserName] = useState('');

  // States for Search and Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [sortCriteria, setSortCriteria] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [showSortOptions, setShowSortOptions] = useState(false);

  // States for Modals
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [selectedUserForModal, setSelectedUserForModal] = useState(null);
  const [ticketsToTransfer, setTicketsToTransfer] = useState([]);
  const [rating, setRating] = useState(0);
  const [evaluationComment, setEvaluationComment] = useState('');

  // State for Orientation
  const [numColumns, setNumColumns] = useState(2);

  // NEW: State to control button visibility for each card
  const [showActionsForUser, setShowActionsForUser] = useState(null);

  // NEW: State to store agent ticket counts
  const [agentTicketCounts, setAgentTicketCounts] = useState({});

  useEffect(() => {
    fetchUsers();
    // NEW: Fetch agent ticket counts when the component mounts or users change
    fetchAgentTicketCounts();

    const updateLayout = () => {
      const { width, height } = Dimensions.get('window');
      if (width > height) {
        setNumColumns(3);
      } else {
        setNumColumns(2);
      }
    };

    updateLayout();
    const subscription = Dimensions.addEventListener('change', updateLayout);
    return () => subscription?.remove();
  }, []);

  // NEW: Function to fetch ticket counts for IT Support agents
  const fetchAgentTicketCounts = async () => {
    try {
      const ticketCounts = {};
      const agents = users.filter(user => user.isITSupport);

      for (const agent of agents) {
        const agentTicketsQuery = query(
          collection(db, 'tickets'),
          where('assignedTo', '==', agent.id)
        );
        const snapshot = await getDocs(agentTicketsQuery);
        let pending = 0;
        let inProgress = 0; // This will also cover 'jey-handling' for display
        let completed = 0;
        let total = 0;

        snapshot.forEach(doc => {
          const ticketStatus = doc.data().status;
          total++;
          if (ticketStatus === 'pending') {
            pending++;
          } else if (ticketStatus === 'jey-handling' || ticketStatus === 'in-progress') {
            inProgress++;
          } else if (ticketStatus === 'completed' || ticketStatus === 'resolved') { // Added 'resolved' as a possible completed status
            completed++;
          }
        });

        ticketCounts[agent.id] = { pending, inProgress, completed, total };
      }
      setAgentTicketCounts(ticketCounts);
    } catch (error) {
      console.error("Error fetching agent ticket counts:", error);
    }
  };

  // Re-run ticket count fetch when users data changes (e.g., after assigning IT support)
  useEffect(() => {
    fetchAgentTicketCounts();
  }, [users]);


  const fetchUsers = async () => {
    try {
      setLoading(true);
      const querySnapshot = await getDocs(collection(db, 'users'));
      const usersData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        isPremium: doc.data().isPremium || false,
        isClockedIn: doc.data().isClockedIn || false, // Ensure isClockedIn is included
        ...doc.data(),
      }));
      setUsers(usersData);
    } catch (error) {
      console.error("Error fetching users:", error);
      Alert.alert("Error", "Failed to load users.");
    } finally {
      setLoading(false);
    }
  };

  const filteredAndSortedUsers = useMemo(() => {
    let filtered = users.filter(user =>
      user.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.role?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    filtered.sort((a, b) => {
      let valA, valB;

      if (sortCriteria === 'name') {
        valA = a.name || '';
        valB = b.name || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortCriteria === 'email') {
        valA = a.email || '';
        valB = b.email || '';
        return sortOrder === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortCriteria === 'isITSupport') {
        valA = a.isITSupport ? 1 : 0;
        valB = b.isITSupport ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      } else if (sortCriteria === 'isPremium') {
        valA = a.isPremium ? 1 : 0;
        valB = b.isPremium ? 1 : 0;
        return sortOrder === 'asc' ? valA - valB : valB - valA;
      }
      return 0;
    });
    return filtered;
  }, [users, searchQuery, sortCriteria, sortOrder]);


  const handleDeleteUser = async (userId, userName) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete ${userName || 'this user'}? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            try {
              await deleteDoc(doc(db, 'users', userId));
              setUsers(prevUsers => prevUsers.filter(u => u.id !== userId));
              Alert.alert("Success", "User deleted successfully");
            } catch (error) {
              console.error("Error deleting user:", error);
              Alert.alert("Error", "Failed to delete user");
            }
          }
        }
      ]
    );
  };

  const handleAssignITSupport = async (userToUpdate) => {
    Alert.alert(
      "Assign IT Support Role",
      `Are you sure you want to ${userToUpdate.isITSupport ? 'remove' : 'assign'} IT Support role to ${userToUpdate.name || 'this user'}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              const userRef = doc(db, 'users', userToUpdate.id);
              const newITSupportStatus = !userToUpdate.isITSupport;

              const updateData = {
                isITSupport: newITSupportStatus,
                updatedAt: serverTimestamp(),
                role: newITSupportStatus ? 'Agent' : 'user'
              };

              if (newITSupportStatus) {
                updateData.eruid = "EliteReplySupportTeam";
              } else {
                updateData.eruid = deleteField();
              }

              await updateDoc(userRef, updateData);

              setUsers(prevUsers =>
                prevUsers.map(u =>
                  u.id === userToUpdate.id
                    ? {
                        ...u,
                        isITSupport: newITSupportStatus,
                        eruid: newITSupportStatus ? "EliteReplySupportTeam" : undefined,
                        role: newITSupportStatus ? 'Agent' : 'user'
                      }
                    : u
                )
              );
              Alert.alert("Success", `IT Support role ${newITSupportStatus ? 'assigned' : 'removed'} successfully`);

            } catch (error) {
              console.error("Error updating IT Support role:", error);
              Alert.alert("Error", "Failed to update IT Support role");
            }
          }
        }
      ]
    );
  };

  const handleTogglePremium = async (userToUpdate) => {
    Alert.alert(
      "Manage Premium Status",
      `Are you sure you want to ${userToUpdate.isPremium ? 'remove' : 'grant'} Premium status to ${userToUpdate.name || 'this user'}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              const userRef = doc(db, 'users', userToUpdate.id);
              const newPremiumStatus = !userToUpdate.isPremium;

              await updateDoc(userRef, {
                isPremium: newPremiumStatus,
                updatedAt: serverTimestamp(),
              });

              setUsers(prevUsers =>
                prevUsers.map(u =>
                  u.id === userToUpdate.id
                    ? { ...u, isPremium: newPremiumStatus }
                    : u
                )
              );
              Alert.alert("Success", `Premium status ${newPremiumStatus ? 'granted' : 'removed'} for ${userToUpdate.name || 'user'} successfully`);

            } catch (error) {
              console.error("Error updating premium status:", error);
              Alert.alert("Error", "Failed to update premium status");
            }
          }
        }
      ]
    );
  };


  const handleEditUser = (user) => {
    setEditingUserId(user.id);
    setTempUserName(user.name || '');
    setShowActionsForUser(null); // Hide actions when editing
  };

  const handleCancelEdit = () => {
    setEditingUserId(null);
    setTempUserName('');
  };

  const handleSaveUserChanges = async (userId) => {
    if (!tempUserName.trim()) {
      Alert.alert("Error", "User name cannot be empty.");
      return;
    }
    try {
      const userRef = doc(db, 'users', userId);
      await updateDoc(userRef, {
        name: tempUserName,
        updatedAt: serverTimestamp()
      });
      setUsers(prevUsers =>
        prevUsers.map(u =>
          u.id === userId
            ? { ...u, name: tempUserName }
            : u
        )
      );
      setEditingUserId(null);
      setTempUserName('');
      Alert.alert("Success", "User updated successfully");
    } catch (error) {
      console.error("Error updating user:", error);
      Alert.alert("Error", "Failed to update user");
    }
  };

  const handleOpenTransferModal = async (user) => {
  setSelectedUserForModal(user);
  if (user.isITSupport) {
    try {
      console.log("Attempting to fetch tickets for transfer for user:", user.name || user.id);
      console.log("Querying for statuses: 'pending', 'jey-handling', and 'in-progress'");

      // MODIFIED QUERY: Removed the '!=' clause
      const q = query(
        collection(db, 'tickets'),
        where('status', 'in', ['pending', 'jey-handling', 'in-progress'])
      );

      const querySnapshot = await getDocs(q);

      let ticketsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate()
      }));

      // NEW: Client-side filtering to exclude tickets already assigned to this user
      const filteredTickets = ticketsData.filter(ticket => ticket.assignedTo !== user.id);

      console.log("Fetched tickets for transfer (after client-side filter):", filteredTickets);
      if (filteredTickets.length === 0) {
        console.log("No tickets found with statuses 'pending', 'jey-handling', or 'in-progress' that are not already assigned to this user.");
      }

      setTicketsToTransfer(filteredTickets); // Use the client-side filtered data
      setShowTransferModal(true);
    } catch (error) {
      console.error("Error fetching tickets for transfer:", error);
      Alert.alert("Error", "Failed to load available tickets for transfer.");
    }
  } else {
    Alert.alert("Info", `${user.name || 'This user'} is not an IT Support agent and cannot receive tickets.`);
  }
};

  const handleTransferTicket = async (ticketId) => {
    if (!selectedUserForModal) return;
    try {
      await updateDoc(doc(db, 'tickets', ticketId), {
        assignedTo: selectedUserForModal.id,
        assignedToName: selectedUserForModal.name || 'Support Agent',
        status: 'in-progress', // Assuming it moves to in-progress after transfer
        updatedAt: serverTimestamp()
      });
      Alert.alert("Success", `Ticket transferred to ${selectedUserForModal.name || 'user'} successfully!`);
      setShowTransferModal(false);
      setSelectedUserForModal(null);
      setTicketsToTransfer([]);
      fetchAgentTicketCounts(); // NEW: Refresh counts after transfer
    } catch (error) {
      console.error("Error transferring ticket:", error);
      Alert.alert("Error", "Failed to transfer ticket");
    }
  };

  const handleOpenEvaluationModal = (user) => {
    setSelectedUserForModal(user);
    setRating(0);
    setEvaluationComment('');
    setShowEvaluationModal(true);
  };

  const handleSaveEvaluation = async () => {
    if (!selectedUserForModal) return;
    if (rating === 0) {
      Alert.alert("Missing Rating", "Please provide a star rating for the evaluation.");
      return;
    }
    try {
      console.log(`Evaluating user: ${selectedUserForModal.name || selectedUserForModal.id}`);
      console.log(`Rating: ${rating}, Comment: ${evaluationComment}`);

      // Assuming you have an 'evaluations' collection
      await setDoc(doc(collection(db, 'evaluations')), { // Use setDoc with a new doc reference for a new document
        userId: selectedUserForModal.id,
        rating,
        comment: evaluationComment,
        evaluatedBy: auth.currentUser?.uid, // Use optional chaining for auth.currentUser
        createdAt: serverTimestamp()
      });


      Alert.alert("Success", `Evaluation for ${selectedUserForModal.name || 'user'} submitted successfully!`);
      setShowEvaluationModal(false);
      setSelectedUserForModal(null);
      setRating(0);
      setEvaluationComment('');
    } catch (error) {
      console.error("Error saving evaluation:", error);
      Alert.alert("Error", "Failed to save evaluation");
    }
  };

  const renderStarRating = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity key={i} onPress={() => setRating(i)}>
          <FontAwesome
            name={i <= rating ? 'star' : 'star-o'}
            size={24}
            color={i <= rating ? '#FFD700' : '#ccc'}
            style={{ marginHorizontal: 3 }}
          />
        </TouchableOpacity>
      );
    }
    return stars;
  };

  const renderSortOptionsModal = () => (
    <Modal
      visible={showSortOptions}
      animationType="fade"
      transparent={true}
      onRequestClose={() => setShowSortOptions(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowSortOptions(false)}
      >
        <View style={styles.sortOptionsContainer}>
          <Text style={styles.sortOptionsTitle}>Sort By:</Text>
          <TouchableOpacity
            style={styles.sortOptionButton}
            onPress={() => { setSortCriteria('name'); setSortOrder('asc'); setShowSortOptions(false); }}
          >
            <Text style={styles.sortOptionText}>Name (A-Z)</Text>
            {sortCriteria === 'name' && sortOrder === 'asc' && <Ionicons name="checkmark" size={18} color="#0a8fdf" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortOptionButton}
            onPress={() => { setSortCriteria('name'); setSortOrder('desc'); setShowSortOptions(false); }}
          >
            <Text style={styles.sortOptionText}>Name (Z-A)</Text>
            {sortCriteria === 'name' && sortOrder === 'desc' && <Ionicons name="checkmark" size={18} color="#0a8fdf" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortOptionButton}
            onPress={() => { setSortCriteria('isITSupport'); setSortOrder('desc'); setShowSortOptions(false); }}
          >
            <Text style={styles.sortOptionText}>IT Support First</Text>
            {sortCriteria === 'isITSupport' && sortOrder === 'desc' && <Ionicons name="checkmark" size={18} color="#0a8fdf" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortOptionButton}
            onPress={() => { setSortCriteria('isITSupport'); setSortOrder('asc'); setShowSortOptions(false); }}
          >
            <Text style={styles.sortOptionText}>Users First</Text>
            {sortCriteria === 'isITSupport' && sortOrder === 'asc' && <Ionicons name="checkmark" size={18} color="#0a8fdf" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortOptionButton}
            onPress={() => { setSortCriteria('isPremium'); setSortOrder('desc'); setShowSortOptions(false); }}
          >
            <Text style={styles.sortOptionText}>Premium First</Text>
            {sortCriteria === 'isPremium' && sortOrder === 'desc' && <Ionicons name="checkmark" size={18} color="#0a8fdf" />}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sortOptionButton}
            onPress={() => { setSortCriteria('isPremium'); setSortOrder('asc'); setShowSortOptions(false); }}
          >
            <Text style={styles.sortOptionText}>Non-Premium First</Text>
            {sortCriteria === 'isPremium' && sortOrder === 'asc' && <Ionicons name="checkmark" size={18} color="#0a8fdf" />}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderUserCard = ({ item: user }) => {
    const isEditing = editingUserId === user.id;
    // NEW: Check if actions should be shown for this user
    const showActions = showActionsForUser === user.id;
    // NEW: Get agent ticket counts
    const counts = agentTicketCounts[user.id] || { pending: 0, inProgress: 0, completed: 0, total: 0 };

    return (
      <TouchableOpacity
        style={styles.userCard}
        onPress={() => navigation.navigate('DetailsUser', { user: user })}
        disabled={isEditing}
      >
        <View style={styles.avatarContainer}>
          {user.photoURL ? (
            <Image source={{ uri: user.photoURL }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.defaultAvatar]}>
              <Text style={styles.defaultAvatarText}>
                {user.name ? user.name.charAt(0).toUpperCase() : 'U'}
              </Text>
            </View>
          )}
          {user.isClockedIn && <View style={styles.clockedInDot} />}
        </View>

        {isEditing ? (
          <TextInput
            style={styles.editInput}
            value={tempUserName}
            onChangeText={setTempUserName}
            placeholder="User Name"
          />
        ) : (
          <Text style={styles.userName} numberOfLines={1}>{user.name || 'No Name'}</Text>
        )}
        <Text style={styles.userEmail} numberOfLines={1}>{user.email}</Text>
        <Text style={styles.userRole}>Role: {user.role || 'user'}</Text>

        {/* NEW: Display agent scores if isITSupport */}
        {user.isITSupport && (
          <View style={styles.agentStatsContainer}>
            <Text style={styles.itSupportBadge}>IT Support</Text>
            <Text style={styles.agentStatText}>
              Total Tickets: <Text style={styles.agentStatNumber}>{counts.total}</Text>
            </Text>
            <Text style={styles.agentStatText}>
              Pending: <Text style={styles.agentStatNumberPending}>{counts.pending}</Text>
            </Text>
            <Text style={styles.agentStatText}>
              In Progress: <Text style={styles.agentStatNumberInProgress}>{counts.inProgress}</Text>
            </Text>
            <Text style={styles.agentStatText}>
              Completed: <Text style={styles.agentStatNumberCompleted}>{counts.completed}</Text>
            </Text>
          </View>
        )}
        {user.isPremium && !user.isITSupport && ( // Only show premium badge if not IT Support, to avoid clutter
          <Text style={styles.premiumBadge}>Premium</Text>
        )}

        {/* NEW: Toggle button for actions */}
        {!isEditing && (
          <TouchableOpacity
            style={styles.toggleActionsButton}
            onPress={() => setShowActionsForUser(showActions ? null : user.id)}
          >
            {/* --- MODIFIED: Use custom image for toggle actions --- */}
            <Image
              source={showActions ? ARROW_UP_SHORT_ICON : ARROW_DOWN_SHORT_ICON}
              style={styles.customToggleArrowIcon}
            />
            {/* --- END MODIFIED --- */}
            <Text style={styles.toggleActionsButtonText}>
              {showActions ? 'Hide Actions' : 'Show Actions'}
            </Text>
          </TouchableOpacity>
        )}

        {/* NEW: Conditional rendering of card actions */}
        {(isEditing || showActions) && (
          <View style={styles.cardActions}>
            {isEditing ? (
              <>
                <TouchableOpacity onPress={() => handleSaveUserChanges(user.id)}>
                  <LinearGradient
                    colors={['#3b82f6', '#1d4ed8']}
                    style={styles.cardActionButton}
                  >
                    {/* --- MODIFIED: Use custom image for Save --- */}
                    <Image source={EDIT_ICON} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.cardActionButtonText}>Save</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleCancelEdit}>
                  <LinearGradient
                    colors={['#ef4444', '#dc2626']}
                    style={styles.cardActionButton}
                  >
                    <Ionicons name="close" size={16} color="#fff" />
                    <Text style={styles.cardActionButtonText}>Cancel</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity onPress={() => handleEditUser(user)}>
                  <LinearGradient
                    colors={['#3b82f6', '#1d4ed8']}
                    style={styles.cardActionButton}
                  >
                    {/* --- MODIFIED: Use custom image for Edit --- */}
                    <Image source={EDIT_ICON} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.cardActionButtonText}>Edit</Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleAssignITSupport(user)}>
                  <LinearGradient
                    colors={user.isITSupport ? ['#ef4444', '#dc2626'] : ['#10b981', '#059669']}
                    style={styles.cardActionButton}
                  >
                    {/* --- MODIFIED: Use custom image for Assign/Remove IT --- */}
                    <Image source={REMOVE_USER_ICON} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.cardActionButtonText}>
                      {user.isITSupport ? 'Remove IT' : 'Assign IT'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleTogglePremium(user)}>
                  <LinearGradient
                    colors={user.isPremium ? ['#f59e0b', '#d97706'] : ['#8b5cf6', '#7c3aed']}
                    style={styles.cardActionButton}
                  >
                    {/* --- MODIFIED: Use custom image for Set/Unset Premium --- */}
                    <Image source={PREMIUM_ICON} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.cardActionButtonText}>
                      {user.isPremium ? 'Unset Premium' : 'Set Premium'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>

                {user.isITSupport && (
                  <>
                    <TouchableOpacity onPress={() => handleOpenTransferModal(user)}>
                      <LinearGradient
                        colors={['#3b82f6', '#1e40af']}
                        style={styles.cardActionButton}
                      >
                        {/* --- MODIFIED: Use custom image for Transfer --- */}
                        <Image source={TRANSFER_USER_ICON} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                        {/* --- END MODIFIED --- */}
                        <Text style={styles.cardActionButtonText}>Transfer</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleOpenEvaluationModal(user)}>
                      <LinearGradient
                        colors={['#fbbf24', '#f59e0b']}
                        style={styles.cardActionButton}
                      >
                        {/* --- MODIFIED: Use custom image for Eval --- */}
                        <Image source={RATE_HALF_ICON} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                        {/* --- END MODIFIED --- */}
                        <Text style={styles.cardActionButtonText}>Eval</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity onPress={() => handleDeleteUser(user.id, user.name)}>
                  <LinearGradient
                    colors={['#ef4444', '#dc2626']}
                    style={styles.cardActionButton}
                  >
                    {/* --- MODIFIED: Use custom image for Delete --- */}
                    <Image source={DELETE_ICON_DASH} style={[styles.customCardActionIcon, { tintColor: '#fff' }]} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.cardActionButtonText}>Delete</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#0a8fdf" />
        <Text style={styles.loadingText}>Loading users...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#667eea', '#764ba2']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color="#ffffff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Users Dashboard</Text>
        <View style={{ width: 24 }} />
      </LinearGradient>

      <View style={styles.searchSortContainer}>
        <TextInput
          style={styles.searchBar}
          placeholder="Search users..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        <TouchableOpacity style={styles.sortButton} onPress={() => setShowSortOptions(true)}>
          {/* --- MODIFIED: Use custom image for Filter icon --- */}
          <Image source={FILTER_LIST_ICON} style={styles.customFilterIcon} />
          {/* --- END MODIFIED --- */}
        </TouchableOpacity>
      </View>

      {filteredAndSortedUsers.length === 0 && searchQuery ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No users found for "{searchQuery}".</Text>
        </View>
      ) : filteredAndSortedUsers.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyText}>No users found.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredAndSortedUsers}
          keyExtractor={item => item.id}
          renderItem={renderUserCard}
          numColumns={numColumns}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={numColumns > 1 ? styles.row : null}
          ListFooterComponent={<View style={{ height: 20 }} />} 
        />
      )}

      {renderSortOptionsModal()}

      <Modal
        visible={showTransferModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowTransferModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Transfer Ticket to {selectedUserForModal?.name || 'User'}</Text>
            <TouchableOpacity onPress={() => setShowTransferModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          {ticketsToTransfer.length === 0 ? (
            <Text style={styles.emptyText}>No available tickets to transfer to this user with statuses 'pending', 'jey-handling', or 'in-progress'.</Text>
          ) : (
            <FlatList
              data={ticketsToTransfer}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.ticketItem}
                  onPress={() => handleTransferTicket(item.id)}
                >
                  <View style={styles.modalTicketHeader}>
                    <Text style={styles.ticketTitle}>{item.category}</Text>
                    <Text style={[
                      styles.modalTicketStatus,
                      item.status === 'pending' && styles.statusPending,
                      (item.status === 'jey-handling' || item.status === 'in-progress') && styles.statusInProgress,
                    ]}>
                      {item.status || 'Unknown'}
                    </Text>
                  </View>
                  <Text style={styles.ticketUser}>User: {item.userName || 'Unknown'}</Text>
                  {item.assignedToName && (
                    <Text style={styles.ticketAgent}>Assigned To: {item.assignedToName}</Text>
                  )}
                  <Text style={styles.ticketMessage} numberOfLines={2}>{item.message}</Text>
                  <Text style={styles.ticketTime}>
                    Waiting: {Math.floor((new Date() - item.createdAt) / (1000 * 60))} min
                  </Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={showEvaluationModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowEvaluationModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Evaluate {selectedUserForModal?.name || 'User'}</Text>
            <TouchableOpacity onPress={() => setShowEvaluationModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.ratingContainer}>
            <Text style={styles.ratingText}>Rating:</Text>
            <View style={styles.starsContainer}>
              {renderStarRating()}
            </View>
          </View>

          <TextInput
            style={styles.commentInput}
            placeholder="Add your comments..."
            multiline
            numberOfLines={4}
            value={evaluationComment}
            onChangeText={setEvaluationComment}
          />

          <TouchableOpacity onPress={handleSaveEvaluation}>
            <LinearGradient
              colors={['#3b82f6', '#1d4ed8']}
              style={styles.submitButton}
            >
              <Text style={styles.submitButtonText}>Submit Evaluation</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#64748b',
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center',
    paddingHorizontal: 24,
    fontWeight: '500',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    paddingTop: 50,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: '#ffffff',
    letterSpacing: -0.5,
  },
  searchSortContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#ffffff',
    margin: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
  },
  searchBar: {
    flex: 1,
    height: 44,
    borderColor: '#e2e8f0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    marginRight: 12,
    fontSize: 16,
    backgroundColor: '#f8fafc',
    color: '#1e293b',
    fontWeight: '500',
  },
  sortButton: {
    backgroundColor: '#f1f5f9',
    padding: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  // --- NEW STYLE for Custom Filter Icon ---
  customFilterIcon: {
    width: 20,
    height: 20,
    resizeMode: 'contain',
    tintColor: '#3b82f6',
  },
  // --- END NEW STYLE ---
  gridContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  userCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 20,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    alignItems: 'center',
    marginBottom: 16,
    minHeight: 320,
    maxWidth: '48%',
    borderWidth: 1,
    borderColor: '#f1f5f9',
  },
  avatarContainer: {
    marginBottom: 16,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: '#ffffff',
  },
  defaultAvatar: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: '#ffffff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  clockedInDot: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#10b981',
    borderWidth: 3,
    borderColor: '#ffffff',
    zIndex: 1,
    shadowColor: '#10b981',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  userName: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1e293b',
    textAlign: 'center',
    letterSpacing: -0.2,
  },
  userEmail: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 8,
    textAlign: 'center',
    fontWeight: '500',
  },
  userRole: {
    fontSize: 13,
    color: '#475569',
    marginBottom: 8,
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  itSupportBadge: {
    fontSize: 11,
    color: '#ffffff',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 8,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  premiumBadge: {
    fontSize: 11,
    color: '#ffffff',
    backgroundColor: '#eab308',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'center',
    marginBottom: 8,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  // NEW: Agent Stats Styles
  agentStatsContainer: {
    marginTop: 8,
    marginBottom: 12,
    alignItems: 'flex-start',
    width: '100%',
    paddingLeft: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    padding: 12,
  },
  agentStatText: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 4,
    fontWeight: '500',
  },
  agentStatNumber: {
    fontWeight: 'bold',
    color: '#333',
  },
  agentStatNumberPending: {
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  agentStatNumberInProgress: {
    fontWeight: 'bold',
    color: '#34C759',
  },
  agentStatNumberCompleted: {
    fontWeight: 'bold',
    color: '#0a8fdf',
  },
  // END NEW Agent Stats Styles
  editInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    fontSize: 15,
    width: '100%',
    textAlign: 'center',
    backgroundColor: '#fff',
    color: '#1e293b',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  // NEW: Toggle Actions Button
  toggleActionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
    marginBottom: 12,
    backgroundColor: '#f8fafc',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  toggleActionsButtonText: {
    color: '#3b82f6',
    fontSize: 13,
    marginLeft: 5,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  // --- NEW STYLE for Custom Toggle Arrow Icons ---
  customToggleArrowIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#0a8fdf', // Match original Ionicons color
  },
  // --- END NEW STYLE ---
  cardActions: {
    marginTop: 10,
    width: '100%',
    alignItems: 'center',
  },
  cardActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    width: '90%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  cardActionButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 5,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  // --- NEW STYLE for Custom Card Action Icons ---
  customCardActionIcon: {
    width: 16, // Match original Ionicons size
    height: 16, // Match original Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // tintColor is applied inline
  },
  // --- END NEW STYLE ---
  modalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f7fa',
    paddingTop: 50,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 25,
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1e293b',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  ticketItem: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalTicketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  modalTicketStatus: {
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  statusPending: {
    backgroundColor: '#FFEEEE',
    color: '#FF3B30',
  },
  statusInProgress: {
    backgroundColor: '#E6F7EE',
    color: '#34C759',
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 5,
    flexShrink: 1,
    marginRight: 10,
  },
  ticketMessage: {
    fontSize: 14,
    color: '#666',
    marginBottom: 5,
  },
  ticketTime: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  ticketAgent: {
    fontSize: 12,
    color: '#777',
    fontStyle: 'italic',
    marginBottom: 5,
  },
  ratingContainer: {
    alignItems: 'center',
    marginVertical: 20,
  },
  ratingText: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
  },
  starsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  commentInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 18,
    marginBottom: 20,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    backgroundColor: '#fff',
    color: '#1e293b',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  submitButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortOptionsContainer: {
    width: 250,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  sortOptionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#333',
    textAlign: 'center',
  },
  sortOptionButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  sortOptionText: {
    fontSize: 16,
    color: '#555',
  },
});

export default UsersDashboard;
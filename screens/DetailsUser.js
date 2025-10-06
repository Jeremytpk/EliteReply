import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  ActivityIndicator,
  Image,
  ScrollView, // Import ScrollView
  Platform,
} from 'react-native';
import { Ionicons, MaterialIcons, FontAwesome } from '@expo/vector-icons'; // Keep Ionicons if still used elsewhere
import { LinearGradient } from 'expo-linear-gradient';
import { db, auth } from '../firebase';
import {
  collection,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  deleteDoc,
  serverTimestamp,
  deleteField,
  getDoc,
  setDoc // Import setDoc for evaluations
} from 'firebase/firestore';
import moment from 'moment';

// --- NEW: Import your custom icons ---
const TRANSFER_USER_ICON = require('../assets/icons/transfer_user.png');
const RATE_HALF_ICON = require('../assets/icons/rate_half.png');
const REMOVE_USER_ICON = require('../assets/icons/remove_user.png');
const EDIT_ICON = require('../assets/icons/edit.png');
const DELETE_ICON_USER = require('../assets/icons/delete.png'); // Renamed to avoid conflict with other delete icons
// --- END NEW IMPORTS ---

const DetailsUser = ({ route, navigation }) => {
  // --- DEFENSIVE CHECK START ---
  if (!route.params || !route.params.user) {
    console.error("DetailsUser: 'user' data missing in route parameters. Displaying fallback.");
    Alert.alert(
      "Error",
      "User details could not be loaded. Please ensure user data is passed correctly.",
      [{ text: "OK", onPress: () => navigation.goBack() }]
    );
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>User details could not be loaded. Missing data.</Text>
        <TouchableOpacity style={styles.goBackButton} onPress={() => navigation.goBack()}>
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }
  // --- DEFENSIVE CHECK END ---

  const { user: initialUser } = route.params;
  const [user, setUser] = useState(initialUser);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [tickets, setTickets] = useState([]); // This will hold available tickets for transfer
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showEvaluationModal, setShowEvaluationModal] = useState(false);
  const [rating, setRating] = useState(0);
  const [evaluationComment, setEvaluationComment] = useState('');
  const [ticketStats, setTicketStats] = useState({
    enCours: 0,
    enAttente: 0,
    termines: 0,
    total: 0
  });

  useEffect(() => {
    const fetchUserDataAndTickets = async () => {
      setLoading(true);
      try {
        const userDocRef = doc(db, 'users', initialUser.id);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setUser({
            id: userDocSnap.id,
            ...userDocSnap.data(),
            // Ensure timestamps are converted to Date objects for consistent display
            clockInTime: userDocSnap.data().clockInTime?.toDate(),
            clockOutTime: userDocSnap.data().clockOutTime?.toDate(),
          });
        } else {
          Alert.alert("Error", "User not found.");
          navigation.goBack();
          return;
        }

        await fetchTicketStats(initialUser.id);
        // Fetch available tickets only if the user is IT Support
        if (userDocSnap.data().isITSupport) {
          await fetchAvailableTickets();
        }
      } catch (error) {
        console.error("Error fetching user details:", error);
        Alert.alert("Error", "Failed to load user details.");
      } finally {
        setLoading(false);
      }
    };

    fetchUserDataAndTickets();
  }, [initialUser.id]); // Re-run if initial user ID changes

  const fetchTicketStats = async (userId) => {
    try {
      const assignedQuery = query(
        collection(db, 'tickets'),
        where('assignedTo', '==', userId)
      );
      const assignedSnapshot = await getDocs(assignedQuery);

      const createdQuery = query(
        collection(db, 'tickets'),
        where('userId', '==', userId)
      );
      const createdSnapshot = await getDocs(createdQuery);

      const assignedTickets = assignedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const createdTickets = createdSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      const enCours = assignedTickets.filter(t => t.status === 'in-progress').length;
      const enAttente = createdTickets.filter(t => t.status === 'nouveau').length; // Tickets created by this user that are 'new'
      const termines = assignedTickets.filter(t => t.status === 'terminé').length;
      const total = assignedTickets.length + createdTickets.length; // Combined count

      setTicketStats({
        enCours,
        enAttente,
        termines,
        total
      });
    } catch (error) {
      console.error("Error fetching ticket stats:", error);
      Alert.alert("Error", "Failed to load ticket statistics");
    }
  };

  const fetchAvailableTickets = async () => {
    try {
      const q = query(
        collection(db, 'tickets'),
        // Filter for tickets that are not yet "completed" or "terminated"
        where('status', 'in', ['nouveau', 'jey-handling', 'in-progress', 'escalated_to_agent'])
      );

      const querySnapshot = await getDocs(q);

      let ticketsData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() // Ensure createdAt is a Date object
      }));

      // Filter out tickets already assigned to the current user (if they are IT Support)
      // And potentially filter out 'jey-handling' tickets not yet escalated if you don't want them in transfer list
      const filteredTickets = ticketsData.filter(ticket =>
        ticket.assignedTo !== user.id && // Not assigned to this specific user
        ticket.status !== 'terminé' && // Not terminated
        ticket.status !== 'completed' // Not completed
      );

      setTickets(filteredTickets);
    } catch (error) {
      console.error("Error fetching available tickets for transfer:", error);
      Alert.alert("Error", "Failed to load available tickets for transfer.");
    }
  };

  const handleDeleteUser = async () => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to delete this user? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          onPress: async () => {
            try {
              // Optionally: Add security rules to prevent non-admins from deleting users
              // Also consider what happens to their tickets if they are not reassigned
              await deleteDoc(doc(db, 'users', user.id));
              Alert.alert("Success", "User deleted successfully");
              navigation.goBack(); // Go back after successful deletion
            } catch (error) {
              console.error("Error deleting user:", error);
              Alert.alert("Error", "Failed to delete user");
            }
          }
        }
      ]
    );
  };

  const handleAssignITSupport = async () => {
    Alert.alert(
      "Assign IT Support Role",
      `Are you sure you want to ${user.isITSupport ? 'remove' : 'assign'} IT Support role to ${user.name || 'this user'}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm",
          onPress: async () => {
            try {
              const userRef = doc(db, 'users', user.id);
              const newITSupportStatus = !user.isITSupport;

              const updateData = {
                isITSupport: newITSupportStatus,
                updatedAt: serverTimestamp(),
                role: newITSupportStatus ? 'Agent' : 'user' // Update role field
              };

              // Conditionally add or remove eruid field
              if (newITSupportStatus) {
                updateData.eruid = "EliteReply198908162025"; // Assign a default ERUID for IT Support
              } else {
                updateData.eruid = deleteField(); // Remove ERUID field
              }

              await updateDoc(userRef, updateData);

              // Update local state to reflect changes immediately
              setUser(prev => ({
                ...prev,
                isITSupport: newITSupportStatus,
                eruid: newITSupportStatus ? "EliteReply198908162025" : undefined, // Mirror the database update
                role: newITSupportStatus ? 'Agent' : 'user'
              }));

              Alert.alert("Success", `IT Support role ${newITSupportStatus ? 'assigned' : 'removed'} successfully`);

              // If assigning IT Support, re-fetch available tickets for transfer
              if (newITSupportStatus) {
                fetchAvailableTickets();
              }

            } catch (error) {
              console.error("Error updating IT Support role:", error);
              Alert.alert("Error", "Failed to update IT Support role");
            }
          }
        }
      ]
    );
  };

  const handleTransferTicket = async (ticketId) => {
    try {
      // Update the ticket to assign it to the current user being viewed
      await updateDoc(doc(db, 'tickets', ticketId), {
        assignedTo: user.id, // Assign to the user whose details are being viewed
        assignedToName: user.name || 'Support Agent',
        status: 'in-progress', // Set status to in-progress
        updatedAt: serverTimestamp()
      });
      Alert.alert("Success", "Ticket transferred successfully");
      setShowTransferModal(false); // Close the modal
      fetchAvailableTickets(); // Refresh available tickets list
      fetchTicketStats(user.id); // Update ticket stats for the assigned user
    } catch (error) {
      console.error("Error transferring ticket:", error);
      Alert.alert("Error", "Failed to transfer ticket");
    }
  };

  const handleSaveEvaluation = async () => {
    // This function needs actual Firestore logic to save the evaluation
    // You would typically save to a 'userEvaluations' or 'agentEvaluations' collection
    // and link it to the user.id
    try {
      console.log(`Saving evaluation for ${user.name}: Rating - ${rating}, Comment - ${evaluationComment}`);
      // Example: addDoc(collection(db, 'userEvaluations'), {
      //   userId: user.id,
      //   ratedBy: auth.currentUser.uid, // Admin who is rating
      //   rating: rating,
      //   comment: evaluationComment,
      //   createdAt: serverTimestamp(),
      // });
      Alert.alert("Success", "Evaluation submitted successfully");
      setShowEvaluationModal(false);
      setRating(0);
      setEvaluationComment('');
    } catch (error) {
      console.error("Error saving evaluation:", error);
      Alert.alert("Error", "Failed to save evaluation");
    }
  };

  const handleSaveChanges = async () => {
    try {
      await updateDoc(doc(db, 'users', user.id), {
        name: user.name,
        email: user.email,
        role: user.role, // Assuming role is editable
        updatedAt: serverTimestamp()
      });
      setEditMode(false);
      Alert.alert("Success", "User updated successfully");
    } catch (error) {
      console.error("Error updating user:", error);
      Alert.alert("Error", "Failed to update user");
    }
  };

  const renderStarRating = () => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <TouchableOpacity key={i} onPress={() => setRating(i)}>
          <FontAwesome
            name={i <= rating ? 'star' : 'star-o'}
            size={32}
            color={i <= rating ? '#FFD700' : '#ccc'}
            style={{ marginHorizontal: 5 }}
          />
        </TouchableOpacity>
      );
    }
    return stars;
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    // Check if timestamp is a Firebase Timestamp object, if so, convert to Date
    const date = timestamp instanceof Date ? timestamp : timestamp.toDate();
    return moment(date).format('DD/MM/YYYY HH:mm');
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <ActivityIndicator size="large" color="#0a8fdf" style={styles.loading} />
      ) : (
        <>
          <View style={styles.header}>
            <TouchableOpacity onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>User Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {/* Make the main content area scrollable */}
          <ScrollView contentContainerStyle={styles.scrollContent}>
            <View style={styles.userCard}>
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

              {editMode ? (
                <>
                  <TextInput
                    style={styles.editInput}
                    value={user.name || ''}
                    onChangeText={text => setUser({ ...user, name: text })}
                    placeholder="Name"
                  />
                  <TextInput
                    style={styles.editInput}
                    value={user.email || ''}
                    onChangeText={text => setUser({ ...user, email: text })}
                    placeholder="Email"
                    keyboardType="email-address"
                  />
                  <TextInput
                    style={styles.editInput}
                    value={user.role || ''}
                    onChangeText={text => setUser({ ...user, role: text })}
                    placeholder="Role"
                  />
                </>
              ) : (
                <>
                  <Text style={styles.userName}>{user.name || 'No Name'}</Text>
                  <Text style={styles.userEmail}>{user.email}</Text>
                  <Text style={styles.userRole}>Role: {user.role || 'user'}</Text>
                  {user.isITSupport && (
                    <Text style={styles.itSupportBadge}>IT Support</Text>
                  )}
                  {user.eruid && (
                    <Text style={styles.eruidText}>ERUID: {user.eruid}</Text>
                  )}
                  <Text style={styles.userId}>User ID: {user.id}</Text>

                  <View style={styles.timeInfoContainer}>
                      <Text style={styles.timeLabel}>Clock In:</Text>
                      <Text style={styles.timeValue}>{formatDate(user.clockInTime)}</Text>
                  </View>
                  <View style={styles.timeInfoContainer}>
                      <Text style={styles.timeLabel}>Clock Out:</Text>
                      <Text style={styles.timeValue}>{formatDate(user.clockOutTime)}</Text>
                  </View>
                </>
              )}
            </View>

            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ticketStats.enCours}</Text>
                <Text style={styles.statLabel}>En cours</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ticketStats.enAttente}</Text>
                <Text style={styles.statLabel}>En attente</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ticketStats.termines}</Text>
                <Text style={styles.statLabel}>Terminés</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{ticketStats.total}</Text>
                <Text style={styles.statLabel}>Total Tickets</Text>
              </View>
            </View>

            <View style={styles.actionsContainer}>
              {user.isITSupport && (
                <>
                  <TouchableOpacity onPress={() => setShowTransferModal(true)}>
                    <LinearGradient
                      colors={['#3b82f6', '#1e40af']}
                      style={styles.actionButton}
                    >
                      {/* --- MODIFIED: Use custom image for Transfer Ticket --- */}
                      <Image source={TRANSFER_USER_ICON} style={styles.customActionButtonIcon} />
                      {/* --- END MODIFIED --- */}
                      <Text style={styles.actionButtonText}>Transfer Ticket</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <TouchableOpacity onPress={() => setShowEvaluationModal(true)}>
                    <LinearGradient
                      colors={['#f59e0b', '#d97706']}
                      style={styles.actionButton}
                    >
                      {/* --- MODIFIED: Use custom image for Evaluation --- */}
                      <Image source={RATE_HALF_ICON} style={styles.customActionButtonIcon} />
                      {/* --- END MODIFIED --- */}
                      <Text style={styles.actionButtonText}>Evaluation</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              )}

              <TouchableOpacity onPress={handleAssignITSupport}>
                <LinearGradient
                  colors={user.isITSupport ? ['#ef4444', '#dc2626'] : ['#10b981', '#059669']}
                  style={styles.actionButton}
                >
                  {/* --- MODIFIED: Use custom image for Assign/Remove IT Support --- */}
                  <Image source={REMOVE_USER_ICON} style={styles.customActionButtonIcon} />
                  {/* --- END MODIFIED --- */}
                  <Text style={styles.actionButtonText}>
                    {user.isITSupport ? 'Remove IT Support' : 'Assign IT Support'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              {editMode ? (
                <>
                  <TouchableOpacity onPress={handleSaveChanges}>
                    <LinearGradient
                      colors={['#3b82f6', '#1d4ed8']}
                      style={styles.actionButton}
                    >
                      {/* --- MODIFIED: Use custom image for Save Changes --- */}
                      <Image source={EDIT_ICON} style={styles.customActionButtonIcon} />
                      {/* --- END MODIFIED --- */}
                      <Text style={styles.actionButtonText}>Save Changes</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditMode(false)}>
                    <LinearGradient
                      colors={['#ef4444', '#dc2626']}
                      style={styles.actionButton}
                    >
                      <Ionicons name="close" size={20} color="#fff" />
                      <Text style={styles.actionButtonText}>Cancel</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity onPress={() => setEditMode(true)}>
                  <LinearGradient
                    colors={['#3b82f6', '#1d4ed8']}
                    style={styles.actionButton}
                  >
                    {/* --- MODIFIED: Use custom image for Edit --- */}
                    <Image source={EDIT_ICON} style={styles.customActionButtonIcon} />
                    {/* --- END MODIFIED --- */}
                    <Text style={styles.actionButtonText}>Edit</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <TouchableOpacity onPress={handleDeleteUser}>
                <LinearGradient
                  colors={['#ef4444', '#dc2626']}
                  style={styles.actionButton}
                >
                  {/* --- MODIFIED: Use custom image for Delete User --- */}
                  <Image source={DELETE_ICON_USER} style={styles.customActionButtonIcon} />
                  {/* --- END MODIFIED --- */}
                  <Text style={styles.actionButtonText}>Delete User</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </ScrollView> {/* End of ScrollView */}

          {/* Transfer Ticket Modal */}
          <Modal
            visible={showTransferModal}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setShowTransferModal(false)}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Transfer Ticket</Text>
                <TouchableOpacity onPress={() => setShowTransferModal(false)}>
                  <Ionicons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              {tickets.length === 0 ? (
                <Text style={styles.emptyText}>No available tickets to transfer</Text>
              ) : (
                <FlatList
                  data={tickets}
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
                          item.status === 'nouveau' && styles.statusPending, // 'nouveau' for pending
                          (item.status === 'jey-handling' || item.status === 'in-progress' || item.status === 'escalated_to_agent') && styles.statusInProgress, // All active statuses
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

          {/* Evaluation Modal */}
          <Modal
            visible={showEvaluationModal}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setShowEvaluationModal(false)}
          >
            <View style={styles.modalContainer}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>Evaluate {user.name || 'User'}</Text>
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
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  scrollContent: { // New style for ScrollView content container
    flexGrow: 1, // Allows content to grow and enable scrolling
    paddingBottom: 20, // Add some padding at the bottom for better scroll experience
  },
  loading: {
    marginTop: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingTop: 30,
    top: 25,
    marginBottom: 30,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1e293b',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  userCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    margin: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    color: '#1e293b',
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  userEmail: {
    fontSize: 16,
    color: '#64748b',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  userRole: {
    fontSize: 16,
    color: '#475569',
    marginBottom: 8,
    textAlign: 'center',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  itSupportBadge: {
    fontSize: 14,
    color: '#fff',
    backgroundColor: '#3b82f6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    alignSelf: 'center',
    marginBottom: 12,
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  userId: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
    textAlign: 'center',
  },
  eruidText: {
    fontSize: 12,
    color: '#94a3b8',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 12,
    textAlign: 'center',
  },
  editInput: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    fontSize: 16,
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
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 15,
    marginBottom: 15,
  },
  statItem: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 18,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#3b82f6',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  statLabel: {
    fontSize: 13,
    color: '#64748b',
    marginTop: 6,
    fontWeight: '500',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  actionsContainer: {
    marginHorizontal: 15,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  // --- NEW STYLE for Custom Action Button Icons ---
  customActionButtonIcon: {
    width: 20, // Match original icon size
    height: 20, // Match original icon size
    resizeMode: 'contain',
    tintColor: '#fff', // Typically white on colored buttons
    marginRight: 10, // Match original spacing
  },
  // --- END NEW STYLE ---
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  modalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f5f7fa',
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
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
  },
  ticketItem: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 18,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 4,
  },
  ticketTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1e293b',
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  ticketMessage: {
    fontSize: 14,
    color: '#64748b',
    marginBottom: 6,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  ticketTime: {
    fontSize: 12,
    color: '#94a3b8',
    fontStyle: 'italic',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
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
  ticketUser: {
    fontSize: 12,
    color: '#777',
    marginBottom: 2,
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
  avatarContainer: {
    alignItems: 'center',
    marginBottom: 15,
    position: 'relative',
  },
  avatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 5,
  },
  defaultAvatar: {
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  defaultAvatarText: {
    color: '#fff',
    fontSize: 48,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  clockedInDot: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#34C759',
    borderWidth: 3,
    borderColor: '#fff',
  },
  timeInfoContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 10,
    marginBottom: 5,
  },
  timeLabel: {
    fontSize: 14,
    color: '#475569',
    fontWeight: '600',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  timeValue: {
    fontSize: 14,
    color: '#1e293b',
    fontFamily: Platform.OS === 'ios' ? 'System' : 'Roboto',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: '#FF3B30',
    textAlign: 'center',
    marginBottom: 20,
  },
  goBackButton: {
    backgroundColor: '#0a8fdf',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
  },
  goBackButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default DetailsUser;
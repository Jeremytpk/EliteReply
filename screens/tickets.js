import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  Dimensions,
  Image // Import Image
} from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'; // Keep Ionicons/MaterialCommunityIcons if still used elsewhere
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, query, where, writeBatch } from 'firebase/firestore'; // Added writeBatch

// --- NEW: Import your custom icons ---
const EYE_OUTLINE_ICON = require('../assets/icons/eye_outline.png'); // For see stats button
const CHECKBOX_MARKED_CIRCLE_ICON = require('../assets/icons/check_box_full.png'); // For selected checkbox
const CHECKBOX_BLANK_CIRCLE_OUTLINE_ICON = require('../assets/icons/check_box_empty.png'); // For unselected checkbox
const TRASH_OUTLINE_ICON = require('../assets/icons/delete.png'); // For delete button
const TRASH_ICON = require('../assets/icons/trash.png'); // For bulk delete button
const CLOSE_ICON = require('../assets/icons/close_circle.png'); // For modal close button
// --- END NEW IMPORTS ---

const { width: screenWidth } = Dimensions.get('window');

const TerminatedTickets = ({ navigation }) => {
  const [terminatedCollectionTickets, setTerminatedCollectionTickets] = useState([]);
  const [currentCollectionTickets, setCurrentCollectionTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('terminated');

  const [selectedTickets, setSelectedTickets] = useState(new Set()); // State to hold selected ticket IDs
  const [isSelectMode, setIsSelectMode] = useState(false); // New state to toggle select mode

  const [showCurrentTicketsOverviewModal, setShowCurrentTicketsOverviewModal] = useState(false);
  const [currentTicketsDetailedCounts, setCurrentTicketsDetailedCounts] = useState({
    total: 0,
    pending: 0,
    jeyHandling: 0,
    otherAgentHandling: 0,
    completed: 0,
    terminatedInCurrent: 0,
    agentHandlingCounts: {},
    today: {
      total: 0,
      terminated: 0,
      inProgress: 0,
      jeyHandling: 0,
    },
    agentTodayScores: {},
  });

  const [modalCurrentPageIndex, setModalCurrentPageIndex] = useState(0);
  const scrollViewRef = useRef(null);

  // Memoized function to fetch tickets to prevent unnecessary re-creation
  const fetchAndSeparateTickets = useCallback(async () => {
    setLoading(true);
    try {
      const terminatedSnapshot = await getDocs(collection(db, 'terminatedTickets'));
      const terminatedData = terminatedSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        source: 'terminated',
        createdAt: doc.data().createdAt?.toDate(),
      }));
      setTerminatedCollectionTickets(terminatedData);

      const currentTicketsSnapshot = await getDocs(collection(db, 'tickets'));
      const currentData = currentTicketsSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        source: 'current',
        createdAt: doc.data().createdAt?.toDate(),
      }));
      setCurrentCollectionTickets(currentData);

      setSelectedTickets(new Set()); // Clear selection on data reload
      setIsSelectMode(false); // Exit select mode on data reload

    } catch (error) {
      console.error("Error fetching tickets:", error);
      Alert.alert("Error", "Failed to load tickets.");
    } finally {
      setLoading(false);
    }
  }, []); // No dependencies for this useCallback as it's a fetch action

  useEffect(() => {
    fetchAndSeparateTickets();
  }, [fetchAndSeparateTickets]); // Depend on the memoized fetch function

  const fetchCurrentTicketsDetailedCounts = async () => {
    try {
      const ticketsRef = collection(db, 'tickets');
      const ticketsSnapshot = await getDocs(ticketsRef);

      let total = 0;
      let pending = 0;
      let jeyHandling = 0;
      let otherAgentHandling = 0;
      let completed = 0;
      let terminatedInCurrent = 0;
      let agentHandlingCounts = {};

      let todayTotal = 0;
      let todayTerminated = 0;
      let todayInProgress = 0;
      let todayJeyHandling = 0;

      let agentTodayScores = {};

      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const usersRef = collection(db, 'users');
      // Assuming 'isITSupport' is the field to identify agents
      const agentsQuery = query(usersRef, where('role', '==', 'IT')); // Changed to 'role' == 'IT' as per ITDashboard.js
      const agentsSnapshot = await getDocs(agentsQuery);
      const agents = agentsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || 'Unknown Agent' }));

      agents.forEach(agent => {
        agentHandlingCounts[agent.id] = { name: agent.name, count: 0 };
        agentTodayScores[agent.id] = {
          name: agent.name,
          total: 0,
          inProgress: 0,
          completed: 0,
          pending: 0,
        };
      });

      ticketsSnapshot.forEach(doc => {
        const ticket = doc.data();
        const createdAt = ticket.createdAt?.toDate();

        const isToday = createdAt && createdAt >= startOfToday && createdAt <= now;
        const isAssigned = ticket.assignedTo && agentHandlingCounts[ticket.assignedTo];

        if (ticket.status === 'terminated') {
          terminatedInCurrent++;
          if (isToday) {
            todayTerminated++;
            todayTotal++;
          }
          return;
        }

        total++; // Count only non-terminated tickets for overall active total

        if (isToday) {
          todayTotal++;
        }

        if (ticket.status === 'nouveau' || ticket.status === 'escalated_to_agent') { // 'pending' status is now 'nouveau' or 'escalated_to_agent'
          pending++;
          if (isToday && isAssigned) agentTodayScores[ticket.assignedTo].pending++;
        } else if (ticket.status === 'terminé' || ticket.status === 'résolu') { // 'completed' or 'resolved' is 'terminé' or 'résolu'
          completed++;
          if (isToday && isAssigned) agentTodayScores[ticket.assignedTo].completed++;
        } else if (ticket.status === 'jey-handling') {
          jeyHandling++;
          if (isToday) {
            todayInProgress++; // Jey-handling tickets are "in progress" by Jey
            todayJeyHandling++;
          }
          // Jey-handling tickets are not counted towards agent's individual inProgress count unless assigned
          // if (isAssigned) {
          //     agentHandlingCounts[ticket.assignedTo].count++;
          //     if (isToday) agentTodayScores[ticket.assignedTo].inProgress++;
          // }
        } else if (ticket.status === 'in-progress') {
          if (isToday) {
            todayInProgress++;
          }
          if (isAssigned) {
              agentHandlingCounts[ticket.assignedTo].count++;
              if (isToday) agentTodayScores[ticket.assignedTo].inProgress++;
          } else {
            // This 'else' path for 'otherAgentHandling' might be tricky if tickets are always assigned
            // Consider if this state is truly possible or indicates an unassigned in-progress ticket
            otherAgentHandling++;
          }
        }
        if (isToday && isAssigned) {
          agentTodayScores[ticket.assignedTo].total++;
        }
      });

      // Filter out agents with no active tickets for display in modal
      const filteredAgentHandlingCounts = Object.fromEntries(
        Object.entries(agentHandlingCounts).filter(([key, value]) => value.count > 0)
      );

      setCurrentTicketsDetailedCounts({
        total,
        pending, // This is 'nouveau' + 'escalated_to_agent'
        jeyHandling,
        otherAgentHandling, // Potentially unassigned 'in-progress'
        completed, // This is 'terminé' (from current collection) + 'résolu'
        terminatedInCurrent, // Count of 'terminated' tickets found in the 'tickets' collection
        agentHandlingCounts: filteredAgentHandlingCounts, // Only show agents with tickets
        today: {
          total: todayTotal,
          terminated: todayTerminated,
          inProgress: todayInProgress,
          jeyHandling: todayJeyHandling,
        },
        agentTodayScores,
      });
    } catch (error) {
      console.error("Error fetching detailed current ticket counts:", error);
      Alert.alert("Error", "Failed to load current ticket statistics.");
    }
  };

  useEffect(() => {
    fetchCurrentTicketsDetailedCounts();
  }, [currentCollectionTickets]); // Re-fetch counts when current collection tickets change

  const toggleSelectTicket = (ticketId) => {
    setSelectedTickets(prevSelected => {
      const newSelected = new Set(prevSelected);
      if (newSelected.has(ticketId)) {
        newSelected.delete(ticketId);
      } else {
        newSelected.add(ticketId);
      }
      return newSelected;
    });
  };

  const handleSelectAll = () => {
    const displayed = activeTab === 'terminated' ? terminatedCollectionTickets : currentCollectionTickets;
    if (selectedTickets.size === displayed.length) {
      setSelectedTickets(new Set()); // Deselect all
    } else {
      const allIds = new Set(displayed.map(t => t.id));
      setSelectedTickets(allIds); // Select all
    }
  };

  const handleDeleteSelectedTickets = async () => {
    if (selectedTickets.size === 0) {
      Alert.alert("No Tickets Selected", "Please select tickets to delete.");
      return;
    }

    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete ${selectedTickets.size} ticket(s)? This action is irreversible.`,
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          onPress: async () => {
            setLoading(true);
            try {
              const batch = writeBatch(db);
              const collectionName = activeTab === 'terminated' ? 'terminatedTickets' : 'tickets';
              
              selectedTickets.forEach(ticketId => {
                const docRef = doc(db, collectionName, ticketId);
                batch.delete(docRef);
              });
              await batch.commit();

              // Update local state after successful deletion
              if (activeTab === 'terminated') {
                setTerminatedCollectionTickets(prev => prev.filter(t => !selectedTickets.has(t.id)));
              } else {
                setCurrentCollectionTickets(prev => prev.filter(t => !selectedTickets.has(t.id)));
                // Re-fetch detailed counts as current collection has changed
                fetchCurrentTicketsDetailedCounts(); 
              }
              setSelectedTickets(new Set()); // Clear selection
              setIsSelectMode(false); // Exit select mode
              Alert.alert("Success", `${selectedTickets.size} ticket(s) deleted successfully`);
            } catch (error) {
              console.error("Error deleting selected tickets:", error);
              Alert.alert("Error", "Failed to delete selected tickets");
            } finally {
              setLoading(false);
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => {
    const isSelected = selectedTickets.has(item.id);
    return (
      <TouchableOpacity
        style={[styles.ticketItem, isSelected && styles.selectedTicketItem]}
        onPress={() => isSelectMode ? toggleSelectTicket(item.id) : navigation.navigate('TicketInfo', { ticketId: item.id, sourceCollection: item.source })}
        onLongPress={() => setIsSelectMode(true)} // Enter select mode on long press
      >
        {isSelectMode && (
          <TouchableOpacity onPress={() => toggleSelectTicket(item.id)} style={styles.checkboxContainer}>
            {/* --- MODIFIED: Use custom image for checkbox --- */}
            <Image
              source={isSelected ? CHECKBOX_MARKED_CIRCLE_ICON : CHECKBOX_BLANK_CIRCLE_OUTLINE_ICON}
              style={[styles.customCheckboxIcon, { tintColor: isSelected ? '#0a8fdf' : '#ccc' }]}
            />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        )}
        <View style={styles.ticketContent}>
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketTitle}>{item.category || 'N/A'}</Text>
            <Text style={[
              styles.ticketStatus,
              item.status === 'terminated' && styles.statusTerminated,
              item.status === 'nouveau' && styles.statusPending, // 'pending' changed to 'nouveau'
              item.status === 'in-progress' && styles.statusInProgress,
              (item.status === 'terminé' || item.status === 'résolu') && styles.statusCompleted, // 'completed' changed to 'terminé' or 'résolu'
              item.status === 'jey-handling' && styles.statusJeyHandling,
              item.status === 'escalated_to_agent' && styles.statusPending, // Add style for escalated
              !item.status && styles.statusDefault
            ]}>
              {item.status || 'Unknown'}
            </Text>
          </View>
          <Text style={styles.ticketDescription}>{item.message || 'No description available.'}</Text>
          <Text style={styles.ticketUser}>User: {item.userName || 'Unknown'}</Text>

          {item.assignedToName && (
            <Text style={styles.ticketAgent}>Assigned To: {item.assignedToName}</Text>
          )}

          {item.participants && item.participants.length > 0 && (
            <Text style={styles.ticketParticipants}>
              Participants: {item.participantNames ? item.participantNames.join(', ') : item.participants.join(', ')} {/* Use participantNames if available */}
            </Text>
          )}
        </View>

        {!isSelectMode && ( // Only show single delete button if not in select mode
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDeleteTicket(item.id, item.source)}
          >
            {/* --- MODIFIED: Use custom image for trash icon --- */}
            <Image source={TRASH_OUTLINE_ICON} style={styles.customDeleteButtonIcon} />
            {/* --- END MODIFIED --- */}
            <Text style={styles.buttonText}>Delete</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  const onScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(contentOffsetX / screenWidth);
    setModalCurrentPageIndex(newIndex);
  };

  const displayedTickets = activeTab === 'terminated' ? terminatedCollectionTickets : currentCollectionTickets;
  const headerText = activeTab === 'terminated'
    ? `Terminated Tickets (${terminatedCollectionTickets.length})`
    : `Current Tickets (${currentCollectionTickets.length})`;
  
  const allSelected = selectedTickets.size > 0 && selectedTickets.size === displayedTickets.length;
  const hasSelected = selectedTickets.size > 0;

  const agentsForSwipe = Object.values(currentTicketsDetailedCounts.agentTodayScores)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>{headerText}</Text>
        {activeTab === 'current' && (
          <TouchableOpacity
            onPress={() => setShowCurrentTicketsOverviewModal(true)}
            style={styles.seeStatsButton}
          >
            {/* --- MODIFIED: Use custom image for eye icon --- */}
            <Image source={EYE_OUTLINE_ICON} style={styles.customSeeStatsIcon} />
            {/* --- END MODIFIED --- */}
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.toggleButtonsContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, activeTab === 'terminated' && styles.activeToggleButton]}
          onPress={() => {
            setActiveTab('terminated');
            setSelectedTickets(new Set()); // Clear selection on tab change
            setIsSelectMode(false); // Exit select mode on tab change
          }}
        >
          <Text style={[styles.toggleButtonText, activeTab === 'terminated' && styles.activeToggleButtonText]}>
            Terminated
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, activeTab === 'current' && styles.activeToggleButton]}
          onPress={() => {
            setActiveTab('current');
            setSelectedTickets(new Set()); // Clear selection on tab change
            setIsSelectMode(false); // Exit select mode on tab change
          }}
        >
          <Text style={[styles.toggleButtonText, activeTab === 'current' && styles.activeToggleButtonText]}>
            Current Tickets
          </Text>
        </TouchableOpacity>
      </View>

      {/* Select All and Bulk Delete Controls */}
      {displayedTickets.length > 0 && (
        <View style={styles.selectionControls}>
            <TouchableOpacity onPress={() => setIsSelectMode(!isSelectMode)} style={styles.toggleSelectModeButton}>
                <Text style={styles.toggleSelectModeText}>
                    {isSelectMode ? 'Exit Select Mode' : 'Select'}
                </Text>
            </TouchableOpacity>

            {isSelectMode && (
                <>
                    <TouchableOpacity onPress={handleSelectAll} style={styles.selectAllButton}>
                        {/* --- MODIFIED: Use custom image for select all checkbox --- */}
                        <Image
                            source={allSelected ? CHECKBOX_MARKED_CIRCLE_ICON : CHECKBOX_BLANK_CIRCLE_OUTLINE_ICON}
                            style={[styles.customCheckboxIcon, { tintColor: allSelected ? '#0a8fdf' : '#666' }]}
                        />
                        {/* --- END MODIFIED --- */}
                        <Text style={styles.selectAllText}>
                            {allSelected ? 'Deselect All' : 'Select All'}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleDeleteSelectedTickets}
                        style={[styles.bulkDeleteButton, !hasSelected && styles.disabledBulkDeleteButton]}
                        disabled={!hasSelected}
                    >
                        {/* --- REMOVED: Image component for bulk delete icon --- */}
                        <Text style={styles.bulkDeleteButtonText}>
                            Delete ({selectedTickets.size})
                        </Text>
                    </TouchableOpacity>
                </>
            )}
        </View>
      )}

      {displayedTickets.length === 0 ? (
        <Text style={styles.emptyText}>No tickets found in this view.</Text>
      ) : (
        <FlatList
          data={displayedTickets}
          renderItem={renderItem}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.listContainer}
        />
      )}

      <Modal
        visible={showCurrentTicketsOverviewModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setShowCurrentTicketsOverviewModal(false);
          setModalCurrentPageIndex(0);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Current Ticket Statistics</Text>
              <TouchableOpacity onPress={() => {
                setShowCurrentTicketsOverviewModal(false);
                setModalCurrentPageIndex(0);
              }}>
                {/* --- MODIFIED: Use custom image for modal close icon --- */}
                <Image source={CLOSE_ICON} style={styles.customModalCloseIcon} />
                {/* --- END MODIFIED --- */}
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={scrollViewRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
            >
              {/* Page 1: Overall Statistics */}
              <View style={[styles.modalPage, { width: screenWidth * 0.85 - 50 }]}>
                <Text style={styles.sectionTitle}>Today's Tickets</Text>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Today:</Text>
                  <Text style={styles.statValueTotal}>{currentTicketsDetailedCounts.today.total}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Terminated Today:</Text>
                  <Text style={styles.statValueTerminated}>{currentTicketsDetailedCounts.today.terminated}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>In Progress Today:</Text>
                  <Text style={styles.statValueInProgress}>{currentTicketsDetailedCounts.today.inProgress}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Jey Handling Today:</Text>
                  <Text style={styles.statValueJeyHandling}>{currentTicketsDetailedCounts.today.jeyHandling}</Text>
                </View>

                <Text style={styles.sectionTitle}>Overall Active Tickets</Text>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Total Active:</Text>
                  <Text style={styles.statValueTotal}>{currentTicketsDetailedCounts.total}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Pending Overall:</Text>
                  <Text style={styles.statValuePending}>{currentTicketsDetailedCounts.pending}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Jey Handling Overall:</Text>
                  <Text style={styles.statValueJeyHandling}>{currentTicketsDetailedCounts.jeyHandling}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Other Agents Handling Overall:</Text>
                  <Text style={styles.statValueInProgress}>{currentTicketsDetailedCounts.otherAgentHandling}</Text>
                </View>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Completed Overall:</Text>
                  <Text style={styles.statValueCompleted}>{currentTicketsDetailedCounts.completed}</Text>
                </View>
                {currentTicketsDetailedCounts.terminatedInCurrent > 0 && (
                  <View style={styles.statItem}>
                    <Text style={styles.statLabel}>Terminated (in Current Tickets):</Text>
                    <Text style={styles.statValueTerminated}>{currentTicketsDetailedCounts.terminatedInCurrent}</Text>
                  </View>
                )}
              </View>

              {/* Page 2 onwards: Agent Daily Scores */}
              {agentsForSwipe.length > 0 && (
                agentsForSwipe.map((agent, index) => (
                  <View key={agent.id} style={[styles.modalPage, { width: screenWidth * 0.85 - 50 }]}>
                    <Text style={styles.sectionTitle}>{agent.name}'s Daily Score</Text>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Total Today:</Text>
                      <Text style={styles.statValueTotal}>{agent.total}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>In Progress Today:</Text>
                      <Text style={styles.statValueInProgress}>{agent.inProgress}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Pending Today:</Text>
                      <Text style={styles.statValuePending}>{agent.pending}</Text>
                    </View>
                    <View style={styles.statItem}>
                      <Text style={styles.statLabel}>Completed Today:</Text>
                      <Text style={styles.statValueCompleted}>{agent.completed}</Text>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>

            {/* Pagination Dots */}
            <View style={styles.paginationDotsContainer}>
              {[currentTicketsDetailedCounts.today, ...agentsForSwipe].map((_, index) => (
                <View
                  key={`dot-${index}`}
                  style={[
                    styles.paginationDot,
                    modalCurrentPageIndex === index && styles.paginationDotActive,
                  ]}
                />
              ))}
            </View>

            {/* Overall Agent Handling Counts (Always visible below swipe) */}
            {Object.keys(currentTicketsDetailedCounts.agentHandlingCounts).length > 0 && (
              <>
                <Text style={styles.agentStatsSectionTitle}>Overall Tickets by Agent</Text>
                {Object.values(currentTicketsDetailedCounts.agentHandlingCounts)
                  .filter(agent => agent.count > 0)
                  .sort((a, b) => b.count - a.count)
                  .map(agent => (
                    <View key={agent.name} style={styles.statItem}>
                      <Text style={styles.statLabel}>{agent.name}:</Text>
                      <Text style={styles.statValueAgent}>{agent.count}</Text>
                    </View>
                  ))}
              </>
            )}

            <TouchableOpacity
              style={styles.modalCloseButton}
              onPress={() => {
                setShowCurrentTicketsOverviewModal(false);
                setModalCurrentPageIndex(0);
              }}
            >
              <Text style={styles.modalCloseButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    backgroundColor: '#f8f9fa',
    paddingTop: 50,
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
  seeStatsButton: {
    padding: 5,
  },
  // --- NEW STYLE for custom see stats icon ---
  customSeeStatsIcon: {
    width: 24, // Match Ionicons size
    height: 24, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#0a8fdf', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  toggleButtonsContainer: {
    flexDirection: 'row',
    marginBottom: 20,
    borderRadius: 8,
    backgroundColor: '#e0e0e0',
    overflow: 'hidden',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0f0f0',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  activeToggleButton: {
    backgroundColor: '#0a8fdf',
    borderColor: '#0a8fdf',
  },
  toggleButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#666',
  },
  activeToggleButtonText: {
    color: '#fff',
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#666',
    paddingHorizontal: 20,
  },
  listContainer: {
    paddingBottom: 20,
  },
  ticketItem: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    flexDirection: 'row', // Added for checkbox alignment
    alignItems: 'center', // Added for checkbox alignment
  },
  selectedTicketItem: {
    borderColor: '#0a8fdf',
    borderWidth: 2,
  },
  checkboxContainer: {
    marginRight: 10,
    padding: 5, // Make it easier to tap
  },
  // --- NEW STYLE for custom checkbox icons ---
  customCheckboxIcon: {
    width: 24, // Match MaterialCommunityIcons size
    height: 24, // Match MaterialCommunityIcons size
    resizeMode: 'contain',
    // tintColor is applied inline
  },
  // --- END NEW STYLE ---
  ticketContent: {
    flex: 1, // Allow content to take remaining space
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ticketTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0a8fdf',
    flexShrink: 1,
    marginRight: 10,
  },
  ticketStatus: {
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 5,
    alignSelf: 'flex-start',
  },
  statusTerminated: {
    backgroundColor: '#FEE8E9',
    color: '#EA4335',
  },
  statusPending: { // Used for 'nouveau' and 'escalated_to_agent'
    backgroundColor: '#FFEEEE',
    color: '#FF3B30',
  },
  statusInProgress: {
    backgroundColor: '#E6F7EE',
    color: '#34C759',
  },
  statusCompleted: { // Used for 'terminé' and 'résolu'
    backgroundColor: '#D1E7DD',
    color: '#155724',
  },
  statusJeyHandling: {
    backgroundColor: '#FFF3CD',
    color: '#856404',
  },
  statusDefault: {
    backgroundColor: '#F0F0F0',
    color: '#9E9E9E',
  },
  ticketDescription: {
    fontSize: 14,
    color: '#555',
    marginBottom: 10,
  },
  ticketUser: {
    fontSize: 12,
    color: '#888',
    fontStyle: 'italic',
    marginBottom: 5,
  },
  ticketAgent: {
    fontSize: 12,
    color: '#666',
    fontStyle: 'italic',
    marginBottom: 10,
  },
  ticketParticipants: {
    fontSize: 12,
    color: '#666',
    marginBottom: 10,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FF3B30',
    padding: 8, // Slightly reduced padding for single delete button
    borderRadius: 5,
    marginTop: 10,
    alignSelf: 'flex-end', // Align to the right
  },
  // --- NEW STYLE for custom delete button icon ---
  customDeleteButtonIcon: {
    width: 20, // Match Ionicons size
    height: 20, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#fff', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  buttonText: {
    color: '#fff',
    marginLeft: 5,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#fff',
    borderRadius: 15,
    padding: 25,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8,
    maxHeight: '80%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 10,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#333',
  },
  // --- NEW STYLE for custom modal close icon ---
  customModalCloseIcon: {
    width: 28, // Match Ionicons size
    height: 28, // Match Ionicons size
    resizeMode: 'contain',
    tintColor: '#333', // Match Ionicons color
  },
  // --- END NEW STYLE ---
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingBottom: 5,
  },
  statItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  statLabel: {
    fontSize: 16,
    color: '#555',
  },
  statValueTotal: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0a8fdf',
  },
  statValuePending: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FF3B30',
  },
  statValueJeyHandling: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#856404',
  },
  statValueInProgress: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#34C759',
  },
  statValueCompleted: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#155724',
  },
  statValueTerminated: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#EA4335',
  },
  agentStatsSectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 20,
    marginBottom: 10,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 15,
  },
  statValueAgent: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  modalCloseButton: {
    backgroundColor: '#0a8fdf',
    borderRadius: 8,
    paddingVertical: 12,
    marginTop: 30,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  modalPage: {
    flexShrink: 0,
    paddingRight: 25,
    paddingLeft: 25,
  },
  paginationDotsContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 10,
  },
  paginationDot: {
    height: 8,
    width: 8,
    borderRadius: 4,
    backgroundColor: '#ccc',
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: '#0a8fdf',
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  selectionControls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#e9ecef',
    borderRadius: 8,
    marginBottom: 15,
  },
  toggleSelectModeButton: {
    backgroundColor: '#6c757d',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 5,
  },
  toggleSelectModeText: {
    color: '#fff',
    fontWeight: '600',
  },
  selectAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  selectAllText: {
    marginLeft: 5,
    fontSize: 14,
    color: '#333',
    fontWeight: '500',
  },
  bulkDeleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#dc3545',
    paddingVertical: 8,   // Adjusted to match selectAllButton
    paddingHorizontal: 10, // Adjusted to match selectAllButton
    borderRadius: 5,
  },
  bulkDeleteButtonText: {
    color: '#fff',
    // Removed marginLeft as there's no icon now
    fontWeight: '600',
    fontSize: 14, // Keep this font size
  },
  disabledBulkDeleteButton: {
    backgroundColor: '#adb5bd',
  },
});

export default TerminatedTickets;
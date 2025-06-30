import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { db } from '../firebase';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';

const { width: screenWidth } = Dimensions.get('window');

const TerminatedTickets = ({ navigation }) => {
  const [terminatedCollectionTickets, setTerminatedCollectionTickets] = useState([]);
  const [currentCollectionTickets, setCurrentCollectionTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('terminated');

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

  useEffect(() => {
    const fetchAndSeparateTickets = async () => {
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

      } catch (error) {
        console.error("Error fetching tickets:", error);
        Alert.alert("Error", "Failed to load tickets.");
      } finally {
        setLoading(false);
      }
    };

    fetchAndSeparateTickets();
  }, []);

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
      const agentsQuery = query(usersRef, where('isITSupport', '==', true));
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

        total++;

        if (isToday) {
          todayTotal++;
        }

        if (ticket.status === 'pending') {
          pending++;
          if (isToday && isAssigned) agentTodayScores[ticket.assignedTo].pending++;
        } else if (ticket.status === 'completed' || ticket.status === 'resolved') {
          completed++;
          if (isToday && isAssigned) agentTodayScores[ticket.assignedTo].completed++;
        } else if (ticket.status === 'jey-handling') {
          jeyHandling++;
          if (isToday) {
            todayInProgress++;
            todayJeyHandling++;
          }
          if (isAssigned) {
              agentHandlingCounts[ticket.assignedTo].count++;
              if (isToday) agentTodayScores[ticket.assignedTo].inProgress++;
          }
        } else if (ticket.status === 'in-progress') {
          if (isToday) {
            todayInProgress++;
          }
          if (isAssigned) {
              agentHandlingCounts[ticket.assignedTo].count++;
              if (isToday) agentTodayScores[ticket.assignedTo].inProgress++;
          } else {
            otherAgentHandling++;
          }
        }
        if (isToday && isAssigned) {
          agentTodayScores[ticket.assignedTo].total++;
        }
      });

      setCurrentTicketsDetailedCounts({
        total,
        pending,
        jeyHandling,
        otherAgentHandling,
        completed,
        terminatedInCurrent,
        agentHandlingCounts,
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
  }, [currentCollectionTickets]);

  const handleDeleteTicket = async (ticketId, sourceCollection) => {
    Alert.alert(
      "Confirm Deletion",
      "Are you sure you want to delete this ticket? This action is irreversible.",
      [
        {
          text: "Cancel",
          style: "cancel"
        },
        {
          text: "Delete",
          onPress: async () => {
            try {
              let collectionName;
              if (sourceCollection === 'terminated') {
                collectionName = 'terminatedTickets';
              } else if (sourceCollection === 'current') {
                collectionName = 'tickets';
              } else {
                console.error("Unknown source collection for deletion:", sourceCollection);
                Alert.alert("Error", "Could not determine collection for deletion.");
                return;
              }

              await deleteDoc(doc(db, collectionName, ticketId));
              if (sourceCollection === 'terminated') {
                setTerminatedCollectionTickets(prev => prev.filter(t => t.id !== ticketId));
              } else {
                setCurrentCollectionTickets(prev => prev.filter(t => t.id !== ticketId));
                fetchCurrentTicketsDetailedCounts();
              }
              Alert.alert("Success", "Ticket deleted successfully");
            } catch (error) {
              console.error("Error deleting ticket:", error);
              Alert.alert("Error", "Failed to delete ticket");
            }
          }
        }
      ]
    );
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.ticketItem}
      onPress={() => navigation.navigate('TicketInfo', { ticketId: item.id, sourceCollection: item.source })}
    >
      <View style={styles.ticketHeader}>
        <Text style={styles.ticketTitle}>{item.category || 'N/A'}</Text>
        <Text style={[
          styles.ticketStatus,
          item.status === 'terminated' && styles.statusTerminated,
          item.status === 'pending' && styles.statusPending,
          item.status === 'in-progress' && styles.statusInProgress,
          item.status === 'completed' && styles.statusCompleted,
          item.status === 'resolved' && styles.statusCompleted,
          item.status === 'jey-handling' && styles.statusJeyHandling,
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
          Participants: {item.participants.join(', ')}
        </Text>
      )}

      <TouchableOpacity
        style={styles.deleteButton}
        onPress={() => handleDeleteTicket(item.id, item.source)}
      >
        <Ionicons name="trash-outline" size={20} color="#fff" />
        <Text style={styles.buttonText}>Delete</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  const onScroll = (event) => {
    const contentOffsetX = event.nativeEvent.contentOffset.x;
    const newIndex = Math.round(contentOffsetX / screenWidth);
    setModalCurrentPageIndex(newIndex);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0a8fdf" />
      </View>
    );
  }

  const displayedTickets = activeTab === 'terminated' ? terminatedCollectionTickets : currentCollectionTickets;
  const headerText = activeTab === 'terminated'
    ? `Terminated Tickets (${terminatedCollectionTickets.length})`
    : `Current Tickets (${currentCollectionTickets.length})`;

  const agentsForSwipe = Object.values(currentTicketsDetailedCounts.agentTodayScores)
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.header}>{headerText}</Text>
        {activeTab === 'current' && (
          <TouchableOpacity
            onPress={() => setShowCurrentTicketsOverviewModal(true)}
            style={styles.seeStatsButton}
          >
            <Ionicons name="eye-outline" size={24} color="#0a8fdf" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.toggleButtonsContainer}>
        <TouchableOpacity
          style={[styles.toggleButton, activeTab === 'terminated' && styles.activeToggleButton]}
          onPress={() => setActiveTab('terminated')}
        >
          <Text style={[styles.toggleButtonText, activeTab === 'terminated' && styles.activeToggleButtonText]}>
            Terminated
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.toggleButton, activeTab === 'current' && styles.activeToggleButton]}
          onPress={() => setActiveTab('current')}
        >
          <Text style={[styles.toggleButtonText, activeTab === 'current' && styles.activeToggleButtonText]}>
            Current Tickets
          </Text>
        </TouchableOpacity>
      </View>

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
                <Ionicons name="close" size={28} color="#333" />
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
                  key={`dot-${index}`} // Added unique key here
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
                    <View key={agent.name} style={styles.statItem}> {/* Key is already present here, but double-check it's unique */}
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
  statusPending: {
    backgroundColor: '#FFEEEE',
    color: '#FF3B30',
  },
  statusInProgress: {
    backgroundColor: '#E6F7EE',
    color: '#34C759',
  },
  statusCompleted: {
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
    padding: 10,
    borderRadius: 5,
    marginTop: 10,
  },
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
});

export default TerminatedTickets;
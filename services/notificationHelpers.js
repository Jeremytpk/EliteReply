import { 
  sendNotificationToUser, 
  sendNotificationToITSupport, 
  sendNotificationToUsersByRole,
  sendNotificationToAllUsers,
  sendNotificationToPartner,
  sendNotificationToAllPartners,
  showInAppNotification,
  scheduleLocalNotification 
} from '../services/notifications';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';

// Helper function to send ticket-related notifications
export const sendTicketNotification = {
  // When a new ticket is created - notify ALL agents/IT Support
  newTicket: async (ticketData) => {
    try {
      // Send to all IT Support agents (role: "Agent" or isITSupport: true)
      await sendNotificationToITSupport(
        `Nouveau ticket: ${ticketData.category}`,
        `${ticketData.userName}: ${ticketData.message.substring(0, 100)}${ticketData.message.length > 100 ? '...' : ''}`,
        {
          type: 'ticket',
          ticketId: ticketData.id,
          category: ticketData.category,
          userId: ticketData.userId,
          userName: ticketData.userName,
          priority: ticketData.userIsPremium ? 'high' : 'normal',
        }
      );
    } catch (error) {
      console.error('Error sending new ticket notification:', error);
    }
  },

  // When an agent takes a ticket - notify the specific user (role: "user")
  ticketAssigned: async (ticketData, agentData) => {
    try {
      // Notify the specific user who created the ticket (role: "user")
      await sendNotificationToUser(
        ticketData.userId,
        'Agent assigné à votre ticket',
        `${agentData.name} a pris en charge votre demande: ${ticketData.category}`,
        {
          type: 'ticket',
          ticketId: ticketData.id,
          agentName: agentData.name,
          category: ticketData.category,
        }
      );

      // Show confirmation to agent
      showInAppNotification(
        'Ticket assigné',
        `Vous avez pris en charge le ticket: ${ticketData.category}`,
        { type: 'system' }
      );
    } catch (error) {
      console.error('Error sending ticket assignment notification:', error);
    }
  },

  // When a ticket is escalated to human agent - notify ALL agents
  ticketEscalated: async (ticketData) => {
    try {
      // Send to all IT Support agents when escalated
      await sendNotificationToITSupport(
        `Ticket escaladé: ${ticketData.category}`,
        `Le client ${ticketData.userName} demande un agent humain`,
        {
          type: 'ticket',
          ticketId: ticketData.id,
          category: ticketData.category,
          userId: ticketData.userId,
          userName: ticketData.userName,
          escalated: true,
          priority: 'high',
        }
      );
    } catch (error) {
      console.error('Error sending ticket escalation notification:', error);
    }
  },

  // When a ticket is resolved - notify the specific user (role: "user")
  ticketResolved: async (ticketData, resolvedBy) => {
    try {
      // Notify the specific user who created the ticket
      await sendNotificationToUser(
        ticketData.userId,
        'Ticket résolu',
        `Votre demande "${ticketData.category}" a été résolue par ${resolvedBy}`,
        {
          type: 'ticket',
          ticketId: ticketData.id,
          category: ticketData.category,
          resolvedBy,
          status: 'resolved',
        }
      );
    } catch (error) {
      console.error('Error sending ticket resolution notification:', error);
    }
  },
};

// Helper function to send message-related notifications
export const sendMessageNotification = {
  // When a text message is sent in conversation (between user and agent)
  textMessage: async (recipientId, messageData) => {
    try {
      // Send to specific user or agent in the conversation
      await sendNotificationToUser(
        recipientId,
        `Nouveau message de ${messageData.senderName}`,
        messageData.message.substring(0, 100),
        {
          type: 'message',
          ticketId: messageData.ticketId,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
          messageType: 'text',
          category: messageData.ticketCategory,
        }
      );
    } catch (error) {
      console.error('Error sending text message notification:', error);
    }
  },

  // When agent sends partner suggestions to user
  partnerSuggestion: async (recipientId, messageData) => {
    try {
      await sendNotificationToUser(
        recipientId,
        'Nouvelle suggestion de partenaire!',
        `${messageData.senderName} vous a envoyé des suggestions de partenaires.`,
        {
          type: 'partner_suggestion',
          ticketId: messageData.ticketId,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
          partnersCount: messageData.partners?.length || 0,
        }
      );
    } catch (error) {
      console.error('Error sending partner suggestion notification:', error);
    }
  },

  // When agent sends product details to user
  productDetails: async (recipientId, messageData) => {
    try {
      await sendNotificationToUser(
        recipientId,
        `Détails de produit de ${messageData.partnerName}!`,
        `${messageData.senderName} vous a envoyé des détails sur ${messageData.productName}.`,
        {
          type: 'product_details',
          ticketId: messageData.ticketId,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
          productName: messageData.productName,
          partnerName: messageData.partnerName,
        }
      );
    } catch (error) {
      console.error('Error sending product details notification:', error);
    }
  },

  // When partner sends message to admin
  partnerMessage: async (adminId, messageData) => {
    try {
      // Send to specific admin
      await sendNotificationToUser(
        adminId,
        `Nouveau Message Partenaire!`,
        `De ${messageData.partnerName}: "${messageData.message}"`,
        {
          type: 'admin_partner_chat',
          partnerId: messageData.partnerId,
          partnerName: messageData.partnerName,
        }
      );
    } catch (error) {
      console.error('Error sending partner message notification:', error);
    }
  },

  // When user requests human agent - notify ALL agents
  agentRequested: async (ticketData) => {
    try {
      // Send to all IT Support agents
      await sendNotificationToITSupport(
        'Agent demandé',
        `${ticketData.userName} demande un agent humain pour: ${ticketData.category}`,
        {
          type: 'ticket',
          ticketId: ticketData.id,
          category: ticketData.category,
          userId: ticketData.userId,
          userName: ticketData.userName,
          agentRequested: true,
          priority: 'high',
        }
      );
    } catch (error) {
      console.error('Error sending agent request notification:', error);
    }
  },
};

// Helper function to send appointment-related notifications
export const sendAppointmentNotification = {
  // When new appointment is created - notify partner (role: "Partner")
  appointmentCreated: async (clientEmail, appointmentData) => {
    try {
      // Find user by email and notify them
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', clientEmail)
      );
      const querySnapshot = await getDocs(usersQuery);
      
      if (!querySnapshot.empty) {
        const userId = querySnapshot.docs[0].id;
        await sendNotificationToUser(
          userId,
          'Rendez-vous confirmé',
          `Votre rendez-vous avec ${appointmentData.partnerName} a été enregistré pour le ${new Date(appointmentData.dateTime).toLocaleDateString('fr-FR')}`,
          {
            type: 'appointment',
            appointmentId: appointmentData.id,
            partnerName: appointmentData.partnerName,
            dateTime: appointmentData.dateTime,
            clientNames: appointmentData.clientNames,
          }
        );
      }

      // Also notify the partner if they have a user account
      // This would require finding the partner's user account if they have one
      
    } catch (error) {
      console.error('Error sending appointment creation notification:', error);
    }
  },

  // When appointment is updated - notify client (role: "user")
  appointmentUpdated: async (clientEmail, appointmentData) => {
    try {
      // Find user by email and notify them
      const usersQuery = query(
        collection(db, 'users'),
        where('email', '==', clientEmail)
      );
      const querySnapshot = await getDocs(usersQuery);
      
      if (!querySnapshot.empty) {
        const userId = querySnapshot.docs[0].id;
        await sendNotificationToUser(
          userId,
          'Rendez-vous mis à jour',
          `Votre rendez-vous avec ${appointmentData.partnerName} a été modifié pour le ${new Date(appointmentData.dateTime).toLocaleDateString('fr-FR')}`,
          {
            type: 'appointment',
            appointmentId: appointmentData.id,
            partnerName: appointmentData.partnerName,
            dateTime: appointmentData.dateTime,
            clientNames: appointmentData.clientNames,
            updated: true,
          }
        );
      }
    } catch (error) {
      console.error('Error sending appointment update notification:', error);
    }
  },

  // When appointment reminder is sent - notify client (role: "user") 
  appointmentReminder: async (appointmentData) => {
    try {
      await sendNotificationToUser(
        appointmentData.clientId,
        'Rappel de rendez-vous',
        `N'oubliez pas votre rendez-vous avec ${appointmentData.partnerName} demain à ${appointmentData.time}`,
        {
          type: 'appointment',
          appointmentId: appointmentData.id,
          partnerName: appointmentData.partnerName,
          service: appointmentData.service,
          date: appointmentData.date,
          time: appointmentData.time,
          confirmed: true,
        }
      );
    } catch (error) {
      console.error('Error sending appointment confirmation notification:', error);
    }
  },

  // When appointment is cancelled
  appointmentCancelled: async (appointmentData, cancelledBy) => {
    try {
      const recipientId = cancelledBy === 'client' ? appointmentData.partnerId : appointmentData.clientId;
      const recipientName = cancelledBy === 'client' ? appointmentData.partnerName : appointmentData.clientName;
      
      await sendNotificationToUser(
        recipientId,
        'Rendez-vous annulé',
        `Votre rendez-vous avec ${recipientName} du ${appointmentData.date} a été annulé`,
        {
          type: 'appointment',
          appointmentId: appointmentData.id,
          service: appointmentData.service,
          date: appointmentData.date,
          time: appointmentData.time,
          cancelled: true,
          cancelledBy,
        }
      );
    } catch (error) {
      console.error('Error sending appointment cancellation notification:', error);
    }
  },

  // Reminder notifications
  appointmentReminder: async (appointmentData, reminderType = '24h') => {
    try {
      const reminderTime = reminderType === '24h' ? '24 heures' : '1 heure';
      
      // Remind client
      await sendNotificationToUser(
        appointmentData.clientId,
        `Rappel: Rendez-vous dans ${reminderTime}`,
        `N'oubliez pas votre rendez-vous avec ${appointmentData.partnerName} pour ${appointmentData.service}`,
        {
          type: 'appointment',
          appointmentId: appointmentData.id,
          reminderType,
          service: appointmentData.service,
          date: appointmentData.date,
          time: appointmentData.time,
        }
      );

      // Remind partner
      await sendNotificationToUser(
        appointmentData.partnerId,
        `Rappel: Rendez-vous dans ${reminderTime}`,
        `N'oubliez pas votre rendez-vous avec ${appointmentData.clientName} pour ${appointmentData.service}`,
        {
          type: 'appointment',
          appointmentId: appointmentData.id,
          reminderType,
          service: appointmentData.service,
          date: appointmentData.date,
          time: appointmentData.time,
        }
      );
    } catch (error) {
      console.error('Error sending appointment reminder notification:', error);
    }
  },
};

// Helper function to send payment-related notifications
export const sendPaymentNotification = {
  // When payment is successful - notify user (role: "user")
  paymentSuccess: async (userId, paymentData) => {
    try {
      await sendNotificationToUser(
        userId,
        'Paiement confirmé',
        `Votre paiement de ${paymentData.amount}€ a été traité avec succès`,
        {
          type: 'payment',
          paymentId: paymentData.id,
          amount: paymentData.amount,
          service: paymentData.service,
          status: 'success',
        }
      );
    } catch (error) {
      console.error('Error sending payment success notification:', error);
    }
  },

  // When payment fails - notify user (role: "user")
  paymentFailed: async (userId, paymentData) => {
    try {
      await sendNotificationToUser(
        userId,
        'Échec du paiement',
        `Votre paiement de ${paymentData.amount}€ n'a pas pu être traité`,
        {
          type: 'payment',
          paymentId: paymentData.id,
          amount: paymentData.amount,
          service: paymentData.service,
          status: 'failed',
        }
      );
    } catch (error) {
      console.error('Error sending payment failure notification:', error);
    }
  },

  // When partner receives payment - notify partner (role: "Partner")
  partnerPaymentReceived: async (partnerId, paymentData) => {
    try {
      await sendNotificationToPartner(
        partnerId,
        'Paiement reçu',
        `Vous avez reçu un paiement de ${paymentData.amount}€ pour ${paymentData.service}`,
        {
          type: 'payment',
          paymentId: paymentData.id,
          amount: paymentData.amount,
          service: paymentData.service,
          clientName: paymentData.clientName,
          status: 'received',
        }
      );
    } catch (error) {
      console.error('Error sending partner payment notification:', error);
    }
  },

  // When pending payment needs admin attention - notify admin (role: "admin")
  pendingPayment: async (adminId, paymentData) => {
    try {
      await sendNotificationToUser(
        adminId,
        "Nouveau Paiement en Attente!",
        `Un paiement de ${paymentData.amount}$ pour ${paymentData.partnerName} est en attente de confirmation.`,
        {
          type: 'admin_pending_payment',
          paymentId: paymentData.paymentId,
          amount: paymentData.amount,
          partnerName: paymentData.partnerName,
        }
      );
    } catch (error) {
      console.error('Error sending pending payment notification:', error);
    }
  },

  // When financial update occurs - notify admin (role: "admin")
  financialUpdate: async (adminId, updateData) => {
    try {
      await sendNotificationToUser(
        adminId,
        "Mise à jour financière partenaire!",
        `Nouvelle transaction enregistrée pour ${updateData.partnerName}.`,
        {
          type: 'partner_payment_update',
          partnerId: updateData.partnerId,
          partnerName: updateData.partnerName,
          transactionAmount: updateData.transactionAmount,
        }
      );
    } catch (error) {
      console.error('Error sending financial update notification:', error);
    }
  },
};

// Helper function to send system-wide notifications
export const sendSystemNotification = {
  // New users today - notify admin (role: "admin")
  newUsersToday: async (adminId, userData) => {
    try {
      await sendNotificationToUser(
        adminId,
        "Nouveaux Utilisateurs!",
        `${userData.count} nouveau(x) utilisateur(s) a/ont rejoint aujourd'hui.`,
        {
          type: 'admin_new_users',
          count: userData.count,
        }
      );
    } catch (error) {
      console.error('Error sending new users notification:', error);
    }
  },

  // Broadcast to all users
  broadcast: async (title, message, data = {}) => {
    try {
      await sendNotificationToAllUsers(title, message, {
        ...data,
        type: 'broadcast',
      });
    } catch (error) {
      console.error('Error sending broadcast notification:', error);
    }
  },

  // Notify specific role
  roleNotification: async (role, title, message, data = {}) => {
    try {
      await sendNotificationToUsersByRole(role, title, message, {
        ...data,
        type: 'system',
        targetRole: role,
      });
    } catch (error) {
      console.error('Error sending role notification:', error);
    }
  },

  // Notify all admins (role: "admin")
  adminNotification: async (title, message, data = {}) => {
    try {
      await sendNotificationToUsersByRole('admin', title, message, {
        ...data,
        type: 'admin_system',
      });
    } catch (error) {
      console.error('Error sending admin notification:', error);
    }
  },

  // Notify all agents (role: "Agent")
  agentNotification: async (title, message, data = {}) => {
    try {
      await sendNotificationToITSupport(title, message, {
        ...data,
        type: 'agent_system',
      });
    } catch (error) {
      console.error('Error sending agent notification:', error);
    }
  },

  // Notify all partners (role: "Partner")
  partnerNotification: async (title, message, data = {}) => {
    try {
      await sendNotificationToAllPartners(title, message, {
        ...data,
        type: 'partner_system',
      });
    } catch (error) {
      console.error('Error sending partner notification:', error);
    }
  },

  // App update notification
  appUpdate: async () => {
    try {
      await sendNotificationToAllUsers(
        'Mise à jour disponible',
        'Une nouvelle version d\'EliteReply est disponible sur l\'App Store et Google Play',
        {
          type: 'system',
          action: 'update',
        }
      );
    } catch (error) {
      console.error('Error sending app update notification:', error);
    }
  },

  // Maintenance notification
  maintenance: async (startTime, duration) => {
    try {
      await sendNotificationToAllUsers(
        'Maintenance programmée',
        `EliteReply sera en maintenance le ${startTime} pendant ${duration}`,
        {
          type: 'system',
          action: 'maintenance',
          startTime,
          duration,
        }
      );
    } catch (error) {
      console.error('Error sending maintenance notification:', error);
    }
  },
};

// Helper function to schedule reminder notifications
export const scheduleNotificationReminders = {
  // Schedule appointment reminders
  appointmentReminders: async (appointmentData) => {
    try {
      const appointmentTime = new Date(appointmentData.date + ' ' + appointmentData.time);
      const now = new Date();
      
      // 24-hour reminder
      const reminder24h = new Date(appointmentTime.getTime() - 24 * 60 * 60 * 1000);
      if (reminder24h > now) {
        const delaySeconds = Math.floor((reminder24h.getTime() - now.getTime()) / 1000);
        await scheduleLocalNotification(
          'Rappel: Rendez-vous demain',
          `N'oubliez pas votre rendez-vous pour ${appointmentData.service}`,
          {
            type: 'appointment',
            appointmentId: appointmentData.id,
            reminderType: '24h',
          },
          delaySeconds
        );
      }
      
      // 1-hour reminder
      const reminder1h = new Date(appointmentTime.getTime() - 60 * 60 * 1000);
      if (reminder1h > now) {
        const delaySeconds = Math.floor((reminder1h.getTime() - now.getTime()) / 1000);
        await scheduleLocalNotification(
          'Rappel: Rendez-vous dans 1 heure',
          `Votre rendez-vous pour ${appointmentData.service} commence bientôt`,
          {
            type: 'appointment',
            appointmentId: appointmentData.id,
            reminderType: '1h',
          },
          delaySeconds
        );
      }
    } catch (error) {
      console.error('Error scheduling appointment reminders:', error);
    }
  },
};

export default {
  sendTicketNotification,
  sendMessageNotification,
  sendAppointmentNotification,
  sendPaymentNotification,
  sendSystemNotification,
  scheduleNotificationReminders,
};

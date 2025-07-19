// functions/index.js

// Import Firebase Functions and Admin SDK
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');

// Correct v2 imports for Cloud Function triggers
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');

// Import Expo Server SDK
const { Expo } = require('expo-server-sdk');

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  admin.initializeApp();
}

// Initialize Expo SDK
const expo = new Expo();

const db = getFirestore(); // Get Firestore instance once globally

// --- Custom Notification Sound Name ---
const CUSTOM_SOUND_NAME = "er_notification";
const ANDROID_NOTIFICATION_CHANNEL_ID = "er_notification_channel";


// --- Cloud Function for New Messages ---
exports.onNewMessage = onDocumentCreated('tickets/{ticketId}/messages/{messageId}', async (event) => {
  const messageData = event.data.data();
  const ticketId = event.params.ticketId;

  console.log('*** onNewMessage Triggered ***');
  console.log('Ticket ID:', ticketId);
  console.log('Message Data:', messageData);

  // Skip notifications for system messages
  if (messageData.expediteurId === 'systeme') {
    console.log('Skipping notification for system message.');
    return null;
  }

  const ticketDocRef = db.collection('tickets').doc(ticketId);
  const ticketDoc = await ticketDocRef.get();

  if (!ticketDoc.exists) {
    console.log(`Ticket ${ticketId} does not exist. Cannot send notification.`);
    return null;
  }
  const ticketData = ticketDoc.data();

  let recipientUid = null;
  let senderDisplayName = messageData.nomExpediteur || 'EliteReply';

  if (messageData.expediteurId === ticketData.userId) {
    if (ticketData.assignedTo && ticketData.assignedTo !== 'jey-ai') {
      recipientUid = ticketData.assignedTo;
      senderDisplayName = ticketData.userName || 'Un Client';
    } else {
      console.log('Client sent message, but no human agent assigned (or Jey is handling). No push notification.');
      return null;
    }
  } else if (messageData.expediteurId === ticketData.assignedTo || messageData.expediteurId === 'jey-ai') {
    recipientUid = ticketData.userId;
    senderDisplayName = (messageData.expediteurId === 'jey-ai') ? 'Jey' : (ticketData.assignedToName || 'Un Agent');
  } else {
    console.log(`Unrecognized sender ${messageData.expediteurId}. No notification sent.`);
    return null;
  }

  if (!recipientUid || recipientUid === messageData.expediteurId) {
      console.log(`Recipient is null or is the sender itself (${recipientUid}). Skipping notification.`);
      return null;
  }

  const recipientUserDoc = await db.collection('users').doc(recipientUid).get();
  if (!recipientUserDoc.exists || !recipientUserDoc.data().expoPushToken) {
    console.log(`Recipient user ${recipientUid} not found or has no Expo Push Token.`);
    return null;
  }
  const expoPushToken = recipientUserDoc.data().expoPushToken;
  const recipientName = recipientUserDoc.data().name || 'User';

  if (!Expo.isExpoPushToken(expoPushToken)) {
    console.error(`Push token "${expoPushToken}" for user ${recipientUid} is not a valid Expo push token format.`);
    return null;
  }

  const notificationTitle = `Nouveau message de ${senderDisplayName}`;
  const notificationBody = messageData.texte.length > 150 ? `${messageData.texte.substring(0, 147)}...` : messageData.texte;

  const messagesToSend = [{
    to: expoPushToken,
    sound: CUSTOM_SOUND_NAME,
    title: notificationTitle,
    body: notificationBody,
    data: {
      type: 'message',
      ticketId: ticketId,
      link: `elitereply://app/conversation/${ticketId}`
    },
    android: {
      channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
    },
  }];

  try {
    console.log(`Sending notification to ${recipientName} (${recipientUid}) with token: ${expoPushToken}`);
    console.log('Payload:', JSON.stringify(messagesToSend[0], null, 2));

    let chunks = expo.chunkPushNotifications(messagesToSend);
    let tickets = [];

    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log('Successfully sent Expo push notification chunk. Ticket response:', ticketChunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending Expo push notification chunk:', error);
        if (error.details) {
          console.error('Expo push error details:', error.details);
        }
      }
    }
    console.log('*** onNewMessage Function End ***');
    return null;
  } catch (error) {
    console.error('Unhandled error in onNewMessage function:', error);
    return null;
  }
});

// --- Cloud Function for New Surveys ---
exports.onNewSurvey = onDocumentCreated('surveys/{surveyId}', async (event) => {
  const surveyData = event.data.data();
  const surveyId = event.params.surveyId;

  console.log('*** onNewSurvey Triggered ***');
  console.log('Survey ID:', surveyId);
  console.log('Survey Data:', surveyData);

  if (!surveyData.active) {
    console.log(`Survey ${surveyId} is not active, skipping notification.`);
    return null;
  }

  const usersSnapshot = await db.collection('users').get();
  const messages = [];

  for (const doc of usersSnapshot.docs) {
    const userData = doc.data();
    const userId = doc.id;
    const expoPushToken = userData.expoPushToken;

    if (expoPushToken && Expo.isExpoPushToken(expoPushToken) && !(surveyData.completedByUsers && surveyData.completedByUsers.includes(userId))) {
      messages.push({
        to: expoPushToken,
        sound: CUSTOM_SOUND_NAME,
        title: 'Nouvelle Enquête Disponible !',
        body: surveyData.title || 'Donnez votre avis et gagnez un coupon !',
        data: {
          type: 'survey',
          surveyId: surveyId,
          link: `elitereply://app/survey/${surveyId}`
        },
        android: {
          channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
        },
      });
    } else {
        console.log(`Skipping notification for user ${userId}: No token, invalid token, or survey already completed.`);
    }
  }

  if (messages.length === 0) {
    console.log('No eligible users to notify for new survey.');
    return null;
  }

  console.log(`Attempting to send ${messages.length} survey notifications.`);
  const chunks = expo.chunkPushNotifications(messages);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log('Sent survey chunk. Ticket response:', ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending survey notification chunk:', error);
      if (error.details) {
          console.error('Expo push error details:', error.details);
      }
    }
  }

  console.log(`Successfully processed sending for ${messages.length} survey notifications.`);
  console.log('*** onNewSurvey Function End ***');
  return null;
});


// --- Cloud Function for New Appointments ---
exports.sendAppointmentNotifications = onDocumentCreated('appointments/{appointmentId}', async (event) => {
  const newAppointment = event.data.data();
  const appointmentId = event.params.appointmentId;

  console.log('*** sendAppointmentNotifications Triggered ***');
  console.log('Appointment ID:', appointmentId);
  console.log('Appointment Data:', newAppointment);

  if (!newAppointment.clientId || !newAppointment.partnerId || !newAppointment.appointmentDateTime) {
    console.warn('Missing essential data (clientId, partnerId, or appointmentDateTime) for appointment notification.');
    return null;
  }

  // Ensure newAppointment.appointmentDateTime is a Timestamp object or has a seconds property
  const appointmentDate = new Date(newAppointment.appointmentDateTime.seconds * 1000);
  const formattedDateTime = appointmentDate.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
  });

  const messagesToSend = [];

  // --- 1. Prepare notification for the CLIENT ---
  try {
    const clientDoc = await db.collection('users').doc(newAppointment.clientId).get();
    if (clientDoc.exists && clientDoc.data().expoPushToken) {
      const clientPushToken = clientDoc.data().expoPushToken;
      const clientName = clientDoc.data().name || 'Client';

      if (Expo.isExpoPushToken(clientPushToken)) {
        // Construct client names for notification if available
        let clientNamesForNotification = (newAppointment.clientNames && newAppointment.clientNames.length > 0)
            ? ` pour ${newAppointment.clientNames.join(', ')}`
            : '';

        messagesToSend.push({
          to: clientPushToken,
          sound: CUSTOM_SOUND_NAME,
          title: 'Votre Rendez-vous Confirmé !',
          // Use 'partnerNom' here for the partner's name
          body: `Votre rendez-vous avec ${newAppointment.partnerNom || 'un partenaire'}${clientNamesForNotification} est confirmé pour le ${formattedDateTime}.`,
          data: {
            type: 'appointment_client_confirmed',
            appointmentId: appointmentId,
            link: `elitereply://app/appointments`,
          },
          android: {
            channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
          },
        });
        console.log(`Prepared notification for client ${clientName} (${newAppointment.clientId}).`);
      } else {
        console.error(`Invalid Expo Push Token for client ${newAppointment.clientId}: "${clientPushToken}"`);
      }
    } else {
      console.log(`No push token or user data found for client: ${newAppointment.clientId}`);
    }
  } catch (error) {
    console.error(`Error processing client notification for appointment ${appointmentId}:`, error);
  }

  // --- 2. Prepare notification for the PARTNER ---
  try {
    const partnerDoc = await db.collection('users').doc(newAppointment.partnerId).get();
    if (partnerDoc.exists && partnerDoc.data().expoPushToken) {
      const partnerPushToken = partnerDoc.data().expoPushToken;
      const partnerName = partnerDoc.data().name || 'Partenaire'; // This is the user's display name, not partnerNom from appointment

      if (Expo.isExpoPushToken(partnerPushToken)) {
        messagesToSend.push({
          to: partnerPushToken,
          sound: CUSTOM_SOUND_NAME,
          title: 'Nouveau Rendez-vous Réservé !',
          // Use 'clientName' for the client's name from appointment data
          body: `Un nouveau rendez-vous a été planifié avec ${newAppointment.clientName || 'un client'} pour le ${formattedDateTime}.`,
          data: {
            type: 'appointment_partner_new',
            appointmentId: appointmentId,
            link: `elitereply://app/partner/appointments`,
            // Consider adding partnerNom and partnerCategorie if needed for context in app
            partnerNom: newAppointment.partnerNom,
            partnerCategorie: newAppointment.partnerCategorie
          },
          android: {
            channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
          },
        });
        console.log(`Prepared notification for partner ${partnerName} (${newAppointment.partnerId}).`);
      } else {
        console.error(`Invalid Expo Push Token for partner ${newAppointment.partnerId}: "${partnerPushToken}"`);
      }
    } else {
      console.log(`No push token or user data found for partner: ${newAppointment.partnerId}`);
    }
  } catch (error) {
    console.error(`Error processing partner notification for appointment ${appointmentId}:`, error);
  }

  if (messagesToSend.length === 0) {
    console.log('No eligible recipients found to send appointment notifications.');
    return null;
  }

  console.log(`Attempting to send ${messagesToSend.length} appointment notifications.`);
  let chunks = expo.chunkPushNotifications(messagesToSend);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log('Successfully sent Expo push notification chunk for appointments. Ticket response:', ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending Expo push notification chunk for appointments:', error);
      if (error.details) {
        console.error('Expo push error details:', error.details);
      }
    }
  }

  console.log('*** sendAppointmentNotifications Function End ***');
  return null;
});


// --- Cloud Function for New Ticket Notifications to Agents (on creation) ---
exports.notifyNewTicketToAgents = onDocumentCreated('tickets/{ticketId}', async (event) => {
  const newTicket = event.data.data();
  const ticketId = event.params.ticketId;

  console.log('*** notifyNewTicketToAgents Triggered ***');
  console.log('New Ticket ID:', ticketId);
  console.log('New Ticket Data:', newTicket);

  if (newTicket.assignedTo === 'jey-ai' && !newTicket.isAgentRequested) {
    console.log('New ticket assigned to Jey-AI and no agent requested. Skipping immediate agent notification.');
    return null;
  }

  const itAgentsQuery = db.collection('users')
    .where('role', '==', 'IT')
    .where('isClockedIn', '==', true)
    .where('expoPushToken', '!=', null);

  const itAgentsSnapshot = await itAgentsQuery.get();
  const messagesToSend = [];

  if (itAgentsSnapshot.empty) {
    console.log('No clocked-in IT agents with push tokens to notify for new ticket.');
    return null;
  }

  const notificationTitle = `Nouveau Ticket en Attente !`;
  // Use 'categorie' here for the ticket category
  const notificationBody = `Un ticket de type "${newTicket.categorie || 'inconnu'}" de ${newTicket.userName || 'un utilisateur'} est en attente.`;

  for (const doc of itAgentsSnapshot.docs) {
    const agentData = doc.data();
    const agentPushToken = agentData.expoPushToken;

    if (agentPushToken && Expo.isExpoPushToken(agentPushToken)) {
      messagesToSend.push({
        to: agentPushToken,
        sound: CUSTOM_SOUND_NAME,
        title: notificationTitle,
        body: notificationBody,
        data: {
          type: 'new_ticket_agent_alert',
          ticketId: ticketId,
          link: `elitereply://app/ticket/${ticketId}`
        },
        android: {
          channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
        },
      });
      console.log(`Prepared notification for agent ${doc.id}.`);
    } else {
      console.warn(`Invalid or missing Expo Push Token for agent ${doc.id}: "${agentPushToken}"`);
    }
  }

  if (messagesToSend.length === 0) {
    console.log('No valid push tokens found among clocked-in IT agents to send new ticket notification.');
    return null;
  }

  console.log(`Attempting to send ${messagesToSend.length} new ticket notifications to agents.`);
  let chunks = expo.chunkPushNotifications(messagesToSend);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log('Successfully sent Expo push notification chunk for new tickets. Ticket response:', ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending Expo push notification chunk for new tickets:', error);
      if (error.details) {
        console.error('Expo push error details:', error.details);
      }
    }
  }

  console.log('*** notifyNewTicketToAgents Function End ***');
  return null;
});


// --- Cloud Function for Ticket Escalation Notifications to Agents (on update) ---
exports.notifyEscalatedTicketToAgents = onDocumentUpdated('tickets/{ticketId}', async (event) => {
  const beforeData = event.data.before.data();
  const afterData = event.data.after.data();
  const ticketId = event.params.ticketId;

  console.log('*** notifyEscalatedTicketToAgents Triggered ***');
  console.log('Ticket ID:', ticketId);
  console.log('Before Data:', beforeData);
  console.log('After Data:', afterData);

  const isEscalationFromJey =
    beforeData.status === 'jey-handling' &&
    afterData.status === 'escalated_to_agent' &&
    !beforeData.isAgentRequested;

  if (!isEscalationFromJey) {
    console.log('Ticket update is not a Jey-AI escalation to agent. Skipping notification.');
    return null;
  }

  const itAgentsQuery = db.collection('users')
    .where('role', '==', 'IT')
    .where('isClockedIn', '==', true)
    .where('expoPushToken', '!=', null);

  const itAgentsSnapshot = await itAgentsQuery.get();
  const messagesToSend = [];

  if (itAgentsSnapshot.empty) {
    console.log('No clocked-in IT agents with push tokens to notify for Jey-AI escalation.');
    return null;
  }

  const notificationTitle = `Jey a Escaladé un Ticket !`;
  // Use 'categorie' here for the ticket category
  const notificationBody = `Le ticket "${afterData.categorie || 'inconnu'}" de ${afterData.userName || 'un utilisateur'} a été escaladé par Jey. Il nécessite une intervention humaine.`;

  for (const doc of itAgentsSnapshot.docs) {
    const agentData = doc.data();
    const agentPushToken = agentData.expoPushToken;

    if (agentPushToken && Expo.isExpoPushToken(agentPushToken)) {
      messagesToSend.push({
        to: agentPushToken,
        sound: CUSTOM_SOUND_NAME,
        title: notificationTitle,
        body: notificationBody,
        data: {
          type: 'ticket_escalated_by_jey',
          ticketId: ticketId,
          link: `elitereply://app/ticket/${ticketId}`
        },
        android: {
          channelId: ANDROID_NOTIFICATION_CHANNEL_ID,
        },
      });
      console.log(`Prepared notification for agent ${doc.id} regarding Jey escalation.`);
    } else {
      console.warn(`Invalid or missing Expo Push Token for agent ${doc.id} for escalation notification.`);
    }
  }

  if (messagesToSend.length === 0) {
    console.log('No valid push tokens found among clocked-in IT agents to send Jey-AI escalation notification.');
    return null;
  }

  console.log(`Attempting to send ${messagesToSend.length} Jey-AI escalation notifications to agents.`);
  let chunks = expo.chunkPushNotifications(messagesToSend);
  let tickets = [];

  for (let chunk of chunks) {
    try {
      let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log('Successfully sent Expo push notification chunk for Jey-AI escalation. Ticket response:', ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error('Error sending Expo push notification chunk for Jey-AI escalation:', error);
      if (error.details) {
        console.error('Expo push error details:', error.details);
      }
    }
  }

  console.log('*** notifyEscalatedTicketToAgents Function End ***');
  return null;
});
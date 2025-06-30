// functions/index.js

// Import Firebase Functions and Admin SDK
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

// Correct v2 imports for Cloud Function triggers
const { onDocumentCreated } = require('firebase-functions/v2/firestore');

// Import Expo Server SDK
const { Expo } = require('expo-server-sdk');

// Initialize Firebase Admin SDK
initializeApp();

// Initialize Expo SDK
const expo = new Expo();

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

  const db = getFirestore();
  const ticketDocRef = db.collection('tickets').doc(ticketId);
  const ticketDoc = await ticketDocRef.get();

  if (!ticketDoc.exists) {
    console.log(`Ticket ${ticketId} does not exist. Cannot send notification.`);
    return null;
  }
  const ticketData = ticketDoc.data();

  let recipientUid = null;
  let senderDisplayName = messageData.nomExpediteur || 'EliteReply'; // Default to sender's name from message

  // Determine the actual recipient based on ticket participants and sender
  if (messageData.expediteurId === ticketData.userId) {
    // Message from the client. Notify the agent (if assigned).
    if (ticketData.assignedTo && ticketData.assignedTo !== 'jey-ai') {
      recipientUid = ticketData.assignedTo;
      senderDisplayName = ticketData.userName || 'Un Client'; // Use client's name for agent's notification
      console.log(`Message from client (${messageData.expediteurId}). Target: Agent (${recipientUid}).`);
    } else {
      // Client sent a message, but no human agent assigned. No push notification.
      console.log('Client sent message, but no human agent assigned (or Jey is handling). No push notification.');
      return null;
    }
  } else if (messageData.expediteurId === ticketData.assignedTo || messageData.expediteurId === 'jey-ai') {
    // Message from the agent or Jey. Notify the client.
    recipientUid = ticketData.userId;
    senderDisplayName = (messageData.expediteurId === 'jey-ai') ? 'Jey' : (ticketData.assignedToName || 'Un Agent'); // Use Jey or assigned agent's name for client's notification
    console.log(`Message from agent/Jey (${messageData.expediteurId}). Target: Client (${recipientUid}).`);
  } else {
    console.log(`Unrecognized sender ${messageData.expediteurId}. No notification sent.`);
    return null;
  }

  // Ensure recipientUid is not null and is different from the sender to prevent self-notification
  if (!recipientUid || recipientUid === messageData.expediteurId) {
      console.log(`Recipient is null or is the sender itself (${recipientUid}). Skipping notification.`);
      return null;
  }

  // Get the recipient's Expo Push Token
  const recipientUserDoc = await db.collection('users').doc(recipientUid).get();
  if (!recipientUserDoc.exists || !recipientUserDoc.data().expoPushToken) {
    console.log(`Recipient user ${recipientUid} not found or has no Expo Push Token.`);
    return null;
  }
  const expoPushToken = recipientUserDoc.data().expoPushToken;
  const recipientName = recipientUserDoc.data().name || 'User';

  // Validate the Expo push token format
  if (!Expo.isExpoPushToken(expoPushToken)) {
    console.error(`Push token "${expoPushToken}" for user ${recipientUid} is not a valid Expo push token format.`);
    // Optionally, remove invalid token from Firestore if it's consistently bad
    // await db.collection('users').doc(recipientUid).update({ expoPushToken: admin.firestore.FieldValue.delete() });
    return null;
  }

  const notificationTitle = `Nouveau message de ${senderDisplayName}`;
  const notificationBody = messageData.texte.length > 150 ? `${messageData.texte.substring(0, 147)}...` : messageData.texte;

  const messagesToSend = [{
    to: expoPushToken,
    sound: 'default', // Play default notification sound
    title: notificationTitle,
    body: notificationBody,
    data: {
      type: 'message',
      ticketId: ticketId,
      // Construct a deep link URL for navigation on tap
      link: `elitereply://app/conversation/${ticketId}`
    },
    // _displayInForeground: true, // This is a client-side Expo property, not for the backend payload
  }];

  try {
    console.log(`Sending notification to ${recipientName} (${recipientUid}) with token: ${expoPushToken}`);
    console.log('Payload:', JSON.stringify(messagesToSend[0], null, 2));

    // Send the notifications in chunks using expo-server-sdk
    let chunks = expo.chunkPushNotifications(messagesToSend);
    let tickets = []; // Array to hold the tickets (receipts) from Expo

    for (let chunk of chunks) {
      try {
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        console.log('Successfully sent Expo push notification chunk. Ticket response:', ticketChunk);
        tickets.push(...ticketChunk);
      } catch (error) {
        console.error('Error sending Expo push notification chunk:', error);
        // Log full error details for debugging
        if (error.details) {
          console.error('Expo push error details:', error.details);
        }
      }
    }
    console.log('*** onNewMessage Function End ***');
    return null; // Important: Cloud Functions should return null or a Promise
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

  const db = getFirestore();
  const usersSnapshot = await db.collection('users').get();
  const messages = [];

  for (const doc of usersSnapshot.docs) { // Use for...of for async operations if needed, or forEach with caution
    const userData = doc.data();
    const userId = doc.id;
    const expoPushToken = userData.expoPushToken;

    // Check if token exists, is valid Expo token, and user hasn't completed the survey
    if (expoPushToken && Expo.isExpoPushToken(expoPushToken) && !(surveyData.completedByUsers && surveyData.completedByUsers.includes(userId))) {
      messages.push({
        to: expoPushToken,
        sound: 'default',
        title: 'Nouvelle Enquête Disponible !',
        body: surveyData.title || 'Donnez votre avis et gagnez un coupon !',
        data: {
          type: 'survey',
          surveyId: surveyId,
          link: `elitereply://app/survey/${surveyId}` // Correct deep link format
        },
        // _displayInForeground: true, // This is a client-side Expo property
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
  const tickets = [];

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
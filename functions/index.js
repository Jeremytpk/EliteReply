// functions/index.js

// Import Firebase Functions and Admin SDK
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const admin = require('firebase-admin');
const functions = require('firebase-functions');

// Correct v2 imports for Cloud Function triggers
const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const { onRequest } = require('firebase-functions/v2/https');

// Import Expo Server SDK
const { Expo } = require('expo-server-sdk');

// Import Stripe - initialize it inside the function to access environment variables properly
const stripePackage = require('stripe');

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

  return tickets;
});

// --- Stripe Payment Processing Function ---
exports.createPaymentIntent = onRequest({
  cors: {
    origin: [
      'http://localhost:19000',
      'http://localhost:8081',
      /https:\/\/.*\.web\.app$/,
      /https:\/\/.*\.firebaseapp\.com$/
    ],
    methods: ['POST', 'OPTIONS']
  }
}, async (request, response) => {
  console.log('*** createPaymentIntent Triggered ***');
  
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  // Initialize Stripe with secret key from environment variables
  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY not set in Firebase Functions config');
    return response.status(500).json({ 
      error: 'Stripe configuration error',
      details: 'Payment service not properly configured'
    });
  }
  
  const stripe = stripePackage(stripeSecretKey);

  try {
    const { amount, currency = 'usd', userId, description, orderData, cardDetails, billingDetails, partnerId } = request.body;

    // Validate required parameters
    if (!amount || isNaN(amount) || amount <= 0) {
      console.error('Invalid amount provided:', amount);
      return response.status(400).json({ 
        error: 'Invalid amount. Amount must be a positive number greater than 0.' 
      });
    }

    if (!userId || typeof userId !== 'string') {
      console.error('Invalid userId provided:', userId);
      return response.status(400).json({ 
        error: 'Valid User ID is required' 
      });
    }

    // Validate amount (minimum $0.50 for Stripe)
    if (amount < 50) {
      console.error('Amount below minimum:', amount);
      return response.status(400).json({ 
        error: 'Amount must be at least $0.50 (50 cents)' 
      });
    }

    // Validate currency
    const supportedCurrencies = ['usd', 'eur', 'gbp', 'cad', 'aud'];
    if (!supportedCurrencies.includes(currency.toLowerCase())) {
      console.error('Unsupported currency:', currency);
      return response.status(400).json({ 
        error: `Unsupported currency: ${currency}. Supported currencies: ${supportedCurrencies.join(', ')}` 
      });
    }

    // SECURITY: Never accept raw card details on server
    // Reject any requests that contain raw card data
    if (cardDetails && (cardDetails.number || cardDetails.cvc)) {
      console.error('Security violation: Raw card data sent to server');
      return response.status(400).json({
        error: 'Security error: Card data must be tokenized on client side',
        details: 'Please use Stripe React Native SDK to create payment methods securely'
      });
    }

    // If payment method ID is provided (secure token from client)
    if (request.body.paymentMethodId) {
      console.log('Processing payment with secure payment method token');
      
      const { paymentMethodId } = request.body;

      // Create and confirm payment intent with existing payment method
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Amount in cents
        currency: currency.toLowerCase(),
        description: description || 'EliteReply Payment',
        payment_method: paymentMethodId,
        confirmation_method: 'manual',
        confirm: true,
        return_url: 'https://elitereply-bd74d.web.app/return', // Your app's return URL
        metadata: {
          userId: userId,
          orderData: orderData ? JSON.stringify(orderData) : null,
          source: 'elitereply-firebase-functions'
        },
      });

      console.log('Payment intent created and confirmed:', {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount
      });

      // Store payment in Firestore
      await db.collection('payments').doc(paymentIntent.id).set({
        paymentIntentId: paymentIntent.id,
        paymentMethodId: paymentMethodId,
        userId: userId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        description: description || 'EliteReply Payment',
        orderData: orderData || null,
        trackingStatus: 'pending', // Initialize tracking status
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('Payment stored in Firestore');

      return response.json({
        success: true,
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        clientSecret: paymentIntent.client_secret
      });
    } else {
      // Create payment intent for client-side confirmation (secure flow)
      console.log('Creating payment intent for client-side confirmation:', {
        amount,
        currency: currency.toLowerCase(),
        userId,
        description: description || 'EliteReply Payment'
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Amount in cents
        currency: currency.toLowerCase(),
        description: description || 'EliteReply Payment',
        metadata: {
          userId: userId,
          partnerId: partnerId || null,
          orderData: orderData ? JSON.stringify(orderData) : null,
          source: 'elitereply-firebase-functions'
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Log payment intent creation
      console.log('Payment intent created successfully:', {
        id: paymentIntent.id,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status
      });

      // Store payment intent in Firestore
      await db.collection('payments').doc(paymentIntent.id).set({
        paymentIntentId: paymentIntent.id,
        userId: userId,
        partnerId: partnerId || null,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        status: paymentIntent.status,
        description: description || 'EliteReply Payment',
        orderData: orderData || null,
        trackingStatus: 'pending', // Initialize tracking status
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log('Payment intent stored in Firestore');

      return response.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    }

  } catch (error) {
    console.error('Error creating payment intent:', {
      message: error.message,
      type: error.type,
      code: error.code,
      statusCode: error.statusCode,
      stack: error.stack
    });
    
    // Handle specific Stripe errors
    if (error.type === 'StripeCardError') {
      return response.status(402).json({
        error: 'Card error',
        details: error.message
      });
    }
    
    if (error.type === 'StripeInvalidRequestError') {
      return response.status(400).json({
        error: 'Invalid request to Stripe',
        details: error.message
      });
    }
    
    if (error.type === 'StripeAPIError') {
      return response.status(500).json({
        error: 'Stripe API error',
        details: 'Payment service temporarily unavailable'
      });
    }
    
    if (error.type === 'StripeConnectionError') {
      return response.status(503).json({
        error: 'Connection error',
        details: 'Unable to connect to payment service'
      });
    }
    
    if (error.type === 'StripeAuthenticationError') {
      return response.status(401).json({
        error: 'Authentication error',
        details: 'Payment service configuration error'
      });
    }
    
    // Generic error response
    return response.status(500).json({
      error: 'Failed to create payment intent',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
});

// --- Stripe Webhook Handler ---
exports.stripeWebhook = onRequest({
  cors: false, // Disable CORS for webhooks
}, async (request, response) => {
  console.log('*** Stripe Webhook Triggered ***');
  
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY environment variable is not set');
    return response.status(500).json({ 
      error: 'Stripe configuration error',
      details: 'Payment service not properly configured'
    });
  }
  
  const stripe = stripePackage(stripeSecretKey);
  const sig = request.get('stripe-signature');
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      request.rawBody, 
      sig, 
      process.env.STRIPE_WEBHOOK_SECRET || 'whsec_1234567890abcdefghijklmnopqrstuvwxyz'
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return response.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object;
        console.log('PaymentIntent succeeded:', paymentIntent.id);
        
        // Update payment status in Firestore
        await db.collection('payments').doc(paymentIntent.id).update({
          status: 'succeeded',
          succeededAt: admin.firestore.FieldValue.serverTimestamp(),
          amount_received: paymentIntent.amount_received,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Auto-generate and send receipt
        try {
          console.log('🧾 Auto-generating receipt for payment:', paymentIntent.id);
          
          const userId = paymentIntent.metadata?.userId;
          const partnerId = paymentIntent.metadata?.partnerId;
          const orderData = paymentIntent.metadata?.orderData ? 
            JSON.parse(paymentIntent.metadata.orderData) : null;

          if (userId) {
            // Generate receipt data
            const receiptNumber = generateReceiptNumber();
            
            // Get client information
            const clientDoc = await db.collection('users').doc(userId).get();
            const clientData = clientDoc.exists ? clientDoc.data() : {};

            // Get partner information if partnerId exists
            let partnerData = {};
            if (partnerId) {
              const partnerDoc = await db.collection('partners').doc(partnerId).get();
              partnerData = partnerDoc.exists ? partnerDoc.data() : {};
            }

            const receiptData = {
              receiptNumber,
              clientInfo: {
                userId,
                name: clientData.name || clientData.displayName || 'Valued Customer',
                email: clientData.email || clientData.emailAddress
              },
              partnerInfo: {
                partnerId: partnerId || 'N/A',
                name: partnerData.nom || partnerData.name || 'EliteReply Partner',
                email: partnerData.email,
                phone: partnerData.numeroTelephone,
                category: partnerData.categorie || partnerData.category,
                manager: partnerData.manager,
                logo: partnerData.logo
              },
              paymentDetails: {
                transactionId: paymentIntent.id,
                amount: paymentIntent.amount,
                currency: paymentIntent.currency.toUpperCase(),
                paymentMethod: paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.brand || 'Card',
                last4: paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.last4,
                description: paymentIntent.description || 'EliteReply Payment'
              },
              orderDetails: orderData,
              timestamp: new Date().toISOString()
            };

            // Save receipt to Firestore
            const receiptDoc = {
              receiptNumber,
              paymentIntentId: paymentIntent.id,
              userId,
              partnerId: partnerId || null,
              receiptData,
              emailsSent: false,
              createdAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const receiptRef = await db.collection('receipts').add(receiptDoc);

            // Send receipt emails
            try {
              const emailResult = await sendReceiptEmails(receiptData);
              
              // Update receipt with email status
              await receiptRef.update({
                emailsSent: true,
                emailResult,
                emailSentAt: admin.firestore.FieldValue.serverTimestamp()
              });

              // Add receipt info to Stripe metadata
              await stripe.paymentIntents.update(paymentIntent.id, {
                metadata: {
                  ...paymentIntent.metadata,
                  receiptNumber,
                  receiptGenerated: 'true',
                  receiptId: receiptRef.id
                }
              });

              console.log('✅ Receipt generated and sent automatically:', receiptNumber);
            } catch (emailError) {
              console.error('❌ Error sending receipt emails:', emailError);
              await receiptRef.update({
                emailsSent: false,
                emailError: emailError.message,
                emailErrorAt: admin.firestore.FieldValue.serverTimestamp()
              });
            }
          } else {
            console.warn('⚠️ No userId in payment metadata, skipping receipt generation');
          }
        } catch (receiptError) {
          console.error('❌ Error auto-generating receipt:', receiptError);
        }
        break;
        
      case 'payment_intent.payment_failed':
        const failedPayment = event.data.object;
        console.log('PaymentIntent failed:', failedPayment.id);
        
        // Update payment status in Firestore
        await db.collection('payments').doc(failedPayment.id).update({
          status: 'failed',
          failedAt: admin.firestore.FieldValue.serverTimestamp(),
          last_payment_error: failedPayment.last_payment_error,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        break;
        
      case 'payment_intent.requires_action':
        const actionRequired = event.data.object;
        console.log('PaymentIntent requires action:', actionRequired.id);
        
        await db.collection('payments').doc(actionRequired.id).update({
          status: 'requires_action',
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        break;
        
      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    response.json({ received: true });
  } catch (error) {
    console.error('Error handling webhook:', error);
    response.status(500).json({ error: 'Webhook handler failed' });
  }
});

// --- Confirm Payment Function ---
exports.confirmPayment = onRequest({
  cors: {
    origin: [
      'http://localhost:19000',
      'http://localhost:8081',
      /https:\/\/.*\.web\.app$/,
      /https:\/\/.*\.firebaseapp\.com$/
    ],
    methods: ['POST', 'OPTIONS']
  }
}, async (request, response) => {
  console.log('*** confirmPayment Triggered ***');
  
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  
  if (!stripeSecretKey) {
    console.error('STRIPE_SECRET_KEY not set in Firebase Functions config');
    return response.status(500).json({ 
      error: 'Stripe configuration error',
      details: 'Payment service not properly configured'
    });
  }
  
  const stripe = stripePackage(stripeSecretKey);

  try {
    const { paymentIntentId, userId } = request.body;

    if (!paymentIntentId || !userId) {
      return response.status(400).json({ 
        error: 'Missing required fields: paymentIntentId, userId' 
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment intent belongs to the user
    if (paymentIntent.metadata.userId !== userId) {
      return response.status(403).json({ 
        error: 'Unauthorized access to payment intent' 
      });
    }

    // Update payment record in Firestore
    await db.collection('payments').doc(paymentIntentId).update({
      status: paymentIntent.status,
      paymentMethod: paymentIntent.payment_method,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeResponse: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount_received: paymentIntent.amount_received,
        charges: paymentIntent.charges?.data?.[0] ? {
          id: paymentIntent.charges.data[0].id,
          payment_method_details: paymentIntent.charges.data[0].payment_method_details
        } : null
      }
    });

    return response.json({
      success: true,
      paymentIntent: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      }
    });

  } catch (error) {
    console.error('Error confirming payment:', error);
    return response.status(500).json({ 
      error: 'Failed to confirm payment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// --- PayPal Payment Processing Function ---
exports.processPayPalPayment = onRequest({
  cors: {
    origin: [
      'http://localhost:19000',
      'http://localhost:8081',
      /https:\/\/.*\.web\.app$/,
      /https:\/\/.*\.firebaseapp\.com$/
    ],
    methods: ['POST', 'OPTIONS']
  }
}, async (request, response) => {
  console.log('*** processPayPalPayment Triggered ***');
  
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { paymentId, payerId, amount, currency, description, userId, orderData } = request.body;

    // Validate required fields
    if (!paymentId || !payerId || !amount || !userId) {
      return response.status(400).json({ 
        error: 'Missing required fields: paymentId, payerId, amount, userId' 
      });
    }

    // Create payment record in Firestore
    const paymentRecord = {
      paypalPaymentId: paymentId,
      paypalPayerId: payerId,
      userId: userId,
      amount: Math.round(amount * 100), // Convert to cents for consistency
      currency: currency || 'USD',
      description: description || 'EliteReply PayPal Payment',
      status: 'completed',
      paymentMethod: 'paypal',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      orderData: orderData || null,
      paypalResponse: {
        paymentId: paymentId,
        payerId: payerId,
        processedAt: new Date().toISOString()
      }
    };

    const docRef = await db.collection('payments').add(paymentRecord);

    return response.json({
      success: true,
      paymentId: paymentId,
      payerId: payerId,
      amount: amount,
      currency: currency,
      status: 'completed',
      firebaseDocId: docRef.id
    });

  } catch (error) {
    console.error('Error processing PayPal payment:', error);
    return response.status(500).json({ 
      error: 'Failed to process PayPal payment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// --- Receipt Generation and Email System ---
const nodemailer = require('nodemailer');

// Email transporter configuration
const createEmailTransporter = () => {
  return nodemailer.createTransporter({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
};

// Generate HTML receipt template
const generateReceiptHTML = (receiptData) => {
  const {
    receiptNumber,
    clientInfo,
    partnerInfo,
    paymentDetails,
    orderDetails,
    timestamp
  } = receiptData;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>EliteReply Payment Receipt</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .receipt-container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .header h1 { margin: 0; font-size: 28px; }
        .header p { margin: 5px 0 0 0; opacity: 0.9; }
        .content { padding: 30px; }
        .section { margin-bottom: 25px; }
        .section h2 { color: #333; font-size: 18px; margin-bottom: 10px; border-bottom: 2px solid #e0e0e0; padding-bottom: 5px; }
        .info-row { display: flex; justify-content: space-between; margin-bottom: 8px; }
        .info-label { font-weight: 600; color: #555; }
        .info-value { color: #333; }
        .total-section { background: #f8f9fa; padding: 20px; border-radius: 6px; margin-top: 20px; }
        .total-amount { font-size: 24px; font-weight: bold; color: #28a745; text-align: center; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; color: #666; font-size: 14px; }
        .partner-logo { max-width: 80px; max-height: 80px; border-radius: 6px; }
        @media (max-width: 600px) { .receipt-container { margin: 10px; } .content { padding: 20px; } }
    </style>
</head>
<body>
    <div class="receipt-container">
        <div class="header">
            <h1>EliteReply</h1>
            <p>Payment Receipt</p>
        </div>
        
        <div class="content">
            <div class="section">
                <h2>Receipt Information</h2>
                <div class="info-row">
                    <span class="info-label">Receipt Number:</span>
                    <span class="info-value">${receiptNumber}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Date & Time:</span>
                    <span class="info-value">${new Date(timestamp).toLocaleString('en-US', {
                      year: 'numeric', month: 'long', day: 'numeric',
                      hour: '2-digit', minute: '2-digit', timeZoneName: 'short'
                    })}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Status:</span>
                    <span class="info-value" style="color: #28a745; font-weight: bold;">✅ PAID</span>
                </div>
            </div>

            <div class="section">
                <h2>Client Information</h2>
                <div class="info-row">
                    <span class="info-label">Name:</span>
                    <span class="info-value">${clientInfo.name || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Email:</span>
                    <span class="info-value">${clientInfo.email || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">User ID:</span>
                    <span class="info-value">${clientInfo.userId}</span>
                </div>
            </div>

            <div class="section">
                <h2>Partner Information</h2>
                ${partnerInfo.logo ? `<div style="margin-bottom: 10px;"><img src="${partnerInfo.logo}" alt="Partner Logo" class="partner-logo"></div>` : ''}
                <div class="info-row">
                    <span class="info-label">Partner Name:</span>
                    <span class="info-value">${partnerInfo.name || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Contact Email:</span>
                    <span class="info-value">${partnerInfo.email || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Phone:</span>
                    <span class="info-value">${partnerInfo.phone || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Category:</span>
                    <span class="info-value">${partnerInfo.category || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Manager:</span>
                    <span class="info-value">${partnerInfo.manager || 'N/A'}</span>
                </div>
            </div>

            <div class="section">
                <h2>Payment Details</h2>
                <div class="info-row">
                    <span class="info-label">Payment Method:</span>
                    <span class="info-value">${paymentDetails.paymentMethod} •••• ${paymentDetails.last4 || 'N/A'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Transaction ID:</span>
                    <span class="info-value">${paymentDetails.transactionId}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Description:</span>
                    <span class="info-value">${paymentDetails.description}</span>
                </div>
            </div>

            ${orderDetails ? `
            <div class="section">
                <h2>Order Details</h2>
                <div class="info-row">
                    <span class="info-label">Service:</span>
                    <span class="info-value">${orderDetails.service || 'EliteReply Service'}</span>
                </div>
                ${orderDetails.description ? `
                <div class="info-row">
                    <span class="info-label">Description:</span>
                    <span class="info-value">${orderDetails.description}</span>
                </div>
                ` : ''}
            </div>
            ` : ''}

            <div class="total-section">
                <div class="total-amount">
                    Total: $${(paymentDetails.amount / 100).toFixed(2)} USD
                </div>
            </div>
        </div>
        
        <div class="footer">
            <p>Thank you for choosing EliteReply!</p>
            <p>This is an automated receipt. For questions, contact jeremytopaka@gmail.com</p>
            <p style="margin-top: 10px; font-size: 12px;">EliteReply © ${new Date().getFullYear()} - Professional Service Platform</p>
        </div>
    </div>
</body>
</html>
  `;
};

// Send receipt emails to all parties
const sendReceiptEmails = async (receiptData) => {
  const transporter = createEmailTransporter();
  const receiptHTML = generateReceiptHTML(receiptData);
  const { clientInfo, partnerInfo } = receiptData;

  const emailPromises = [];
  
  // Email to client
  if (clientInfo.email) {
    emailPromises.push(
      transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: clientInfo.email,
        subject: `EliteReply Payment Receipt - ${receiptData.receiptNumber}`,
        html: receiptHTML,
        attachments: []
      })
    );
  }

  // Email to partner
  if (partnerInfo.email) {
    emailPromises.push(
      transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: partnerInfo.email,
        subject: `New Payment Received - EliteReply Receipt ${receiptData.receiptNumber}`,
        html: receiptHTML,
        attachments: []
      })
    );
  }

  // Email to admin (you)
  emailPromises.push(
    transporter.sendMail({
      from: process.env.EMAIL_FROM,
      to: 'jeremytopaka@gmail.com',
      subject: `Payment Notification - EliteReply Receipt ${receiptData.receiptNumber}`,
      html: receiptHTML,
      attachments: []
    })
  );

  // Send all emails
  try {
    await Promise.all(emailPromises);
    console.log('✅ Receipt emails sent successfully to all parties');
    return { success: true, emailsSent: emailPromises.length };
  } catch (error) {
    console.error('❌ Error sending receipt emails:', error);
    throw error;
  }
};

// Generate receipt number
const generateReceiptNumber = () => {
  const date = new Date();
  const year = date.getFullYear().toString().slice(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const time = Date.now().toString().slice(-4);
  return `ER${year}${month}${day}${time}`;
};

// Main receipt generation function
exports.generateAndSendReceipt = onRequest({
  cors: { origin: true, methods: ['POST'] }
}, async (request, response) => {
  console.log('*** generateAndSendReceipt Triggered ***');
  
  try {
    const { 
      paymentIntentId, 
      userId, 
      partnerId, 
      orderDetails 
    } = request.body;

    if (!paymentIntentId || !userId) {
      return response.status(400).json({
        error: 'Missing required fields: paymentIntentId, userId'
      });
    }

    // Get Stripe payment details
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    const stripe = stripePackage(stripeSecretKey);
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    // Get client information from Firestore
    const clientDoc = await db.collection('users').doc(userId).get();
    const clientData = clientDoc.exists ? clientDoc.data() : {};

    // Get partner information from Firestore
    let partnerData = {};
    if (partnerId) {
      const partnerDoc = await db.collection('partners').doc(partnerId).get();
      partnerData = partnerDoc.exists ? partnerDoc.data() : {};
    }

    // Generate receipt data
    const receiptNumber = generateReceiptNumber();
    const receiptData = {
      receiptNumber,
      clientInfo: {
        userId,
        name: clientData.name || clientData.displayName || 'Valued Customer',
        email: clientData.email || clientData.emailAddress
      },
      partnerInfo: {
        partnerId: partnerId || 'N/A',
        name: partnerData.nom || partnerData.name || 'EliteReply Partner',
        email: partnerData.email,
        phone: partnerData.numeroTelephone,
        category: partnerData.categorie || partnerData.category,
        manager: partnerData.manager,
        logo: partnerData.logo
      },
      paymentDetails: {
        transactionId: paymentIntentId,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency.toUpperCase(),
        paymentMethod: paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.brand || 'Card',
        last4: paymentIntent.charges?.data?.[0]?.payment_method_details?.card?.last4,
        description: paymentIntent.description || 'EliteReply Payment'
      },
      orderDetails,
      timestamp: new Date().toISOString()
    };

    // Save receipt to Firestore
    const receiptDoc = {
      receiptNumber,
      paymentIntentId,
      userId,
      partnerId: partnerId || null,
      receiptData,
      emailsSent: false,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    };

    const receiptRef = await db.collection('receipts').add(receiptDoc);

    // Send receipt emails
    try {
      const emailResult = await sendReceiptEmails(receiptData);
      
      // Update receipt with email status
      await receiptRef.update({
        emailsSent: true,
        emailResult,
        emailSentAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Add receipt info to Stripe metadata
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          ...paymentIntent.metadata,
          receiptNumber,
          receiptGenerated: 'true',
          receiptId: receiptRef.id
        }
      });

      return response.json({
        success: true,
        receiptNumber,
        receiptId: receiptRef.id,
        emailsSent: emailResult.emailsSent,
        message: 'Receipt generated and sent successfully'
      });

    } catch (emailError) {
      console.error('Error sending emails:', emailError);
      
      // Update receipt with email error
      await receiptRef.update({
        emailsSent: false,
        emailError: emailError.message,
        emailErrorAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return response.json({
        success: true,
        receiptNumber,
        receiptId: receiptRef.id,
        emailsSent: 0,
        emailError: emailError.message,
        message: 'Receipt generated but email sending failed'
      });
    }

  } catch (error) {
    console.error('Error generating receipt:', error);
    return response.status(500).json({
      error: 'Failed to generate receipt',
      details: error.message
    });
  }
});

// --- Test Email Function ---
exports.testReceiptEmail = onRequest({
  cors: { origin: true, methods: ['POST'] }
}, async (request, response) => {
  console.log('*** testReceiptEmail Triggered ***');
  
  try {
    // Sample receipt data for testing
    const testReceiptData = {
      receiptNumber: 'ER251003-TEST',
      clientInfo: {
        userId: 'test_user_123',
        name: 'Test Customer',
        email: 'jeremytopaka@gmail.com' // Using your email for testing
      },
      partnerInfo: {
        partnerId: 'test_partner_456',
        name: 'Test Partner Service',
        email: 'jeremytopaka@gmail.com', // Using your email for testing
        phone: '+1-555-123-4567',
        category: 'Technology',
        manager: 'Test Manager'
      },
      paymentDetails: {
        transactionId: 'pi_test_12345_receipt_test',
        amount: 2500, // $25.00
        currency: 'USD',
        paymentMethod: 'Visa',
        last4: '4242',
        description: 'EliteReply Test Payment'
      },
      orderDetails: {
        service: 'EliteReply Premium Service',
        description: 'Test service for receipt email verification'
      },
      timestamp: new Date().toISOString()
    };

    // Send test receipt emails
    const emailResult = await sendReceiptEmails(testReceiptData);
    
    return response.json({
      success: true,
      message: 'Test receipt emails sent successfully',
      emailsSent: emailResult.emailsSent,
      receiptData: testReceiptData
    });

  } catch (error) {
    console.error('Error sending test receipt email:', error);
    return response.status(500).json({
      error: 'Failed to send test receipt email',
      details: error.message
    });
  }
});

// --- OpenAI Proxy for Jey (secure backend) ---
// Load .env for local testing/emulator. In production Cloud Functions use environment variables or Secret Manager.
try {
  // eslint-disable-next-line global-require
  const dotenv = require('dotenv');
  dotenv.config();
  console.log('functions: dotenv loaded for local env');
} catch (e) {
  // ignore if dotenv not installed in production
}

// ----------------------------------------------------------------------
// *** START OF CRITICAL FIXES FOR OPENAI LIBRARY SYNTAX ***
// ----------------------------------------------------------------------
// 1. UPDATED IMPORT: Use only the top-level 'OpenAI' class for modern library versions
const { OpenAI } = require('openai');

// Utility: simple exponential backoff
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const callOpenAIWithRetries = async (openai, payload, { retries = 3, minDelay = 500 } = {}) => {
  let attempt = 0;
  while (attempt < retries) {
    try {
      // 2. UPDATED API CALL: Use the modern SDK function structure
      const resp = await openai.chat.completions.create(payload);
      return resp; // The modern SDK returns the response object, not resp.data
    } catch (err) {
      attempt++;
      const isRetryable = !err.response || err.response.status >= 500 || err.response.status === 429;
      console.error(`OpenAI chat.completions.create failed (attempt ${attempt}):`, err.message || err);
      if (!isRetryable || attempt >= retries) throw err;
      await delay(minDelay * Math.pow(2, attempt));
    }
  }
};

// Simple per-user rate limit: max 30 requests per 60 seconds
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;

exports.jeyProxy = onRequest({
  cors: {
    origin: [
      'http://localhost:19000',
      'http://localhost:8081',
      /https:\/\/.*\.web\.app$/,
      /https:\/\/.*\.firebaseapp\.com$/
    ],
    methods: ['POST', 'OPTIONS']
  },
  secrets: ["OPENAI_API_KEY"] // CRITICAL CONFIG FIX: Binding the secret
}, async (req, res) => {
  console.log('*** jeyProxy Triggered ***');
  
  // TEMPORARY DEBUG LINE (Kept to force deploy)
  console.log('JeyProxy: Checking for updated configuration (v2.1)'); 
  
  if (req.method === 'OPTIONS') return res.status(200).send('ok');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const idToken = req.headers.authorization && req.headers.authorization.startsWith('Bearer ') ? req.headers.authorization.split('Bearer ')[1] : null;

    if (!idToken) {
      console.warn('jeyProxy: missing Authorization Bearer token');
      return res.status(401).json({ error: 'Unauthorized: Missing ID token', details: 'Missing Authorization Bearer token in request headers' });
    }

    // Verify Firebase ID token
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
      console.log('jeyProxy: verified idToken for uid=', decoded.uid);
    } catch (err) {
      console.error('jeyProxy: token verification failed:', err && err.code, err && err.message);
      // Provide the code/message to help debug token/project mismatches (safe for logs)
      return res.status(401).json({ error: 'Unauthorized: Invalid ID token', details: err && err.message, code: err && err.code });
    }

    const uid = decoded.uid;

    // Rate limiting using Firestore document per user
    const rlRef = db.collection('_internal').doc(`rate_limit_jey_${uid}`);
    const now = Date.now();
    // Rate limit transaction with a small retry loop to avoid transient transaction failures
    const MAX_RL_TRANSACTION_ATTEMPTS = 2;
    let rlAttempt = 0;
    try {
      while (rlAttempt < MAX_RL_TRANSACTION_ATTEMPTS) {
        try {
          await db.runTransaction(async (tx) => {
            const snap = await tx.get(rlRef);
            if (!snap.exists) {
              tx.set(rlRef, { windowStart: now, count: 1 });
            } else {
              const data = snap.data();
              if (now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
                tx.set(rlRef, { windowStart: now, count: 1 });
              } else {
                if ((data.count || 0) >= RATE_LIMIT_MAX) {
                  // Use HttpsError so caller can detect resource-exhausted
                  throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded');
                }
                tx.update(rlRef, { count: (data.count || 0) + 1 });
              }
            }
          });
          // success - break the retry loop
          break;
        } catch (innerErr) {
          rlAttempt++;
          // If it's a resource-exhausted HttpsError, rethrow immediately
          if (innerErr && innerErr.code === 'resource-exhausted') {
            throw innerErr;
          }
          console.warn(`jeyProxy: rate-limit transaction attempt ${rlAttempt} failed:`, innerErr && innerErr.message);
          if (rlAttempt >= MAX_RL_TRANSACTION_ATTEMPTS) {
            // rethrow so outer catch handles it
            throw innerErr;
          }
          // small backoff before retry
          await delay(200);
        }
      }
    } catch (rlErr) {
      if (rlErr && rlErr.code === 'resource-exhausted') {
        console.log('jeyProxy: user exceeded rate limit');
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      console.error('jeyProxy: Rate limit transaction error:', rlErr && (rlErr.stack || rlErr.message || rlErr));
      return res.status(500).json({ error: 'Rate limit check failed', details: rlErr && (rlErr.message || String(rlErr)) });
    }

    const { messages, max_tokens = 250, temperature = 0.7, systemPrompt } = req.body;
    if (!messages || !Array.isArray(messages)) return res.status(400).json({ error: 'Invalid messages array' });

    let openaiKey = process.env.OPENAI_API_KEY; // Reads the bound secret first
    let openaiKeySource = 'env (Secret)';
    
    // Fallback logic kept for legacy config or other scenarios
    if (!openaiKey) {
      try {
        const cfg = functions.config && functions.config();
        if (cfg && cfg.openai) {
          // Check for all possible legacy config names
          openaiKey = cfg.openai.api_key || cfg.openai.apikey || cfg.openai.key || null; 
          openaiKeySource = 'functions.config (legacy)';
        }
      } catch (e) {
        console.warn('jeyProxy: functions.config() not available or failed', e && e.message);
      }
    }

    if (!openaiKey) {
      console.error('jeyProxy: OpenAI API key not found in env (Secret) or functions.config (Legacy)');
      // Allow a guarded dev fallback for local testing
      const isEmulator = !!process.env.FIREBASE_AUTH_EMULATOR_HOST || !!process.env.FIREBASE_FIRESTORE_EMULATOR_HOST;
      const allowDev = process.env.JEY_ALLOW_DEV_FALLBACK === '1';
      if (isEmulator || allowDev) {
        console.log('jeyProxy: returning guarded development response for Jey (emulator or JEY_ALLOW_DEV_FALLBACK=1)');
        return res.json({ success: true, data: {
          id: 'dev-fake-response',
          object: 'chat.completion',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'Bonjour, je suis Jey (mode développement). Voici une réponse de test.' }, finish_reason: 'stop' }
          ],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 }
        }});
      }
      return res.status(500).json({ error: 'OpenAI API key not configured on functions environment' });
    }
    console.log(`jeyProxy: using OpenAI key from ${openaiKeySource}`);

    // 3. UPDATED INITIALIZATION: Use the modern OpenAI constructor directly
    const openai = new OpenAI({ apiKey: openaiKey });

    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'system', content: systemPrompt || 'You are Jey, assistant for EliteReply. Speak French.' }, ...messages],
      max_tokens,
      temperature
    };

    // The function call now uses the corrected callOpenAIWithRetries, which uses the modern API method.
    const openaiResp = await callOpenAIWithRetries(openai, payload, { retries: 3, minDelay: 500 });

    // Return the full model response object (trim large fields)
    return res.json({ success: true, data: openaiResp });
  } catch (error) {
    console.error('jeyProxy error:', error);
    if (error instanceof functions.https.HttpsError) {
      return res.status(429).json({ error: error.message });
    }
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});
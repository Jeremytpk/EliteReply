const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const stripe = require('stripe');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Initialize Stripe with secret key
const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// Initialize Firebase Admin
const serviceAccount = require(process.env.FIREBASE_PRIVATE_KEY_PATH);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID
});

const db = admin.firestore();

// Security middleware
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:19000'],
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Middleware for parsing JSON (except for webhooks)
app.use((req, res, next) => {
  if (req.originalUrl === '/api/webhooks/stripe') {
    next();
  } else {
    express.json()(req, res, next);
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Create Payment Intent endpoint
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount, currency = 'usd', description, userId, orderData } = req.body;

    // Validate required fields
    if (!amount || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: amount, userId' 
      });
    }

    // Validate amount (minimum $0.50 for Stripe)
    if (amount < 50) {
      return res.status(400).json({ 
        error: 'Amount must be at least $0.50 USD' 
      });
    }

    // Verify user exists in Firebase
    try {
      await admin.auth().getUser(userId);
    } catch (error) {
      return res.status(400).json({ 
        error: 'Invalid user ID' 
      });
    }

    // Create payment intent
    const paymentIntent = await stripeClient.paymentIntents.create({
      amount: Math.round(amount), // Amount in cents
      currency: currency.toLowerCase(),
      description: description || 'EliteReply Payment',
      metadata: {
        userId: userId,
        orderData: orderData ? JSON.stringify(orderData) : null,
        source: 'elitereply-app'
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // Log payment intent creation
    await db.collection('payment_intents').add({
      paymentIntentId: paymentIntent.id,
      userId: userId,
      amount: amount,
      currency: currency,
      status: 'created',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      orderData: orderData || null
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id
    });

  } catch (error) {
    console.error('Error creating payment intent:', error);
    res.status(500).json({ 
      error: 'Failed to create payment intent',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Confirm Payment endpoint
app.post('/api/confirm-payment', async (req, res) => {
  try {
    const { paymentIntentId, userId } = req.body;

    if (!paymentIntentId || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentIntentId, userId' 
      });
    }

    // Retrieve payment intent from Stripe
    const paymentIntent = await stripeClient.paymentIntents.retrieve(paymentIntentId);

    // Verify the payment intent belongs to the user
    if (paymentIntent.metadata.userId !== userId) {
      return res.status(403).json({ 
        error: 'Unauthorized access to payment intent' 
      });
    }

    // Update payment record in Firebase
    const paymentRecord = {
      paymentIntentId: paymentIntent.id,
      userId: userId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
      paymentMethod: paymentIntent.payment_method,
      confirmedAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeResponse: {
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount_received: paymentIntent.amount_received,
        charges: paymentIntent.charges?.data?.[0] ? {
          id: paymentIntent.charges.data[0].id,
          payment_method_details: paymentIntent.charges.data[0].payment_method_details
        } : null
      }
    };

    await db.collection('payments').add(paymentRecord);

    res.json({
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
    res.status(500).json({ 
      error: 'Failed to confirm payment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PayPal Payment Processing endpoint
app.post('/api/process-paypal-payment', async (req, res) => {
  try {
    const { paymentId, payerId, amount, currency, description, userId, orderData } = req.body;

    // Validate required fields
    if (!paymentId || !payerId || !amount || !userId) {
      return res.status(400).json({ 
        error: 'Missing required fields: paymentId, payerId, amount, userId' 
      });
    }

    // Verify user exists in Firebase
    try {
      await admin.auth().getUser(userId);
    } catch (error) {
      return res.status(400).json({ 
        error: 'Invalid user ID' 
      });
    }

    // Create payment record in Firebase
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
      orderData: orderData || null,
      paypalResponse: {
        paymentId: paymentId,
        payerId: payerId,
        processedAt: new Date().toISOString()
      }
    };

    const docRef = await db.collection('payments').add(paymentRecord);

    res.json({
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
    res.status(500).json({ 
      error: 'Failed to process PayPal payment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Stripe Webhook endpoint
app.post('/api/webhooks/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    event = stripeClient.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log('PaymentIntent succeeded:', paymentIntent.id);
      
      // Update payment status in Firebase
      try {
        const paymentsRef = db.collection('payments');
        const query = paymentsRef.where('paymentIntentId', '==', paymentIntent.id);
        const snapshot = await query.get();
        
        if (!snapshot.empty) {
          const docRef = snapshot.docs[0].ref;
          await docRef.update({
            status: 'succeeded',
            succeededAt: admin.firestore.FieldValue.serverTimestamp(),
            amount_received: paymentIntent.amount_received
          });
        }
      } catch (error) {
        console.error('Error updating payment status:', error);
      }
      break;
      
    case 'payment_intent.payment_failed':
      const failedPayment = event.data.object;
      console.log('PaymentIntent failed:', failedPayment.id);
      
      // Update payment status in Firebase
      try {
        const paymentsRef = db.collection('payments');
        const query = paymentsRef.where('paymentIntentId', '==', failedPayment.id);
        const snapshot = await query.get();
        
        if (!snapshot.empty) {
          const docRef = snapshot.docs[0].ref;
          await docRef.update({
            status: 'failed',
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            last_payment_error: failedPayment.last_payment_error
          });
        }
      } catch (error) {
        console.error('Error updating failed payment status:', error);
      }
      break;
      
    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  res.json({received: true});
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 EliteReply Backend Server running on port ${port}`);
  console.log(`📡 Health check: http://localhost:${port}/health`);
  console.log(`📱 Network access: http://172.20.9.254:${port}/health`);
  console.log(`💳 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;

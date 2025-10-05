import { getStripeConfig, createPaymentIntent } from '../config/stripe';

class StripeService {
  constructor() {
    this.config = getStripeConfig();
  }

  // Validate card number using Luhn algorithm
  validateCardNumber(cardNumber) {
    const cleaned = cardNumber.replace(/\s+/g, '');
    if (!/^\d{13,19}$/.test(cleaned)) return false;

    let sum = 0;
    let shouldDouble = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned.charAt(i), 10);

      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      shouldDouble = !shouldDouble;
    }

    return sum % 10 === 0;
  }

  // Validate expiry date
  validateExpiryDate(month, year) {
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    
    const expYear = parseInt(year, 10);
    const expMonth = parseInt(month, 10);

    if (expMonth < 1 || expMonth > 12) return false;
    if (expYear < currentYear || (expYear === currentYear && expMonth < currentMonth)) return false;

    return true;
  }

  // Validate CVV
  validateCVV(cvv) {
    return /^\d{3,4}$/.test(cvv);
  }

  // Get card type from card number
  getCardType(cardNumber) {
    const cleaned = cardNumber.replace(/\s+/g, '');
    
    if (/^4/.test(cleaned)) return 'visa';
    if (/^5[1-5]/.test(cleaned)) return 'mastercard';
    if (/^3[47]/.test(cleaned)) return 'amex';
    if (/^6(?:011|5)/.test(cleaned)) return 'discover';
    
    return 'unknown';
  }

  // Create payment intent on backend
  async createPaymentIntent(amount, currency = 'usd', description, userId, orderInfo = {}) {
    try {
      // Use the centralized createPaymentIntent function
      return await createPaymentIntent(amount, currency, description, userId, orderInfo);
    } catch (error) {
      console.error('Error creating payment intent:', error);
      throw new Error('Impossible de créer l\'intention de paiement. Vérifiez votre connexion.');
    }
  }

  // Process real payment with Stripe
  async processCardPayment(cardData, amount, orderInfo) {
    try {
      // Validate card data
      if (!this.validateCardNumber(cardData.cardNumber)) {
        throw new Error('Numéro de carte invalide');
      }

      if (!this.validateExpiryDate(cardData.expiryMonth, cardData.expiryYear)) {
        throw new Error('Date d\'expiration invalide');
      }

      if (!this.validateCVV(cardData.cvv)) {
        throw new Error('CVV invalide');
      }

      console.log('Processing real payment:', {
        amount,
        cardType: this.getCardType(cardData.cardNumber),
        last4: cardData.cardNumber.slice(-4),
        orderInfo
      });

      // Get current user
      const { auth } = require('../firebase');
      const user = auth.currentUser;
      if (!user) {
        throw new Error('User must be authenticated to process payment');
      }

      // Create payment intent
      const paymentIntent = await this.createPaymentIntent(
        amount, 
        'usd', 
        orderInfo.description || 'EliteReply Payment',
        user.uid,
        orderInfo
      );

      // Return payment intent for client-side confirmation
      const paymentResult = {
        success: true,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: amount * 100, // Amount in cents
        currency: 'usd',
        status: paymentIntent.status,
        cardLast4: cardData.cardNumber.slice(-4),
        cardType: this.getCardType(cardData.cardNumber),
        processedAt: new Date().toISOString()
      };

      return paymentResult;

    } catch (error) {
      console.error('Stripe payment error:', error);
      throw new Error(error.message || 'Erreur lors du traitement du paiement');
    }
  }

  // Create a payment method for future use
  async createPaymentMethod(cardData) {
    try {
      // In a real implementation, you would create a payment method with Stripe
      const paymentMethod = {
        id: `pm_${Date.now()}`,
        type: 'card',
        card: {
          last4: cardData.cardNumber.slice(-4),
          brand: this.getCardType(cardData.cardNumber),
          exp_month: parseInt(cardData.expiryMonth, 10),
          exp_year: parseInt(cardData.expiryYear, 10),
        },
        billing_details: {
          name: cardData.cardholderName,
        },
        created: Math.floor(Date.now() / 1000)
      };

      return paymentMethod;
    } catch (error) {
      console.error('Error creating payment method:', error);
      throw error;
    }
  }

  // Handle payment errors
  formatPaymentError(error) {
    if (error.code) {
      switch (error.code) {
        case 'card_declined':
          return 'Votre carte a été refusée. Veuillez utiliser une autre carte.';
        case 'insufficient_funds':
          return 'Fonds insuffisants. Veuillez vérifier votre solde.';
        case 'expired_card':
          return 'Votre carte a expiré. Veuillez utiliser une carte valide.';
        case 'incorrect_cvc':
          return 'Code CVV incorrect. Veuillez vérifier et réessayer.';
        case 'processing_error':
          return 'Erreur de traitement. Veuillez réessayer plus tard.';
        case 'incorrect_number':
          return 'Numéro de carte incorrect. Veuillez vérifier et réessayer.';
        default:
          return error.message || 'Erreur de paiement inconnue.';
      }
    }
    
    return error.message || 'Erreur lors du traitement du paiement.';
  }
}

export default new StripeService();

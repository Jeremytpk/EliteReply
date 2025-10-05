// PayPal Service for backend API calls
const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3000/api' // Development server
  : 'https://your-backend-domain.com/api'; // Replace with your production domain

export const PayPalService = {
  // Process PayPal payment via backend
  processPayPalPayment: async (paymentData) => {
    try {
      console.log('🔄 Processing PayPal payment via backend...', paymentData);
      
      const response = await fetch(`${API_BASE_URL}/process-paypal-payment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(paymentData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('✅ PayPal payment processed via backend:', data);
      
      return data;
      
    } catch (error) {
      console.error('❌ Error processing PayPal payment via backend:', error);
      throw new Error(`Failed to process PayPal payment: ${error.message}`);
    }
  }
};

export default PayPalService;

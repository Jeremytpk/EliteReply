# EliteReply Order Tracking System

## Overview
The EliteReply Order Tracking System provides comprehensive order tracking functionality for both clients and partners, allowing real-time status updates and management of order fulfillment.

## Components

### OrderTracking Component (`components/OrderTracking.js`)
A React Native component that provides animated order tracking with real-time status updates.

**Features:**
- 4 tracking stages: Pending → Processing → Shipped → Delivered
- Animated progress indicators with smooth transitions
- Real-time Firestore synchronization
- Partner update capabilities
- French localization
- Professional UI with colored status indicators

**Usage:**
```jsx
<OrderTracking 
  paymentId="payment_id_here"
  initialStatus="pending"
  isPartner={true|false}
  onStatusUpdate={(newStatus) => console.log('Status updated:', newStatus)}
/>
```

**Props:**
- `paymentId`: String - The ID of the payment document to track
- `initialStatus`: String - Initial tracking status (pending, processing, shipped, delivered)
- `isPartner`: Boolean - Whether the user has partner permissions to update status
- `onStatusUpdate`: Function - Callback function called when status is updated

## Screens

### PartnerPayments (`screens/PartnerPayments.js`)
Partner-focused payment management screen with order tracking capabilities.

**Features:**
- View all payments related to the partner
- Detailed payment receipt modal (same as OnlinePaid but with partner functionality)
- Order tracking management with status update permissions
- Real-time payment synchronization
- Professional receipt generation with partner details

### OnlinePaid (`screens/OnlinePaid.js`)
Enhanced with order tracking integration for client payment management.

**New Features:**
- Order tracking section in payment detail modal
- Client view of order status (read-only)
- Real-time status updates

### ClientReceipts (`screens/ClientReceipts.js`)
Client receipt management enhanced with order tracking.

**New Features:**
- Order tracking section in receipt detail modal
- Client view of their order status
- Real-time status monitoring

## Database Schema

### Payments Collection
Each payment document now includes:
```javascript
{
  paymentIntentId: "pi_xxxxx",
  userId: "user_id",
  partnerId: "partner_id", // Optional
  amount: 2000, // In cents
  currency: "usd",
  status: "succeeded",
  description: "Service EliteReply",
  trackingStatus: "pending", // New field: pending, processing, shipped, delivered
  createdAt: FirebaseTimestamp,
  updatedAt: FirebaseTimestamp
}
```

## Navigation Integration

### AdminScreen
Added "Paiements Partenaires" button to access partner payment management.

### App Navigation
Added `PartnerPayments` screen to the main navigation stack.

## Firebase Functions
Updated payment creation functions to initialize `trackingStatus` as 'pending' by default.

**Modified Functions:**
- `createPaymentIntent`
- `createPaymentIntentWithPartner`

## Real-time Updates
The system uses Firestore real-time listeners to provide instant updates across all connected clients when order status changes.

## Status Flow
1. **Pending** - Order received, awaiting processing
2. **Processing** - Order is being prepared/processed
3. **Shipped** - Order has been shipped/sent
4. **Delivered** - Order has been completed/delivered

## Permissions
- **Clients**: Can view their order status (read-only)
- **Partners**: Can view and update order status for their payments
- **Admins**: Can access all payment tracking through admin interface

## Styling
- Consistent with EliteReply design system
- French localization throughout
- Animated progress indicators
- Professional color scheme matching app branding
- Responsive design for various screen sizes

## Usage Examples

### For Clients
1. Access receipts through `ClientReceipts` screen
2. View order tracking in receipt detail modal
3. Real-time status updates without refresh

### For Partners
1. Access payments through `PartnerPayments` screen from Admin dashboard
2. View detailed payment information
3. Update order status using OrderTracking component
4. Manage multiple orders with real-time synchronization

### For Admins
1. Access through AdminScreen → "Paiements Partenaires"
2. Overview of all partner payments
3. Tracking management capabilities

## Technical Implementation
- React Native with Expo
- Firebase Firestore for real-time data
- React Native Animated API for smooth transitions
- French localization with proper currency formatting
- Professional receipt-style UI components

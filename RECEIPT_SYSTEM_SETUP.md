# EliteReply Receipt System Setup Guide

## Gmail App Password Setup

### Step 1: Enable 2-Factor Authentication
1. Go to your Google Account settings: https://myaccount.google.com/
2. Navigate to Security → 2-Step Verification
3. Enable 2-Step Verification if not already enabled

### Step 2: Generate App Password
1. Go to Security → 2-Step Verification → App passwords
2. Select "Mail" and "Other (custom name)"
3. Enter "EliteReply Functions" as the name
4. Copy the generated 16-character password (e.g., "abcd efgh ijkl mnop")

### Step 3: Update Firebase Functions Environment
Update the `.env` file in the `functions/` directory:

```bash
# Email Configuration (Gmail SMTP)
EMAIL_USER=jeremytopaka@gmail.com
EMAIL_PASS=your_16_character_app_password_here
EMAIL_FROM=EliteReply <jeremytopaka@gmail.com>
```

Replace `your_16_character_app_password_here` with the App Password from Step 2.

### Step 4: Redeploy Functions
```bash
cd functions
firebase deploy --only functions
```

## Receipt System Features

### ✅ What's Implemented:

1. **Automatic Receipt Generation**: When a payment succeeds, a receipt is automatically generated
2. **Multi-Recipient Emails**: Receipts are sent to:
   - Client (customer who paid)
   - Partner (service provider)
   - Admin (jeremytopaka@gmail.com)
3. **Professional HTML Receipts**: Beautiful, responsive email templates
4. **Stripe Integration**: Payment details and receipt metadata added to Stripe
5. **Database Storage**: All receipts stored in Firestore for record keeping

### 📋 Receipt Information Includes:

- **Receipt Number**: Unique identifier (e.g., ER251003-1234)
- **Client Information**: Name, email, user ID
- **Partner Information**: Name, email, phone, category, manager, logo
- **Payment Details**: Transaction ID, amount, currency, payment method, last 4 digits
- **Order Details**: Service description and additional information
- **Timestamp**: Complete date and time of payment

### 🔧 How to Use:

1. **Automatic Mode**: Receipts are automatically generated when payments succeed via Stripe webhook
2. **Manual Mode**: Call the `generateAndSendReceipt` function directly with payment details

### 📧 Email Template Features:

- Responsive design that works on mobile and desktop
- Professional EliteReply branding
- Color-coded sections for easy reading
- Partner logo display (if available)
- Payment status indicators
- Complete transaction details

## Testing the System

After setting up the Gmail App Password and redeploying:

1. Make a test payment through your app
2. Check that the payment succeeds
3. Verify receipt emails are sent to all parties
4. Check Firestore for receipt records
5. Verify Stripe payment intent has receipt metadata

## Troubleshooting

- **Emails not sending**: Check Gmail App Password and EMAIL_PASS in .env
- **Missing partner info**: Ensure partnerId is passed in payment creation
- **Receipt not generating**: Check Firebase Functions logs for errors
- **Email formatting issues**: Verify HTML template renders correctly

## Important Notes

- Gmail has daily sending limits (500 emails/day for personal accounts)
- App Passwords are more secure than regular passwords
- All receipt data is stored in Firestore for audit trails
- Receipt numbers are unique and sequential
- The system handles missing client/partner information gracefully

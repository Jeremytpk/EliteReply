# 🔐 Security Guide for EliteReply

## API Keys & Secrets Management

### ⚠️ NEVER COMMIT THESE TO GIT:
- Stripe API keys (live or test)
- OpenAI API keys
- Firebase service account keys
- Database passwords
- Email passwords

### ✅ Secure Storage Methods:

#### 1. Environment Variables (Recommended)
```bash
# Use environment variables for all sensitive data
export STRIPE_SECRET_KEY="your_actual_key_here"
export OPENAI_API_KEY="your_actual_key_here"
```

#### 2. Local Environment Files
```bash
# Copy template and fill with real values
cp .env.example .env.local
# Edit .env.local with your actual keys (already in .gitignore)
```

#### 3. Firebase Functions Environment
```bash
# Set environment variables in Firebase Functions
firebase functions:config:set stripe.secret_key="your_key_here"
firebase functions:config:set openai.api_key="your_key_here"
```

### 🛡️ Security Best Practices:

1. **Rotate Keys Regularly**: Change API keys every 90 days
2. **Use Test Keys in Development**: Never use live keys during development
3. **Restrict Key Permissions**: Limit API key scopes to minimum required
4. **Monitor Usage**: Check API key usage logs regularly
5. **Enable Alerts**: Set up alerts for unusual API activity

### 🚨 If Keys Are Compromised:

1. **Immediate Actions**:
   - Revoke compromised keys immediately
   - Generate new keys
   - Update all environments
   - Review access logs

2. **Prevention**:
   - Use `.gitignore` to exclude sensitive files
   - Enable GitHub secret scanning
   - Use environment-specific configurations
   - Regular security audits

### 📋 Environment Setup Checklist:

- [ ] `.env.local` is in `.gitignore`
- [ ] No hardcoded API keys in source code
- [ ] Firebase Functions use environment config
- [ ] Test keys used in development
- [ ] Live keys used only in production
- [ ] Keys have minimum required permissions
- [ ] Regular security reviews scheduled

### 🔍 Monitoring & Alerts:

- GitHub Secret Scanning: Enabled
- Stripe Dashboard: Monitor for unusual activity
- OpenAI Usage: Track API consumption
- Firebase Security Rules: Regularly reviewed

## Contact

For security concerns or questions, contact the development team.

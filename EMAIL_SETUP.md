# Email Verification Setup Guide

This guide will help you set up the email verification system for FamilyHub.

## Quick Setup

### Option 1: Gmail (Easiest for Development)

1. **Enable 2-Step Verification** on your Google Account:
   - Go to https://myaccount.google.com/security
   - Enable 2-Step Verification if not already enabled

2. **Generate an App Password**:
   - Go to https://myaccount.google.com/apppasswords
   - Select "Mail" and "Other (Custom name)"
   - Enter "FamilyHub" as the name
   - Copy the generated 16-character password

3. **Create `.env` file** in the project root:
   ```env
   PORT=3000
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-email@gmail.com
   SMTP_PASS=your-16-character-app-password
   ```

4. **Start the server**:
   ```bash
   npm start
   ```

### Option 2: SendGrid (Recommended for Production)

1. **Sign up for SendGrid**: https://sendgrid.com (free tier available)

2. **Create an API Key**:
   - Go to Settings > API Keys
   - Create a new API key with "Mail Send" permissions
   - Copy the API key

3. **Update `server.js`** to use SendGrid:
   ```javascript
   const sgMail = require('@sendgrid/mail');
   sgMail.setApiKey(process.env.SENDGRID_API_KEY);
   
   // In send-verification endpoint:
   await sgMail.send({
     to: email,
     from: process.env.SMTP_USER,
     subject: 'FamilyHub - Email Verification Code',
     html: mailOptions.html,
     text: mailOptions.text
   });
   ```

4. **Create `.env` file**:
   ```env
   PORT=3000
   SENDGRID_API_KEY=your-sendgrid-api-key
   SMTP_USER=your-verified-sender-email@example.com
   ```

5. **Install SendGrid package**:
   ```bash
   npm install @sendgrid/mail
   ```

### Option 3: Mailgun

1. **Sign up for Mailgun**: https://www.mailgun.com (free tier available)

2. **Get your API credentials** from the Mailgun dashboard

3. **Update `server.js`** to use Mailgun API

4. **Create `.env` file**:
   ```env
   PORT=3000
   MAILGUN_API_KEY=your-mailgun-api-key
   MAILGUN_DOMAIN=your-mailgun-domain
   ```

## Testing Email Configuration

1. Start the server: `npm start`
2. You should see: "FamilyHub server running on http://localhost:3000"
3. If there's an error about SMTP credentials, check your `.env` file

## Troubleshooting

### "Invalid login" or "Authentication failed"
- **Gmail**: Make sure you're using an App Password, not your regular password
- **Gmail**: Ensure 2-Step Verification is enabled
- Check that `SMTP_USER` and `SMTP_PASS` are correct in `.env`

### "Connection timeout"
- Check your firewall settings
- Verify SMTP_HOST and SMTP_PORT are correct
- For Gmail, try port 465 with `secure: true` in server.js

### "Email not received"
- Check spam/junk folder
- Verify the email address is correct
- Check server logs for errors
- For Gmail, ensure "Less secure app access" is enabled (if using regular password) or use App Password

### "Module not found: dotenv"
- Run: `npm install` to install dependencies

## Security Notes

- **Never commit `.env` file** to version control
- Use App Passwords for Gmail instead of regular passwords
- For production, use dedicated email services (SendGrid, Mailgun, AWS SES)
- Rotate API keys and passwords regularly
- Consider implementing rate limiting to prevent abuse

## Production Recommendations

1. Use a dedicated email service (SendGrid, Mailgun, AWS SES)
2. Set up SPF, DKIM, and DMARC records for better deliverability
3. Implement email sending queues (Bull, RabbitMQ)
4. Add rate limiting per IP/email
5. Monitor email delivery rates and bounce rates
6. Set up email templates for better branding
7. Add email verification expiration reminders



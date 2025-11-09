# Vercel Deployment Guide

## Environment Variables Required

When deploying to Vercel, you'll need to set the following environment variables in your Vercel project settings:

### Required Variables

1. **SMTP_USER** ⚠️ **REQUIRED**
   - Your email address (e.g., `your-email@gmail.com`)
   - Used for sending verification emails
   - Example: `your-email@gmail.com`

2. **SMTP_PASS** ⚠️ **REQUIRED**
   - Your email password or app password
   - For Gmail: Use an App Password (not your regular password)
   - See [EMAIL_SETUP.md](./EMAIL_SETUP.md) for details
   - Example: `abcd efgh ijkl mnop` (Gmail App Password)

### Optional Variables (with defaults)

3. **SMTP_HOST**
   - Default: `smtp.gmail.com`
   - SMTP server hostname
   - Other options: `smtp.sendgrid.net`, `smtp.mailgun.org`, etc.
   - Only set if not using Gmail

4. **SMTP_PORT**
   - Default: `587`
   - SMTP server port
   - Common values: `587` (TLS), `465` (SSL), `25` (unencrypted)
   - Only set if not using default Gmail port

## How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Name**: `SMTP_USER`
   - **Value**: Your email address
   - **Environment**: Production, Preview, Development (select all)
4. Repeat for `SMTP_PASS`, `SMTP_HOST`, and `SMTP_PORT` if needed

## Important Notes for Vercel Deployment

### Option 1: Deploy Backend as Serverless Functions (Recommended)

Vercel works best with serverless functions. You'll need to:

1. **Convert Express routes to Vercel serverless functions**
   - Create `api/` directory in your project root
   - Convert each route to a separate function file
   - Example: `api/send-verification.js`, `api/verify-code.js`

2. **Update API_URL in auth.js**
   - Change from `http://localhost:3000/api` to your Vercel deployment URL
   - Or use a relative path: `/api/send-verification`

3. **Create `vercel.json`** configuration:
   ```json
   {
     "version": 2,
     "builds": [
       {
         "src": "server.js",
         "use": "@vercel/node"
       }
     ],
     "routes": [
       {
         "src": "/api/(.*)",
         "dest": "/api/$1"
       },
       {
         "src": "/(.*)",
         "dest": "/$1"
       }
     ]
   }
   ```

### Option 2: Deploy Backend Separately

Deploy the Express server to a different platform:
- **Railway**: Easy Node.js deployment
- **Render**: Free tier available
- **Heroku**: Traditional PaaS
- **Fly.io**: Global edge deployment

Then update `API_URL` in `auth.js` to point to your backend URL.

## Quick Setup Steps

1. **Install Vercel CLI** (if not already installed):
   ```bash
   npm i -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Deploy**:
   ```bash
   vercel
   ```

4. **Set environment variables**:
   ```bash
   vercel env add SMTP_USER
   vercel env add SMTP_PASS
   vercel env add SMTP_HOST
   vercel env add SMTP_PORT
   ```

5. **Update auth.js** to use your Vercel URL:
   ```javascript
   const API_URL = process.env.NODE_ENV === 'production' 
     ? 'https://your-app.vercel.app/api'
     : 'http://localhost:3000/api';
   ```

## Example Environment Variables for Different Email Services

### Gmail
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
```

### SendGrid
```
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=your-sendgrid-api-key
```

### Mailgun
```
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@your-domain.mailgun.org
SMTP_PASS=your-mailgun-password
```

## Troubleshooting

### Email not sending
- Verify all environment variables are set correctly
- Check Vercel function logs for errors
- Ensure SMTP credentials are correct
- Test with a simple email service first (Gmail App Password)

### CORS errors
- Make sure CORS is enabled in your serverless functions
- Add your Vercel frontend URL to allowed origins

### API connection errors
- Verify `API_URL` in `auth.js` matches your Vercel deployment URL
- Check that serverless functions are deployed correctly
- Review Vercel function logs in the dashboard

## Security Best Practices

1. **Never commit `.env` files** - Vercel handles this automatically
2. **Use App Passwords** for Gmail instead of regular passwords
3. **Rotate credentials regularly**
4. **Use environment-specific variables** (Production vs Preview)
5. **Enable Vercel's environment variable encryption**


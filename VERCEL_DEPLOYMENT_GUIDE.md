# Complete Vercel Deployment Guide for FamilyHub

This is a comprehensive step-by-step guide to deploy FamilyHub to Vercel successfully.

---

## 📋 Prerequisites

Before you begin, ensure you have:
- ✅ A GitHub account
- ✅ A Vercel account (free tier works perfectly)
- ✅ A Gmail account (for email verification)
- ✅ Node.js installed locally (for testing)

---

## Step 1: Prepare Gmail for Email Sending

### 1.1 Enable 2-Step Verification
1. Go to https://myaccount.google.com/security
2. Scroll to "2-Step Verification"
3. Click "Get Started" and follow the prompts
4. Complete the setup process

### 1.2 Generate App Password
1. Go to https://myaccount.google.com/apppasswords
   - If you don't see this link, make sure 2-Step Verification is enabled first
2. Under "Select app", choose "Mail"
3. Under "Select device", choose "Other (Custom name)"
4. Type: `FamilyHub`
5. Click "Generate"
6. **IMPORTANT**: Copy the 16-character password (format: `abcd efgh ijkl mnop`)
   - ⚠️ You won't be able to see this again!
   - Save it in a secure place temporarily

---

## Step 2: Prepare Your Code for GitHub

### 2.1 Initialize Git Repository
Open terminal in your FamilyHub folder and run:

```bash
# Navigate to your project
cd /path/to/FamilyHub

# Initialize git (if not already done)
git init

# Add all files
git add .

# Create initial commit
git commit -m "Initial commit - FamilyHub ready for Vercel deployment"
```

### 2.2 Create GitHub Repository
1. Go to https://github.com/new
2. Repository name: `FamilyHub` (or your preferred name)
3. Description: "Personal planning and study companion"
4. Choose **Public** or **Private**
5. **DO NOT** check:
   - ❌ Add a README file
   - ❌ Add .gitignore
   - ❌ Choose a license
6. Click "Create repository"

### 2.3 Push Code to GitHub
```bash
# Add remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/FamilyHub.git

# Rename branch to main
git branch -M main

# Push code
git push -u origin main
```

---

## Step 3: Deploy to Vercel

### 3.1 Sign Up / Login to Vercel
1. Go to https://vercel.com
2. Click "Sign Up" (or "Log In" if you have an account)
3. Choose **"Continue with GitHub"** (recommended - easiest integration)
4. Authorize Vercel to access your GitHub account

### 3.2 Import Your Project
1. In Vercel dashboard, click **"Add New..."** → **"Project"**
2. You should see your GitHub repositories
3. Find **"FamilyHub"** and click **"Import"**

### 3.3 Configure Project Settings
Vercel should auto-detect most settings. Verify these:

- **Framework Preset**: `Other` (or leave blank)
- **Root Directory**: `./` (root of repository)
- **Build Command**: Leave **empty** (no build needed)
- **Output Directory**: Leave **empty**
- **Install Command**: `npm install` (default)

### 3.4 ⚠️ CRITICAL: Set Environment Variables

**DO THIS BEFORE CLICKING DEPLOY!**

In the "Environment Variables" section:

#### Add Variable 1: SMTP_USER
1. Click **"Add"** button
2. **Name**: `SMTP_USER`
3. **Value**: Your Gmail address (e.g., `yourname@gmail.com`)
4. **Environment**: Check all three:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
5. Click **"Save"**

#### Add Variable 2: SMTP_PASS
1. Click **"Add"** button again
2. **Name**: `SMTP_PASS`
3. **Value**: Your 16-character Gmail App Password (from Step 1.2)
   - Format: `abcd efgh ijkl mnop` (with or without spaces)
4. **Environment**: Check all three:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
5. Click **"Save"**

#### Add Variable 3: GEMINI_API_KEY
1. Click **"Add"** button again
2. **Name**: `GEMINI_API_KEY`
3. **Value**: Your Google AI Studio API key (starts with `AIza...`)
4. **Environment**: Check all three:
   - ✅ Production
   - ✅ Preview
   - ✅ Development
5. Click **"Save"**
6. (Optional) Add another variable named `GEMINI_MODEL` if you want to use a custom Gemini model (default: `models/gemini-2.5-flash`)

#### Optional Variables (Only if NOT using Gmail)
If using a different email service:

**SMTP_HOST**:
- Name: `SMTP_HOST`
- Value: `smtp.gmail.com` (or your provider's SMTP server)
- Environment: All

**SMTP_PORT**:
- Name: `SMTP_PORT`
- Value: `587`
- Environment: All

### 3.5 Deploy!
1. Review all settings
2. Click the big **"Deploy"** button
3. Wait 1-2 minutes for deployment
4. You'll see a success message with your deployment URL!

---

## Step 4: Verify Your Deployment

### 4.1 Get Your Deployment URL
After deployment completes, you'll see:
- **Production URL**: `https://familyhub-xxxxx.vercel.app`
- Or your custom domain if configured

### 4.2 Test the Application
1. Open your deployment URL in a browser
2. You should see the FamilyHub login page
3. Test signup:
   - Click "Sign up"
   - Enter:
     - Username: `testuser`
     - Email: Your email address
     - Password: `test123456`
   - Click "Send Verification Code"
   - **Check your email** for the verification code
   - Enter the code and complete signup
   - You should be redirected to the dashboard

### 4.3 Test All Features
- ✅ Create tasks in Day Planner
- ✅ Use the Study Chatbot
- ✅ Search for nutrition information
- ✅ Logout and login again

### 4.4 Check Function Logs
1. In Vercel dashboard → Your project
2. Click **"Functions"** tab
3. Click on `api/send-verification` or `api/verify-code`
4. View logs to see if there are any errors

---

## Step 5: Troubleshooting

### Problem: "Email service not configured" Error

**Symptoms**: Error message when trying to send verification code

**Solution**:
1. Go to Vercel Dashboard → Your Project → **Settings** → **Environment Variables**
2. Verify `SMTP_USER` and `SMTP_PASS` are both set
3. Make sure they're enabled for **Production** environment
4. Go to **Deployments** tab
5. Click **"..."** on the latest deployment → **"Redeploy"**
6. Wait for redeployment to complete

### Problem: "Failed to send verification email"

**Symptoms**: Network error or email sending fails

**Solution**:
1. **Check Vercel Function Logs**:
   - Dashboard → Functions → `api/send-verification` → View logs
   - Look for error messages
2. **Verify Gmail App Password**:
   - Make sure you're using the App Password, not your regular password
   - Verify 2-Step Verification is enabled
   - Try generating a new App Password
3. **Check Environment Variables**:
   - Ensure `SMTP_USER` is your full email address
   - Ensure `SMTP_PASS` is the 16-character App Password (no spaces needed)

### Problem: "Verification code not found"

**Symptoms**: Code verification fails even with correct code

**Explanation**: 
- Serverless functions use separate instances
- In-memory storage doesn't persist across different function invocations
- This is a known limitation

**Workaround**:
- Use the verification code **immediately** after receiving the email
- If it fails, click "Resend Code" and use the new code right away
- The code should work if both requests hit the same function instance

**Future Solution**: 
- Implement Vercel KV (key-value store) for persistent storage
- Or use an external database (MongoDB, PostgreSQL, etc.)

### Problem: CORS Errors

**Symptoms**: Browser console shows CORS errors

**Solution**:
- The serverless functions already have CORS enabled
- If issues persist, check browser console for specific error
- Verify your frontend URL matches the deployment URL

### Problem: 404 Errors on API Calls

**Symptoms**: API calls return 404 Not Found

**Solution**:
1. Verify `vercel.json` exists in project root
2. Check that `api/` folder contains:
   - `send-verification.js`
   - `verify-code.js`
   - `health.js`
3. Verify routes in `vercel.json` are correct
4. Redeploy the project

### Problem: Site Shows "404 Not Found"

**Symptoms**: Main page doesn't load

**Solution**:
1. Check that `index.html` exists in root directory
2. Verify `vercel.json` routing configuration
3. Check deployment logs for errors
4. Try accessing: `https://your-app.vercel.app/index.html` directly

---

## Step 6: Enable Automatic Deployments

### 6.1 Verify Git Integration
1. Go to Project → **Settings** → **Git**
2. Should show your GitHub repository
3. If not connected, click "Connect Git Repository"

### 6.2 Automatic Deployments
Now configured! Every time you:
- **Push to `main` branch**: Auto-deploys to production
- **Create a Pull Request**: Creates a preview deployment
- **Push to other branches**: Creates a preview deployment

---

## Step 7: Monitor Your Deployment

### 7.1 View Deployment History
- Dashboard → **Deployments** tab
- See all deployments with status and timestamps

### 7.2 View Function Logs
- Dashboard → **Functions** tab
- Click any function to see real-time logs
- Useful for debugging

### 7.3 Check Analytics
- Dashboard → **Analytics** tab
- View traffic, function invocations, and performance

---

## Environment Variables Quick Reference

For your reference, here's what you need:

```
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-app-password
GEMINI_API_KEY=AIza-your-gemini-key
# Optional override:
# GEMINI_MODEL=models/gemini-2.5-flash
```

Optional (only if not using Gmail):
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
```

---

## Post-Deployment Checklist

After deployment, verify everything works:

- [ ] Site loads at your Vercel URL
- [ ] Can navigate to signup page
- [ ] Can create a new account
- [ ] Verification email is received
- [ ] Can verify email with code
- [ ] Can login after verification
- [ ] Dashboard loads correctly
- [ ] Can create tasks in Day Planner
- [ ] Can edit and delete tasks
- [ ] Study Chatbot works
- [ ] Nutrition lookup works
- [ ] Can logout and login again
- [ ] No errors in browser console (F12)
- [ ] No errors in Vercel function logs

---

## Debugging Tips

### Enable Debug Mode
Add `?debug=true` to your URL:
```
https://your-app.vercel.app?debug=true
```
This will show detailed logs in the browser console.

### Check Browser Console
1. Open your site
2. Press `F12` (or right-click → Inspect)
3. Go to **Console** tab
4. Look for `[DEBUG]`, `[ERROR]`, or `[WARN]` messages

### Check Vercel Logs
1. Vercel Dashboard → Your Project
2. **Functions** → Click function name → **View Logs**
3. See real-time function execution logs

### Test Locally First
Before deploying, test locally:
```bash
npm install
npm start
```
Then visit `http://localhost:3000` (if using server.js) or serve the frontend separately.

---

## Next Steps (Optional Enhancements)

### 1. Add Custom Domain
1. Go to Project → **Settings** → **Domains**
2. Add your domain
3. Follow DNS configuration instructions

### 2. Add Vercel KV for Persistent Storage
- Solves the verification code storage issue
- Requires Vercel Pro plan or use free tier with limits
- See: https://vercel.com/docs/storage/vercel-kv

### 3. Add Database
- Use Supabase (free tier available)
- Or MongoDB Atlas (free tier)
- Store user data and tasks persistently

### 4. Add Error Monitoring
- Integrate Sentry for error tracking
- Get notified of production errors

### 5. Add Analytics
- Google Analytics
- Or Vercel Analytics (built-in)

---

## Quick Command Reference

```bash
# Local development
npm install
npm start

# Git commands
git add .
git commit -m "Your message"
git push origin main

# Vercel CLI (optional)
npm i -g vercel
vercel login
vercel
```

---

## Support & Resources

### Vercel Documentation
- https://vercel.com/docs

### Vercel Community
- https://github.com/vercel/vercel/discussions

### Gmail App Passwords
- https://support.google.com/accounts/answer/185833

---

## Summary

Your deployment process:
1. ✅ Prepare Gmail App Password
2. ✅ Push code to GitHub
3. ✅ Import to Vercel
4. ✅ Set environment variables (SMTP_USER, SMTP_PASS)
5. ✅ Deploy
6. ✅ Test application
7. ✅ Monitor and maintain

**🎉 Congratulations! Your FamilyHub is now live on Vercel!**

Your app URL: `https://your-app.vercel.app`

---

## Important Notes

1. **Verification Code Storage**: Currently uses in-memory storage which may not work across different serverless function instances. Use codes immediately after receiving them.

2. **Free Tier Limits**: 
   - 100GB bandwidth/month
   - 100 serverless function invocations/day
   - Unlimited deployments

3. **Environment Variables**: Never commit `.env` files to GitHub. Vercel handles this automatically.

4. **Security**: Always use App Passwords for Gmail, never your regular password.

---

**Need help?** Check the troubleshooting section or Vercel function logs for detailed error messages.



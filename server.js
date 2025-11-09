require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Store verification codes temporarily (in production, use Redis or database)
const verificationCodes = new Map();

// Email transporter configuration
// For production, use environment variables for credentials
let transporter;

try {
    // Check if email credentials are configured
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️  WARNING: SMTP credentials not configured in .env file');
        console.warn('   Email verification will not work until SMTP_USER and SMTP_PASS are set');
        console.warn('   See EMAIL_SETUP.md for configuration instructions');
    }

    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    });
} catch (error) {
    console.error('Error configuring email transporter:', error);
}

// Alternative: Use Gmail OAuth2 or other services like SendGrid
// For SendGrid, you would use:
// const sgMail = require('@sendgrid/mail');
// sgMail.setApiKey(process.env.SENDGRID_API_KEY);

// Generate verification code
function generateVerificationCode() {
    return crypto.randomInt(100000, 999999).toString();
}

// Request logging middleware (moved after express.json() middleware)
const requestLogger = (req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        const logBody = { ...req.body };
        if (logBody.password) logBody.password = '***';
        if (logBody.code) logBody.code = '***';
        console.log('Request body:', logBody);
    }
    next();
};

// Apply request logger after body parsing
app.use(requestLogger);

const usersHandler = require('./api/users');
const plannerHandler = require('./api/planner');
const workoutHandler = require('./api/workout');

function delegate(handler) {
    return (req, res) => {
        Promise.resolve(handler(req, res)).catch(error => {
            console.error('Route handler error:', error);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            }
        });
    };
}

app.all('/api/users', delegate(usersHandler));
app.all('/api/planner', delegate(plannerHandler));
app.all('/api/workout', delegate(workoutHandler));

// Send verification email
app.post('/api/send-verification', async (req, res) => {
    try {
        console.log('[API] POST /api/send-verification - Processing request');
        const { email, username } = req.body;
        console.log('[API] Request data:', { email, username });

        if (!email || !username) {
            console.error('[API] Validation failed: Missing email or username');
            return res.status(400).json({ error: 'Email and username are required' });
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            console.error('[API] Validation failed: Invalid email format', email);
            return res.status(400).json({ error: 'Invalid email format' });
        }

        // Generate verification code
        const code = generateVerificationCode();
        console.log('[API] Generated verification code for:', email);
        
        // Store code with expiration (10 minutes)
        verificationCodes.set(email, {
            code,
            username,
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
        });
        console.log('[API] Verification code stored. Total codes:', verificationCodes.size);

        // Email content
        const mailOptions = {
            from: process.env.SMTP_USER || 'noreply@familyhub.com',
            to: email,
            subject: 'FamilyHub - Email Verification Code',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #6366f1;">Welcome to FamilyHub!</h2>
                    <p>Hello ${username},</p>
                    <p>Thank you for signing up for FamilyHub. Please use the verification code below to complete your registration:</p>
                    <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
                        <h1 style="color: #6366f1; font-size: 32px; letter-spacing: 5px; margin: 0;">${code}</h1>
                    </div>
                    <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
                    <p style="color: #666; font-size: 14px;">If you didn't create an account with FamilyHub, please ignore this email.</p>
                    <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                    <p style="color: #999; font-size: 12px;">This is an automated message, please do not reply.</p>
                </div>
            `,
            text: `
                Welcome to FamilyHub!
                
                Hello ${username},
                
                Thank you for signing up for FamilyHub. Please use the verification code below to complete your registration:
                
                ${code}
                
                This code will expire in 10 minutes.
                
                If you didn't create an account with FamilyHub, please ignore this email.
            `
        };

        // Send email
        if (!transporter || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
            console.error('[API] Email service not configured');
            console.error('[API] SMTP_USER:', process.env.SMTP_USER ? 'Set' : 'Not set');
            console.error('[API] SMTP_PASS:', process.env.SMTP_PASS ? 'Set' : 'Not set');
            return res.status(503).json({ 
                error: 'Email service not configured',
                message: 'Please configure SMTP credentials in .env file. See EMAIL_SETUP.md for instructions.'
            });
        }

        console.log('[API] Sending email to:', email);
        await transporter.sendMail(mailOptions);
        console.log('[API] Email sent successfully to:', email);

        res.json({ 
            success: true, 
            message: 'Verification code sent to your email',
            expiresIn: 10 // minutes
        });

    } catch (error) {
        console.error('[API] Error sending verification email:', error);
        console.error('[API] Error stack:', error.stack);
        console.error('[API] Error details:', {
            message: error.message,
            code: error.code,
            command: error.command
        });
        res.status(500).json({ 
            error: 'Failed to send verification email',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
        });
    }
});

// Verify code
app.post('/api/verify-code', (req, res) => {
    try {
        console.log('[API] POST /api/verify-code - Processing request');
        const { email, code } = req.body;
        console.log('[API] Verification attempt for:', email, 'Code length:', code?.length);

        if (!email || !code) {
            console.error('[API] Validation failed: Missing email or code');
            return res.status(400).json({ error: 'Email and code are required' });
        }

        const storedData = verificationCodes.get(email);
        console.log('[API] Stored data found:', storedData ? 'Yes' : 'No');

        if (!storedData) {
            console.error('[API] Verification code not found for email:', email);
            console.log('[API] Available codes:', Array.from(verificationCodes.keys()));
            return res.status(400).json({ error: 'Verification code not found or expired' });
        }

        // Check expiration
        const now = Date.now();
        const expiresAt = storedData.expiresAt;
        const isExpired = now > expiresAt;
        console.log('[API] Code expiration check:', { now, expiresAt, isExpired, timeRemaining: expiresAt - now });

        if (isExpired) {
            console.error('[API] Verification code expired for:', email);
            verificationCodes.delete(email);
            return res.status(400).json({ error: 'Verification code has expired' });
        }

        // Verify code
        const codeMatch = storedData.code === code;
        console.log('[API] Code match:', codeMatch);
        
        if (!codeMatch) {
            console.error('[API] Invalid verification code for:', email);
            return res.status(400).json({ error: 'Invalid verification code' });
        }

        // Code verified - remove from storage
        verificationCodes.delete(email);
        console.log('[API] Verification successful for:', email, 'Username:', storedData.username);

        res.json({ 
            success: true, 
            message: 'Email verified successfully',
            username: storedData.username
        });

    } catch (error) {
        console.error('[API] Error verifying code:', error);
        console.error('[API] Error stack:', error.stack);
        res.status(500).json({ error: 'Failed to verify code' });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', message: 'FamilyHub API is running' });
});

// Clean up expired codes periodically
setInterval(() => {
    const now = Date.now();
    for (const [email, data] of verificationCodes.entries()) {
        if (now > data.expiresAt) {
            verificationCodes.delete(email);
        }
    }
}, 5 * 60 * 1000); // Run every 5 minutes

app.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log(`🚀 FamilyHub server running on http://localhost:${PORT}`);
    console.log('='.repeat(50));
    console.log('Environment:', process.env.NODE_ENV || 'development');
    console.log('SMTP Configuration:');
    console.log('  - SMTP_HOST:', process.env.SMTP_HOST || 'smtp.gmail.com (default)');
    console.log('  - SMTP_PORT:', process.env.SMTP_PORT || '587 (default)');
    console.log('  - SMTP_USER:', process.env.SMTP_USER ? '✅ Set' : '❌ Not set');
    console.log('  - SMTP_PASS:', process.env.SMTP_PASS ? '✅ Set' : '❌ Not set');
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('⚠️  Email verification will not work until SMTP credentials are configured');
        console.warn('   See EMAIL_SETUP.md for configuration instructions');
    }
    console.log('='.repeat(50));
});


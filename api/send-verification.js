const nodemailer = require('nodemailer');
const crypto = require('crypto');
const storage = require('./_shared-storage');

// Generate verification code
function generateVerificationCode() {
    return crypto.randomInt(100000, 999999).toString();
}

// Email transporter configuration
let transporter;

try {
    transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: {
            user: process.env.SMTP_USER || '',
            pass: process.env.SMTP_PASS || ''
        }
    });
} catch (error) {
    console.error('Error configuring email transporter:', error);
}

module.exports = async (req, res) => {
    console.log(`[${new Date().toISOString()}] [API] ${req.method} /api/send-verification`);
    
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        console.log('[API] CORS preflight request');
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        console.error('[API] Invalid method:', req.method);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('[API] Processing send-verification request');
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
        storage.set(email, {
            code,
            username,
            expiresAt: Date.now() + 10 * 60 * 1000
        });
        console.log('[API] Verification code stored. Total codes:', storage.size());

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
                message: 'Please configure SMTP credentials in environment variables.'
            });
        }

        console.log('[API] Sending email to:', email);
        await transporter.sendMail(mailOptions);
        console.log('[API] Email sent successfully to:', email);
        console.log('[API] Verification code generated:', code);

        // Return code in response for debugging (displayed on frontend)
        res.json({ 
            success: true, 
            message: 'Verification code sent to your email',
            expiresIn: 10,
            code: code // Include code for debugging display
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
};


const storage = require('./_shared-storage');

module.exports = async (req, res) => {
    console.log(`[${new Date().toISOString()}] [API] ${req.method} /api/verify-code`);
    
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
        console.log('[API] Processing verify-code request');
        const { email, code } = req.body;
        console.log('[API] Verification attempt for:', email, 'Code length:', code?.length);

        if (!email || !code) {
            console.error('[API] Validation failed: Missing email or code');
            return res.status(400).json({ error: 'Email and code are required' });
        }

        // Get stored verification data
        const storedData = storage.get(email);
        console.log('[API] Stored data found:', storedData ? 'Yes' : 'No');
        
        // Debug: Show all stored codes
        const allCodes = storage.getAll();
        console.log('[API] All stored codes:', JSON.stringify(allCodes, null, 2));

        if (!storedData) {
            console.error('[API] Verification code not found for email:', email);
            console.log('[API] Available email addresses:', storage.keys());
            console.log('[API] Storage size:', storage.size());
            console.warn('[API] This may happen if the verification request hit a different serverless function instance.');
            console.warn('[API] Solution: Use the code immediately after receiving the email, or request a new code.');
            
            return res.status(400).json({ 
                error: 'Verification code not found or expired',
                hint: 'Please use the code immediately after receiving the email. If the issue persists, click "Resend Code" to get a new one.',
                debug: process.env.NODE_ENV === 'development' ? {
                    availableEmails: storage.keys(),
                    storageSize: storage.size()
                } : undefined
            });
        }

        // Check expiration
        const now = Date.now();
        const expiresAt = storedData.expiresAt;
        const isExpired = now > expiresAt;
        console.log('[API] Code expiration check:', { now, expiresAt, isExpired, timeRemaining: expiresAt - now });

        if (isExpired) {
            console.error('[API] Verification code expired for:', email);
            storage.delete(email);
            return res.status(400).json({ error: 'Verification code has expired' });
        }

        // Verify code (trim and compare)
        const enteredCode = String(code).trim();
        const storedCode = String(storedData.code).trim();
        const codeMatch = enteredCode === storedCode;
        
        console.log('[API] Code verification:');
        console.log('[API]   Entered code:', enteredCode, '(length:', enteredCode.length, ')');
        console.log('[API]   Stored code:', storedCode, '(length:', storedCode.length, ')');
        console.log('[API]   Codes match:', codeMatch);
        
        if (!codeMatch) {
            console.error('[API] Invalid verification code for:', email);
            console.error('[API] Entered:', enteredCode, 'Expected:', storedCode);
            return res.status(400).json({ 
                error: 'Invalid verification code',
                hint: 'Please check the code and try again. Make sure there are no extra spaces.'
            });
        }

        // Code verified - remove from storage
        storage.delete(email);
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
};


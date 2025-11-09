// Shared storage for verification codes
// Uses a combination of approaches to maximize compatibility with Vercel serverless functions

// Try to use a persistent storage mechanism
// On Vercel, we'll use a module-level variable that persists within the same container
let verificationCodesStorage = null;

// Initialize storage
function initStorage() {
    if (!verificationCodesStorage) {
        // Try global first (works in Node.js)
        if (typeof global !== 'undefined') {
            if (!global.verificationCodes) {
                global.verificationCodes = new Map();
            }
            verificationCodesStorage = global.verificationCodes;
        } else {
            // Fallback to module-level Map
            verificationCodesStorage = new Map();
        }
    }
    return verificationCodesStorage;
}

// Cleanup expired codes
function cleanupExpiredCodes() {
    const storage = initStorage();
    const now = Date.now();
    const expiredEmails = [];
    
    for (const [email, data] of storage.entries()) {
        if (now > data.expiresAt) {
            expiredEmails.push(email);
        }
    }
    
    expiredEmails.forEach(email => storage.delete(email));
    
    if (expiredEmails.length > 0) {
        console.log('[STORAGE] Cleaned up', expiredEmails.length, 'expired codes');
    }
}

module.exports = {
    get: (email) => {
        const storage = initStorage();
        cleanupExpiredCodes();
        const data = storage.get(email);
        
        if (data) {
            console.log('[STORAGE] Found code for:', email, 'Expires in:', Math.round((data.expiresAt - Date.now()) / 1000), 'seconds');
        } else {
            console.log('[STORAGE] No code found for:', email);
            console.log('[STORAGE] Available emails:', Array.from(storage.keys()));
        }
        
        return data;
    },
    set: (email, data) => {
        const storage = initStorage();
        storage.set(email, data);
        console.log('[STORAGE] Stored code for:', email, 'Total codes:', storage.size);
        console.log('[STORAGE] Code expires at:', new Date(data.expiresAt).toISOString());
    },
    delete: (email) => {
        const storage = initStorage();
        storage.delete(email);
        console.log('[STORAGE] Deleted code for:', email, 'Remaining codes:', storage.size);
    },
    has: (email) => {
        const storage = initStorage();
        cleanupExpiredCodes();
        return storage.has(email);
    },
    size: () => {
        const storage = initStorage();
        return storage.size;
    },
    keys: () => {
        const storage = initStorage();
        return Array.from(storage.keys());
    },
    getAll: () => {
        const storage = initStorage();
        cleanupExpiredCodes();
        const result = {};
        for (const [email, data] of storage.entries()) {
            result[email] = {
                username: data.username,
                expiresAt: data.expiresAt,
                expiresIn: Math.round((data.expiresAt - Date.now()) / 1000)
            };
        }
        return result;
    }
};

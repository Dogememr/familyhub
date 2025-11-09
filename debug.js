// Debug utility for FamilyHub
// Enable debug mode by adding ?debug=true to URL or setting localStorage.debug = 'true'

const DEBUG_MODE = (() => {
    const urlParams = new URLSearchParams(window.location.search);
    const urlDebug = urlParams.get('debug') === 'true';
    const storageDebug = localStorage.getItem('debug') === 'true';
    return urlDebug || storageDebug || window.location.hostname === 'localhost';
})();

// Debug logger
const Debug = {
    log: (...args) => {
        if (DEBUG_MODE) {
            console.log('[DEBUG]', new Date().toISOString(), ...args);
        }
    },
    
    error: (...args) => {
        console.error('[ERROR]', new Date().toISOString(), ...args);
    },
    
    warn: (...args) => {
        console.warn('[WARN]', new Date().toISOString(), ...args);
    },
    
    info: (...args) => {
        if (DEBUG_MODE) {
            console.info('[INFO]', new Date().toISOString(), ...args);
        }
    },
    
    api: (method, url, data, response) => {
        if (DEBUG_MODE) {
            console.group(`[API] ${method} ${url}`);
            console.log('Request:', data);
            console.log('Response:', response);
            console.log('Status:', response?.status || 'N/A');
            console.groupEnd();
        }
    },
    
    storage: (action, key, value) => {
        if (DEBUG_MODE) {
            console.log(`[STORAGE] ${action}:`, key, value ? '(value hidden for security)' : '');
        }
    },
    
    auth: (action, details) => {
        if (DEBUG_MODE) {
            console.log(`[AUTH] ${action}:`, details);
        }
    }
};

// Make debug mode toggleable
if (DEBUG_MODE) {
    console.log('%c🔧 DEBUG MODE ENABLED', 'color: #10b981; font-weight: bold; font-size: 14px;');
    console.log('To disable: localStorage.setItem("debug", "false")');
    console.log('To enable: localStorage.setItem("debug", "true")');
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Debug;
}



// Auth system with localStorage and email verification
// API URL - automatically detects production vs development
const API_URL = (() => {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;
    
    // Check if running on localhost or file:// protocol (local file opening)
    if (hostname === 'localhost' || hostname === '127.0.0.1' || protocol === 'file:') {
        return 'http://localhost:3000/api';
    }
    // For Vercel (or any production deployment), use relative path
    return '/api';
})();

// Initialize Debug utility (fallback if not loaded)
if (typeof Debug === 'undefined') {
    window.Debug = {
        log: console.log.bind(console),
        error: console.error.bind(console),
        warn: console.warn.bind(console),
        info: console.info.bind(console),
        api: () => {},
        storage: () => {},
        auth: () => {}
    };
}

// Initialize auth system
function initializeAuth() {
    // Check if DOM is already loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            setupAuth();
        });
    } else {
        // DOM already loaded
        setupAuth();
    }
}

function setupAuth() {
    Debug.log('Auth system initialized');
    Debug.log('API URL:', API_URL);
    Debug.log('Current hostname:', window.location.hostname);
    Debug.log('Current protocol:', window.location.protocol);

    // Warn if using localhost API but not on localhost
    if (API_URL.includes('localhost:3000') && window.location.hostname !== 'localhost' && window.location.protocol !== 'file:') {
        Debug.warn('Using localhost API URL but not on localhost. This may cause CORS errors.');
        Debug.warn('Make sure your backend server is running on http://localhost:3000');
    }
    const loginForm = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const verificationForm = document.getElementById('verificationForm');
    const showSignup = document.getElementById('showSignup');
    const showLogin = document.getElementById('showLogin');
    const backToSignup = document.getElementById('backToSignup');
    const loginBtn = document.getElementById('login');
    const signupBtn = document.getElementById('signup');
    const verificationBtn = document.getElementById('verification');
    const resendCodeBtn = document.getElementById('resendCode');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');
    const passwordToggleButtons = document.querySelectorAll('.toggle-password');
    // Store signup data temporarily
    let pendingSignupData = null;

    async function apiRequest(path, options = {}) {
        const config = {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        };
        if (options.body !== undefined) {
            config.body = typeof options.body === 'string' ? options.body : JSON.stringify(options.body);
        }

        Debug.api(config.method, `${API_URL}${path}`, options.body, null);
        const response = await fetch(`${API_URL}${path}`, config);
        const data = await response.json().catch(() => ({}));
        Debug.api(config.method, `${API_URL}${path}`, options.body, { status: response.status, data });

        if (!response.ok) {
            const error = new Error(data.error || data.message || `Request failed (${response.status})`);
            error.status = response.status;
            error.data = data;
            throw error;
        }
        return data;
    }

    function upsertLocalUserRecord(user, passwordBase64) {
        if (!user || !user.username) return;
        try {
            const existing = JSON.parse(localStorage.getItem('users') || '[]');
            const withoutCurrent = existing.filter(item => item.username !== user.username);
            const previous = existing.find(item => item.username === user.username) || {};
            const merged = { ...previous };
            Object.entries(user).forEach(([key, value]) => {
                if (value !== undefined && value !== null) {
                    merged[key] = value;
                } else if (!(key in merged)) {
                    merged[key] = value;
                }
            });
            if (passwordBase64) {
                merged.password = passwordBase64;
            } else if (previous.password) {
                merged.password = previous.password;
            }
            if (!merged.email && user.email) {
                merged.email = user.email;
            }
            withoutCurrent.push(merged);
            localStorage.setItem('users', JSON.stringify(withoutCurrent));
        } catch (error) {
            Debug.warn('Failed to cache user locally', error);
        }
    }

    async function lookupUserByUsername(username) {
        if (!username) return null;
        try {
            const data = await apiRequest(`/users?username=${encodeURIComponent(username)}&includePassword=true`);
            return data.user || null;
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    }

    async function lookupUserByEmail(email) {
        if (!email) return null;
        try {
            const data = await apiRequest(`/users?email=${encodeURIComponent(email)}`);
            return data.user || null;
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    }

    async function registerAccount({ username, email, password, role, lastLogin, lastDeviceId, lastDeviceLabel }) {
        const payload = {
            username,
            email,
            password,
            role,
            lastLogin,
            lastDeviceId,
            lastDeviceLabel
        };
        const data = await apiRequest('/users', { method: 'POST', body: payload });
        return data.user;
    }

    async function loginAccount(username, encodedPassword) {
        const data = await apiRequest('/users', {
            method: 'POST',
            body: {
                action: 'login',
                username,
                password: encodedPassword
            }
        });
        return data.user;
    }

    const VERIFICATION_STORAGE_KEY = 'familyhub_verification';

    function storeVerificationCodeLocally(email, code) {
        if (!email || !code) return;
        const payload = {
            email,
            code: String(code).trim(),
            expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
        };
        try {
            sessionStorage.setItem(VERIFICATION_STORAGE_KEY, JSON.stringify(payload));
            Debug.log('Verification code stored locally', payload);
        } catch (error) {
            Debug.error('Failed to store verification code locally', error);
        }
    }

    function getStoredVerificationData(email) {
        if (!email) return null;
        try {
            const raw = sessionStorage.getItem(VERIFICATION_STORAGE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            if (!parsed || parsed.email !== email) return null;
            return parsed;
        } catch (error) {
            Debug.error('Failed to read verification code from storage', error);
            return null;
        }
    }

    function clearStoredVerificationData() {
        sessionStorage.removeItem(VERIFICATION_STORAGE_KEY);
    }

    passwordToggleButtons.forEach(btn => {
        const targetId = btn.getAttribute('data-target');
        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;

        btn.addEventListener('click', () => {
            const isPassword = targetInput.type === 'password';
            targetInput.type = isPassword ? 'text' : 'password';
            btn.classList.toggle('is-visible', !isPassword);
            btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    });

    // Apply saved theme and set up controls
    if (window.ThemeManager) {
        ThemeManager.initButtons(document);
    }

    // Switch between login and signup forms
    showSignup.addEventListener('click', function(e) {
        e.preventDefault();
        loginForm.classList.remove('active');
        signupForm.classList.add('active');
        verificationForm.classList.remove('active');
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
    });

    showLogin.addEventListener('click', function(e) {
        e.preventDefault();
        signupForm.classList.remove('active');
        verificationForm.classList.remove('active');
        loginForm.classList.add('active');
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
    });

    backToSignup.addEventListener('click', function(e) {
        e.preventDefault();
        verificationForm.classList.remove('active');
        signupForm.classList.add('active');
        errorMessage.classList.remove('show');
        successMessage.classList.remove('show');
    });

    // Signup functionality - Send verification code
    signupBtn.addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('signupUsername').value.trim();
        const email = document.getElementById('signupEmail').value.trim();
        const password = document.getElementById('signupPassword').value;

        Debug.auth('Signup attempt', { username, email, passwordLength: password.length });

        if (username.length < 3) {
            Debug.warn('Signup validation failed: username too short', username.length);
            showError('Username must be at least 3 characters');
            return;
        }

        if (password.length < 6) {
            Debug.warn('Signup validation failed: password too short', password.length);
            showError('Password must be at least 6 characters');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            Debug.warn('Signup validation failed: invalid email format', email);
            showError('Please enter a valid email address');
            return;
        }

        try {
            const existingUser = await lookupUserByUsername(username);
            if (existingUser) {
                Debug.warn('Signup failed: username already exists remotely', username);
                showError('Username already exists');
                return;
            }

            const existingEmail = await lookupUserByEmail(email);
            if (existingEmail) {
                Debug.warn('Signup failed: email already registered remotely', email);
                showError('An account with that email already exists');
                return;
            }
        } catch (error) {
            Debug.error('Failed to verify user uniqueness', error);
            showError('Could not verify username and email availability. Please try again.');
            return;
        }

        pendingSignupData = {
            username,
            email,
            password
        };
        Debug.log('Signup data stored (password hidden)');

        // Show loading state
        const submitBtn = signupBtn.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            Debug.log('Sending verification code request to:', `${API_URL}/send-verification`);
            const requestData = { email, username };
            Debug.api('POST', `${API_URL}/send-verification`, requestData, null);
            
            // Send verification code to email
            const response = await fetch(`${API_URL}/send-verification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            Debug.log('Response status:', response.status, response.statusText);
            Debug.log('Response headers:', Object.fromEntries(response.headers.entries()));
            const data = await response.json();
            Debug.api('POST', `${API_URL}/send-verification`, requestData, { status: response.status, data });

            if (!response.ok) {
                Debug.error('API error response:', data);
                const error = new Error(data.error || 'Failed to send verification code');
                error.data = data;
                error.status = response.status;
                throw error;
            }

            Debug.log('Verification code sent successfully');
            Debug.auth('Verification code sent', { email });
            
            if (data.code) {
                storeVerificationCodeLocally(email, data.code);
            } else {
                Debug.error('❌ No code in response! Response data:', data);
            }

            // Show verification form
            document.getElementById('verificationEmail').textContent = email;
            signupForm.classList.remove('active');
            verificationForm.classList.add('active');
            showSuccess('Verification code sent to your email!');
            
            // Focus on verification code input
            setTimeout(() => {
                document.getElementById('verificationCode').focus();
            }, 100);

        } catch (error) {
            Debug.error('Error sending verification code:', error);
            Debug.error('Error stack:', error.stack);
            Debug.error('Error details:', {
                message: error.message,
                status: error.status,
                data: error.data
            });
            
            let errorMsg = 'Failed to send verification code. ';
            
            if (error.message && error.message.includes('fetch')) {
                Debug.error('Network error - backend server may not be running');
                errorMsg += 'Make sure the backend server is running on http://localhost:3000';
            } else if (error.data && error.data.message) {
                errorMsg = error.data.message;
            } else if (error.status) {
                errorMsg += `Server returned status ${error.status}: ${error.message}`;
            } else {
                errorMsg += error.message || 'Please check your server connection.';
            }
            
            showError(errorMsg);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    });

    // Resend verification code
    resendCodeBtn.addEventListener('click', async function() {
        if (!pendingSignupData) {
            Debug.warn('Resend code attempted without pending signup data');
            showError('Please start the signup process again');
            return;
        }

        Debug.log('Resending verification code for:', pendingSignupData.email);
        const submitBtn = resendCodeBtn;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending...';

        try {
            const requestData = { 
                email: pendingSignupData.email, 
                username: pendingSignupData.username 
            };
            Debug.api('POST', `${API_URL}/send-verification`, requestData, null);
            
            const response = await fetch(`${API_URL}/send-verification`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const data = await response.json();
            Debug.api('POST', `${API_URL}/send-verification`, requestData, { status: response.status, data });

            if (!response.ok) {
                Debug.error('Resend code failed:', data);
                throw new Error(data.error || 'Failed to resend verification code');
            }

            Debug.log('Verification code resent successfully');
            
            if (data.code && pendingSignupData) {
                storeVerificationCodeLocally(pendingSignupData.email, data.code);
            }
            
            showSuccess('New verification code sent to your email!');
        } catch (error) {
            Debug.error('Error resending verification code:', error);
            Debug.error('Error stack:', error.stack);
            showError(error.message || 'Failed to resend verification code');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Resend Code';
        }
    });

    // Verification functionality
    verificationBtn.addEventListener('submit', async function(e) {
        e.preventDefault();
        const code = document.getElementById('verificationCode').value.trim();

        Debug.auth('Verification attempt', { email: pendingSignupData?.email, codeLength: code.length });

        if (!pendingSignupData) {
            Debug.warn('Verification attempted without pending signup data');
            showError('Please start the signup process again');
            return;
        }

        if (code.length !== 6 || !/^\d+$/.test(code)) {
            Debug.warn('Invalid verification code format', code);
            showError('Please enter a valid 6-digit code');
            return;
        }

        const submitBtn = verificationBtn.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verifying...';

        try {
            const email = pendingSignupData.email;
            const enteredCodeTrimmed = String(code).trim();
            const storedData = getStoredVerificationData(email);

            if (!storedData) {
                Debug.warn('No stored verification code found');
                showError('Verification code not found. Please click "Resend Code".');
                throw new Error('No stored verification code');
            }

            const now = Date.now();
            if (storedData.expiresAt && now >= storedData.expiresAt) {
                Debug.warn('Stored verification code has expired');
               clearStoredVerificationData();
                showError('Verification code has expired. Please click "Resend Code".');
                throw new Error('Verification code expired');
            }

            if (enteredCodeTrimmed !== String(storedData.code).trim()) {
                Debug.warn('Entered code does not match stored code', {
                    entered: enteredCodeTrimmed,
                    expected: storedData.code
                });
                showError('Invalid verification code. Please check the code and try again.');
                throw new Error('Verification code mismatch');
            }

            Debug.log('Verification code verified locally');
            Debug.auth('Account creation', { username: pendingSignupData.username, email });

            // Clear local verification data
            clearStoredVerificationData();

            let newUser = null;
            try {
                newUser = await registerAccount({
                    username: pendingSignupData.username,
                    email: pendingSignupData.email,
                    password: btoa(pendingSignupData.password),
                    role: 'solo'
                });
            } catch (error) {
                if (error.status === 409) {
                    showError('That username or email is already in use. Please choose a different one.');
                    verificationForm.classList.remove('active');
                    signupForm.classList.add('active');
                    throw error;
                }
                throw error;
            }

            upsertLocalUserRecord(
                {
                    ...newUser,
                    email: pendingSignupData.email
                },
                btoa(pendingSignupData.password)
            );
            localStorage.setItem(`planner_${pendingSignupData.username}`, JSON.stringify({ entries: [] }));
            Debug.storage('write', 'users', null);
            Debug.log('User account created via API');

            // Auto login
            localStorage.setItem('currentUser', pendingSignupData.username);
            Debug.storage('write', 'currentUser', null);
            Debug.auth('Login successful', { username: pendingSignupData.username });
            localStorage.removeItem(`familyhub_theme_${pendingSignupData.username}`);
            localStorage.removeItem(`familyhub_ai_theme_${pendingSignupData.username}`);
            
            showSuccess('Email verified! Creating your account...');
            
            setTimeout(() => {
                Debug.log('Redirecting to dashboard');
                window.location.href = 'dashboard.html';
            }, 1000);

        } catch (error) {
            Debug.error('Error verifying code:', error);
            Debug.error('Error stack:', error.stack);
            Debug.error('Error details:', {
                message: error.message,
                status: error.status,
                data: error.data
            });
            showError(error.message || 'Failed to verify code. Please try again.');
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verify Email';
        }
    });

    // Auto-format verification code input (numbers only)
    const verificationCodeInput = document.getElementById('verificationCode');
    if (verificationCodeInput) {
        verificationCodeInput.addEventListener('input', function(e) {
            // Only allow numbers
            e.target.value = e.target.value.replace(/\D/g, '');
        });

        // Auto-submit when 6 digits are entered
        verificationCodeInput.addEventListener('input', function(e) {
            if (e.target.value.length === 6) {
                // Small delay to allow user to see the complete code
                setTimeout(() => {
                    verificationBtn.requestSubmit();
                }, 300);
            }
        });
    }

    // Load saved username if "Remember Me" was checked
    const rememberMeCheckbox = document.getElementById('rememberMe');
    const savedUsername = localStorage.getItem('rememberedUsername');
    if (savedUsername && document.getElementById('loginUsername')) {
        document.getElementById('loginUsername').value = savedUsername;
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = true;
        }
    }

    // Login functionality
    loginBtn.addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('loginUsername').value.trim();
        const password = document.getElementById('loginPassword').value;
        const rememberMe = rememberMeCheckbox ? rememberMeCheckbox.checked : false;

        Debug.auth('Login attempt', { username, passwordLength: password.length, rememberMe });

        const builtInAccount = (() => {
            if (username.toUpperCase() === 'ADMIN' && password === 'ADMIN@032681') {
                return { username: 'ADMIN', mode: 'admin' };
            }
            if (username === 'LunchTable1' && password === 'password') {
                return { username: 'LunchTable1', mode: 'demo' };
            }
            return null;
        })();

        if (builtInAccount) {
            Debug.log('Built-in login successful', builtInAccount.username);
            Debug.auth('Built-in login', { username: builtInAccount.username });

            localStorage.setItem('currentUser', builtInAccount.username);
            localStorage.setItem('lastLogin', new Date().toISOString());
            if (builtInAccount.mode === 'admin') {
                localStorage.setItem('isAdmin', 'true');
            } else {
                localStorage.removeItem('isAdmin');
            }

            if (rememberMe) {
                localStorage.setItem('rememberedUsername', builtInAccount.username);
            } else {
                localStorage.removeItem('rememberedUsername');
            }

            const loginHistory = JSON.parse(localStorage.getItem('loginHistory') || '[]');
            loginHistory.unshift({
                username: builtInAccount.username,
                timestamp: new Date().toISOString()
            });
            if (loginHistory.length > 5) {
                loginHistory.pop();
            }
            localStorage.setItem('loginHistory', JSON.stringify(loginHistory));

            if (builtInAccount.username === 'LunchTable1') {
                await populateDemoEntries();
                localStorage.setItem('users', JSON.stringify([
                    {
                        username: 'LunchTable1',
                        email: 'demo@familyhub.local',
                        password: btoa('password'),
                        role: 'demo',
                        familyId: null,
                        verified: true,
                        createdAt: new Date().toISOString()
                    }
                ]));
                localStorage.setItem('familyhub_theme_LunchTable1', 'theme-ocean');
            }

            window.location.href = 'dashboard.html';
            return;
        }
    async function populateDemoEntries() {
        const demoUsername = 'LunchTable1';
        const plannerKey = `planner_${demoUsername}`;
        const generator = typeof window !== 'undefined' ? window.generateDemoPlannerEntries : null;
        const demoEntries = generator ? generator(new Date()) : [];

        localStorage.setItem(plannerKey, JSON.stringify({ entries: demoEntries }));
        try {
            await apiRequest('/planner', {
                method: 'PUT',
                body: {
                    username: demoUsername,
                    planner: { entries: demoEntries }
                }
            });
        } catch (error) {
            Debug.warn('Failed to sync demo planner entries to API', error);
        }
    }

        try {
            const encodedPassword = btoa(password);
            const user = await loginAccount(username, encodedPassword);
            Debug.log('Login successful via API');
            Debug.auth('Login successful', { username });

            localStorage.setItem('currentUser', username);
            localStorage.setItem('lastLogin', new Date().toISOString());
            localStorage.removeItem('isAdmin');
            upsertLocalUserRecord(user, encodedPassword);
            Debug.storage('write', 'currentUser', null);

            const themeKey = `familyhub_theme_${username}`;
            const aiThemeKey = `familyhub_ai_theme_${username}`;
            localStorage.removeItem(themeKey);
            localStorage.removeItem(aiThemeKey);

            if (rememberMe) {
                localStorage.setItem('rememberedUsername', username);
                Debug.log('Username saved for next login');
            } else {
                localStorage.removeItem('rememberedUsername');
            }

            const loginHistory = JSON.parse(localStorage.getItem('loginHistory') || '[]');
            loginHistory.unshift({
                username,
                timestamp: new Date().toISOString()
            });
            if (loginHistory.length > 5) {
                loginHistory.pop();
            }
            localStorage.setItem('loginHistory', JSON.stringify(loginHistory));

            Debug.log('Redirecting to dashboard');
            window.location.href = 'dashboard.html';
        } catch (error) {
            Debug.warn('Login failed via API', error);
            if (error.status === 401) {
                showError('Invalid username or password');
            } else {
                showError(error.message || 'Unable to login right now. Please try again.');
            }
        }
    });

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.classList.add('show');
        successMessage.classList.remove('show');
        setTimeout(() => {
            errorMessage.classList.remove('show');
        }, 5000);
    }

    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.classList.add('show');
        errorMessage.classList.remove('show');
        setTimeout(() => {
            successMessage.classList.remove('show');
        }, 5000);
    }

    // Check if already logged in
    const currentUser = localStorage.getItem('currentUser');
    const lastLogin = localStorage.getItem('lastLogin');
    
    if (currentUser) {
        // Check if login is still valid (optional: you can add expiration here)
        // For now, we'll keep users logged in indefinitely until they logout
        Debug.log('User already logged in, redirecting to dashboard', currentUser);
        Debug.log('Last login:', lastLogin ? new Date(lastLogin).toLocaleString() : 'Unknown');
        window.location.href = 'dashboard.html';
    } else {
        Debug.log('No user logged in, showing login form');
        // Clear any stale data
        localStorage.removeItem('currentUser');
    }
}

// Start initialization
initializeAuth();

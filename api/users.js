const {
    getUsers,
    findUserByUsername,
    findUserByEmail,
    addUser,
    updateUser
} = require('./_data-store');

function sanitizeUser(user, includeSensitive = false) {
    if (!user) return null;
    const clone = { ...user };
    if (!includeSensitive) {
        delete clone.password;
    }
    return clone;
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            const { username, email, includePassword } = req.query || {};
            const includeSensitive = includePassword === 'true';

            if (username) {
                const user = findUserByUsername(username);
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return;
                }
                res.status(200).json({ user: sanitizeUser(user, includeSensitive) });
                return;
            }

            if (email) {
                const user = findUserByEmail(email);
                if (!user) {
                    res.status(404).json({ error: 'User not found' });
                    return;
                }
                res.status(200).json({ user: sanitizeUser(user, includeSensitive) });
                return;
            }

            const users = getUsers().map(user => sanitizeUser(user, includeSensitive));
            res.status(200).json({ users });
            return;
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

        if (req.method === 'POST') {
            if (body.action === 'login') {
                const { username, password } = body;
                if (!username || !password) {
                    res.status(400).json({ error: 'Username and password are required' });
                    return;
                }
                const user = findUserByUsername(username);
                if (!user || user.password !== password) {
                    res.status(401).json({ error: 'Invalid credentials' });
                    return;
                }
                const updated = updateUser(username, { lastLogin: new Date().toISOString() }) || user;
                res.status(200).json({ user: sanitizeUser(updated) });
                return;
            }

            const { username, email, password, role = 'solo' } = body;
            if (!username || !email || !password) {
                res.status(400).json({ error: 'Username, email, and password are required' });
                return;
            }

            if (findUserByUsername(username)) {
                res.status(409).json({ error: 'Username already exists' });
                return;
            }

            // Allow multiple accounts with the same email

            const newUser = addUser({
                id: `user_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                username,
                email,
                password,
                role,
                verified: true,
                createdAt: new Date().toISOString(),
                familyId: null,
                lastLogin: null
            });

            res.status(201).json({ user: sanitizeUser(newUser) });
            return;
        }

        if (req.method === 'PUT') {
            const { username, updates } = body;
            if (!username || !updates) {
                res.status(400).json({ error: 'Username and updates are required' });
                return;
            }
            const existing = findUserByUsername(username);
            if (!existing) {
                res.status(404).json({ error: 'User not found' });
                return;
            }

            const allowed = [
                'familyId',
                'role',
                'lastLogin',
                'email',
                'password',
                'verified'
            ];
            const safeUpdates = {};
            Object.keys(updates).forEach(key => {
                if (allowed.includes(key)) {
                    safeUpdates[key] = updates[key];
                }
            });

            const updatedUser = updateUser(username, safeUpdates);
            res.status(200).json({ user: sanitizeUser(updatedUser) });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[api/users] Unexpected error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


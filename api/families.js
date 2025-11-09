const {
    listFamilies,
    findFamilyById,
    findFamilyByCode,
    createFamily,
    saveFamily,
    joinFamilyByCode,
    regenerateFamilyCode,
    findUserByUsername,
    updateUser,
    addUser
} = require('./_data-store');

function sanitizeFamily(family) {
    if (!family) return null;
    return {
        ...family,
        members: Array.isArray(family.members) ? family.members.map(member => ({ ...member })) : [],
        reminders: Array.isArray(family.reminders) ? family.reminders.map(reminder => ({ ...reminder })) : [],
        chat: Array.isArray(family.chat) ? family.chat.map(message => ({ ...message })) : []
    };
}

function sanitizeUserRecord(user) {
    if (!user) return null;
    const clone = { ...user };
    delete clone.password;
    return clone;
}

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            const { familyId, code, username } = req.query || {};

            if (familyId) {
                const family = findFamilyById(familyId);
                if (!family) {
                    res.status(404).json({ error: 'Family not found' });
                    return;
                }
                res.status(200).json({ family: sanitizeFamily(family) });
                return;
            }

            if (code) {
                const family = findFamilyByCode(code);
                if (!family) {
                    res.status(404).json({ error: 'Family not found' });
                    return;
                }
                res.status(200).json({ family: sanitizeFamily(family) });
                return;
            }

            const families = listFamilies();
            if (username) {
                const filtered = families.filter(family =>
                    Array.isArray(family.members) && family.members.some(member => member.username === username)
                );
                res.status(200).json({ families: filtered.map(sanitizeFamily) });
                return;
            }

            res.status(200).json({ families: families.map(sanitizeFamily) });
            return;
        }

        const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};

        if (req.method === 'POST') {
            const { name, owner, ownerProfile } = body;
            if (!name || !owner) {
                res.status(400).json({ error: 'Name and owner are required' });
                return;
            }
            let ownerRecord = findUserByUsername(owner);
            if (!ownerRecord && ownerProfile && ownerProfile.password) {
                try {
                    addUser({
                        id: ownerProfile.id || `user_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                        username: owner,
                        email: ownerProfile.email || `${owner}@familyhub.local`,
                        password: ownerProfile.password,
                        role: ownerProfile.role || 'solo',
                        verified: true,
                        createdAt: ownerProfile.createdAt || new Date().toISOString(),
                        familyId: null,
                        lastLogin: ownerProfile.lastLogin || null,
                        lastDeviceId: ownerProfile.lastDeviceId || null,
                        lastDeviceLabel: ownerProfile.lastDeviceLabel || null
                    });
                    ownerRecord = findUserByUsername(owner);
                } catch (error) {
                    console.warn('[api/families] Failed to auto-create owner profile', error);
                }
            }
            if (!ownerRecord) {
                res.status(404).json({ error: 'Owner user not found' });
                return;
            }
            const family = createFamily({ name, ownerUsername: owner });
            res.status(201).json({ family: sanitizeFamily(family) });
            return;
        }

        if (req.method === 'PUT') {
            const { family } = body;
            if (!family || !family.id) {
                res.status(400).json({ error: 'Family payload with id is required' });
                return;
            }
            if (!findFamilyById(family.id)) {
                res.status(404).json({ error: 'Family not found' });
                return;
            }

            const sanitizedChat = Array.isArray(family.chat)
                ? family.chat.map(message => ({
                      ...message,
                      message: String(message.message || '')
                  }))
                : [];

            const stored = saveFamily({
                ...family,
                chat: sanitizedChat
            });
            res.status(200).json({ family: sanitizeFamily(stored) });
            return;
        }

        if (req.method === 'PATCH') {
            const { action } = body;
            if (action === 'join') {
                const { username, code, role = 'adult', userProfile } = body;
                if (!username || !code) {
                    res.status(400).json({ error: 'Username and family code are required' });
                    return;
                }
                let userRecord = findUserByUsername(username);
                if (!userRecord && userProfile && userProfile.password) {
                    try {
                        addUser({
                            id: userProfile.id || `user_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
                            username,
                            email: userProfile.email || `${username}@familyhub.local}`,
                            password: userProfile.password,
                            role: userProfile.role || role || 'adult',
                            verified: true,
                            createdAt: userProfile.createdAt || new Date().toISOString(),
                            familyId: null,
                            lastLogin: userProfile.lastLogin || null,
                            lastDeviceId: userProfile.lastDeviceId || null,
                            lastDeviceLabel: userProfile.lastDeviceLabel || null
                        });
                        userRecord = findUserByUsername(username);
                    } catch (error) {
                        console.warn('[api/families] Failed to auto-create joining user profile', error);
                    }
                }
                if (!userRecord) {
                    res.status(404).json({ error: 'User not found' });
                    return;
                }
                const { family, user } = joinFamilyByCode({ username, code, role });
                if (!family) {
                    res.status(404).json({ error: 'Family not found' });
                    return;
                }
                res.status(200).json({ family: sanitizeFamily(family), user: sanitizeUserRecord(user) });
                return;
            }

            if (action === 'regenerate') {
                const { familyId } = body;
                if (!familyId) {
                    res.status(400).json({ error: 'Family id is required for regeneration' });
                    return;
                }
                const family = regenerateFamilyCode(familyId);
                if (!family) {
                    res.status(404).json({ error: 'Family not found' });
                    return;
                }
                res.status(200).json({ family: sanitizeFamily(family) });
                return;
            }

            if (action === 'updateMemberRole') {
                const { username, familyId, role } = body;
                if (!username || !familyId || !role) {
                    res.status(400).json({ error: 'Username, familyId, and role are required' });
                    return;
                }
                const family = findFamilyById(familyId);
                if (!family) {
                    res.status(404).json({ error: 'Family not found' });
                    return;
                }
                const members = Array.isArray(family.members) ? family.members.map(member => {
                    if (member.username === username) {
                        return { ...member, role };
                    }
                    return member;
                }) : [];
                const updatedFamily = saveFamily({ ...family, members });
                const updatedUser = updateUser(username, { role });
                res.status(200).json({
                    family: sanitizeFamily(updatedFamily),
                    user: sanitizeUserRecord(updatedUser)
                });
                return;
            }

            res.status(400).json({ error: 'Unsupported action' });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[api/families] Unexpected error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


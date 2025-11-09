const FAMILY_STORAGE_KEY = 'families';
const USERS_STORAGE_KEY = 'users';
const BACKEND_STORE_KEY = 'familyhub_backend_store';

const API_BASE_URL = (() => {
    if (typeof window === 'undefined') return '/api';
    const { protocol, hostname } = window.location;
    if (protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1') {
        return 'http://localhost:3000/api';
    }
    return '/api';
})();

const DataClient = {
    async request(path, options = {}) {
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
        const url = `${API_BASE_URL}${path}`;
        Debug.api(config.method, url, options.body, null);
        const response = await fetch(url, config);
        const data = await response.json().catch(() => ({}));
        Debug.api(config.method, url, options.body, { status: response.status, data });
        if (!response.ok) {
            const error = new Error(data.error || data.message || `Request failed (${response.status})`);
            error.status = response.status;
            error.details = data;
            throw error;
        }
        return data;
    },
    async listUsers(includeSensitive = false) {
        const query = includeSensitive ? '?includePassword=true' : '';
        const data = await this.request(`/users${query}`);
        return data.users || [];
    },
    async getUser(username, includeSensitive = false) {
        const query = `?username=${encodeURIComponent(username)}${includeSensitive ? '&includePassword=true' : ''}`;
        try {
            const data = await this.request(`/users${query}`);
            return data.user || null;
        } catch (error) {
            if (error.status === 404) return null;
            throw error;
        }
    },
    async updateUser(username, updates) {
        const data = await this.request('/users', {
            method: 'PUT',
            body: { username, updates }
        });
        return data.user;
    },
    async getPlanner(username) {
        const data = await this.request(`/planner?username=${encodeURIComponent(username)}`);
        return data.planner || { entries: [] };
    },
    async savePlanner(username, entries) {
        const data = await this.request('/planner', {
            method: 'PUT',
            body: {
                username,
                planner: { entries }
            }
        });
        return data.planner;
    },
    async listFamilies() {
        const data = await this.request('/families');
        return data.families || [];
    },
    async createFamily(payload) {
        const data = await this.request('/families', {
            method: 'POST',
            body: payload
        });
        return data.family;
    },
    async updateFamily(family) {
        const data = await this.request('/families', {
            method: 'PUT',
            body: { family }
        });
        return data.family;
    },
    async joinFamily(payload) {
        const data = await this.request('/families', {
            method: 'PATCH',
            body: { action: 'join', ...payload }
        });
        return data;
    },
    async regenerateFamily(familyId) {
        const data = await this.request('/families', {
            method: 'PATCH',
            body: { action: 'regenerate', familyId }
        });
        return data.family;
    },
    async updateFamilyMemberRole(payload) {
        const data = await this.request('/families', {
            method: 'PATCH',
            body: { action: 'updateMemberRole', ...payload }
        });
        return data;
    },
    async listFamiliesForUser(username) {
        const query = username ? `?username=${encodeURIComponent(username)}` : '';
        const data = await this.request(`/families${query}`);
        return data.families || [];
    },
    async getFamilyById(familyId) {
        if (!familyId) return null;
        const data = await this.request(`/families?familyId=${encodeURIComponent(familyId)}`);
        return data.family || null;
    }
};

function loadBackendStore() {
    try {
        const raw = localStorage.getItem(BACKEND_STORE_KEY);
        const parsed = raw ? JSON.parse(raw) : {};
        return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            families: Array.isArray(parsed.families) ? parsed.families : [],
            planners: parsed.planners && typeof parsed.planners === 'object' ? parsed.planners : {},
            memberships: parsed.memberships && typeof parsed.memberships === 'object' ? parsed.memberships : {},
            themes: parsed.themes && typeof parsed.themes === 'object' ? parsed.themes : {},
            shareCodes: parsed.shareCodes && typeof parsed.shareCodes === 'object' ? parsed.shareCodes : {}
        };
    } catch (error) {
        console.warn('Failed to parse backend store', error);
        return {
            users: [],
            families: [],
            planners: {},
            memberships: {},
            themes: {},
            shareCodes: {}
        };
    }
}

function writeBackendStore(store) {
    try {
        localStorage.setItem(BACKEND_STORE_KEY, JSON.stringify(store));
    } catch (error) {
        console.error('Failed to write backend store', error);
    }
}

function saveBackendStore(store, options = {}) {
    try {
        const existing = loadBackendStore();
        const replaceShareCodes = options.replaceShareCodes === true;
        const merged = {
            users: Array.isArray(store.users) ? store.users : existing.users,
            families: Array.isArray(store.families) ? store.families : existing.families,
            planners: { ...existing.planners, ...(store.planners || {}) },
            memberships: { ...existing.memberships, ...(store.memberships || {}) },
            themes: { ...existing.themes, ...(store.themes || {}) },
            shareCodes: replaceShareCodes
                ? { ...(store.shareCodes || {}) }
                : { ...existing.shareCodes, ...(store.shareCodes || {}) }
        };
        writeBackendStore(merged);
        return merged;
    } catch (error) {
        console.error('Failed to save backend store', error);
        return loadBackendStore();
    }
}

function setBackendMembership(username, familyId) {
    if (!username) return;
    const store = loadBackendStore();
    const memberships = { ...store.memberships };
    if (familyId) {
        memberships[username] = familyId;
    } else {
        delete memberships[username];
    }
    saveBackendStore({
        ...store,
        memberships
    });
}

function getBackendMembership(username) {
    if (!username) return null;
    const store = loadBackendStore();
    return store.memberships?.[username] || null;
}

function joinFamilyLocally(code, role) {
    if (!code) return null;
    const normalizedCode = String(code).trim().toUpperCase();
    const families = loadFamilies();
    const index = families.findIndex(family => family.code && String(family.code).trim().toUpperCase() === normalizedCode);
    if (index === -1) return null;

    const family = { ...families[index] };
    if (!Array.isArray(family.members)) {
        family.members = [];
    }

    if (!family.members.some(member => member.username === currentUser)) {
        family.members = [
            ...family.members,
            {
                username: currentUser,
                role
            }
        ];
    }

    families[index] = family;
    saveFamilies(families);
    familiesState = families;

    currentFamily = family;
    currentFamilyMember = family.members.find(member => member.username === currentUser) || null;
    const resolvedRole = currentFamilyMember?.role || role || 'adult';
    isFamilyOwner = resolvedRole === 'owner';
    isFamilyAdult = resolvedRole === 'owner' || resolvedRole === 'adult';
    lastFamilySyncSignature = computeFamilySignature(family);
    setBackendMembership(currentUser, family.id);

    return family;
}

function generateShareCode(existingCodes = new Set()) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let attempt = '';
    let tries = 0;
    do {
        attempt = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        tries += 1;
    } while (existingCodes.has(attempt) && tries < 5000);
    return attempt;
}

function ensureEntryShareCodes(entries) {
    if (!Array.isArray(entries)) return;
    const store = loadBackendStore();
    const existingCodes = new Set(Object.keys(store.shareCodes || {}));
    entries.forEach(entry => {
        if (entry?.shareCode) {
            existingCodes.add(entry.shareCode);
        }
    });
    entries.forEach(entry => {
        if (!entry.shareCode) {
            let code = generateShareCode(existingCodes);
            while (existingCodes.has(code)) {
                code = generateShareCode(existingCodes);
            }
            entry.shareCode = code;
            existingCodes.add(code);
        }
    });
}

function persistPlannerEntries(username, entries) {
    if (!username) return;
    const store = loadBackendStore();
    const planners = { ...(store.planners || {}) };
    const shareCodes = { ...(store.shareCodes || {}) };

    Object.keys(shareCodes).forEach(code => {
        if (shareCodes[code]?.owner === username) {
            delete shareCodes[code];
        }
    });

    const sanitizedEntries = Array.isArray(entries)
        ? entries.map(entry => ({
              ...entry
          }))
        : [];

    sanitizedEntries.forEach(entry => {
        if (entry.shareCode) {
            shareCodes[entry.shareCode] = {
                owner: username,
                entry: { ...entry }
            };
        }
    });

    planners[username] = sanitizedEntries;
    writeBackendStore({
        ...store,
        planners,
        shareCodes
    });
}

function getPlannerEntryByShareCode(code) {
    if (!code) return null;
    const store = loadBackendStore();
    const record = store.shareCodes?.[code];
    if (!record || !record.entry) return null;
    return {
        owner: record.owner,
        entry: { ...record.entry }
    };
}

function loadFamilies() {
    const backend = loadBackendStore();
    if (backend.families && backend.families.length) {
        try {
            localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(backend.families));
        } catch (error) {
            console.warn('Failed to mirror families to local storage', error);
        }
        return backend.families;
    }
    try {
        return JSON.parse(localStorage.getItem(FAMILY_STORAGE_KEY) || '[]');
    } catch (error) {
        console.warn('Failed to parse families', error);
        return [];
    }
}

function saveFamilies(families) {
    const snapshot = Array.isArray(families) ? families : [];
    try {
        localStorage.setItem(FAMILY_STORAGE_KEY, JSON.stringify(snapshot));
    } catch (error) {
        console.error('Failed to save families to local storage', error);
    }
    saveBackendStore({
        families: snapshot
    });
}

function loadUsers() {
    try {
        const backend = loadBackendStore();
        if (backend.users && backend.users.length) {
            return backend.users;
        }
        return JSON.parse(localStorage.getItem(USERS_STORAGE_KEY) || '[]');
    } catch (error) {
        console.warn('Failed to parse users', error);
        return [];
    }
}

function saveUsers(users) {
    try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
    } catch (error) {
        console.error('Failed to save users', error);
    }
    saveBackendStore({
        users: Array.isArray(users) ? users : []
    });
}

function formatPriorityLabel(priority) {
    if (!priority) return 'Normal';
    const normalized = String(priority).toLowerCase();
    if (normalized === 'high') return 'High';
    if (normalized === 'low') return 'Low';
    return 'Normal';
}

function formatDateDisplay(dateISO) {
    const date = new Date(`${dateISO}T00:00:00`);
    return new Intl.DateTimeFormat(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
    }).format(date);
}

function formatTimeDisplay(dateISO, time) {
    if (!time) return 'All day';
    const date = new Date(`${dateISO}T${time}`);
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit'
    }).format(date);
}

function getTimezoneLabel() {
    try {
        const now = new Date();
        const parts = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' }).formatToParts(now);
        const tzPart = parts.find(part => part.type === 'timeZoneName');
        return tzPart ? tzPart.value : Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch (error) {
        return Intl.DateTimeFormat().resolvedOptions().timeZone;
    }
}

function createElement(tag, className, content, useHTML = false) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content !== undefined) {
        if (useHTML) {
            el.innerHTML = content;
        } else {
            el.textContent = content;
        }
    }
    return el;
}

function normalizeFamilyCode(value = '') {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

function toLocalISO(date) {
    const tzOffset = date.getTimezoneOffset() * 60000;
    const local = new Date(date.getTime() - tzOffset);
    return local.toISOString().split('T')[0];
}

// Dashboard functionality
document.addEventListener('DOMContentLoaded', function() {
    const run = async () => {
    // Initialize debug (fallback if not loaded)
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

    Debug.log('Dashboard initialized');
    
    // Check authentication
    const currentUser = localStorage.getItem('currentUser');
    Debug.storage('read', 'currentUser', null);

    if (window.ThemeManager) {
        ThemeManager.initButtons(document);
    }

    const isMobileDevice = /Mobi|Android/i.test(navigator.userAgent);
    document.body.classList.add(isMobileDevice ? 'device-mobile' : 'device-desktop');
    
    if (!currentUser) {
        Debug.warn('No user logged in, redirecting to login');
        window.location.href = 'index.html';
        return;
    }

    Debug.log('User authenticated:', currentUser);
    const isAdmin = currentUser.toUpperCase() === 'ADMIN';
    const deviceStorageKey = 'familyhub_device_id';
    const existingDeviceId = localStorage.getItem(deviceStorageKey);
    const deviceId =
        existingDeviceId || `device_${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
    const deviceLabel = `${isMobileDevice ? 'Mobile' : 'Desktop'} • ${navigator.platform || 'Unknown platform'}`;
    if (!existingDeviceId) {
        localStorage.setItem(deviceStorageKey, deviceId);
    }
    const PLANNER_STORAGE_KEY = `planner_${currentUser}`;
    const FAMILY_MEMBERSHIP_KEY = `familyhub_membership_${currentUser}`;

    let usersState = loadUsers();
    let familiesState = loadFamilies();
    let currentUserRecord = usersState.find(u => u.username === currentUser) || null;
    let currentFamily = null;
    let currentFamilyMember = null;
    let familyRoleLabel = '';
    let isFamilyOwner = false;
    let isFamilyAdult = false;
    let lastFamilySyncSignature = null;
    let lastPlannerSyncSignature = null;

    function computeFamilySignature(family) {
        if (!family) return null;
        try {
            const members = Array.isArray(family.members)
                ? family.members
                      .map(member => ({
                          username: member.username,
                          role: member.role
                      }))
                      .sort((a, b) => a.username.localeCompare(b.username))
                : [];
            const chat = Array.isArray(family.chat)
                ? family.chat
                      .map(message => ({
                          id: message.id,
                          username: message.username,
                          message: message.message,
                          createdAt: message.createdAt
                      }))
                      .sort((a, b) => {
                          if (a.createdAt === b.createdAt) {
                              return a.id.localeCompare(b.id);
                          }
                          return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
                      })
                : [];
            return JSON.stringify({
                id: family.id,
                code: family.code,
                members,
                chat
            });
        } catch (error) {
            Debug.warn('Failed to compute family signature', error);
            return null;
        }
    }

    function computePlannerSignature(entries = []) {
        try {
            const normalized = (entries || [])
                .map(entry => ({
                    id: entry.id,
                    type: entry.type,
                    title: entry.title,
                    notes: entry.notes,
                    priority: entry.priority,
                    startDate: entry.startDate,
                    endDate: entry.endDate,
                    startTime: entry.startTime,
                    endTime: entry.endTime,
                    sharedWithFamily: entry.sharedWithFamily,
                    assignees: Array.isArray(entry.assignees) ? [...entry.assignees].sort() : []
                }))
                .sort((a, b) => {
                    if (a.startDate === b.startDate) {
                        if (a.startTime === b.startTime) {
                            return (a.id || '').localeCompare(b.id || '');
                        }
                        return (a.startTime || '').localeCompare(b.startTime || '');
                    }
                    return (a.startDate || '').localeCompare(b.startDate || '');
                });
            return JSON.stringify(normalized);
        } catch (error) {
            Debug.warn('Failed to compute planner signature', error);
            return null;
        }
    }

    function mergeRemoteUsers(remoteUsers = []) {
        const localUsers = loadUsers();
        const merged = remoteUsers.map(remote => {
            const localMatch = localUsers.find(item => item.username === remote.username) || {};
            return {
                ...localMatch,
                ...remote,
                password: localMatch.password
            };
        });
        const extras = localUsers.filter(
            local => !remoteUsers.some(remote => remote.username === local.username)
        );
        return [...merged, ...extras];
    }

    async function ensureRemoteUserRecord({ createIfMissing = false } = {}) {
        if (isAdmin) return;
        let remoteUser = null;
        try {
            remoteUser = await DataClient.getUser(currentUser);
        } catch (error) {
            if (!error.status || error.status !== 404) {
                throw error;
            }
        }

        const localUsers = loadUsers();
        usersState = localUsers;
        currentUserRecord = localUsers.find(u => u.username === currentUser) || null;

        if (!remoteUser && createIfMissing && currentUserRecord && currentUserRecord.password) {
            const payload = {
                username: currentUserRecord.username,
                email: currentUserRecord.email || `${currentUserRecord.username}@familyhub.local`,
                password: currentUserRecord.password,
                role: currentUserRecord.role || 'solo'
            };
            try {
                await DataClient.request('/users', { method: 'POST', body: payload });
            } catch (error) {
                if (!error.status || error.status !== 409) {
                    throw error;
                }
            }
            try {
                remoteUser = await DataClient.getUser(currentUser);
            } catch (error) {
                if (!error.status || error.status !== 404) {
                    throw error;
                }
            }
        }

        if (remoteUser) {
            const mergedUser = {
                ...currentUserRecord,
                ...remoteUser,
                password: currentUserRecord?.password
            };
            const withoutCurrent = localUsers.filter(item => item.username !== currentUser);
            withoutCurrent.push(mergedUser);
            saveUsers(withoutCurrent);
            usersState = withoutCurrent;
            currentUserRecord = mergedUser;
        }
    }

    await ensureRemoteUserRecord({ createIfMissing: true }).catch(error => {
        Debug.error('Failed to ensure remote user record', error);
    });

    if (!isAdmin) {
        try {
            const remoteUsers = await DataClient.listUsers();
            usersState = mergeRemoteUsers(remoteUsers);
            saveUsers(usersState);
            currentUserRecord = usersState.find(u => u.username === currentUser) || currentUserRecord;
        } catch (error) {
            Debug.error('Failed to sync users from server', error);
        }
    }

    if (!isAdmin && currentUserRecord) {
        try {
            const updated = await DataClient.updateUser(currentUser, {
                lastLogin: new Date().toISOString(),
                lastDeviceId: deviceId,
                lastDeviceLabel: deviceLabel
            });
            if (updated) {
                const withoutCurrent = usersState.filter(user => user.username !== currentUser);
                withoutCurrent.push({
                    ...updated,
                    password: currentUserRecord.password
                });
                saveUsers(withoutCurrent);
                usersState = withoutCurrent;
                currentUserRecord = withoutCurrent.find(user => user.username === currentUser) || currentUserRecord;
            }
        } catch (error) {
            Debug.error('Failed to record device info', error);
        }
    }

    try {
        const remoteFamilies = await DataClient.listFamiliesForUser(currentUser);
        if (Array.isArray(remoteFamilies) && remoteFamilies.length > 0) {
            const localFamilies = loadFamilies();
            const merged = remoteFamilies.map(remote => {
                const localMatch = localFamilies.find(family => family.id === remote.id) || {};
                return {
                    ...localMatch,
                    ...remote
                };
            });
            const extras = localFamilies.filter(
                localFamily => !remoteFamilies.some(remote => remote.id === localFamily.id)
            );
            familiesState = [...merged, ...extras];
            saveFamilies(familiesState);
            updateFamilyStateFromStorage();
            lastFamilySyncSignature = computeFamilySignature(currentFamily);
        } else {
            Debug.info('No remote families returned; keeping local cache.');
        }
    } catch (error) {
        Debug.warn('Failed to sync families from server; continuing with local cache.', error);
    }

    if (!isAdmin) {
        try {
            let remotePlanner = await DataClient.getPlanner(currentUser);
            if (!remotePlanner || !Array.isArray(remotePlanner.entries)) {
                remotePlanner = { entries: [] };
            }
            localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(remotePlanner));
            plannerData = remotePlanner;
            lastPlannerSyncSignature = computePlannerSignature(plannerData.entries);
        } catch (error) {
            if (error.status === 404) {
                try {
                    await DataClient.savePlanner(currentUser, []);
                    localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ entries: [] }));
                    plannerData = { entries: [] };
                    lastPlannerSyncSignature = computePlannerSignature(plannerData.entries);
                } catch (plannerError) {
                    Debug.error('Planner bootstrap failed', plannerError);
                }
            } else {
                Debug.error('Failed to sync planner from server', error);
            }
        }
    }

    usersState = loadUsers();
    familiesState = loadFamilies();
    currentUserRecord = usersState.find(u => u.username === currentUser) || null;

    if (!isAdmin && !currentUserRecord) {
        Debug.warn('No matching user record found, redirecting to login');
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
        return;
    }

    if (currentUser === 'LunchTable1') {
        if (!usersState.some(user => user.username === 'LunchTable1')) {
            usersState.push({
                username: 'LunchTable1',
                email: 'demo@familyhub.local',
                role: 'demo',
                password: btoa('password'),
                familyId: null,
                verified: true,
                createdAt: new Date().toISOString()
            });
            saveUsers(usersState);
            currentUserRecord = usersState.find(user => user.username === currentUser) || currentUserRecord;
        }
        localStorage.setItem('familyhub_theme_LunchTable1', 'theme-ocean');
        if (typeof ThemeManager !== 'undefined') {
            ThemeManager.apply?.('theme-ocean');
        }
    }

    if (!isAdmin && currentUserRecord?.familyId) {
        currentFamily = familiesState.find(f => f.id === currentUserRecord.familyId) || null;
        if (currentFamily && Array.isArray(currentFamily.members)) {
            currentFamilyMember = currentFamily.members.find(member => member.username === currentUser) || null;
            const role = currentFamilyMember?.role || currentUserRecord.role;
            isFamilyOwner = role === 'owner';
            isFamilyAdult = role === 'owner' || role === 'adult';

            if (role === 'owner' || role === 'adult') {
                familyRoleLabel = ' (Adult)';
            } else if (role === 'kid') {
                familyRoleLabel = ' (Kid)';
            }
        }
    }

    if (isAdmin) {
        Debug.log('Admin user logged in');
    }

    const timezoneLabel = getTimezoneLabel();

    // Navigation
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.page-section');
    const manageFamilyBtn = document.getElementById('manageFamilyBtn');

    function activatePage(pageId) {
        navButtons.forEach(b => b.classList.toggle('active', b.getAttribute('data-page') === pageId));
        sections.forEach(section => section.classList.toggle('active', section.id === pageId));
    }

    navButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const targetPage = this.getAttribute('data-page');
            activatePage(targetPage);
        });
    });

    manageFamilyBtn?.addEventListener('click', () => {
        activatePage('familyChat');
        document.getElementById('familyChat')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (!currentFamily && !isAdmin) {
            setFamilySetupFeedback('');
            familySetupPanel?.classList.remove('hidden');
            toggleFamilyForms('join');
        } else if (currentFamily) {
            setFamilySetupFeedback('');
            familySetupPanel?.classList.add('hidden');
        }
    });

    async function callAI({ message, system, history = [], temperature = 0.7 }) {
        const payload = {
            message,
            history,
            temperature
        };

        if (system) {
            payload.system = system;
        }

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const data = await response.json().catch(() => ({}));

            if (!response.ok) {
                const errorMessage =
                    data?.message ||
                    data?.error ||
                    data?.details?.body?.error?.message ||
                    data?.details?.body?.raw ||
                    `Status ${response.status}`;
                const error = new Error(errorMessage);
                error.details = data?.details || data;
                error.status = response.status;
                throw error;
            }

            return (data.reply || '').trim();
        } catch (error) {
            Debug.error('AI call failed', error);
            throw error;
        }
    }

    function escapeHtml(str = '') {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatInlineText(inlineText = '') {
        if (!inlineText) return '';
        return inlineText
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/`([^`]+)`/g, (_, inner) => `<code>${escapeHtml(inner)}</code>`)
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>');
    }

    function applyInlineFormatting(text = '') {
        return formatInlineText(text);
    }

    function formatAiText(markdownText = '') {
        if (!markdownText || typeof markdownText !== 'string') return '';

        const tokens = [];
        const pushToken = token => {
            if (token && token.value) {
                tokens.push(token);
            }
        };

        let index = 0;
        const length = markdownText.length;
        while (index < length) {
            const remaining = markdownText.slice(index);

            const newlineMatch = remaining.match(/^\n+/);
            if (newlineMatch) {
                index += newlineMatch[0].length;
                pushToken({ type: 'newline' });
                continue;
            }

            const fenceMatch = remaining.match(/^```(\w+)?\n([\s\S]*?)\n```/);
            if (fenceMatch) {
                index += fenceMatch[0].length;
                pushToken({ type: 'preformatted', value: fenceMatch[2] });
                continue;
            }

            const strongMatch = remaining.match(/^\*\*(.+?)\*\*/);
            if (strongMatch) {
                index += strongMatch[0].length;
                pushToken({ type: 'strong', value: strongMatch[1] });
                continue;
            }

            const emMatch = remaining.match(/^\*(.+?)\*/);
            if (emMatch) {
                index += emMatch[0].length;
                pushToken({ type: 'em', value: emMatch[1] });
                continue;
            }

            const codeMatch = remaining.match(/^`([^`]+)`/);
            if (codeMatch) {
                index += codeMatch[0].length;
                pushToken({ type: 'code', value: codeMatch[1] });
                continue;
            }

            const bulletMatch = remaining.match(/^[-*]\s+/);
            if (bulletMatch) {
                index += bulletMatch[0].length;
                pushToken({ type: 'bullet' });
                continue;
            }

            const orderedMatch = remaining.match(/^\d+\.\s+/);
            if (orderedMatch) {
                index += orderedMatch[0].length;
                pushToken({ type: 'ordered' });
                continue;
            }

            const nextTokenIndex =
                (() => {
                    const lookahead = ['**', '*', '`', '\n', '```', '- ', '* ', '1. ', '2. ', '3. '];
                    let earliest = length;
                    lookahead.forEach(marker => {
                        const pos = markdownText.indexOf(marker, index + 1);
                        if (pos !== -1 && pos < earliest) earliest = pos;
                    });
                    return earliest;
                })();

            const text = markdownText.slice(index, nextTokenIndex);
            index = nextTokenIndex;
            pushToken({ type: 'text', value: text });
        }

        const fragments = [];
        let currentList = null;
        const openList = type => {
            if (currentList === type) return;
            if (currentList) fragments.push(`</${currentList}>`);
            currentList = type;
            fragments.push(`<${type}>`);
        };
        const closeList = () => {
            if (currentList) {
                fragments.push(`</${currentList}>`);
                currentList = null;
            }
        };

        const flushParagraph = paragraphTokens => {
            if (!paragraphTokens.length) return;
            const html = paragraphTokens
                .map(token => {
                    switch (token.type) {
                        case 'strong':
                            return `<strong>${formatInlineText(token.value)}</strong>`;
                        case 'em':
                            return `<em>${formatInlineText(token.value)}</em>`;
                        case 'code':
                            return `<code>${escapeHtml(token.value)}</code>`;
                        case 'preformatted':
                            return `<pre><code>${escapeHtml(token.value)}</code></pre>`;
                        case 'text':
                        default:
                            return formatInlineText(token.value);
                    }
                })
                .join('');
            if (html.trim()) {
                fragments.push(`<p>${html}</p>`);
            }
        };

        const paragraphBuffer = [];
        tokens.forEach(token => {
            switch (token.type) {
                case 'newline':
                    if (currentList) closeList();
                    flushParagraph(paragraphBuffer.splice(0, paragraphBuffer.length));
                    break;
                case 'bullet':
                    openList('ul');
                    flushParagraph(paragraphBuffer.splice(0, paragraphBuffer.length));
                    break;
                case 'ordered':
                    openList('ol');
                    flushParagraph(paragraphBuffer.splice(0, paragraphBuffer.length));
                    break;
                case 'text':
                case 'strong':
                case 'em':
                case 'code':
                case 'preformatted':
                    if (currentList) {
                        const content = formatInlineText(token.value || '');
                        const rendered =
                            token.type === 'strong'
                                ? `<strong>${formatInlineText(token.value)}</strong>`
                                : token.type === 'em'
                                ? `<em>${formatInlineText(token.value)}</em>`
                                : token.type === 'code'
                                ? `<code>${escapeHtml(token.value)}</code>`
                                : content;
                        if (token.type === 'preformatted') {
                            fragments.push(`<li><pre><code>${escapeHtml(token.value)}</code></pre></li>`);
                        } else {
                            fragments.push(`<li>${rendered}</li>`);
                        }
                    } else {
                        paragraphBuffer.push(token);
                    }
                    break;
                default:
                    break;
            }
        });

        closeList();
        flushParagraph(paragraphBuffer);
        return fragments.join('');
    }

    function parseJsonSafe(text) {
        if (!text) return null;
        let sanitized = text.trim();
        if (sanitized.startsWith('```')) {
            sanitized = sanitized.replace(/```json\s*/i, '').replace(/```$/, '').trim();
        }
        try {
            return JSON.parse(sanitized);
        } catch (error) {
            Debug.warn('Failed to parse AI JSON payload', { text: sanitized, error });
            return null;
        }
    }

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', function() {
        Debug.log('Logout initiated');
        Debug.auth('Logout', { username: currentUser });
        
        // Clear session data
        localStorage.removeItem('currentUser');
        localStorage.removeItem('lastLogin');
        localStorage.removeItem('isAdmin');
        localStorage.removeItem(FAMILY_MEMBERSHIP_KEY);
        setBackendMembership(currentUser, null);
        
        // Optionally clear remembered username (user can choose to keep it)
        // localStorage.removeItem('rememberedUsername');
        
        Debug.storage('delete', 'currentUser', null);
        window.location.href = 'index.html';
    });

    // Day Planner - Calendar Experience
    const calendarGrid = document.getElementById('calendarGrid');
    const calendarMonthEl = document.getElementById('calendarMonth');
    const calendarYearEl = document.getElementById('calendarYear');
    const selectedDayLabel = document.getElementById('selectedDayLabel');
    const selectedDayDate = document.getElementById('selectedDayDate');
    const statsTasks = document.getElementById('statsTasks');
    const statsEvents = document.getElementById('statsEvents');
    const dayEntries = document.getElementById('dayEntries');
    const todayBtn = document.getElementById('todayBtn');
    const addEntryBtn = document.getElementById('addEntryBtn');
    const reminderCodeInput = document.getElementById('reminderCodeInput');
    const importReminderCodeBtn = document.getElementById('importReminderCodeBtn');
    const prevMonthBtn = document.getElementById('prevMonth');
    const nextMonthBtn = document.getElementById('nextMonth');
    const aiPlanDayBtn = document.getElementById('aiPlanDayBtn');
    const aiDayInsights = document.getElementById('aiDayInsights');
    const aiDayInsightsContent = document.getElementById('aiDayInsightsContent');
    const clearAiInsightsBtn = document.getElementById('clearAiInsights');

    const taskModal = document.getElementById('taskModal');
    const taskForm = document.getElementById('taskForm');
    const closeModalBtn = document.querySelector('.close');
    const entryTypeInput = document.getElementById('entryType');
    const segmentButtons = Array.from(document.querySelectorAll('.segment'));
    const taskTitleInput = document.getElementById('taskTitle');
    const taskDescriptionInput = document.getElementById('taskDescription');
    const taskPriorityInput = document.getElementById('taskPriority');
    const taskDateInput = document.getElementById('taskDate');
    const taskEndDateInput = document.getElementById('taskEndDate');
    const taskTimeInput = document.getElementById('taskTime');
    const taskEndTimeInput = document.getElementById('taskEndTime');
    const endDateGroup = document.getElementById('endDateGroup');
    const endTimeGroup = document.getElementById('endTimeGroup');
    const modalTitle = document.getElementById('modalTitle');
    const saveEntryBtn = taskForm.querySelector('button[type="submit"]');
    const aiEntryAssistBtn = document.getElementById('aiEntryAssistBtn');
    const aiEntrySuggestion = document.getElementById('aiEntrySuggestion');

    const aiCustomizeBtn = document.getElementById('aiCustomizeBtn');
    const aiThemeModal = document.getElementById('aiThemeModal');
    const closeAiThemeModal = document.getElementById('closeAiThemeModal');
    const aiThemeForm = document.getElementById('aiThemeForm');
    const aiThemePrompt = document.getElementById('aiThemePrompt');
    const aiThemePreview = document.getElementById('aiThemePreview');
    const applyAiThemeBtn = document.getElementById('applyAiTheme');
    const resetAiThemeBtn = document.getElementById('resetAiTheme');

    const aiFocusBtn = document.getElementById('aiFocusBtn');
    const aiFocusResult = document.getElementById('aiFocusResult');
    const aiHabitInput = document.getElementById('aiHabitInput');
    const aiHabitBtn = document.getElementById('aiHabitBtn');
    const aiHabitResult = document.getElementById('aiHabitResult');
    const aiBreakInput = document.getElementById('aiBreakInput');
    const aiBreakBtn = document.getElementById('aiBreakBtn');
    const aiBreakResult = document.getElementById('aiBreakResult');
    const budgetForecastOutput = document.getElementById('budgetForecast');
    const budgetHealthOutput = document.getElementById('budgetHealth');
    const familyRemindersContainer = document.getElementById('familyRemindersContainer');
    const familyRemindersList = document.getElementById('familyRemindersList');
    const familyShareBlock = document.getElementById('familyShareBlock');
    const shareWithFamilyCheckbox = document.getElementById('shareWithFamily');
    const familyAssigneeGroup = document.getElementById('familyAssigneeGroup');
    const familyAssigneesSelect = document.getElementById('familyAssignees');
    const familyNameHeading = document.getElementById('familyNameHeading');
    const familyRoleLabelEl = document.getElementById('familyRoleLabel');
    const familyCodeBlock = document.getElementById('familyCodeBlock');
    const familyInviteCodeEl = document.getElementById('familyInviteCode');
    const regenerateCodeBtn = document.getElementById('regenerateCodeBtn');
    const familyMemberListEl = document.getElementById('familyMemberList');
    const familyChatMessagesEl = document.getElementById('familyChatMessages');
    const familyChatInput = document.getElementById('familyChatInput');
    const familyChatSendBtn = document.getElementById('familyChatSend');
    const familySetupPanel = document.getElementById('familySetupPanel');
    const showCreateFamilyBtn = document.getElementById('showCreateFamily');
    const showJoinFamilyBtn = document.getElementById('showJoinFamily');
    const createFamilyForm = document.getElementById('createFamilyForm');
    const joinFamilyForm = document.getElementById('joinFamilyForm');
    const createFamilyNameInput = document.getElementById('createFamilyName');
    const joinFamilyCodeInput = document.getElementById('joinFamilyCode');
    const joinFamilyRoleSelect = document.getElementById('joinFamilyRole');
    const familySetupFeedback = document.getElementById('familySetupFeedback');
    const workHoursForm = document.getElementById('workHoursForm');
    const itemCostInput = document.getElementById('itemCost');
    const hourlyRateInput = document.getElementById('hourlyRate');
    const savingsRateInput = document.getElementById('savingsRate');
    const workHoursResult = document.getElementById('workHoursResult');
    const financeAiForm = document.getElementById('financeAiForm');
    const financeAiPrompt = document.getElementById('financeAiPrompt');
    const financeAiResult = document.getElementById('financeAiResult');
    const budgetForm = document.getElementById('budgetForm');
    const budgetCategoriesContainer = document.getElementById('budgetCategories');
    const addBudgetRowBtn = document.getElementById('addBudgetRow');
    const budgetSummaryOutput = document.getElementById('budgetSummary');
    const budgetAiResult = document.getElementById('budgetAiResult');
    const monthlyIncomeInput = document.getElementById('monthlyIncome');
    const planningTipsList = document.getElementById('planningTipsList');
    const mealPlanForm = document.getElementById('mealPlanForm');
    const mealPreferencesInput = document.getElementById('mealPreferences');
    const mealExtrasInput = document.getElementById('mealExtras');
    const mealSuggestionOutput = document.getElementById('mealSuggestion');
    const mealStepsOutput = document.getElementById('mealSteps');
    const surpriseFocusSelect = document.getElementById('surpriseFocus');
    const surpriseBtn = document.getElementById('surpriseBtn');
    const surpriseResult = document.getElementById('surpriseResult');

    function updateFamilyStateFromStorage() {
        familiesState = loadFamilies();
        if (isAdmin) {
            currentFamily = null;
            currentFamilyMember = null;
            isFamilyOwner = false;
            isFamilyAdult = false;
            lastFamilySyncSignature = null;
            return;
        }

        const storedFamilyId =
            currentUserRecord?.familyId ||
            localStorage.getItem(FAMILY_MEMBERSHIP_KEY) ||
            getBackendMembership(currentUser) ||
            null;

        if (storedFamilyId) {
            currentFamily = familiesState.find(f => f.id === storedFamilyId) || null;
            if (!currentFamily) {
                const normalizedCode = String(storedFamilyId).trim().toUpperCase();
                currentFamily = familiesState.find(family => family.code && String(family.code).trim().toUpperCase() === normalizedCode) || null;
            }

            if (currentFamily) {
                currentFamilyMember =
                    currentFamily.members?.find(member => member.username === currentUser) || null;
                const role = currentFamilyMember?.role || currentUserRecord?.role || 'adult';
                isFamilyOwner = role === 'owner';
                isFamilyAdult = role === 'owner' || role === 'adult';
                currentFamilyMember =
                    currentFamilyMember || {
                        username: currentUser,
                        role
                    };
                lastFamilySyncSignature = computeFamilySignature(currentFamily);

                if (!currentUserRecord || currentUserRecord.familyId !== currentFamily.id) {
                    currentUserRecord = {
                        ...(currentUserRecord || {}),
                        username: currentUser,
                        familyId: currentFamily.id,
                        role
                    };
                    const updatedUsers = loadUsers().filter(user => user.username !== currentUser);
                    updatedUsers.push(currentUserRecord);
                    saveUsers(updatedUsers);
                    usersState = updatedUsers;
                }

                if (localStorage.getItem(FAMILY_MEMBERSHIP_KEY) !== currentFamily.id) {
                    localStorage.setItem(FAMILY_MEMBERSHIP_KEY, currentFamily.id);
                    setBackendMembership(currentUser, currentFamily.id);
                }
            } else {
                currentFamily = null;
                currentFamilyMember = null;
                isFamilyOwner = false;
                isFamilyAdult = false;
                lastFamilySyncSignature = null;
                localStorage.removeItem(FAMILY_MEMBERSHIP_KEY);
                setBackendMembership(currentUser, null);
            }
        } else {
            currentFamily = null;
            currentFamilyMember = null;
            isFamilyOwner = false;
            isFamilyAdult = false;
            lastFamilySyncSignature = null;
            setBackendMembership(currentUser, null);
        }
    }

    async function updateFamily(mutator) {
        if (!currentFamily) return null;
        familiesState = loadFamilies();
        const index = familiesState.findIndex(f => f.id === currentFamily.id);
        if (index === -1) return null;
        const draft = {
            ...familiesState[index],
            members: Array.isArray(familiesState[index].members) ? [...familiesState[index].members] : [],
            reminders: Array.isArray(familiesState[index].reminders) ? [...familiesState[index].reminders] : [],
            chat: Array.isArray(familiesState[index].chat) ? [...familiesState[index].chat] : []
        };
        mutator(draft);

        familiesState[index] = draft;
        saveFamilies(familiesState);
        currentFamily = draft;
        currentFamilyMember = draft.members.find(member => member.username === currentUser) || currentFamilyMember;
        const role = currentFamilyMember?.role || currentUserRecord?.role;
        isFamilyOwner = role === 'owner';
        isFamilyAdult = role === 'owner' || role === 'adult';
        lastFamilySyncSignature = computeFamilySignature(currentFamily);

        try {
            const savedFamily = await DataClient.updateFamily(draft);
            if (savedFamily) {
                familiesState[index] = savedFamily;
                saveFamilies(familiesState);
                currentFamily = savedFamily;
                currentFamilyMember =
                    savedFamily.members.find(member => member.username === currentUser) || currentFamilyMember;
                const updatedRole = currentFamilyMember?.role || currentUserRecord?.role;
                isFamilyOwner = updatedRole === 'owner';
                isFamilyAdult = updatedRole === 'owner' || updatedRole === 'adult';
                lastFamilySyncSignature = computeFamilySignature(currentFamily);
                return savedFamily;
            }
        } catch (error) {
            Debug.warn('Failed to sync family remotely; using local changes.', error);
        }
        return draft;
    }

    async function syncCurrentFamilyFromServer({ silent = false } = {}) {
        if (isAdmin) return false;
        const familyId =
            currentFamily?.id ||
            currentUserRecord?.familyId ||
            localStorage.getItem(FAMILY_MEMBERSHIP_KEY);
        if (!familyId) return false;

        try {
            const remoteFamily = await DataClient.getFamilyById(familyId);
            if (!remoteFamily) return false;

            const signature = computeFamilySignature(remoteFamily);
            const hasChanged = signature && signature !== lastFamilySyncSignature;
            const index = familiesState.findIndex(family => family.id === remoteFamily.id);
            if (index === -1) {
                familiesState.push(remoteFamily);
            } else {
                familiesState[index] = remoteFamily;
            }
            saveFamilies(familiesState);
            currentFamily = remoteFamily;
            currentFamilyMember =
                remoteFamily.members?.find(member => member.username === currentUser) || currentFamilyMember;
            const role = currentFamilyMember?.role || currentUserRecord?.role;
            isFamilyOwner = role === 'owner';
            isFamilyAdult = role === 'owner' || role === 'adult';
            lastFamilySyncSignature = signature;
            setBackendMembership(currentUser, currentFamily?.id || familyId);

            if (!silent || hasChanged) {
                renderFamilyOverview();
                renderFamilyChat();
                renderFamilyReminders(selectedDateISO);
            }
            return hasChanged;
        } catch (error) {
            if (!silent) {
                Debug.warn('Failed to sync family from server; keeping local data.', error);
            }
            return false;
        }
    }

    async function syncPlannerFromServer({ silent = false } = {}) {
        if (isAdmin) return false;
        try {
            const remotePlanner = await DataClient.getPlanner(currentUser);
            const entries = Array.isArray(remotePlanner?.entries) ? remotePlanner.entries : [];
            const signature = computePlannerSignature(entries);
            const hasChanged = signature && signature !== lastPlannerSyncSignature;
            if (!hasChanged && silent) {
                return false;
            }
            ensureEntryShareCodes(entries);
            persistPlannerEntries(currentUser, entries);
            plannerData.entries = entries;
            localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ entries }));
            lastPlannerSyncSignature = signature;
            if (!silent || hasChanged) {
                renderCalendar();
                renderDayDetail();
            }
            return hasChanged;
        } catch (error) {
            if (!silent) {
                Debug.warn('Failed to sync planner from server; keeping local cache.', error);
            }
            return false;
        }
    }

    async function updateUserRole(username, newRole) {
        try {
            if (currentFamily) {
                const result = await DataClient.updateFamilyMemberRole({
                    username,
                    familyId: currentFamily.id,
                    role: newRole
                });

                if (result?.family) {
                    familiesState = familiesState.map(f => (f.id === result.family.id ? result.family : f));
                    saveFamilies(familiesState);
                    currentFamily = result.family;
                    currentFamilyMember =
                        result.family.members.find(member => member.username === currentUser) || currentFamilyMember;
                }

                if (result?.user) {
                    const usersLocal = loadUsers().filter(u => u.username !== result.user.username);
                    usersLocal.push(result.user);
                    saveUsers(usersLocal);
                    usersState = usersLocal;
                    if (result.user.username === currentUser) {
                        currentUserRecord = result.user;
                    }
                }
            } else {
                const updatedUser = await DataClient.updateUser(username, { role: newRole });
                if (updatedUser) {
                    const usersLocal = loadUsers().filter(u => u.username !== updatedUser.username);
                    usersLocal.push(updatedUser);
                    saveUsers(usersLocal);
                    usersState = usersLocal;
                    if (updatedUser.username === currentUser) {
                        currentUserRecord = updatedUser;
                    }
                }
            }
        } catch (error) {
            Debug.error('Failed to update user role via API', error);
        }
    }

    function renderUserHeader() {
        const headerEl = document.getElementById('currentUser');
        if (!headerEl) return;
        let suffix = '';
        if (isAdmin) {
            suffix = ' (Admin)';
        } else if (currentFamily) {
            const role = currentFamilyMember?.role || currentUserRecord?.role;
            if (role === 'owner' || role === 'adult') {
                suffix = ' (Adult)';
            } else if (role === 'kid') {
                suffix = ' (Kid)';
            }
        }
        headerEl.textContent = `Welcome, ${currentUser}${suffix}`;
    }

    function roleLabelForMember(role) {
        if (role === 'owner') return 'Adult (Owner)';
        if (role === 'adult') return 'Adult';
        if (role === 'kid') return 'Kid';
        return 'Member';
    }

    updateFamilyStateFromStorage();
    renderUserHeader();

    if (familyShareBlock) {
        const showShare = currentFamily && isFamilyOwner;
        familyShareBlock.classList.toggle('hidden', !showShare);
        familyAssigneeGroup?.classList.add('hidden');
        if (!showShare && shareWithFamilyCheckbox) {
            shareWithFamilyCheckbox.checked = false;
        }
    }

    shareWithFamilyCheckbox?.addEventListener('change', () => {
        if (!familyAssigneeGroup) return;
        familyAssigneeGroup.classList.toggle('hidden', !shareWithFamilyCheckbox.checked);
    });

    function setFamilySetupFeedback(message, tone = 'neutral') {
        if (!familySetupFeedback) return;
        familySetupFeedback.textContent = message || '';
        familySetupFeedback.style.color =
            tone === 'error' ? 'var(--danger-color)' : tone === 'success' ? 'var(--primary-color)' : 'var(--text-secondary)';
    }

    function toggleFamilyForms(mode) {
        if (!familySetupPanel) return;
        setFamilySetupFeedback('');
        if (mode === 'create') {
            createFamilyForm?.classList.remove('hidden');
            joinFamilyForm?.classList.add('hidden');
        } else if (mode === 'join') {
            joinFamilyForm?.classList.remove('hidden');
            createFamilyForm?.classList.add('hidden');
        } else {
            createFamilyForm?.classList.add('hidden');
            joinFamilyForm?.classList.add('hidden');
        }
    }

    showCreateFamilyBtn?.addEventListener('click', () => toggleFamilyForms('create'));
    showJoinFamilyBtn?.addEventListener('click', () => toggleFamilyForms('join'));

    let plannerData = loadPlannerData();
    let currentMonth = new Date();
    let selectedDateISO = toLocalISO(new Date());
    let editingEntryId = null;

    async function ensureDemoPlannerCoverage() {
        if (currentUser !== 'LunchTable1') return;
        const uniqueDays = new Set((plannerData.entries || []).map(entry => entry.startDate));
        const referenceDate = new Date();
        const monthLength = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 0).getDate();
        if (uniqueDays.size >= monthLength - 1) return;
        const generator = typeof window !== 'undefined' ? window.generateDemoPlannerEntries : null;
        if (!generator) return;
        const demoEntries = generator(referenceDate);
        plannerData.entries = demoEntries;
        await savePlannerData();
    }

    function loadPlannerData() {
        try {
            const backend = loadBackendStore();
            const entries = Array.isArray(backend.planners?.[currentUser])
                ? backend.planners[currentUser]
                : null;
            if (entries) {
                ensureEntryShareCodes(entries);
                persistPlannerEntries(currentUser, entries);
                lastPlannerSyncSignature = computePlannerSignature(entries);
                localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify({ entries }));
                return { entries };
            }
        } catch (error) {
            Debug.warn('Failed to load planner from backend store', error);
        }

        try {
            const stored = JSON.parse(localStorage.getItem(PLANNER_STORAGE_KEY) || '{}');
            if (!stored || !Array.isArray(stored.entries)) {
                lastPlannerSyncSignature = computePlannerSignature([]);
                return { entries: [] };
            }
            ensureEntryShareCodes(stored.entries);
            persistPlannerEntries(currentUser, stored.entries);
            lastPlannerSyncSignature = computePlannerSignature(stored.entries);
            return stored;
        } catch (error) {
            Debug.error('Failed to load planner data', error);
            lastPlannerSyncSignature = computePlannerSignature([]);
            return { entries: [] };
        }
    }

    async function savePlannerData() {
        ensureEntryShareCodes(plannerData.entries);
        try {
            localStorage.setItem(PLANNER_STORAGE_KEY, JSON.stringify(plannerData));
            Debug.storage('write', PLANNER_STORAGE_KEY, plannerData.entries.length);
        } catch (error) {
            Debug.error('Failed to save planner data', error);
        }
        lastPlannerSyncSignature = computePlannerSignature(plannerData.entries);
        try {
            persistPlannerEntries(currentUser, plannerData.entries || []);
        } catch (error) {
            Debug.error('Failed to persist planner to backend store', error);
        }
        if (!isAdmin) {
            try {
                await DataClient.savePlanner(currentUser, plannerData.entries || []);
            } catch (error) {
                Debug.error('Failed to sync planner to server', error);
            }
        }
    }

    function setEntryType(type) {
        entryTypeInput.value = type;
        segmentButtons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.type === type);
        });

        const isEvent = type === 'event';
        endDateGroup.style.display = isEvent ? '' : 'none';
        endTimeGroup.style.display = isEvent ? '' : 'none';
        taskEndDateInput.required = isEvent;
        taskEndTimeInput.required = false;

        modalTitle.textContent = editingEntryId
            ? `Edit ${isEvent ? 'Event' : 'Task'}`
            : `New ${isEvent ? 'Event' : 'Task'}`;
        saveEntryBtn.textContent = editingEntryId ? 'Update Entry' : 'Save Entry';
    }

    segmentButtons.forEach(btn => {
        btn.addEventListener('click', () => setEntryType(btn.dataset.type));
    });

    function formatMonthYear(date) {
        return {
            month: date.toLocaleDateString(undefined, { month: 'long' }),
            year: date.getFullYear()
        };
    }

    function dateToISO(date) {
        return toLocalISO(date);
    }

    function getEntriesForDate(dateISO) {
        return plannerData.entries.filter(entry => {
            const start = entry.startDate;
            const end = entry.endDate || entry.startDate;
            return dateISO >= start && dateISO <= end;
        });
    }

    function getIndicatorCounts(dateISO) {
        let tasks = 0;
        let events = 0;
        plannerData.entries.forEach(entry => {
            const start = entry.startDate;
            const end = entry.endDate || entry.startDate;
            if (dateISO >= start && dateISO <= end) {
                if (entry.type === 'event') events += 1;
                else tasks += 1;
            }
        });

        if (currentFamily) {
            const reminders = Array.isArray(currentFamily.reminders) ? currentFamily.reminders : [];
            reminders.forEach(reminder => {
                if (reminder.date !== dateISO) return;
                const assigned = Array.isArray(reminder.assignedTo) ? reminder.assignedTo : [];
                const visible =
                    isFamilyOwner ||
                    isFamilyAdult ||
                    assigned.length === 0 ||
                    assigned.includes(currentUser);
                if (visible) {
                    tasks += 1;
                }
            });
        }

        return { tasks, events };
    }

    function renderCalendar() {
        const { month, year } = formatMonthYear(currentMonth);
        calendarMonthEl.textContent = month;
        calendarYearEl.textContent = year;

        calendarGrid.innerHTML = '';

        const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
        const startDay = startOfMonth.getDay();
        const daysInMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0).getDate();
        const daysInPrevMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 0).getDate();

        const totalCells = 42;

        for (let i = 0; i < totalCells; i++) {
            const dayCell = document.createElement('div');
            dayCell.className = 'calendar-day';

            let dayNumber;
            let cellDate;
            if (i < startDay) {
                dayNumber = daysInPrevMonth - startDay + i + 1;
                dayCell.classList.add('outside');
                cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, dayNumber);
            } else if (i >= startDay + daysInMonth) {
                dayNumber = i - (startDay + daysInMonth) + 1;
                dayCell.classList.add('outside');
                cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, dayNumber);
            } else {
                dayNumber = i - startDay + 1;
                cellDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), dayNumber);
            }

            const isoDate = dateToISO(cellDate);
            dayCell.dataset.date = isoDate;

            const dayNumberEl = document.createElement('span');
            dayNumberEl.className = 'day-number';
            dayNumberEl.textContent = dayNumber;
            dayCell.appendChild(dayNumberEl);

            const indicators = document.createElement('div');
            indicators.className = 'day-indicators';
            const counts = getIndicatorCounts(isoDate);

            for (let t = 0; t < counts.tasks; t += 1) {
                const dot = document.createElement('span');
                dot.className = 'indicator task';
                indicators.appendChild(dot);
            }

            for (let e = 0; e < counts.events; e += 1) {
                const dot = document.createElement('span');
                dot.className = 'indicator event';
                indicators.appendChild(dot);
            }

            if (counts.tasks + counts.events > 0) {
                dayCell.appendChild(indicators);
            }

            const todayISO = toLocalISO(new Date());
            if (isoDate === todayISO) {
                dayCell.classList.add('today');
            }

            if (isoDate === selectedDateISO) {
                dayCell.classList.add('selected');
            }

            dayCell.addEventListener('click', () => {
                selectedDateISO = isoDate;
                renderCalendar();
                renderDayDetail();
            });

            calendarGrid.appendChild(dayCell);
        }
    }

    function renderDayDetail() {
        updateFamilyStateFromStorage();
        const selectedDateObj = new Date(`${selectedDateISO}T00:00:00`);
        selectedDayLabel.textContent = selectedDateObj.toLocaleDateString(undefined, {
            weekday: 'long'
        });
        selectedDayDate.textContent = `${selectedDateObj.toLocaleDateString(undefined, {
            month: 'long',
            day: 'numeric',
            year: 'numeric'
        })} • ${timezoneLabel}`;

        const dayEntriesData = getEntriesForDate(selectedDateISO).sort((a, b) => {
            const aTime = a.startTime || '00:00';
            const bTime = b.startTime || '00:00';
            return aTime.localeCompare(bTime);
        });
        const familyRemindersForDay = getFamilyRemindersForDate(selectedDateISO);

        if (aiDayInsights) {
            aiDayInsights.classList.add('hidden');
            aiDayInsights.classList.remove('loading');
            if (aiDayInsightsContent) {
                aiDayInsightsContent.innerHTML = '';
            }
        }

        const { tasks, events } = getIndicatorCounts(selectedDateISO);
        statsTasks.textContent = tasks;
        statsEvents.textContent = events;

        dayEntries.innerHTML = '';
        dayEntries.classList.toggle('empty', dayEntriesData.length === 0);

        if (dayEntriesData.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'empty-state';
            empty.innerHTML = `
                <h3>No plans yet</h3>
                <p>Pick a time and add a task or event to keep your day on track.</p>
                <button type="button" class="btn btn-primary btn-small" id="emptyStateAddInternal">
                    Plan something
                </button>
            `;
            dayEntries.appendChild(empty);
            empty.querySelector('#emptyStateAddInternal').addEventListener('click', () => openEntryModal('create'));
        } else {
        dayEntriesData.forEach(entry => {
            const card = document.createElement('div');
            card.className = 'entry-card';

            const header = document.createElement('div');
            header.className = 'entry-header';

            const badge = document.createElement('span');
            badge.className = `entry-type-badge ${entry.type}`;
            badge.textContent = entry.type === 'event' ? 'Event' : 'Task';
            header.appendChild(badge);

            const priorityLabel = formatPriorityLabel(entry.priority);
            if (priorityLabel) {
                const priorityClass = priorityLabel === 'High' ? 'high' : priorityLabel === 'Low' ? 'low' : 'normal';
                const priorityChip = document.createElement('span');
                priorityChip.className = `priority-chip ${priorityClass}`;
                priorityChip.textContent = `Priority: ${priorityLabel}`;
                header.appendChild(priorityChip);
            }

            card.appendChild(header);

            const content = document.createElement('div');
            content.className = 'entry-content';

            const title = document.createElement('div');
            title.className = 'entry-title';
            title.textContent = entry.title;
            content.appendChild(title);

            const timeRange = document.createElement('div');
            timeRange.className = 'entry-time-range';
            let timeLabel = 'All day';

            if (entry.type === 'event') {
                const startDate = entry.startDate || selectedDateISO;
                const endDate = entry.endDate || startDate;
                const startTime = entry.startTime ? formatTimeDisplay(startDate, entry.startTime) : '';
                const endTime = entry.endTime ? formatTimeDisplay(endDate, entry.endTime) : '';

                if (startDate !== endDate) {
                    const startDateLabel = new Date(startDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const endDateLabel = new Date(endDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                    const timePart = startTime || endTime ? ` • ${[startTime, endTime].filter(Boolean).join(' – ')} ${timezoneLabel}` : '';
                    timeLabel = `${startDateLabel} – ${endDateLabel}${timePart}`;
                } else if (startTime || endTime) {
                    const parts = [];
                    if (startTime) parts.push(startTime);
                    if (endTime) parts.push(endTime);
                    timeLabel = `${parts.join(' – ')} ${timezoneLabel}`;
                } else {
                    timeLabel = 'All-day event';
                }
            } else if (entry.startTime) {
                timeLabel = `${formatTimeDisplay(selectedDateISO, entry.startTime)} ${timezoneLabel}`;
            }

            timeRange.textContent = timeLabel;
            content.appendChild(timeRange);

            if (entry.notes) {
                const notes = document.createElement('div');
                notes.className = 'entry-notes';
                notes.innerHTML = applyInlineFormatting(entry.notes);
                content.appendChild(notes);
            }

            card.appendChild(content);

            const actions = document.createElement('div');
            actions.className = 'entry-actions';

            const editBtn = document.createElement('button');
            editBtn.className = 'btn btn-secondary btn-small';
            editBtn.textContent = 'Edit';
            editBtn.addEventListener('click', () => openEntryModal('edit', entry));

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-danger btn-small';
            deleteBtn.textContent = 'Delete';
            deleteBtn.addEventListener('click', () => deleteEntry(entry.id));

            actions.appendChild(editBtn);
            actions.appendChild(deleteBtn);

            if (entry.type === 'task') {
                const practiceBtn = document.createElement('button');
                practiceBtn.className = 'btn btn-tertiary btn-small';
                practiceBtn.textContent = 'Practice Tips';
                actions.appendChild(practiceBtn);

                const aiHelpContainer = document.createElement('div');
                aiHelpContainer.className = 'ai-help';
                aiHelpContainer.style.display = 'none';
                card.appendChild(aiHelpContainer);

                practiceBtn.addEventListener('click', () => {
                    handlePracticeAssist(entry, aiHelpContainer, practiceBtn);
                });
            }

            card.appendChild(actions);

            const shareRow = document.createElement('div');
            shareRow.className = 'entry-share';
            const codeLabel = document.createElement('span');
            codeLabel.innerHTML = `Code: <code>${entry.shareCode || '------'}</code>`;
            const shareActions = document.createElement('div');
            shareActions.className = 'share-actions';
            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'btn btn-secondary subtle btn-mini';
            copyBtn.textContent = 'Copy Code';
            copyBtn.addEventListener('click', () => copyShareCode(entry.shareCode));
            shareActions.appendChild(copyBtn);
            shareRow.appendChild(codeLabel);
            shareRow.appendChild(shareActions);
            card.appendChild(shareRow);

                dayEntries.appendChild(card);
            });
        }

        renderFamilyReminders(selectedDateISO, familyRemindersForDay);
        renderPlanningTips(dayEntriesData, familyRemindersForDay);
    }

    async function handlePracticeAssist(entry, container, triggerBtn) {
        if (!container) return;

        const context = [
            `Task title: ${entry.title || 'Untitled task'}`,
            entry.startDate ? `Date: ${entry.startDate}` : '',
            entry.notes ? `Notes: ${entry.notes}` : '',
            entry.startTime ? `Time: ${entry.startTime}` : '',
            entry.priority ? `Priority: ${entry.priority}` : ''
        ]
            .filter(Boolean)
            .join('\n');

        container.style.display = 'block';
        container.classList.add('loading');
        container.innerHTML = '';
        triggerBtn.disabled = true;

        try {
            const reply = await callAI({
                system:
                    'You are a compassionate study coach. Provide step-by-step practice guidance to help the student make progress without revealing full answers. Include reminders of key concepts and suggested practice problems.',
                message: `Give me guidance for this task:\n${context}\nRespond in short bullet points and encourage active learning.`,
                temperature: 0.4
            });

            container.classList.remove('loading');
            container.innerHTML = formatAiText(reply || 'No suggestions available.');
        } catch (error) {
            container.classList.remove('loading');
            container.innerHTML =
                '<p style="color: var(--danger-color);">Couldn’t load AI help right now. Try again in a bit.</p>';
        } finally {
            triggerBtn.disabled = false;
        }
    }

    async function suggestEntryDetails() {
        if (!aiEntrySuggestion) return;
        const title = taskTitleInput.value.trim();
        if (!title) {
            aiEntrySuggestion.innerHTML =
                '<p style="color: var(--danger-color);">Add a title first so AI knows what to plan.</p>';
            return;
        }

        const type = entryTypeInput.value || 'task';
        const notes = taskDescriptionInput.value.trim();
        const date = taskDateInput.value || selectedDateISO;
        const time = taskTimeInput.value || 'unspecified';

        aiEntrySuggestion.classList.add('loading');
        aiEntrySuggestion.innerHTML = '';

        try {
            const reply = await callAI({
                system:
                    'You help busy families prepare for events and tasks. Return concise bullet lists of preparation steps, materials to gather, and reminders.',
                message: `Create preparation tips for a ${type}. Title: "${title}". Date: ${date}. Time: ${time}. Notes: ${notes || 'none'}.`,
                temperature: 0.45
            });
            aiEntrySuggestion.classList.remove('loading');
            aiEntrySuggestion.innerHTML =
                formatAiText(reply || 'No tips generated.') || '<p>No tips generated.</p>';
        } catch (error) {
            aiEntrySuggestion.classList.remove('loading');
            aiEntrySuggestion.innerHTML =
                '<p style="color: var(--danger-color);">AI is unavailable right now. Try again later.</p>';
        }
    }

    const AI_SUGGESTION_JSON_PROMPT =
        'You are an elite planning assistant. Respond with STRICT JSON in the form {"suggestions":[{"title":"","summary":"","category":"","time":"","duration":"","motivation":""}, ...]}. up to 4 suggestions, omit null fields.';
    const MEAL_PLANNER_JSON_PROMPT =
        'You are a friendly, fast family chef. Respond with STRICT JSON {"title":"","summary":"","ingredients":[""],"steps":[""],"extraTip":""}. Keep ingredients short and use pantry-friendly language.';
    const SURPRISE_PROMPT =
        'You are an upbeat household motivator. Given a focus area, respond with Markdown containing one quick action, one micro-win suggestion, and one encouragement sentence.';

    async function generateDayPlanInsights() {
        if (!aiDayInsights || !aiDayInsightsContent) return;

        aiDayInsights.classList.remove('hidden');
        aiDayInsights.classList.add('loading');
        aiDayInsightsContent.innerHTML = '<p>Gathering ideas for your day...</p>';
        aiPlanDayBtn.disabled = true;

        const entriesForDay = getEntriesForDate(selectedDateISO);
        const familyRemindersForDay = getFamilyRemindersForDate(selectedDateISO);

        const dayEntriesData = entriesForDay
            .sort((a, b) => (a.startTime || '00:00').localeCompare(b.startTime || '00:00'))
            .map(entry => {
                const parts = [`Title: ${entry.title}`];
                if (entry.type) parts.push(`Type: ${entry.type}`);
                if (entry.startTime) parts.push(`Time: ${entry.startTime}`);
                if (entry.notes) parts.push(`Notes: ${entry.notes}`);
                return parts.join(' | ');
            })
            .join('\n');

        const familyContext = familyRemindersForDay
            .map(reminder => {
                const assigned = Array.isArray(reminder.assignedTo) ? reminder.assignedTo.join(', ') : 'Everyone';
                return `Family reminder: ${reminder.title} | Time: ${reminder.time || 'All day'} | Assigned: ${assigned}`;
            })
            .join('\n');

        const selectedDateObj = new Date(`${selectedDateISO}T00:00:00`);
        const friendlyDate = selectedDateObj.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric'
        });

        try {
            const reply = await callAI({
                system: AI_SUGGESTION_JSON_PROMPT,
                message: `Today is ${friendlyDate} (${selectedDateISO}). Existing plans:\n${dayEntriesData || 'None yet.'}\nFamily commitments:\n${familyContext || 'No shared reminders today.'}\nSuggest meaningful tasks or reminders that support productivity, self-care, and family life.`,
                temperature: 0.35
            });

            const parsed = parseJsonSafe(reply);
            if (parsed?.suggestions?.length) {
                renderAiPlanSuggestions(parsed.suggestions);
            } else {
                aiDayInsightsContent.innerHTML = formatAiText(reply || 'No suggestions available.');
            }
        } catch (error) {
            const message =
                error?.message || 'AI is unavailable right now. Please try again soon.';
            aiDayInsightsContent.innerHTML = `<p style="color: var(--danger-color);">${message}</p>`;
        } finally {
            aiDayInsights.classList.remove('loading');
            aiPlanDayBtn.disabled = false;
        }
    }

    function renderAiPlanSuggestions(suggestions = []) {
        aiDayInsightsContent.innerHTML = '';
        if (!suggestions.length) {
            aiDayInsightsContent.innerHTML = '<p>No new ideas right now.</p>';
            return;
        }

        suggestions.forEach(item => {
            const chip = document.createElement('div');
            chip.className = 'ai-day-suggestion-chip';

            const title = document.createElement('strong');
            title.textContent = item.title || 'Suggestion';
            chip.appendChild(title);

            if (item.summary) {
                const summary = document.createElement('p');
                summary.textContent = item.summary;
                chip.appendChild(summary);
            }

            if (item.time || item.duration) {
                const meta = document.createElement('p');
                meta.style.fontSize = '0.85rem';
                meta.style.color = 'var(--text-secondary)';
                meta.textContent = [item.time, item.duration].filter(Boolean).join(' • ');
                chip.appendChild(meta);
            }

            if (item.motivation) {
                const motivation = document.createElement('p');
                motivation.style.fontStyle = 'italic';
                motivation.textContent = item.motivation;
                chip.appendChild(motivation);
            }

            const actions = document.createElement('div');
            actions.style.marginTop = '8px';

            const addBtn = document.createElement('button');
            addBtn.className = 'btn btn-secondary btn-small';
            addBtn.textContent = 'Add to planner';
            addBtn.addEventListener('click', () => {
                openEntryModal('create');
                taskTitleInput.value = item.title || 'New reminder';
                taskDescriptionInput.value = item.summary || '';
                taskDateInput.value = selectedDateISO;
                taskEndDateInput.value = selectedDateISO;
                setEntryType((item.category || '').toLowerCase().includes('event') ? 'event' : 'task');

                if (item.time && /^\d{1,2}:\d{2}/.test(item.time)) {
                    taskTimeInput.value = item.time.slice(0, 5);
                }

                if (item.duration && /\d+/.test(item.duration)) {
                    taskDescriptionInput.value += `\nSuggested duration: ${item.duration}`;
                }
            });

            actions.appendChild(addBtn);
            chip.appendChild(actions);

            aiDayInsightsContent.appendChild(chip);
        });
    }

    function openEntryModal(mode, entry = null) {
        taskForm.reset();
        editingEntryId = mode === 'edit' && entry ? entry.id : null;

        const baseDate = entry?.startDate || selectedDateISO;
        taskDateInput.value = baseDate;

        if (entry) {
            taskTitleInput.value = entry.title || '';
            taskDescriptionInput.value = entry.notes || '';
            taskPriorityInput.value = entry.priority || 'normal';
            taskTimeInput.value = entry.startTime || '';
            taskEndTimeInput.value = entry.endTime || '';
            taskEndDateInput.value = entry.endDate || entry.startDate;
            setEntryType(entry.type || 'task');
        } else {
            taskDescriptionInput.value = '';
            taskPriorityInput.value = 'normal';
            taskEndDateInput.value = baseDate;
            taskTimeInput.value = '';
            taskEndTimeInput.value = '';
            setEntryType('task');
        }

        if (aiEntrySuggestion) {
            aiEntrySuggestion.classList.remove('loading');
            aiEntrySuggestion.innerHTML = '';
        }

        if (familyShareBlock) {
            const canShare = currentFamily && isFamilyOwner;
            familyShareBlock.classList.toggle('hidden', !canShare);
            if (shareWithFamilyCheckbox) {
                shareWithFamilyCheckbox.checked = false;
            }
            if (familyAssigneeGroup) {
                familyAssigneeGroup.classList.add('hidden');
            }
            if (canShare && familyAssigneesSelect) {
                familyAssigneesSelect.innerHTML = '';
                const everyoneOption = document.createElement('option');
                everyoneOption.value = '__all';
                everyoneOption.textContent = 'Entire family';
                familyAssigneesSelect.appendChild(everyoneOption);

                (currentFamily.members || [])
                    .filter(member => member.username !== currentUser)
                    .forEach(member => {
                        const opt = document.createElement('option');
                        opt.value = member.username;
                        opt.textContent = `${member.username} (${roleLabelForMember(member.role)})`;
                        familyAssigneesSelect.appendChild(opt);
                    });

                familyAssigneesSelect.size = Math.min(6, familyAssigneesSelect.options.length);
                familyAssigneesSelect.selectedIndex = 0;
            }
        }

        taskModal.classList.add('show');
        setTimeout(() => taskTitleInput.focus(), 50);
    }

    function closeModal() {
        taskModal.classList.remove('show');
        if (shareWithFamilyCheckbox) {
            shareWithFamilyCheckbox.checked = false;
        }
        familyAssigneeGroup?.classList.add('hidden');
    }

    async function deleteEntry(entryId) {
        if (!confirm('Remove this entry?')) return;
        plannerData.entries = plannerData.entries.filter(entry => entry.id !== entryId);
        await savePlannerData();
        renderCalendar();
        renderDayDetail();
        Debug.log('Entry deleted', entryId);
    }

    async function copyShareCode(code) {
        if (!code) {
            alert('This reminder does not have a code yet. Try again after saving.');
            return;
        }
        try {
            await navigator.clipboard.writeText(code);
            Debug.log('Reminder code copied to clipboard', code);
            alert(`Reminder code copied! Share this code so someone else can import it: ${code}`);
        } catch (error) {
            Debug.warn('Clipboard copy failed for share code', error);
            prompt('Copy this reminder code manually:', code);
        }
    }

    function normalizeReminderCode(input = '') {
        return input.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    }

    async function importReminderByCode(codeRaw) {
        const code = normalizeReminderCode(codeRaw);
        if (reminderCodeInput) {
            reminderCodeInput.value = code;
        }
        if (!code) {
            alert('Enter a reminder code to import.');
            return;
        }
        const record = getPlannerEntryByShareCode(code);
        if (!record || !record.entry) {
            alert('We could not find a reminder with that code. Double-check and try again.');
            return;
        }

        const duplicate = plannerData.entries.some(entry => entry.shareCode === code);
        if (duplicate) {
            alert('This reminder is already in your planner.');
            return;
        }

        const clone = {
            ...record.entry,
            id:
                typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                    ? crypto.randomUUID()
                    : `entry_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            createdAt: new Date().toISOString(),
            shareCode: null
        };

        plannerData.entries.push(clone);
        plannerData.entries.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        await savePlannerData();
        renderCalendar();
        renderDayDetail();
        if (reminderCodeInput) {
            reminderCodeInput.value = '';
        }
        alert('Reminder imported! You can now adjust it in your planner.');
    }

    if (aiEntryAssistBtn) {
        aiEntryAssistBtn.addEventListener('click', suggestEntryDetails);
    }

    if (aiPlanDayBtn) {
        aiPlanDayBtn.addEventListener('click', generateDayPlanInsights);
    }

    if (clearAiInsightsBtn && aiDayInsights) {
        clearAiInsightsBtn.addEventListener('click', () => {
            aiDayInsights.classList.add('hidden');
            aiDayInsightsContent.innerHTML = '';
        });
    }

    prevMonthBtn.addEventListener('click', () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        renderCalendar();
    });

    nextMonthBtn.addEventListener('click', () => {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        renderCalendar();
    });

    todayBtn.addEventListener('click', () => {
        currentMonth = new Date();
        selectedDateISO = toLocalISO(new Date());
        renderCalendar();
        renderDayDetail();
    });

    addEntryBtn.addEventListener('click', () => openEntryModal('create'));
    importReminderCodeBtn?.addEventListener('click', () => {
        const code = reminderCodeInput?.value || '';
        importReminderByCode(code);
    });
    reminderCodeInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            importReminderByCode(event.target.value || '');
        }
    });

    closeModalBtn.addEventListener('click', closeModal);
    window.addEventListener('click', e => {
        if (e.target === taskModal) {
            closeModal();
        }
    });

    taskForm.addEventListener('submit', async e => {
        e.preventDefault();

        const type = entryTypeInput.value || 'task';
        const title = taskTitleInput.value.trim();
        const notes = taskDescriptionInput.value.trim();
        const priority = taskPriorityInput.value || 'normal';
        const startDate = taskDateInput.value;
        const startTime = taskTimeInput.value;
        let endDate = taskEndDateInput.value;
        const endTime = taskEndTimeInput.value;

        if (!startDate) {
            alert('Please choose a start date.');
            return;
        }

        if (!title) {
            alert('Please enter a title.');
            return;
        }

        if (type === 'event') {
            if (!endDate) {
                endDate = startDate;
            }
            if (endDate < startDate) {
                alert('End date cannot be before start date.');
                return;
            }
        } else {
            endDate = startDate;
        }

        const existingEntry = editingEntryId
            ? plannerData.entries.find(item => item.id === editingEntryId)
            : null;

        const entryPayload = {
            id: editingEntryId || `entry_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
            type,
            title,
            notes,
            priority,
            startDate,
            endDate,
            startTime,
            endTime,
            createdAt: editingEntryId
                ? existingEntry?.createdAt || new Date().toISOString()
                : new Date().toISOString(),
            shareCode: existingEntry?.shareCode || null
        };

        if (editingEntryId) {
            plannerData.entries = plannerData.entries.map(item => (item.id === editingEntryId ? entryPayload : item));
            Debug.log('Updated planner entry', entryPayload);
        } else {
            plannerData.entries.push(entryPayload);
            Debug.log('Created planner entry', entryPayload);
        }

        plannerData.entries.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        await savePlannerData();

        if (currentFamily && isFamilyOwner && shareWithFamilyCheckbox?.checked) {
            const selectedAssignees = familyAssigneesSelect
                ? Array.from(familyAssigneesSelect.selectedOptions).map(option => option.value)
                : [];
            const assignedTo =
                selectedAssignees.length === 0 || selectedAssignees.includes('__all')
                    ? []
                    : selectedAssignees.filter(value => value !== '__all');

            const updated = await updateFamily(fam => {
                if (!Array.isArray(fam.reminders)) fam.reminders = [];
                fam.reminders.push({
                    id: `famrem_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
                    title,
                    notes,
                    priority,
                    date: startDate,
                    time: startTime,
                    assignedTo,
                    createdBy: currentUser,
                    createdAt: new Date().toISOString()
                });
            });
            if (!updated) {
                setFamilySetupFeedback?.('Shared reminder did not sync. Please try again shortly.', 'error');
            }
        }

        selectedDateISO = entryPayload.startDate;
        if (
            currentMonth.getFullYear() !== new Date(entryPayload.startDate).getFullYear() ||
            currentMonth.getMonth() !== new Date(entryPayload.startDate).getMonth()
        ) {
            currentMonth = new Date(entryPayload.startDate);
        }

        renderCalendar();
        renderDayDetail();
        closeModal();

        if (shareWithFamilyCheckbox) {
            shareWithFamilyCheckbox.checked = false;
        }
        familyAssigneeGroup?.classList.add('hidden');
    });

    await ensureDemoPlannerCoverage();
    renderCalendar();
    renderDayDetail();

    const AI_THEME_STORAGE_KEY = 'familyhub_ai_theme';
    const THEME_VARIABLES = [
        '--app-background',
        '--card-surface',
        '--primary-color',
        '--secondary-color',
        '--accent-color-1',
        '--accent-color-2',
        '--accent-color-3',
        '--text-primary',
        '--text-secondary',
        '--bg-color',
        '--border-color',
        '--card-bg'
    ];
    let pendingAiTheme = null;

    function applyAiThemePalette(theme) {
        if (!theme) return;
        const palette = theme.palette || {};
        const text = theme.text || {};
        const root = document.documentElement;

        const primaryColor = palette.primary || '#6366f1';
        const secondaryColor = palette.secondary || palette.accent || '#8b5cf6';
        const accentColor = palette.accent || secondaryColor;

        const computedBackground =
            palette.backgroundGradient ||
            palette.background ||
            `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)`;
        root.style.setProperty('--app-background', computedBackground);
        root.style.setProperty('--page-background', computedBackground);

        const computedSurface =
            palette.surface ||
            `linear-gradient(160deg, rgba(255, 255, 255, 0.96), rgba(255, 255, 255, 0.86))`;
        const surfaceSolid = palette.surfaceSolid || 'rgba(255, 255, 255, 0.94)';
        root.style.setProperty('--card-surface', computedSurface);
        root.style.setProperty('--card-gradient', computedSurface);
        root.style.setProperty('--card-bg', surfaceSolid);
        root.style.setProperty('--bg-color', surfaceSolid);
        root.style.setProperty('--border-color', palette.border || 'rgba(148, 163, 184, 0.35)');

        root.style.setProperty('--primary-color', primaryColor);
        root.style.setProperty('--accent-color-3', primaryColor);
        root.style.setProperty('--secondary-color', secondaryColor);
        root.style.setProperty('--accent-color-2', secondaryColor);
        root.style.setProperty('--accent-color-1', accentColor);

        if (text.primary) {
            root.style.setProperty('--text-primary', text.primary);
            root.style.setProperty('--logo-color', text.primary);
        } else {
            root.style.setProperty('--text-primary', '#1e293b');
            root.style.setProperty('--logo-color', '#0f172a');
        }
        if (text.secondary) {
            root.style.setProperty('--text-secondary', text.secondary);
        } else {
            root.style.setProperty('--text-secondary', 'rgba(15, 23, 42, 0.72)');
        }

        if (Array.isArray(theme.supportingColors)) {
            theme.supportingColors.slice(0, 2).forEach((color, index) => {
                if (color && color.value) {
                    root.style.setProperty(`--accent-color-${index + 1}`, color.value);
                }
            });
        }

        const previewPayload = {
            ...theme,
            palette: {
                ...palette,
                primaryResolved: primaryColor,
                secondaryResolved: secondaryColor,
                accentResolved: accentColor,
                backgroundResolved: computedBackground,
                surfaceResolved: computedSurface,
                surfaceSolid
            }
        };

        localStorage.setItem(AI_THEME_STORAGE_KEY, JSON.stringify(previewPayload));
        if (window.ThemeManager) {
            if (typeof ThemeManager.set === 'function') {
                ThemeManager.set('theme-custom');
            } else {
                ThemeManager.apply?.('theme-custom');
            }
        } else {
            const existingThemeClasses = Array.from(document.body.classList).filter(cls => cls.startsWith('theme-'));
            document.body.classList.remove(...existingThemeClasses);
            document.body.classList.add('theme-custom');
        }
        updateAiThemePreview(previewPayload);
    }

    const primaryColorSafe = palette =>
        palette.primaryResolved || palette.primary || '#6366f1';

    function updateAiThemePreview(theme) {
        if (!aiThemePreview) return;
        aiThemePreview.classList.remove('loading');
        aiThemePreview.innerHTML = '';

        if (!theme) {
            aiThemePreview.innerHTML = '<p style="color: var(--text-secondary);">No AI theme applied yet.</p>';
            return;
        }

        const palette = theme.palette || {};
        const text = theme.text || {};
        const chips = [
            { label: 'Primary', value: palette.primaryResolved || palette.primary },
            { label: 'Secondary', value: palette.secondaryResolved || palette.secondary },
            { label: 'Accent', value: palette.accentResolved || palette.accent },
            { label: 'Background', value: palette.backgroundResolved || palette.backgroundGradient || palette.background },
            { label: 'Surface', value: palette.surfaceResolved || palette.surface },
            { label: 'Text', value: text.primary }
        ].filter(item => item.value);

        chips.forEach(chipData => {
            const chip = document.createElement('div');
            chip.className = 'theme-chip';
            chip.style.background = chipData.value;
            chip.style.color = '#fff';
            chip.innerHTML = `<span>${chipData.label}</span><strong>${chipData.value}</strong>`;
            aiThemePreview.appendChild(chip);
        });

        if (theme.description) {
            const desc = document.createElement('p');
            desc.style.gridColumn = '1 / -1';
            desc.style.color = 'var(--text-secondary)';
            desc.textContent = theme.description;
            aiThemePreview.appendChild(desc);
        }

        const sample = document.createElement('div');
        sample.className = 'ai-theme-sample';
        sample.innerHTML = `
            <div class="sample-card" style="background:${palette.surfaceResolved || palette.surface || 'rgba(255,255,255,0.92)'}; color:${text.primary || 'var(--text-primary)'};">
                <div class="sample-pill" style="background:${palette.accentResolved || palette.accent || palette.secondary || palette.primary};"></div>
                <h4>Preview Headline</h4>
                <p style="color:${text.secondary || 'var(--text-secondary)'};">This is how your cards will look with the new theme.</p>
                <button class="btn btn-primary" style="background:${primaryColorSafe(palette)};">Primary Action</button>
            </div>
        `;
        aiThemePreview.appendChild(sample);
    }

    function loadStoredAiTheme() {
        try {
            const stored = localStorage.getItem(AI_THEME_STORAGE_KEY);
            if (!stored) {
                updateAiThemePreview(null);
                if (applyAiThemeBtn) {
                    applyAiThemeBtn.disabled = true;
                }
                return;
            }
            const parsed = JSON.parse(stored);
            pendingAiTheme = null;
            if (applyAiThemeBtn) {
                applyAiThemeBtn.disabled = true;
            }
            applyAiThemePalette(parsed);
        } catch (error) {
            Debug.warn('Failed to load stored AI theme', error);
            updateAiThemePreview(null);
            if (applyAiThemeBtn) {
                applyAiThemeBtn.disabled = true;
            }
        }
    }

    function openAiThemeModal() {
        if (!aiThemeModal) return;
        aiThemeModal.classList.add('show');
        aiThemePrompt?.focus();
    }

    function closeAiTheme() {
        if (!aiThemeModal) return;
        aiThemeModal.classList.remove('show');
    }

    if (aiCustomizeBtn) {
        aiCustomizeBtn.addEventListener('click', openAiThemeModal);
    }

    if (closeAiThemeModal) {
        closeAiThemeModal.addEventListener('click', closeAiTheme);
    }

    if (aiThemeForm) {
        aiThemeForm.addEventListener('submit', async event => {
            event.preventDefault();
            if (!aiThemePrompt) return;
            const prompt = aiThemePrompt.value.trim();
            if (!prompt) {
                aiThemePreview.innerHTML =
                    '<p style="color: var(--danger-color);">Tell AI about the vibe you want first.</p>';
                return;
            }

            pendingAiTheme = null;
            if (applyAiThemeBtn) {
                applyAiThemeBtn.disabled = true;
            }

            aiThemePreview.classList.add('loading');
            aiThemePreview.innerHTML = '<p>Designing your theme...</p>';

            try {
                const reply = await callAI({
                    system:
                        'You are a UI theming assistant. Respond ONLY in JSON with keys palette.primary, palette.secondary, palette.accent, palette.background, palette.surface, palette.backgroundGradient (optional), text.primary, text.secondary, description, supportingColors (array). Use accessible color contrast.',
                    message: `Create a web app theme inspired by: "${prompt}". Provide hex colors and a short description.`,
                    temperature: 0.6
                });

                const parsed = parseJsonSafe(reply);
                if (parsed?.palette) {
                    pendingAiTheme = parsed;
                    updateAiThemePreview(parsed);
                    if (applyAiThemeBtn) {
                        applyAiThemeBtn.disabled = false;
                        applyAiThemeBtn.textContent = 'Apply Theme';
                    }
                } else {
                    aiThemePreview.classList.remove('loading');
                    aiThemePreview.innerHTML =
                        '<p style="color: var(--danger-color);">AI response was not in the expected format.</p>';
                    pendingAiTheme = null;
                    if (applyAiThemeBtn) {
                        applyAiThemeBtn.disabled = true;
                    }
                }
            } catch (error) {
                aiThemePreview.classList.remove('loading');
                aiThemePreview.innerHTML =
                    '<p style="color: var(--danger-color);">Could not generate theme right now. Please try again later.</p>';
                pendingAiTheme = null;
                if (applyAiThemeBtn) {
                    applyAiThemeBtn.disabled = true;
                }
            }
        });
    }

    if (applyAiThemeBtn) {
        applyAiThemeBtn.addEventListener('click', () => {
            if (!pendingAiTheme) return;
            applyAiThemeBtn.disabled = true;
            applyAiThemePalette(pendingAiTheme);
            pendingAiTheme = null;
            closeAiTheme();
        });
    }

    if (resetAiThemeBtn) {
        resetAiThemeBtn.addEventListener('click', () => {
            THEME_VARIABLES.forEach(variable => {
                document.documentElement.style.removeProperty(variable);
            });
            localStorage.removeItem(AI_THEME_STORAGE_KEY);
            updateAiThemePreview(null);
            pendingAiTheme = null;
            if (applyAiThemeBtn) {
                applyAiThemeBtn.disabled = true;
            }
        });
    }

    window.addEventListener('click', e => {
        if (e.target === aiThemeModal) {
            closeAiTheme();
        }
    });

    loadStoredAiTheme();

    async function generateFocusPlan() {
        if (!aiFocusResult) return;
        aiFocusResult.classList.add('loading');
        aiFocusResult.innerHTML = '';

        const tasksToday = getEntriesForDate(selectedDateISO)
            .map(entry => `- ${entry.title}${entry.startTime ? ` at ${entry.startTime}` : ''}`)
            .join('\n');

        try {
            const reply = await callAI({
                system:
                    'You are a productivity strategist. Provide a short plan with priorities, focus windows, and energy management tips.',
                message: `Create a focus plan for ${selectedDateISO}. Current commitments:\n${tasksToday || 'No scheduled items yet.'}`,
                temperature: 0.4
            });
            aiFocusResult.classList.remove('loading');
            aiFocusResult.innerHTML = formatAiText(reply || 'No plan generated.');
        } catch (error) {
            aiFocusResult.classList.remove('loading');
            aiFocusResult.innerHTML =
                '<p style="color: var(--danger-color);">Focus planner unavailable. Try later.</p>';
        }
    }

    async function handleHabitCoach() {
        if (!aiHabitInput || !aiHabitResult) return;
        const habit = aiHabitInput.value.trim();
        if (!habit) {
            aiHabitResult.innerHTML =
                '<p style="color: var(--danger-color);">Describe the habit you want help with.</p>';
            return;
        }

        aiHabitResult.classList.add('loading');
        aiHabitResult.innerHTML = '';

        try {
            const reply = await callAI({
                system:
                    'You are a supportive accountability coach. Provide 3-4 bullet tips including a cue, routine, reward, and a quick win. Keep it actionable and encouraging.',
                message: `Suggest habit-building guidance for: ${habit}`,
                temperature: 0.6
            });
            aiHabitResult.classList.remove('loading');
            aiHabitResult.innerHTML = formatAiText(reply || 'No coaching tips generated.');
        } catch (error) {
            aiHabitResult.classList.remove('loading');
            aiHabitResult.innerHTML =
                '<p style="color: var(--danger-color);">Habit coach unavailable. Try again later.</p>';
        }
    }

    async function handleBreakSuggestion() {
        if (!aiBreakInput || !aiBreakResult) return;
        const mood = aiBreakInput.value.trim() || 'Feeling neutral';

        aiBreakResult.classList.add('loading');
        aiBreakResult.innerHTML = '';

        try {
            const reply = await callAI({
                system:
                    'You are a wellness assistant. Suggest a short, restorative break that keeps momentum. Include duration, quick instructions, and benefit.',
                message: `Suggest a productive break idea. User context: ${mood}`,
                temperature: 0.7
            });
            aiBreakResult.classList.remove('loading');
            aiBreakResult.innerHTML = formatAiText(reply || 'No break suggestion generated.');
        } catch (error) {
            aiBreakResult.classList.remove('loading');
            aiBreakResult.innerHTML =
                '<p style="color: var(--danger-color);">Couldn’t get a break suggestion right now.</p>';
        }
    }

    if (aiFocusBtn) {
        aiFocusBtn.addEventListener('click', generateFocusPlan);
    }

    if (aiHabitBtn) {
        aiHabitBtn.addEventListener('click', handleHabitCoach);
    }

    if (aiBreakBtn) {
        aiBreakBtn.addEventListener('click', handleBreakSuggestion);
    }

    function getFamilyRemindersForDate(dateISO) {
        if (!currentFamily) return [];
        const reminders = Array.isArray(currentFamily.reminders) ? currentFamily.reminders : [];
        return reminders
            .filter(reminder => reminder.date === dateISO)
            .filter(reminder => {
                const assigned = Array.isArray(reminder.assignedTo) ? reminder.assignedTo : [];
                if (isFamilyOwner || isFamilyAdult) return true;
                if (assigned.length === 0) return true;
                return assigned.includes(currentUser);
            });
    }

    function renderFamilyReminders(dateISO, reminderList = null) {
        if (!familyRemindersContainer || !familyRemindersList) return;
        updateFamilyStateFromStorage();
        if (!currentFamily) {
            familyRemindersContainer.classList.add('hidden');
            familyRemindersList.innerHTML = '';
            return;
        }

        const relevant = reminderList ?? getFamilyRemindersForDate(dateISO);

        if (!relevant.length) {
            familyRemindersContainer.classList.add('hidden');
            familyRemindersList.innerHTML = '';
            return;
        }

        familyRemindersContainer.classList.remove('hidden');
        familyRemindersList.innerHTML = '';

        relevant
            .sort((a, b) => (a.time || '23:59').localeCompare(b.time || '23:59'))
            .forEach(reminder => {
                const card = createElement('div', 'family-reminder-card');
                card.appendChild(createElement('strong', null, reminder.title || 'Family reminder'));

                if (reminder.notes) {
                    card.appendChild(createElement('p', null, applyInlineFormatting(reminder.notes), true));
                }

                const meta = createElement('div', 'meta');
                const timeText = reminder.time
                    ? `${formatTimeDisplay(reminder.date, reminder.time)} ${timezoneLabel}`
                    : 'All day';
                meta.appendChild(createElement('span', null, `Time: ${timeText}`));
                meta.appendChild(createElement('span', null, `Priority: ${formatPriorityLabel(reminder.priority)}`));

                const assigned = Array.isArray(reminder.assignedTo) ? reminder.assignedTo : [];
                if (assigned.length) {
                    meta.appendChild(createElement('span', null, `Assigned: ${assigned.join(', ')}`));
                } else {
                    meta.appendChild(createElement('span', null, 'Assigned: Everyone'));
                }

                if (reminder.createdBy) {
                    meta.appendChild(createElement('span', null, `From: ${reminder.createdBy}`));
                }

                card.appendChild(meta);
                familyRemindersList.appendChild(card);
            });
    }

    function renderFamilyMemberList() {
        if (!familyMemberListEl) return;
        updateFamilyStateFromStorage();
        if (!currentFamily) {
            familyMemberListEl.innerHTML =
                '<li class="family-chat-empty">Create or join a family to manage members.</li>';
            return;
        }

        const members = Array.isArray(currentFamily.members) ? currentFamily.members.slice() : [];
        if (!members.length) {
            familyMemberListEl.innerHTML = '<li class="family-chat-empty">No family members yet.</li>';
            return;
        }

        familyMemberListEl.innerHTML = '';
        members
            .sort((a, b) => a.username.localeCompare(b.username))
            .forEach(member => {
                const li = createElement('li', 'family-member-row');
                const info = createElement('div');
                info.className = 'member-info';
                const name = createElement('span', 'name', member.username);
                const role = createElement('span', 'role', roleLabelForMember(member.role));
                info.appendChild(name);
                info.appendChild(role);
                li.appendChild(info);

                if (isFamilyOwner && member.username !== currentUser) {
                    const select = document.createElement('select');
                    select.innerHTML = `
                        <option value="adult">Adult</option>
                        <option value="kid">Kid</option>
                    `;
                    select.value = member.role === 'kid' ? 'kid' : 'adult';
                    select.addEventListener('change', async () => {
                        const newRole = select.value === 'kid' ? 'kid' : 'adult';
                        await updateUserRole(member.username, newRole);
                        updateFamilyStateFromStorage();
                        renderFamilyOverview();
                        renderUserHeader();
                    });
                    li.appendChild(select);
                }

                familyMemberListEl.appendChild(li);
            });
    }

    function renderFamilyChat() {
        if (!familyChatMessagesEl) return;
        if (!currentFamily) {
            familyChatMessagesEl.innerHTML =
                '<div class="family-chat-empty">Family chat is ready once you join a family.</div>';
            familyChatInput?.setAttribute('disabled', 'disabled');
            familyChatSendBtn?.setAttribute('disabled', 'disabled');
            return;
        }

        familyChatInput?.removeAttribute('disabled');
        familyChatSendBtn?.removeAttribute('disabled');

        const chatLog = Array.isArray(currentFamily.chat) ? currentFamily.chat : [];
        if (!chatLog.length) {
            familyChatMessagesEl.innerHTML =
                '<div class="family-chat-empty">Say hello to your family and start planning together!</div>';
            return;
        }

        familyChatMessagesEl.innerHTML = '';
        chatLog
            .slice()
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
            .forEach(message => {
                const bubble = createElement(
                    'div',
                    `family-chat-message${message.username === currentUser ? ' me' : ''}`
                );
                const meta = createElement(
                    'div',
                    'family-chat-meta',
                    `${message.username} • ${new Intl.DateTimeFormat(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit'
                    }).format(new Date(message.createdAt || Date.now()))}`
                );
                const body = createElement('div', 'message-body', applyInlineFormatting(message.message), true);
                bubble.appendChild(meta);
                bubble.appendChild(body);
                familyChatMessagesEl.appendChild(bubble);
            });

        familyChatMessagesEl.scrollTop = familyChatMessagesEl.scrollHeight;
    }

    function renderFamilyOverview() {
        if (!familyNameHeading) return;

        if (!currentFamily) {
            familyNameHeading.textContent = 'Family Hub';
            if (familyRoleLabelEl) {
                familyRoleLabelEl.textContent = 'Solo mode';
            }
            if (familyInviteCodeEl) {
                familyInviteCodeEl.textContent = '------';
            }
            regenerateCodeBtn?.classList.add('hidden');
            familyCodeBlock?.classList.add('hidden');
            if (isAdmin) {
                familySetupPanel?.classList.add('hidden');
            } else {
                familySetupPanel?.classList.remove('hidden');
            }
            renderFamilyMemberList();
            renderFamilyChat();
            renderFamilyReminders(selectedDateISO);
            return;
        }

        familyNameHeading.textContent = currentFamily.name || 'Family Hub';
        if (familyRoleLabelEl) {
            familyRoleLabelEl.textContent = roleLabelForMember(currentFamilyMember?.role || currentUserRecord?.role);
        }
        if (familyInviteCodeEl) {
            familyInviteCodeEl.textContent = currentFamily.code || '------';
        }
        regenerateCodeBtn?.classList.toggle('hidden', !isFamilyOwner);
        familyCodeBlock?.classList.remove('hidden');
        familySetupPanel?.classList.add('hidden');
        if (familyShareBlock) {
            const showShare = isFamilyOwner;
            familyShareBlock.classList.toggle('hidden', !showShare);
            if (!showShare && shareWithFamilyCheckbox) {
                shareWithFamilyCheckbox.checked = false;
            }
            familyAssigneeGroup?.classList.add('hidden');
        }
        renderFamilyMemberList();
        renderFamilyChat();
        renderFamilyReminders(selectedDateISO);
    }

    async function handleCreateFamily(event) {
        event.preventDefault();
        if (!createFamilyNameInput) return;
        const name = createFamilyNameInput.value.trim();
        if (name.length < 3) {
            setFamilySetupFeedback('Family name must be at least 3 characters.', 'error');
            return;
        }

        const ownerProfilePayload =
            currentUserRecord && currentUserRecord.password
                ? {
                      email: currentUserRecord.email,
                      password: currentUserRecord.password,
                      role: currentUserRecord.role || 'solo',
                      lastLogin: new Date().toISOString(),
                      lastDeviceId: deviceId,
                      lastDeviceLabel: deviceLabel
                  }
                : null;

        const attemptCreate = async () => {
            await ensureRemoteUserRecord({ createIfMissing: true });
            return DataClient.createFamily({
                name,
                owner: currentUser,
                ownerProfile: ownerProfilePayload || undefined
            });
        };

        try {
            let family = null;
            for (let attempt = 0; attempt < 2; attempt += 1) {
                try {
                    family = await attemptCreate();
                    break;
                } catch (error) {
                    if (error.status === 404 && attempt === 0) {
                        Debug.warn('Owner not found remotely, attempting to recreate user');
                        await ensureRemoteUserRecord({ createIfMissing: true });
                        continue;
                    }
                    throw error;
                }
            }

            if (!family) {
                setFamilySetupFeedback('Unable to create family right now. Please try again later.', 'error');
                return;
            }

            const families = loadFamilies().filter(f => f.id !== family.id);
            families.push(family);
            saveFamilies(families);
            familiesState = families;

            currentFamily = family;
            currentFamilyMember = family.members?.find(member => member.username === currentUser) || {
                username: currentUser,
                role: 'owner'
            };
            isFamilyOwner = true;
            isFamilyAdult = true;
            lastFamilySyncSignature = computeFamilySignature(currentFamily);

            currentUserRecord = {
                ...(currentUserRecord || {}),
                username: currentUser,
                familyId: family.id,
                role: 'owner'
            };
            const usersUpdated = loadUsers().filter(user => user.username !== currentUser);
            usersUpdated.push(currentUserRecord);
            saveUsers(usersUpdated);
            usersState = usersUpdated;
            localStorage.setItem(FAMILY_MEMBERSHIP_KEY, family.id);
            setBackendMembership(currentUser, family.id);

            if (familyInviteCodeEl) {
                familyInviteCodeEl.textContent = family.code || '------';
            }
            familyCodeBlock?.classList.remove('hidden');
            regenerateCodeBtn?.classList.remove('hidden');

            const updatedUser = await DataClient.getUser(currentUser);
            if (updatedUser) {
                const usersLocal = loadUsers().filter(u => u.username !== currentUser);
                const localMatch = currentUserRecord || {};
                usersLocal.push({
                    ...localMatch,
                    ...updatedUser,
                    password: localMatch.password
                });
                saveUsers(usersLocal);
                usersState = usersLocal;
                currentUserRecord = usersLocal.find(user => user.username === currentUser) || currentUserRecord;
            }

            createFamilyNameInput.value = '';
            updateFamilyStateFromStorage();
            renderUserHeader();
            renderFamilyOverview();
            renderCalendar();
            renderDayDetail();
            setFamilySetupFeedback('Family created! Share your invite code with family members.', 'success');
            toggleFamilyForms('none');
            await syncCurrentFamilyFromServer({ silent: true });
            alert(`Family created! Share this code so others can join: ${family.code}`);
        } catch (error) {
            Debug.error('Failed to create family', error);
            setFamilySetupFeedback('We could not create your family. Please try again later.', 'error');
        }
    }

    async function handleJoinFamily(event) {
        event.preventDefault();
        if (!joinFamilyCodeInput) return;
        const rawCode = joinFamilyCodeInput.value.trim();
        const code = normalizeFamilyCode(rawCode);
        if (code.length !== 6) {
            setFamilySetupFeedback('Enter a valid 6-character family code.', 'error');
            return;
        }

        const role = joinFamilyRoleSelect?.value === 'kid' ? 'kid' : 'adult';

        const joinProfile =
            currentUserRecord && currentUserRecord.password
                ? {
                      email: currentUserRecord.email,
                      password: currentUserRecord.password,
                      role: currentUserRecord.role || role,
                      lastLogin: new Date().toISOString(),
                      lastDeviceId: deviceId,
                      lastDeviceLabel: deviceLabel
                  }
                : null;

        try {
            const localFamily = joinFamilyLocally(code, role);
            if (!localFamily) {
                throw new Error('LOCAL_FAMILY_NOT_FOUND');
            }

            currentFamily = localFamily;
            currentFamilyMember =
                localFamily.members.find(member => member.username === currentUser) || currentFamilyMember;

            currentUserRecord = {
                ...(currentUserRecord || {}),
                username: currentUser,
                familyId: localFamily.id,
                role: currentFamilyMember?.role || role
            };
            const localUsers = loadUsers().filter(user => user.username !== currentUser);
            const mergedUser = {
                ...(currentUserRecord || {}),
                username: currentUser,
                familyId: localFamily.id,
                role: currentFamilyMember?.role || role
            };
            localUsers.push(mergedUser);
            saveUsers(localUsers);
            usersState = localUsers;
            currentUserRecord = mergedUser;

            try {
                await DataClient.joinFamily({
                    username: currentUser,
                    code,
                    role,
                    userProfile: joinProfile || undefined
                });
            } catch (remoteError) {
                Debug.warn('Remote family join failed; local data retained.', remoteError);
            }

            joinFamilyCodeInput.value = '';
            updateFamilyStateFromStorage();
            renderUserHeader();
            renderFamilyOverview();
            renderCalendar();
            renderDayDetail();
            setFamilySetupFeedback('Welcome to the family! Reminders and chat are now shared.', 'success');
            toggleFamilyForms('none');
            await syncCurrentFamilyFromServer({ silent: true });
            return;
        } catch (localError) {
            if (localError.message !== 'LOCAL_FAMILY_NOT_FOUND') {
                Debug.error('Local family join encountered an unexpected error', localError);
                setFamilySetupFeedback('We could not join that family. Please try again.', 'error');
                return;
            }
        }

        try {
            await ensureRemoteUserRecord({ createIfMissing: true });
            const { family, user } = await DataClient.joinFamily({
                username: currentUser,
                code,
                role,
                userProfile: joinProfile || undefined
            });

            if (!family) {
                setFamilySetupFeedback('We couldn’t find that family code. Double-check with the owner.', 'error');
                return;
            }

            const families = loadFamilies().filter(f => f.id !== family.id);
            families.push(family);
            saveFamilies(families);
            familiesState = families;

            currentFamily = family;
            currentFamilyMember = family.members?.find(member => member.username === currentUser) || {
                username: currentUser,
                role
            };
            isFamilyOwner = currentFamilyMember.role === 'owner';
            isFamilyAdult = currentFamilyMember.role === 'owner' || currentFamilyMember.role === 'adult';
            lastFamilySyncSignature = computeFamilySignature(currentFamily);

            currentUserRecord = {
                ...(currentUserRecord || {}),
                username: currentUser,
                familyId: family.id,
                role: currentFamilyMember.role || role
            };
            const usersUpdated = loadUsers().filter(userLocal => userLocal.username !== currentUser);
            usersUpdated.push(currentUserRecord);
            saveUsers(usersUpdated);
            usersState = usersUpdated;
            localStorage.setItem(FAMILY_MEMBERSHIP_KEY, family.id);
            setBackendMembership(currentUser, family.id);

            if (user) {
                const usersLocal = loadUsers().filter(u => u.username !== currentUser);
                const localMatch = currentUserRecord || {};
                usersLocal.push({
                    ...localMatch,
                    ...user,
                    password: localMatch.password
                });
                saveUsers(usersLocal);
                usersState = usersLocal;
                currentUserRecord = usersLocal.find(record => record.username === currentUser) || currentUserRecord;
            }

            joinFamilyCodeInput.value = '';
            updateFamilyStateFromStorage();
            renderUserHeader();
            renderFamilyOverview();
            renderCalendar();
            renderDayDetail();
            setFamilySetupFeedback('Welcome to the family! Reminders and chat are now shared.', 'success');
            toggleFamilyForms('none');
            await syncCurrentFamilyFromServer({ silent: true });
            alert('Family joined! Head to the Family Chat to start talking and see shared plans.');
        } catch (error) {
            Debug.error('Failed to join family', error);
            if (error.status === 404) {
                setFamilySetupFeedback('We couldn’t find that family code. Double-check with the owner.', 'error');
            } else {
                setFamilySetupFeedback('Unable to join that family right now. Please try again.', 'error');
            }
        }
    }

    async function sendFamilyChatMessage() {
        if (!currentFamily || !familyChatInput) return;
        const text = familyChatInput.value.trim();
        if (!text) return;

        const result = await updateFamily(fam => {
            if (!Array.isArray(fam.chat)) fam.chat = [];
            fam.chat.push({
                id: `chat_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`,
                username: currentUser,
                message: text,
                createdAt: new Date().toISOString()
            });
        });

        if (!result) {
            setFamilySetupFeedback?.('We couldn’t send that message right now. Try again in a moment.', 'error');
            return;
        }

        familyChatInput.value = '';
        renderFamilyChat();
        await syncCurrentFamilyFromServer({ silent: true });
    }

    async function regenerateFamilyCode() {
        if (!isFamilyOwner || !currentFamily) return;
        try {
            const updatedFamily = await DataClient.regenerateFamily(currentFamily.id);
            if (!updatedFamily) {
                alert('We could not regenerate a new code right now. Please try again later.');
                return;
            }
            familiesState = familiesState.map(f => (f.id === updatedFamily.id ? updatedFamily : f));
            saveFamilies(familiesState);
            currentFamily = updatedFamily;
            currentFamilyMember =
                updatedFamily.members.find(member => member.username === currentUser) || currentFamilyMember;
            renderFamilyOverview();
            renderFamilyReminders(selectedDateISO);
            alert(`Your new family invite code is ${updatedFamily.code}. Share it with people you trust.`);
            Debug.log('Family invite code regenerated', { code: updatedFamily.code });
        } catch (error) {
            Debug.error('Failed to regenerate family code', error);
            alert('We couldn’t regenerate the invite code. Please try again later.');
        }
    }

    if (familyChatSendBtn) {
        familyChatSendBtn.addEventListener('click', sendFamilyChatMessage);
    }

    familyChatInput?.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendFamilyChatMessage();
        }
    });

    regenerateCodeBtn?.addEventListener('click', regenerateFamilyCode);
    createFamilyForm?.addEventListener('submit', handleCreateFamily);
    joinFamilyForm?.addEventListener('submit', handleJoinFamily);
    toggleFamilyForms('none');

    renderFamilyOverview();
    await syncCurrentFamilyFromServer({ silent: true });
    await syncPlannerFromServer({ silent: true });

    if (!isAdmin) {
        const FAMILY_SYNC_INTERVAL_MS = 6000;
        const PLANNER_SYNC_INTERVAL_MS = 6000;
        setInterval(() => {
            syncCurrentFamilyFromServer({ silent: true });
        }, FAMILY_SYNC_INTERVAL_MS);
        setInterval(() => {
            syncPlannerFromServer({ silent: true });
        }, PLANNER_SYNC_INTERVAL_MS);
    }

    function renderPlanningTips(dayEntriesData, familyRemindersForDay) {
        if (!planningTipsList) return;
        planningTipsList.innerHTML = '';

        const tips = [];

        const priorityWeight = item => {
            const label = formatPriorityLabel(item.priority);
            if (label === 'High') return 0;
            if (label === 'Normal') return 1;
            return 2;
        };

        const combinedItems = dayEntriesData.map(item => ({
            source: 'personal',
            ...item
        }));

        familyRemindersForDay
            .filter(reminder => {
                const assigned = Array.isArray(reminder.assignedTo) ? reminder.assignedTo : [];
                return (
                    isFamilyOwner ||
                    isFamilyAdult ||
                    assigned.length === 0 ||
                    assigned.includes(currentUser)
                );
            })
            .forEach(reminder => {
                combinedItems.push({
                    source: 'family',
                    title: reminder.title,
                    notes: reminder.notes,
                    startDate: reminder.date,
                    startTime: reminder.time || '',
                    priority: reminder.priority,
                    type: 'task'
                });
            });

        if (combinedItems.length) {
            const sorted = combinedItems
                .slice()
                .sort((a, b) => {
                    const prio = priorityWeight(a) - priorityWeight(b);
                    if (prio !== 0) return prio;
                    return (a.startTime || '99:99').localeCompare(b.startTime || '99:99');
                })
                .slice(0, 4);

            sorted.forEach(item => {
                const priority = formatPriorityLabel(item.priority);
                const timeLabel = item.startTime
                    ? `${formatTimeDisplay(selectedDateISO, item.startTime)} ${timezoneLabel}`
                    : 'all day';
                const labelPrefix =
                    item.source === 'family' ? 'Shared reminder' : item.type === 'event' ? 'Event' : 'Task';
                tips.push(
                    `${labelPrefix}: **${item.title}** — aim to handle it ${timeLabel} (Priority: ${priority}).`
                );
                if (!item.notes) {
                    tips.push(`Add a quick note to **${item.title}** so you know the next action.`);
                }
            });
        }

        if (dayEntriesData.length > 2) {
            tips.push('Batch similar tasks together to stay in flow and reduce context switching.');
        }

        if (familyRemindersForDay.length) {
            tips.push('Check your shared reminders so everyone in the family stays aligned today.');
        }

        if (!tips.length) {
            tips.push('Add a task or shared reminder to see personalized planning tips for today.');
        }

        tips.slice(0, 6).forEach(text => {
            const li = document.createElement('li');
            li.innerHTML = formatAiText(text);
            planningTipsList.appendChild(li);
        });
    }

    // Chatbot
    const chatMessages = document.getElementById('chatMessages');
    const chatInput = document.getElementById('chatInput');
    const sendChatBtn = document.getElementById('sendChatBtn');
    let conversationHistory = [];
    let isSending = false;
    const botTextColorInput = document.getElementById('botTextColor');
    const userTextColorInput = document.getElementById('userTextColor');
    const resetChatColorsBtn = document.getElementById('resetChatColors');
    const CHAT_COLOR_STORAGE_KEY = 'familyhub_chat_colors';

    function applyChatColors({ botColor, userColor }) {
        if (botColor) {
            document.documentElement.style.setProperty('--chat-bot-text', botColor);
        }
        if (userColor) {
            document.documentElement.style.setProperty('--chat-user-text', userColor);
        }
    }

    function loadChatColors() {
        try {
            const stored = JSON.parse(localStorage.getItem(CHAT_COLOR_STORAGE_KEY) || '{}');
            if (stored.botColor) botTextColorInput.value = stored.botColor;
            if (stored.userColor) userTextColorInput.value = stored.userColor;
            applyChatColors(stored);
        } catch (error) {
            Debug.warn('Unable to load chat colors', error);
        }
    }

    function saveChatColors(colors) {
        localStorage.setItem(CHAT_COLOR_STORAGE_KEY, JSON.stringify(colors));
    }

    botTextColorInput?.addEventListener('change', () => {
        const colors = {
            botColor: botTextColorInput.value,
            userColor: userTextColorInput?.value || undefined
        };
        applyChatColors(colors);
        saveChatColors(colors);
    });

    userTextColorInput?.addEventListener('change', () => {
        const colors = {
            botColor: botTextColorInput?.value || undefined,
            userColor: userTextColorInput.value
        };
        applyChatColors(colors);
        saveChatColors(colors);
    });

    resetChatColorsBtn?.addEventListener('click', () => {
        botTextColorInput.value = '#1e293b';
        userTextColorInput.value = '#ffffff';
        const defaults = { botColor: '#1e293b', userColor: '#ffffff' };
        applyChatColors(defaults);
        saveChatColors(defaults);
    });

    loadChatColors();

    function renderWorkHoursResult({ hoursNeeded, daysNeeded, savingsContribution }) {
        if (!workHoursResult) return;
        workHoursResult.innerHTML = `
            <p><strong>Hours required:</strong> ${hoursNeeded.toFixed(2)} hours</p>
            <p><strong>Work days (8h/day):</strong> ${daysNeeded.toFixed(2)} days</p>
            ${
                typeof savingsContribution === 'number'
                    ? `<p>You’d contribute <strong>${(savingsContribution * 100).toFixed(0)}%</strong> of each paycheck to reach this goal.</p>`
                    : ''
            }
        `;
    }

    workHoursForm?.addEventListener('submit', event => {
        event.preventDefault();
        if (!itemCostInput || !hourlyRateInput || !workHoursResult) return;
        const cost = parseFloat(itemCostInput.value);
        const wage = parseFloat(hourlyRateInput.value);
        const savingsRate = parseFloat(savingsRateInput.value);

        if (!isFinite(cost) || cost <= 0 || !isFinite(wage) || wage <= 0) {
            workHoursResult.innerHTML =
                '<p style="color: var(--danger-color);">Enter a valid cost and hourly pay.</p>';
            return;
        }

        const hoursNeeded = cost / wage;
        const daysNeeded = hoursNeeded / 8;
        const savingsContribution = isFinite(savingsRate) && savingsRate > 0 ? Math.min(savingsRate / 100, 1) : null;

        renderWorkHoursResult({ hoursNeeded, daysNeeded, savingsContribution });
    });

    financeAiForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!financeAiResult) return;
        const context = (financeAiPrompt?.value || '').trim();
        if (!context) {
            financeAiResult.innerHTML =
                '<p style="color: var(--danger-color);">Tell me about the purchase so I can help evaluate it.</p>';
            return;
        }

        financeAiResult.classList.add('loading');
        financeAiResult.innerHTML = '';
        try {
            const reply = await callAI({
                system:
                    'You are a mindful financial advisor. Offer a short evaluation of whether the user should buy an item, include opportunity cost, saving tips, and an encouragement to plan responsibly.',
                message: context,
                temperature: 0.45
            });
            financeAiResult.classList.remove('loading');
            financeAiResult.innerHTML = formatAiText(reply || 'No guidance available right now.');
        } catch (error) {
            financeAiResult.classList.remove('loading');
            financeAiResult.innerHTML =
                '<p style="color: var(--danger-color);">AI is unavailable right now. Try again later.</p>';
        }
    });

    function createBudgetRow(name = '', amount = '') {
        const row = document.createElement('div');
        row.className = 'budget-row';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'Category';
        nameInput.value = name;

        const amountInput = document.createElement('input');
        amountInput.type = 'number';
        amountInput.placeholder = 'Amount';
        amountInput.min = '0';
        amountInput.step = '0.01';
        amountInput.value = amount;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.addEventListener('click', () => {
            row.remove();
        });

        row.appendChild(nameInput);
        row.appendChild(amountInput);
        row.appendChild(removeButton);

        budgetCategoriesContainer?.appendChild(row);
    }

    function initBudgetRows() {
        if (!budgetCategoriesContainer) return;
        budgetCategoriesContainer.innerHTML = `
            <div class="budget-row header">
                <span>Category</span>
                <span>Amount</span>
                <span></span>
            </div>
        `;
        createBudgetRow('Housing', '');
        createBudgetRow('Groceries', '');
        createBudgetRow('Savings', '');
    }

    addBudgetRowBtn?.addEventListener('click', () => createBudgetRow());

    function summarizeBudget(categories, income) {
        if (!budgetSummaryOutput) return;
        const totalExpenses = categories.reduce((sum, item) => sum + item.amount, 0);
        const remaining = income - totalExpenses;

        const listItems = categories
            .map(
                item =>
                    `<li><strong>${item.name || 'Unnamed'}</strong>: $${item.amount.toFixed(
                        2
                    )} (${((item.amount / income) * 100 || 0).toFixed(1)}%)</li>`
            )
            .join('');

        budgetSummaryOutput.innerHTML = `
            <p><strong>Total income:</strong> $${income.toFixed(2)}</p>
            <p><strong>Total planned:</strong> $${totalExpenses.toFixed(2)}</p>
            <p><strong>Remaining:</strong> $${remaining.toFixed(2)}</p>
            <ul>${listItems}</ul>
        `;
    }

    function renderBudgetInsights(categories, income) {
        if (!budgetForecastOutput || !budgetHealthOutput) return;

        if (!categories.length) {
            budgetForecastOutput.innerHTML = '';
            budgetHealthOutput.innerHTML = '';
            return;
        }

        const totalExpenses = categories.reduce((sum, item) => sum + item.amount, 0);
        const remaining = income - totalExpenses;
        const yearlySpend = totalExpenses * 12;
        const yearlyLeft = remaining * 12;

        const leftoverBadge =
            remaining >= 0
                ? `<span style="color: var(--success-color); font-weight:600;">Surplus: $${remaining.toFixed(2)}</span>`
                : `<span style="color: var(--danger-color); font-weight:600;">Short: $${remaining.toFixed(2)}</span>`;

        budgetForecastOutput.innerHTML = `
            <p>${leftoverBadge} per month (${remaining >= 0 ? 'you can allocate the extra!' : 'trim or boost income.'})</p>
            <p><strong>Yearly planned spend:</strong> $${yearlySpend.toFixed(2)}</p>
            <p><strong>Yearly leftover:</strong> $${yearlyLeft.toFixed(2)}</p>
            <p><strong>Suggested emergency fund:</strong> $${(income * 3).toFixed(
                2
            )} (≈3 months of income)</p>
        `;

        const needsKeywords = [
            'rent',
            'mortgage',
            'housing',
            'utilities',
            'electric',
            'water',
            'internet',
            'insurance',
            'groceries',
            'medical',
            'health',
            'transport',
            'gas',
            'debt',
            'loan',
            'childcare'
        ];
        const savingsKeywords = ['save', 'savings', 'invest', 'investment', 'retirement', '401k', 'emergency'];

        const classification = categories.reduce(
            (acc, item) => {
                const name = item.name.toLowerCase();
                if (savingsKeywords.some(keyword => name.includes(keyword))) {
                    acc.savings += item.amount;
                } else if (needsKeywords.some(keyword => name.includes(keyword))) {
                    acc.needs += item.amount;
                } else {
                    acc.wants += item.amount;
                }
                return acc;
            },
            { needs: 0, wants: 0, savings: 0 }
        );

        const pct = value => ((value / income) * 100 || 0).toFixed(1);
        const needsPct = pct(classification.needs);
        const wantsPct = pct(classification.wants);
        const savingsPct = pct(classification.savings);

        budgetHealthOutput.innerHTML = `
            <p><strong>50/30/20 check</strong></p>
            <ul>
                <li>Needs: ${needsPct}% (goal ≈ 50%)</li>
                <li>Wants: ${wantsPct}% (goal ≈ 30%)</li>
                <li>Savings: ${savingsPct}% (goal ≈ 20%)</li>
            </ul>
            <p>${remaining >= 0 ? 'Great! You have room to direct the surplus toward savings or debt payoff.' : 'Consider trimming wants or negotiating bills to balance the plan.'}</p>
        `;
    }

    budgetForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!monthlyIncomeInput || !budgetCategoriesContainer) return;

        const income = parseFloat(monthlyIncomeInput.value);
        if (!isFinite(income) || income <= 0) {
            budgetSummaryOutput.innerHTML =
                '<p style="color: var(--danger-color);">Enter a valid monthly income.</p>';
            budgetForecastOutput.innerHTML = '';
            budgetHealthOutput.innerHTML = '';
            return;
        }

        const rows = Array.from(budgetCategoriesContainer.querySelectorAll('.budget-row'))
            .slice(1) // skip header
            .map(row => {
                const [nameInput, amountInput] = row.querySelectorAll('input');
                return {
                    name: nameInput?.value.trim() || 'Unnamed',
                    amount: parseFloat(amountInput?.value || '0') || 0
                };
            })
            .filter(item => item.amount > 0);

        if (!rows.length) {
            budgetSummaryOutput.innerHTML =
                '<p style="color: var(--danger-color);">Add at least one budget category.</p>';
            budgetForecastOutput.innerHTML = '';
            budgetHealthOutput.innerHTML = '';
            return;
        }

        summarizeBudget(rows, income);
        renderBudgetInsights(rows, income);

        if (!budgetAiResult) return;
        budgetAiResult.classList.add('loading');
        budgetAiResult.innerHTML = '';

        try {
            const prompt = rows
                .map(item => `${item.name}: $${item.amount.toFixed(2)}`)
                .join('\n');
            const reply = await callAI({
                system:
                    'You are a supportive budgeting coach. Review the categories, point out potential adjustments, and encourage healthy savings habits politely.',
                message: `Monthly income: $${income.toFixed(
                    2
                )}\nCurrent allocations:\n${prompt}\nProvide short actionable tips.`,
                temperature: 0.5
            });
            budgetAiResult.classList.remove('loading');
            budgetAiResult.innerHTML = formatAiText(reply || 'No tips right now.');
        } catch (error) {
            budgetAiResult.classList.remove('loading');
            budgetAiResult.innerHTML =
                '<p style="color: var(--danger-color);">Budget assistant is busy. Try again later.</p>';
        }
    });

    mealPlanForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!mealSuggestionOutput || !mealStepsOutput) return;

        const mealType = mealPlanForm.querySelector('input[name="mealType"]:checked')?.value || 'dinner';
        const preferences = mealPreferencesInput?.value.trim() || 'No specific ingredients listed.';
        const extras = mealExtrasInput?.value.trim() || 'No additional comments.';

        mealSuggestionOutput.classList.add('loading');
        mealStepsOutput.classList.add('loading');
        mealSuggestionOutput.innerHTML = '';
        mealStepsOutput.innerHTML = '';

        try {
            const reply = await callAI({
                system: MEAL_PLANNER_JSON_PROMPT,
                message: `Meal type: ${mealType}\nAvailable or desired ingredients: ${preferences}\nExtra details: ${extras}\nReturn JSON only.`,
                temperature: 0.55
            });
            const parsed = parseJsonSafe(reply);
            if (parsed?.title) {
                const ingredients = Array.isArray(parsed.ingredients) ? parsed.ingredients : [];
                mealSuggestionOutput.innerHTML = `
                    <h3>${applyInlineFormatting(parsed.title)}</h3>
                    <p>${applyInlineFormatting(parsed.summary || '')}</p>
                    ${
                        ingredients.length
                            ? `<h4>Ingredients</h4><ul>${ingredients
                                  .map(item => `<li>${applyInlineFormatting(item)}</li>`)
                                  .join('')}</ul>`
                            : ''
                    }
                    ${parsed.extraTip ? `<p><em>${applyInlineFormatting(parsed.extraTip)}</em></p>` : ''}
                `;
                const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
                mealStepsOutput.innerHTML = steps.length
                    ? `<h4>Steps</h4><ol>${steps
                          .map(step => `<li>${applyInlineFormatting(step)}</li>`)
                          .join('')}</ol>`
                    : '<p>Ready to cook—no detailed steps provided.</p>';
            } else {
                mealSuggestionOutput.innerHTML = formatAiText(reply || 'Dinner idea coming soon.');
                mealStepsOutput.innerHTML = '';
            }
        } catch (error) {
            mealSuggestionOutput.innerHTML =
                '<p style="color: var(--danger-color);">Chef AI is busy. Try again in a moment.</p>';
            mealStepsOutput.innerHTML = '';
        } finally {
            mealSuggestionOutput.classList.remove('loading');
            mealStepsOutput.classList.remove('loading');
        }
    });

    surpriseBtn?.addEventListener('click', async () => {
        if (!surpriseResult) return;
        const focus = surpriseFocusSelect?.value || 'productivity';
        surpriseResult.classList.add('loading');
        surpriseResult.innerHTML = '';
        try {
            const reply = await callAI({
                system: SURPRISE_PROMPT,
                message: `Focus area: ${focus}. Provide encouraging, family-friendly guidance tailored to a busy household.`,
                temperature: 0.6
            });
            surpriseResult.classList.remove('loading');
            surpriseResult.innerHTML = formatAiText(reply || 'All caught up—take a deep breath and smile!');
        } catch (error) {
            surpriseResult.classList.remove('loading');
            surpriseResult.innerHTML =
                '<p style="color: var(--danger-color);">Couldn’t fetch a boost right now. Try again soon.</p>';
        }
    });

    initBudgetRows();

    window.addEventListener('storage', event => {
        if (event.key === FAMILY_STORAGE_KEY) {
            updateFamilyStateFromStorage();
            renderFamilyOverview();
            renderFamilyReminders(selectedDateISO);
        }
        if (event.key === USERS_STORAGE_KEY) {
            usersState = loadUsers();
            currentUserRecord = usersState.find(u => u.username === currentUser) || currentUserRecord;
            renderUserHeader();
        }
    });

    const welcomeMessage =
        'Hello! I\'m your study assistant. Ask me anything about homework, studying, time management, or concepts you\'re working through.';
    addChatMessage('bot', welcomeMessage);
    conversationHistory.push({ role: 'assistant', content: welcomeMessage, text: welcomeMessage });

    function formatMessage(message) {
        return message.replace(/\n/g, '<br>');
    }

    function addChatMessage(sender, message) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;
        messageDiv.innerHTML = formatMessage(message);
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return messageDiv;
    }

    function addLoadingMessage() {
        const loadingDiv = document.createElement('div');
        loadingDiv.className = 'message bot loading';
        loadingDiv.innerHTML = `
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
        `;
        chatMessages.appendChild(loadingDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return loadingDiv;
    }

    function removeMessage(node) {
        if (node && node.parentNode) {
            node.parentNode.removeChild(node);
        }
    }

    async function sendMessage() {
        const message = chatInput.value.trim();
        if (!message || isSending) return;

        addChatMessage('user', message);
        const historySnapshot = conversationHistory
            .slice()
            .map(entry => {
                const text = entry.content ?? entry.text ?? '';
                return {
                    role: entry.role === 'assistant' || entry.role === 'model' ? 'assistant' : 'user',
                    content: text,
                    text
                };
            });
        const userEntry = { role: 'user', content: message, text: message };
        conversationHistory.push(userEntry);

        chatInput.value = '';
        chatInput.focus();

        const loadingMessage = addLoadingMessage();
        isSending = true;
        sendChatBtn.disabled = true;

        try {
            const historyPayload = historySnapshot.map(item => ({
                role: item.role,
                text: item.content || item.text || ''
            }));

            const reply = await callAI({
                message,
                history: historyPayload,
                system:
                    'You are FamilyHub Study Mentor. Help students prioritise assignments, break down tasks, offer study strategies, and encourage active learning. Never reveal direct answers to graded work; provide hints, steps, and planning support.',
                temperature: 0.55
            });

            conversationHistory.push({ role: 'assistant', content: reply, text: reply });
            removeMessage(loadingMessage);
            addChatMessage('bot', reply);
        } catch (error) {
            Debug.error('Chatbot error:', error);
            if (error?.details) {
                Debug.error('Chatbot error details:', error.details);
            }
            removeMessage(loadingMessage);
            conversationHistory.pop(); // remove the user entry that failed

            let friendlyMessage =
                'I ran into an issue while thinking about that. Please try again in a moment.';

            if (error?.status === 429) {
                friendlyMessage =
                    'I’m hitting some rate limits right now. Give me a little break and try again soon.';
            } else if (error?.message) {
                friendlyMessage = `I couldn’t reach the AI service: ${error.message}.`;
            }

            addChatMessage('bot', friendlyMessage);
        } finally {
            isSending = false;
            sendChatBtn.disabled = false;
        }
    }

    sendChatBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Nutrition Lookup
    const foodSearch = document.getElementById('foodSearch');
    const searchFoodBtn = document.getElementById('searchFoodBtn');
    const nutritionResults = document.getElementById('nutritionResults');

    // Food database (fallback if AI unavailable)
    const foodDatabase = {
        'apple': { calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4 },
        'banana': { calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3 },
        'chicken breast': { calories: 231, protein: 43, carbs: 0, fat: 5, fiber: 0 },
        'rice': { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4 },
        'salmon': { calories: 206, protein: 22, carbs: 0, fat: 12, fiber: 0 },
        'broccoli': { calories: 55, protein: 4, carbs: 11, fat: 0.6, fiber: 5 },
        'eggs': { calories: 155, protein: 13, carbs: 1.1, fat: 11, fiber: 0 },
        'bread': { calories: 79, protein: 3, carbs: 15, fat: 1, fiber: 0.9 },
        'milk': { calories: 103, protein: 8, carbs: 12, fat: 2.4, fiber: 0 },
        'orange': { calories: 62, protein: 1.2, carbs: 15, fat: 0.2, fiber: 3 },
        'pasta': { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8 },
        'yogurt': { calories: 59, protein: 10, carbs: 3.6, fat: 0.4, fiber: 0 }
    };

    function renderNutritionItems(items, heading) {
        if (!Array.isArray(items) || !items.length) {
            nutritionResults.innerHTML =
                '<p style="text-align: center; color: var(--text-secondary);">No nutrition details available.</p>';
            return;
        }

        const fragment = document.createDocumentFragment();

        items.forEach(item => {
            const card = document.createElement('div');
            card.className = 'food-item';

            const name = document.createElement('div');
            name.className = 'food-name';
            name.textContent = `${item.name || heading} (${item.serving || 'per serving'})`;
            card.appendChild(name);

            if (item.notes) {
                const notesPara = document.createElement('p');
                notesPara.style.color = 'var(--text-secondary)';
                notesPara.style.marginBottom = '12px';
                notesPara.textContent = item.notes;
                card.appendChild(notesPara);
            }

            const info = document.createElement('div');
            info.className = 'nutrition-info';

            const stats = [
                { label: 'Calories', value: item.calories ? `${item.calories} kcal` : null },
                { label: 'Protein', value: item.protein ? `${item.protein} g` : null },
                { label: 'Carbs', value: item.carbs ? `${item.carbs} g` : null },
                { label: 'Fat', value: item.fat ? `${item.fat} g` : null },
                { label: 'Fiber', value: item.fiber ? `${item.fiber} g` : null }
            ].filter(stat => stat.value);

            if (!stats.length && (!item.vitamins || !item.vitamins.length)) {
                const fallback = document.createElement('p');
                fallback.style.color = 'var(--text-secondary)';
                fallback.textContent = 'No macro data provided.';
                card.appendChild(fallback);
            } else {
                stats.forEach(stat => {
                    const statDiv = document.createElement('div');
                    statDiv.className = 'nutrition-stat';
                    statDiv.innerHTML = `
                        <div class="nutrition-stat-label">${stat.label}</div>
                        <div class="nutrition-stat-value">${stat.value}</div>
                    `;
                    info.appendChild(statDiv);
                });
                card.appendChild(info);
            }

            fragment.appendChild(card);
        });

        nutritionResults.innerHTML = '';
        nutritionResults.appendChild(fragment);
    }

    async function searchFood() {
        const queryRaw = foodSearch.value.trim();
        if (!queryRaw) {
            nutritionResults.innerHTML =
                '<p style="text-align: center; color: var(--text-secondary);">Please enter a food item to search.</p>';
            return;
        }

        const query = queryRaw.toLowerCase();
        nutritionResults.innerHTML = '<p style="text-align: center; color: var(--text-secondary);">Checking with AI...</p>';

        try {
            const reply = await callAI({
                system:
                    'You are a registered dietitian. Respond ONLY in JSON with key "items": Array of foods, each with name, serving, calories, protein, carbs, fat, fiber, notes. Include multiple flavor or brand variants if relevant.',
                message: `Provide nutrition information for different varieties of "${queryRaw}".`,
                temperature: 0.3
            });

            const parsed = parseJsonSafe(reply);
            if (parsed?.items?.length) {
                renderNutritionItems(parsed.items, queryRaw);
                return;
            }
        } catch (error) {
            Debug.warn('AI nutrition lookup failed, using fallback', error);
        }

        const food = foodDatabase[query];
        if (!food) {
            nutritionResults.innerHTML = `
                <div class="food-item">
                    <p style="text-align: center; color: var(--text-secondary);">
                        Couldn’t find detailed information for "${queryRaw}". Try another item or ask AI again later.
                    </p>
                </div>
            `;
            return;
        }

        renderNutritionItems(
            [
                {
                    name: queryRaw.charAt(0).toUpperCase() + queryRaw.slice(1),
                    serving: 'per 100g',
                    calories: food.calories,
                    protein: food.protein,
                    carbs: food.carbs,
                    fat: food.fat,
                    fiber: food.fiber
                }
            ],
            queryRaw
        );
    }

    searchFoodBtn.addEventListener('click', searchFood);
    foodSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchFood();
        }
    });
    };
    run().catch(error => {
        Debug.error('Dashboard initialization failed', error);
        alert('We hit a snag loading your dashboard. Please refresh and try again.');
    });
});





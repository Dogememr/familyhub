const fs = require('fs');
const path = require('path');

const STORE_FILE = path.join(process.cwd(), 'data', 'store.json');

const DEFAULT_STORE = {
    users: [],
    planner: {},
    families: []
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function ensureFile() {
    try {
        const dir = path.dirname(STORE_FILE);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(STORE_FILE)) {
            fs.writeFileSync(STORE_FILE, JSON.stringify(DEFAULT_STORE, null, 2), 'utf-8');
        }
    } catch (error) {
        console.warn('[DataStore] Failed to ensure store file:', error.message);
    }
}

let canPersist = true;

function readFromFile() {
    try {
        ensureFile();
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        return {
            users: Array.isArray(parsed.users) ? parsed.users : [],
            planner: parsed.planner && typeof parsed.planner === 'object' ? parsed.planner : {},
            families: Array.isArray(parsed.families) ? parsed.families : []
        };
    } catch (error) {
        console.warn('[DataStore] Failed to read store file, using defaults:', error.message);
        canPersist = false;
        return clone(DEFAULT_STORE);
    }
}

const globalScope = globalThis || global;
if (!globalScope.__FAMILYHUB_DATA__) {
    globalScope.__FAMILYHUB_DATA__ = readFromFile();
}

let memoryStore = globalScope.__FAMILYHUB_DATA__;

function persist() {
    if (!canPersist) return;
    try {
        fs.writeFileSync(STORE_FILE, JSON.stringify(memoryStore, null, 2), 'utf-8');
    } catch (error) {
        canPersist = false;
        console.warn('[DataStore] Persist skipped (readonly environment?):', error.message);
    }
}

function updateStore(mutator) {
    const current = clone(memoryStore);
    const next = mutator(clone(memoryStore)) || current;
    memoryStore = {
        users: Array.isArray(next.users) ? next.users : [],
        planner: next.planner && typeof next.planner === 'object' ? next.planner : {},
        families: Array.isArray(next.families) ? next.families : []
    };
    globalScope.__FAMILYHUB_DATA__ = memoryStore;
    persist();
    return memoryStore;
}

function getUsers() {
    return clone(memoryStore.users);
}

function findUserByUsername(username) {
    return clone(memoryStore.users.find(user => user.username === username) || null);
}

function findUserByEmail(email) {
    return clone(memoryStore.users.find(user => user.email === email) || null);
}

function addUser(user) {
    updateStore(store => {
        const users = [...store.users, clone(user)];
        const planner = { ...store.planner };
        planner[user.username] = planner[user.username] || { entries: [] };
        return { ...store, users, planner };
    });
    return findUserByUsername(user.username);
}

function updateUser(username, updates) {
    let updatedUser = null;
    updateStore(store => {
        const users = store.users.map(user => {
            if (user.username !== username) return user;
            updatedUser = { ...user, ...clone(updates) };
            return updatedUser;
        });
        return { ...store, users };
    });
    return clone(updatedUser);
}

function getPlanner(username) {
    const planner = memoryStore.planner[username];
    if (planner && typeof planner === 'object') {
        return clone(planner);
    }
    return { entries: [] };
}

function setPlanner(username, plannerData) {
    const safePlanner = plannerData && typeof plannerData === 'object' ? plannerData : { entries: [] };
    updateStore(store => {
        const planner = { ...store.planner, [username]: clone(safePlanner) };
        return { ...store, planner };
    });
    return getPlanner(username);
}

function listFamilies() {
    return clone(memoryStore.families);
}

function findFamilyById(familyId) {
    return clone(memoryStore.families.find(family => family.id === familyId) || null);
}

function findFamilyByCode(code) {
    return clone(memoryStore.families.find(family => family.code === code) || null);
}

function generateFamilyCode(existing = new Set()) {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let attempt = '';
    let tries = 0;
    do {
        attempt = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
        tries += 1;
    } while ((existing.has(attempt) || findFamilyByCode(attempt)) && tries < 2000);
    return attempt;
}

function createFamily({ name, ownerUsername }) {
    const families = listFamilies();
    const existingCodes = new Set(families.map(f => f.code));
    const family = {
        id: `fam_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
        name,
        code: generateFamilyCode(existingCodes),
        owner: ownerUsername,
        createdAt: new Date().toISOString(),
        members: [{ username: ownerUsername, role: 'owner' }],
        reminders: [],
        chat: []
    };
    updateStore(store => {
        const familiesUpdated = [...store.families, family];
        return { ...store, families: familiesUpdated };
    });
    updateUser(ownerUsername, { familyId: family.id, role: 'owner' });
    return findFamilyById(family.id);
}

function saveFamily(family) {
    let saved = null;
    updateStore(store => {
        const families = store.families.map(item => {
            if (item.id !== family.id) return item;
            saved = { ...item, ...clone(family) };
            return saved;
        });
        return { ...store, families };
    });
    return saved ? clone(saved) : null;
}

function joinFamilyByCode({ username, role, code }) {
    const family = memoryStore.families.find(item => item.code === code);
    if (!family) {
        return { family: null, user: null };
    }
    if (!Array.isArray(family.members)) {
        family.members = [];
    }
    if (!family.members.some(member => member.username === username)) {
        family.members.push({ username, role });
    }
    updateStore(store => {
        const families = store.families.map(item => (item.id === family.id ? family : item));
        return { ...store, families };
    });
    const updatedUser = updateUser(username, { familyId: family.id, role });
    return { family: findFamilyById(family.id), user: updatedUser };
}

function regenerateFamilyCode(familyId) {
    let updatedFamily = null;
    updateStore(store => {
        const existingCodes = new Set(store.families.map(f => f.code));
        const families = store.families.map(family => {
            if (family.id !== familyId) return family;
            const newCode = generateFamilyCode(existingCodes);
            updatedFamily = { ...family, code: newCode, regeneratedAt: new Date().toISOString() };
            return updatedFamily;
        });
        return { ...store, families };
    });
    return clone(updatedFamily);
}

module.exports = {
    getUsers,
    findUserByUsername,
    findUserByEmail,
    addUser,
    updateUser,
    getPlanner,
    setPlanner,
    listFamilies,
    findFamilyById,
    findFamilyByCode,
    createFamily,
    saveFamily,
    joinFamilyByCode,
    regenerateFamilyCode
};


const { getPlanner, setPlanner, findUserByUsername } = require('./_data-store');

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return;
    }

    try {
        if (req.method === 'GET') {
            const { username } = req.query || {};
            if (!username) {
                res.status(400).json({ error: 'Username is required' });
                return;
            }
            if (!findUserByUsername(username)) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            const planner = getPlanner(username);
            res.status(200).json({ planner });
            return;
        }

        if (req.method === 'PUT') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
            const { username, planner } = body;
            if (!username || !planner) {
                res.status(400).json({ error: 'Username and planner data are required' });
                return;
            }
            if (!findUserByUsername(username)) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            const saved = setPlanner(username, planner);
            res.status(200).json({ planner: saved });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[api/planner] Unexpected error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


const { getWorkout, setWorkout, findUserByUsername } = require('./_data-store');

module.exports = async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
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
            const workouts = getWorkout(username);
            res.status(200).json({ workouts });
            return;
        }

        if (req.method === 'PUT') {
            const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
            const { username, workouts } = body;
            if (!username || !workouts) {
                res.status(400).json({ error: 'Username and workouts data are required' });
                return;
            }
            if (!findUserByUsername(username)) {
                res.status(404).json({ error: 'User not found' });
                return;
            }
            const saved = setWorkout(username, workouts);
            res.status(200).json({ workouts: saved });
            return;
        }

        res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('[api/workout] Unexpected error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};


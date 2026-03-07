// middleware/auth.js
const jwt = require('jsonwebtoken');
const db = require('../config/database');

const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { rows } = await db.query(
      'SELECT id, email, role, is_active, is_banned FROM users WHERE id = $1',
      [decoded.userId]
    );
    if (!rows[0]) return res.status(401).json({ error: 'User not found' });
    if (!rows[0].is_active) return res.status(403).json({ error: 'Account deactivated' });
    if (rows[0].is_banned) return res.status(403).json({ error: 'Account suspended' });
    req.user = rows[0];
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

const optionalAuth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const { rows } = await db.query('SELECT id, email, role FROM users WHERE id = $1', [decoded.userId]);
      if (rows[0]) req.user = rows[0];
    }
  } catch (_) {}
  next();
};

module.exports = { auth, adminOnly, optionalAuth };

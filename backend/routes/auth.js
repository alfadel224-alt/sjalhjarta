// routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { auth } = require('../middleware/auth');

const generateToken = (userId) =>
  jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  body('first_name').trim().isLength({ min: 2, max: 100 }),
  body('age').isInt({ min: 18, max: 100 }),
  body('gender').notEmpty(),
  body('seeking').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password, first_name, age, gender, seeking, city } = req.body;
  const client = await db.getClient();

  try {
    await client.query('BEGIN');
    const exists = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (exists.rows[0]) return res.status(409).json({ error: 'Email already registered' });

    const password_hash = await bcrypt.hash(password, 12);
    const userRes = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email, role`,
      [email, password_hash]
    );
    const user = userRes.rows[0];

    await client.query(
      `INSERT INTO profiles (user_id, first_name, age, gender, seeking, city) VALUES ($1,$2,$3,$4,$5,$6)`,
      [user.id, first_name, age, gender, seeking, city || null]
    );

    await client.query(
      `INSERT INTO subscriptions (user_id, plan) VALUES ($1, 'free')`,
      [user.id]
    );

    await client.query('COMMIT');
    const token = generateToken(user.id);
    res.status(201).json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    client.release();
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { email, password } = req.body;
  try {
    const { rows } = await db.query(
      'SELECT id, email, password_hash, role, is_active, is_banned FROM users WHERE email = $1',
      [email]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!user.is_active) return res.status(403).json({ error: 'Account deactivated' });
    if (user.is_banned) return res.status(403).json({ error: 'Account suspended' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    await db.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    const token = generateToken(user.id);
    res.json({ token, user: { id: user.id, email: user.email, role: user.role } });
  } catch (err) {
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role, u.created_at,
              p.first_name, p.age, p.gender, p.city, p.avatar_url, p.is_complete,
              s.plan, s.status as sub_status
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN subscriptions s ON s.user_id = u.id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// POST /api/auth/change-password
router.post('/change-password', auth, [
  body('current_password').notEmpty(),
  body('new_password').isLength({ min: 8 }),
], async (req, res) => {
  const { current_password, new_password } = req.body;
  try {
    const { rows } = await db.query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Current password incorrect' });
    const hash = await bcrypt.hash(new_password, 12);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update password' });
  }
});

module.exports = router;

// routes/admin.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(auth, adminOnly);

// GET /api/admin/stats
router.get('/stats', async (req, res) => {
  try {
    const [users, profiles, matches, messages, revenue, newToday] = await Promise.all([
      db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active) as active, COUNT(*) FILTER (WHERE is_banned) as banned FROM users'),
      db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_complete) as complete FROM profiles'),
      db.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status=\'matched\') as mutual FROM matches'),
      db.query('SELECT COUNT(*) as total FROM messages'),
      db.query('SELECT COALESCE(SUM(amount),0) as total FROM payments WHERE status=\'succeeded\''),
      db.query('SELECT COUNT(*) as users_today FROM users WHERE created_at > NOW() - INTERVAL \'1 day\''),
    ]);

    res.json({
      users: users.rows[0],
      profiles: profiles.rows[0],
      matches: matches.rows[0],
      messages: messages.rows[0],
      revenue: revenue.rows[0],
      new_today: newToday.rows[0],
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/users — paginated user list
router.get('/users', async (req, res) => {
  const { page = 1, limit = 25, search = '', filter = 'all' } = req.query;
  const offset = (page - 1) * limit;
  try {
    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (search) {
      where += ` AND (u.email ILIKE $${paramIdx} OR p.first_name ILIKE $${paramIdx})`;
      params.push(`%${search}%`);
      paramIdx++;
    }
    const ALLOWED_FILTERS = ['all', 'banned', 'premium', 'new'];
    const safeFilter = ALLOWED_FILTERS.includes(filter) ? filter : 'all';
    if (safeFilter === 'banned') { where += ` AND u.is_banned = true`; }
    if (safeFilter === 'premium') { where += ` AND s.plan != 'free'`; }
    if (safeFilter === 'new') { where += ` AND u.created_at > NOW() - INTERVAL '7 days'`; }

    params.push(limit, offset);

    const { rows } = await db.query(
      `SELECT u.id, u.email, u.role, u.is_active, u.is_banned, u.created_at, u.last_login,
              p.first_name, p.age, p.city, p.avatar_url, p.is_complete,
              s.plan, s.status as sub_status,
              (SELECT COUNT(*) FROM matches WHERE user1_id = u.id OR user2_id = u.id) as match_count
       FROM users u
       LEFT JOIN profiles p ON p.user_id = u.id
       LEFT JOIN subscriptions s ON s.user_id = u.id
       ${where}
       ORDER BY u.created_at DESC
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      params
    );

    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) FROM users u LEFT JOIN profiles p ON p.user_id = u.id LEFT JOIN subscriptions s ON s.user_id = u.id ${where}`,
      params.slice(0, -2)
    );

    res.json({ users: rows, total: parseInt(countRows[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// PUT /api/admin/users/:userId/ban
router.put('/users/:userId/ban', async (req, res) => {
  const { ban_reason } = req.body;
  try {
    await db.query(
      'UPDATE users SET is_banned = true, ban_reason = $1 WHERE id = $2',
      [ban_reason || 'Policy violation', req.params.userId]
    );
    res.json({ message: 'User banned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// PUT /api/admin/users/:userId/unban
router.put('/users/:userId/unban', async (req, res) => {
  try {
    await db.query('UPDATE users SET is_banned = false, ban_reason = null WHERE id = $1', [req.params.userId]);
    res.json({ message: 'User unbanned' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// DELETE /api/admin/users/:userId
router.delete('/users/:userId', async (req, res) => {
  try {
    await db.query('DELETE FROM users WHERE id = $1', [req.params.userId]);
    res.json({ message: 'User deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// GET /api/admin/reports
router.get('/reports', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT r.*, 
              p1.first_name as reporter_name, 
              p2.first_name as reported_name
       FROM reports r
       LEFT JOIN profiles p1 ON p1.user_id = r.reporter_id
       LEFT JOIN profiles p2 ON p2.user_id = r.reported_id
       ORDER BY r.created_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reports' });
  }
});

// PUT /api/admin/reports/:reportId
router.put('/reports/:reportId', async (req, res) => {
  const { status } = req.body;
  try {
    await db.query('UPDATE reports SET status = $1 WHERE id = $2', [status, req.params.reportId]);
    res.json({ message: 'Report updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/admin/payments
router.get('/payments', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT pay.*, p.first_name, u.email
       FROM payments pay
       JOIN users u ON u.id = pay.user_id
       LEFT JOIN profiles p ON p.user_id = pay.user_id
       ORDER BY pay.created_at DESC LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET /api/admin/growth — daily signups for chart
router.get('/growth', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT DATE(created_at) as date, COUNT(*) as signups
       FROM users
       WHERE created_at > NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date ASC`
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

module.exports = router;

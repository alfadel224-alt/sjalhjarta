// routes/profiles.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, process.env.UPLOAD_DIR || 'uploads'),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Images only'));
    cb(null, true);
  },
});

// GET /api/profiles/me
router.get('/me', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM profiles WHERE user_id = $1',
      [req.user.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profiles/me
router.put('/me', auth, async (req, res) => {
  const {
    first_name, age, gender, seeking, city, bio,
    occupation, education, height_cm, interests, values
  } = req.body;
  try {
    const isComplete = !!(first_name && age && gender && seeking && bio && city);
    const { rows } = await db.query(
      `UPDATE profiles SET
        first_name = COALESCE($1, first_name),
        age = COALESCE($2, age),
        gender = COALESCE($3, gender),
        seeking = COALESCE($4, seeking),
        city = COALESCE($5, city),
        bio = COALESCE($6, bio),
        occupation = COALESCE($7, occupation),
        education = COALESCE($8, education),
        height_cm = COALESCE($9, height_cm),
        interests = COALESCE($10::jsonb, interests),
        values = COALESCE($11::jsonb, values),
        is_complete = $12,
        last_active = NOW()
       WHERE user_id = $13 RETURNING *`,
      [first_name, age, gender, seeking, city, bio, occupation, education, height_cm,
       interests ? JSON.stringify(interests) : null,
       values ? JSON.stringify(values) : null,
       isComplete, req.user.id]
    );
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// POST /api/profiles/avatar
router.post('/avatar', auth, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const url = `/uploads/${req.file.filename}`;
    await db.query('UPDATE profiles SET avatar_url = $1 WHERE user_id = $2', [url, req.user.id]);
    res.json({ avatar_url: url });
  } catch (err) {
    res.status(500).json({ error: 'Upload failed' });
  }
});

// GET /api/profiles/discover — browse potential matches
router.get('/discover', auth, async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;
  try {
    // Get current user profile
    const { rows: me } = await db.query(
      'SELECT gender, seeking FROM profiles WHERE user_id = $1', [req.user.id]
    );
    if (!me[0]) return res.status(400).json({ error: 'Complete your profile first' });

    // Already interacted with
    const { rows: seen } = await db.query(
      'SELECT user2_id as uid FROM matches WHERE user1_id = $1 UNION SELECT user1_id FROM matches WHERE user2_id = $1',
      [req.user.id]
    );
    const seenIds = seen.map(r => r.uid);
    seenIds.push(req.user.id);

    const { rows } = await db.query(
      `SELECT p.id, p.user_id, p.first_name, p.age, p.city, p.bio,
              p.avatar_url, p.occupation, p.interests, p.values,
              p.last_active,
              EXTRACT(EPOCH FROM (NOW() - p.last_active))/3600 as hours_ago
       FROM profiles p
       WHERE p.is_visible = true
         AND p.is_complete = true
         AND p.user_id != ALL($1::uuid[])
       ORDER BY p.last_active DESC
       LIMIT $2 OFFSET $3`,
      [seenIds, limit, offset]
    );
    res.json({ profiles: rows, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch profiles' });
  }
});

// GET /api/profiles/:userId — view specific profile
router.get('/:userId', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT p.id, p.first_name, p.age, p.city, p.bio, p.avatar_url,
              p.occupation, p.education, p.height_cm, p.interests, p.values,
              p.gender, p.last_active, p.ai_summary
       FROM profiles p
       WHERE p.user_id = $1 AND p.is_visible = true`,
      [req.params.userId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Profile not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

module.exports = router;

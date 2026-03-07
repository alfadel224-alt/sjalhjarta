// routes/matches.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// AI compatibility scoring
async function calculateAIScore(profile1, profile2) {
  try {
    const prompt = `You are a relationship compatibility expert. Score the compatibility between two people on a scale of 0-100.

Person 1: ${profile1.first_name}, ${profile1.age}, ${profile1.city}
Bio: ${profile1.bio || 'Not provided'}
Interests: ${JSON.stringify(profile1.interests || [])}
Values: ${JSON.stringify(profile1.values || [])}
Occupation: ${profile1.occupation || 'Not provided'}

Person 2: ${profile2.first_name}, ${profile2.age}, ${profile2.city}
Bio: ${profile2.bio || 'Not provided'}
Interests: ${JSON.stringify(profile2.interests || [])}
Values: ${JSON.stringify(profile2.values || [])}
Occupation: ${profile2.occupation || 'Not provided'}

Respond with ONLY a JSON object: {"score": number, "reason": "brief explanation in Swedish"}`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 200,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text.trim();
    const clean = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);
    return { score: result.score / 100, reason: result.reason };
  } catch (err) {
    // Fallback: simple interest overlap scoring
    const interests1 = new Set(profile1.interests || []);
    const interests2 = new Set(profile2.interests || []);
    const overlap = [...interests1].filter(i => interests2.has(i)).length;
    const score = Math.min(0.95, 0.5 + overlap * 0.1);
    return { score, reason: 'Baserat på gemensamma intressen' };
  }
}

// POST /api/matches/like/:targetUserId
router.post('/like/:targetUserId', auth, async (req, res) => {
  const { targetUserId } = req.params;
  if (targetUserId === req.user.id) return res.status(400).json({ error: 'Cannot like yourself' });

  const client = await db.getClient();
  try {
    await client.query('BEGIN');

    // Check existing match
    const existing = await client.query(
      `SELECT * FROM matches
       WHERE (user1_id = $1 AND user2_id = $2) OR (user1_id = $2 AND user2_id = $1)`,
      [req.user.id, targetUserId]
    );

    let match = existing.rows[0];

    if (!match) {
      // Get both profiles for AI scoring
      const { rows: p1 } = await client.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
      const { rows: p2 } = await client.query('SELECT * FROM profiles WHERE user_id = $1', [targetUserId]);

      let aiScore = 0.7;
      let aiReason = '';
      if (p1[0] && p2[0]) {
        const result = await calculateAIScore(p1[0], p2[0]);
        aiScore = result.score;
        aiReason = result.reason;
      }

      const { rows } = await client.query(
        `INSERT INTO matches (user1_id, user2_id, user1_liked, ai_score)
         VALUES ($1, $2, true, $3) RETURNING *`,
        [req.user.id, targetUserId, aiScore]
      );
      match = rows[0];
      await client.query('COMMIT');
      return res.json({ status: 'liked', match, aiReason });
    }

    // Update existing
    const isUser1 = match.user1_id === req.user.id;
    const myField = isUser1 ? 'user1_liked' : 'user2_liked';
    const theirField = isUser1 ? 'user2_liked' : 'user1_liked';

    const { rows } = await client.query(
      `UPDATE matches SET ${myField} = true,
       status = CASE WHEN ${theirField} = true THEN 'matched' ELSE status END,
       matched_at = CASE WHEN ${theirField} = true THEN NOW() ELSE matched_at END
       WHERE id = $1 RETURNING *`,
      [match.id]
    );

    await client.query('COMMIT');
    const isMutual = rows[0].status === 'matched';
    res.json({ status: isMutual ? 'matched' : 'liked', match: rows[0], mutual: isMutual });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Failed to process like' });
  } finally {
    client.release();
  }
});

// POST /api/matches/pass/:targetUserId
router.post('/pass/:targetUserId', auth, async (req, res) => {
  try {
    await db.query(
      `INSERT INTO matches (user1_id, user2_id, status) VALUES ($1,$2,'rejected')
       ON CONFLICT DO NOTHING`,
      [req.user.id, req.params.targetUserId]
    );
    res.json({ status: 'passed' });
  } catch (err) {
    res.status(500).json({ error: 'Failed' });
  }
});

// GET /api/matches — get all mutual matches
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT m.id, m.ai_score, m.matched_at, m.created_at,
              CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END as partner_id,
              p.first_name, p.age, p.city, p.avatar_url, p.last_active,
              (SELECT content FROM messages WHERE match_id = m.id ORDER BY created_at DESC LIMIT 1) as last_message,
              (SELECT COUNT(*) FROM messages WHERE match_id = m.id AND sender_id != $1 AND is_read = false) as unread_count
       FROM matches m
       JOIN profiles p ON p.user_id = (CASE WHEN m.user1_id = $1 THEN m.user2_id ELSE m.user1_id END)
       WHERE (m.user1_id = $1 OR m.user2_id = $1)
         AND m.status = 'matched'
       ORDER BY m.matched_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch matches' });
  }
});

// GET /api/matches/:matchId/messages
router.get('/:matchId/messages', auth, async (req, res) => {
  try {
    // Verify user is part of this match
    const { rows: match } = await db.query(
      'SELECT * FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2)',
      [req.params.matchId, req.user.id]
    );
    if (!match[0]) return res.status(403).json({ error: 'Access denied' });

    const { rows } = await db.query(
      `SELECT m.*, p.first_name, p.avatar_url
       FROM messages m JOIN profiles p ON p.user_id = m.sender_id
       WHERE m.match_id = $1 ORDER BY m.created_at ASC`,
      [req.params.matchId]
    );

    // Mark as read
    await db.query(
      'UPDATE messages SET is_read = true WHERE match_id = $1 AND sender_id != $2',
      [req.params.matchId, req.user.id]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

// POST /api/matches/:matchId/messages
router.post('/:matchId/messages', auth, async (req, res) => {
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: 'Message cannot be empty' });

  try {
    const { rows: match } = await db.query(
      'SELECT * FROM matches WHERE id = $1 AND (user1_id = $2 OR user2_id = $2) AND status = \'matched\'',
      [req.params.matchId, req.user.id]
    );
    if (!match[0]) return res.status(403).json({ error: 'Access denied' });

    const { rows } = await db.query(
      `INSERT INTO messages (match_id, sender_id, content)
       VALUES ($1,$2,$3) RETURNING *`,
      [req.params.matchId, req.user.id, content.trim()]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;

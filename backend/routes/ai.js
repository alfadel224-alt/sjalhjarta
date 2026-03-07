// routes/ai.js
const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { auth } = require('../middleware/auth');
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const STELLA_SYSTEM = `Du är Stella, en varm, klok och professionell AI-kärlekscoach på den svenska dejtingplattformen Själ & Hjärta.

Ditt syfte:
- Hjälpa användare bygga genuina, meningsfulla relationer
- Ge konkreta råd om kommunikation, profilförbättring och dejting
- Vara empatisk, uppmuntrande och ärlig
- Svara alltid på svenska
- Hålla svar kortfattade (2-4 meningar) om inte mer behövs
- Aldrig ge medicinska, juridiska eller finansiella råd

Personlighet: Varm som en bästa vän, klok som en terapeut, praktisk som en livsstilscoach.`;

// POST /api/ai/chat
router.post('/chat', auth, async (req, res) => {
  const { message, context } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Message required' });

  try {
    // Load or create conversation
    let { rows } = await db.query(
      'SELECT * FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [req.user.id]
    );

    let conversation = rows[0];
    let history = conversation ? conversation.messages : [];

    // Keep last 20 messages for context
    if (history.length > 20) history = history.slice(-20);

    history.push({ role: 'user', content: message });

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      system: STELLA_SYSTEM,
      messages: history,
    });

    const reply = response.content[0].text;
    history.push({ role: 'assistant', content: reply });

    // Save conversation
    if (conversation) {
      await db.query(
        'UPDATE ai_conversations SET messages = $1::jsonb, updated_at = NOW() WHERE id = $2',
        [JSON.stringify(history), conversation.id]
      );
    } else {
      await db.query(
        'INSERT INTO ai_conversations (user_id, messages) VALUES ($1, $2::jsonb)',
        [req.user.id, JSON.stringify(history)]
      );
    }

    res.json({ reply, timestamp: new Date() });
  } catch (err) {
    console.error('AI error:', err);
    res.status(500).json({ error: 'AI service unavailable', fallback: 'Tyvärr kan jag inte svara just nu. Försök igen om en stund!' });
  }
});

// POST /api/ai/analyze-profile
router.post('/analyze-profile', auth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM profiles WHERE user_id = $1', [req.user.id]);
    const profile = rows[0];
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const prompt = `Analysera denna dejtingprofil och ge 3 konkreta förbättringsförslag på svenska. Var specifik och uppmuntrande.

Namn: ${profile.first_name}, ${profile.age} år
Stad: ${profile.city || 'Ej angiven'}
Bio: ${profile.bio || 'Ej skriven'}
Yrke: ${profile.occupation || 'Ej angivet'}
Intressen: ${JSON.stringify(profile.interests || [])}
Värderingar: ${JSON.stringify(profile.values || [])}

Svara med JSON: {"score": 0-100, "strengths": ["..."], "suggestions": ["...", "...", "..."], "bio_rewrite": "förbättrad bio"}`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text.replace(/```json|```/g, '').trim();
    const analysis = JSON.parse(text);

    // Save AI summary
    await db.query(
      'UPDATE profiles SET ai_summary = $1 WHERE user_id = $2',
      [analysis.bio_rewrite || profile.bio, req.user.id]
    );

    res.json(analysis);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Analysis failed' });
  }
});

// POST /api/ai/message-suggestion
router.post('/message-suggestion', auth, async (req, res) => {
  const { partner_profile, context: ctx } = req.body;
  try {
    const prompt = `Hjälp mig skriva ett autentiskt och engagerande första meddelande till denna person på svenska.

${partner_profile ? `Partner: ${partner_profile.first_name}, ${partner_profile.age}, ${partner_profile.city}
Bio: ${partner_profile.bio || ''}
Intressen: ${JSON.stringify(partner_profile.interests || [])}` : ''}
${ctx ? `Kontext: ${ctx}` : ''}

Ge 3 olika förslag (kort, medium, kreativ). JSON: {"suggestions": [{"style":"kort","text":"..."}, {"style":"medium","text":"..."}, {"style":"kreativ","text":"..."}]}`;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = msg.content[0].text.replace(/```json|```/g, '').trim();
    res.json(JSON.parse(text));
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
});

// GET /api/ai/conversation-history
router.get('/conversation', auth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT messages FROM ai_conversations WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1',
      [req.user.id]
    );
    res.json({ messages: rows[0]?.messages || [] });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

// DELETE /api/ai/conversation
router.delete('/conversation', auth, async (req, res) => {
  try {
    await db.query('DELETE FROM ai_conversations WHERE user_id = $1', [req.user.id]);
    res.json({ message: 'Conversation cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear' });
  }
});

module.exports = router;

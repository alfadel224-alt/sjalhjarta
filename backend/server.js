require('dotenv').config();
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ── CORS يدوي — يعمل 100% ──
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const apiLimiter = rateLimit({ windowMs: 15*60*1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15*60*1000, max: 10 });

app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('combined'));
app.use('/uploads', express.static(uploadDir));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'Själ & Hjärta API', version: '1.0.0', timestamp: new Date().toISOString() }));

app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/profiles', apiLimiter, require('./routes/profiles'));
app.use('/api/matches', apiLimiter, require('./routes/matches'));
app.use('/api/ai', apiLimiter, require('./routes/ai'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/admin', apiLimiter, require('./routes/admin'));

app.use('/api/*', (req, res) => res.status(404).json({ error: `Route ${req.method} ${req.path} not found` }));
app.use((err, req, res, next) => res.status(500).json({ error: err.message }));

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
module.exports = app;

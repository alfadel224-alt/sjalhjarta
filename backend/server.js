// server.js — Själ & Hjärta API Server

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// مهم لـ Railway / Render
app.set('trust proxy', 1);

// ── Ensure uploads directory exists ──
const uploadDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ── CORS Configuration ──
const allowedOrigins = [
  'http://localhost:3000',
  'https://remarkable-syrniki-1fcb04.netlify.app'
];

app.use(cors({
  origin: function(origin, callback) {

    // السماح للطلبات بدون origin (مثل Postman)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(new Error('CORS not allowed'), false);
    }

    return callback(null, true);
  },
  methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
  credentials: true
}));

app.options('*', cors());

// ── Security ──
app.use(helmet({
  crossOriginResourcePolicy: false,
  crossOriginOpenerPolicy: false
}));

// ── Rate limiting ──
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests, please try again later' }
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many auth attempts' }
});

// ── Stripe webhook needs raw body ──
app.use('/api/subscriptions/webhook', express.raw({ type: 'application/json' }));

// ── Body parsing ──
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Logging ──
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Static files ──
app.use('/uploads', express.static(uploadDir));

// ── Health check ──
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Själ & Hjärta API',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// ── API Routes ──
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/profiles', apiLimiter, require('./routes/profiles'));
app.use('/api/matches', apiLimiter, require('./routes/matches'));
app.use('/api/ai', apiLimiter, require('./routes/ai'));
app.use('/api/subscriptions', require('./routes/subscriptions'));
app.use('/api/admin', apiLimiter, require('./routes/admin'));

// ── 404 handler ──
app.use('/api', (req, res) => {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// ── Global error handler ──
app.use((err, req, res, next) => {

  console.error('Unhandled error:', err);

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'File too large (max 5MB)' });
  }

  if (err.message === 'CORS not allowed') {
    return res.status(403).json({ error: 'CORS blocked for this origin' });
  }

  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// ── Start server ──
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║   🌹  Själ & Hjärta API Server       ║
  ║   Port: ${PORT}                          
  ║   Env:  ${(process.env.NODE_ENV || 'development').padEnd(12)}              
  ╚══════════════════════════════════════╝
  `);
});

module.exports = app;

// config/migrate.js
require('dotenv').config();
const db = require('./database');

const migrations = `
-- ═══════════════════════════════════════
-- Själ & Hjärta — Database Schema
-- ═══════════════════════════════════════

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ── USERS ──
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user','admin')),
  is_verified   BOOLEAN DEFAULT false,
  is_active     BOOLEAN DEFAULT true,
  is_banned     BOOLEAN DEFAULT false,
  ban_reason    TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  last_login    TIMESTAMPTZ
);

-- ── PROFILES ──
CREATE TABLE IF NOT EXISTS profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  first_name      VARCHAR(100) NOT NULL,
  age             INTEGER CHECK (age >= 18 AND age <= 100),
  gender          VARCHAR(30),
  seeking         VARCHAR(30),
  city            VARCHAR(100),
  bio             TEXT,
  occupation      VARCHAR(150),
  education       VARCHAR(150),
  height_cm       INTEGER,
  avatar_url      VARCHAR(500),
  photos          JSONB DEFAULT '[]',
  interests       JSONB DEFAULT '[]',
  values          JSONB DEFAULT '[]',
  personality     JSONB DEFAULT '{}',
  ai_summary      TEXT,
  compatibility_vector FLOAT[] DEFAULT '{}',
  is_complete     BOOLEAN DEFAULT false,
  is_visible      BOOLEAN DEFAULT true,
  last_active     TIMESTAMPTZ DEFAULT NOW(),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── SUBSCRIPTIONS ──
CREATE TABLE IF NOT EXISTS subscriptions (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id             UUID REFERENCES users(id) ON DELETE CASCADE,
  plan                VARCHAR(30) DEFAULT 'free' CHECK (plan IN ('free','plus','premium')),
  status              VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active','cancelled','expired','past_due')),
  stripe_customer_id  VARCHAR(255),
  stripe_sub_id       VARCHAR(255),
  current_period_end  TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── MATCHES ──
CREATE TABLE IF NOT EXISTS matches (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user1_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  user2_id        UUID REFERENCES users(id) ON DELETE CASCADE,
  ai_score        FLOAT DEFAULT 0,
  status          VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','matched','rejected')),
  user1_liked     BOOLEAN DEFAULT false,
  user2_liked     BOOLEAN DEFAULT false,
  matched_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user1_id, user2_id)
);

-- ── MESSAGES ──
CREATE TABLE IF NOT EXISTS messages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  match_id    UUID REFERENCES matches(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── AI COACH CONVERSATIONS ──
CREATE TABLE IF NOT EXISTS ai_conversations (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
  messages    JSONB DEFAULT '[]',
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── REPORTS ──
CREATE TABLE IF NOT EXISTS reports (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reporter_id   UUID REFERENCES users(id),
  reported_id   UUID REFERENCES users(id),
  reason        VARCHAR(100),
  description   TEXT,
  status        VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','reviewed','resolved','dismissed')),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── PAYMENTS ──
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID REFERENCES users(id),
  amount          INTEGER NOT NULL,
  currency        VARCHAR(3) DEFAULT 'SEK',
  status          VARCHAR(20),
  stripe_pi_id    VARCHAR(255),
  plan            VARCHAR(30),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── INDEXES ──
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_city ON profiles(city);
CREATE INDEX IF NOT EXISTS idx_profiles_gender ON profiles(gender);
CREATE INDEX IF NOT EXISTS idx_profiles_seeking ON profiles(seeking);
CREATE INDEX IF NOT EXISTS idx_matches_user1 ON matches(user1_id);
CREATE INDEX IF NOT EXISTS idx_matches_user2 ON matches(user2_id);
CREATE INDEX IF NOT EXISTS idx_messages_match ON messages(match_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);

-- ── UPDATED_AT TRIGGER ──
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_users_updated BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
  CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
`;

async function migrate() {
  console.log('🗄️  Running migrations...');
  try {
    await db.query(migrations);
    console.log('✅ Migrations completed successfully!');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

migrate();

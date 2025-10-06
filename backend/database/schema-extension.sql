-- database/schema-extension.sql
-- Add these tables to your existing database

-- Table for storing daily usage data
CREATE TABLE IF NOT EXISTS daily_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  site VARCHAR(100) NOT NULL,
  seconds_spent INTEGER DEFAULT 0,
  source VARCHAR(20) DEFAULT 'manual', -- 'manual' or 'extension'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, date, site)
);

-- Index for faster queries
CREATE INDEX idx_daily_usage_user_date ON daily_usage(user_id, date);
CREATE INDEX idx_daily_usage_site ON daily_usage(site);

-- Table for emergency access requests
CREATE TABLE IF NOT EXISTS emergency_access_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  site VARCHAR(100) NOT NULL,
  reason TEXT NOT NULL,
  approved BOOLEAN DEFAULT NULL,
  ai_response TEXT,
  timestamp TIMESTAMP DEFAULT NOW(),
  processed_at TIMESTAMP DEFAULT NULL
);

-- Index for emergency requests
CREATE INDEX idx_emergency_requests_user ON emergency_access_requests(user_id);
CREATE INDEX idx_emergency_requests_timestamp ON emergency_access_requests(timestamp DESC);

-- Table for sync logs (optional but useful for debugging)
CREATE TABLE IF NOT EXISTS sync_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  timestamp TIMESTAMP NOT NULL,
  sites_synced INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Add site_limits column to users table if not exists
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS site_limits JSONB DEFAULT '{
  "instagram.com": 3600,
  "tiktok.com": 3600,
  "youtube.com": 7200,
  "facebook.com": 3600,
  "twitter.com": 3600,
  "reddit.com": 3600,
  "netflix.com": 7200
}'::jsonb;

-- Sample query to get user's today usage
-- SELECT site, seconds_spent 
-- FROM daily_usage 
-- WHERE user_id = $1 AND date = CURRENT_DATE;

-- Sample query to get weekly usage
-- SELECT site, SUM(seconds_spent) as total_seconds
-- FROM daily_usage 
-- WHERE user_id = $1 
--   AND date >= CURRENT_DATE - INTERVAL '7 days'
-- GROUP BY site
-- ORDER BY total_seconds DESC;
-- BGRemover D1 Database Schema
-- Run: wrangler d1 execute bgremover-db --file=schema.sql

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id     TEXT    UNIQUE NOT NULL,
  email         TEXT    NOT NULL,
  name          TEXT,
  picture       TEXT,
  credits       INTEGER NOT NULL DEFAULT 5,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  paypal_order_id TEXT  UNIQUE NOT NULL,
  google_id     TEXT    NOT NULL,
  plan_id       TEXT    NOT NULL,   -- 'starter' | 'popular' | 'pro'
  amount        TEXT    NOT NULL,   -- '4.99'
  credits       INTEGER NOT NULL,   -- credits to add
  status        TEXT    NOT NULL DEFAULT 'pending', -- pending | completed | failed
  created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Processing history
CREATE TABLE IF NOT EXISTS processing_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  google_id     TEXT    NOT NULL,
  filename      TEXT,
  created_at    INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_orders_google_id ON orders(google_id);
CREATE INDEX IF NOT EXISTS idx_orders_paypal_id ON orders(paypal_order_id);

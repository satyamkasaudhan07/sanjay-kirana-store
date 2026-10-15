-- ============================================================================
-- Migration 002: Add Admin Accounts and Authentication Challenges Tables
-- Safe & Additive: Preserves all existing tables (products, orders, order_items, users)
-- ============================================================================

-- 1. Owner Admin Accounts Table
CREATE TABLE IF NOT EXISTS admin_accounts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Index on username for fast login lookup
CREATE INDEX IF NOT EXISTS idx_admin_accounts_username ON admin_accounts(username);

-- 2. Authentication Challenges & OTP Table (Multi-worker & Restart Safe)
-- Supports customer phone OTPs and owner 2-step challenge verification with attempt limits
CREATE TABLE IF NOT EXISTS auth_challenges (
    id SERIAL PRIMARY KEY,
    challenge_id VARCHAR(64) UNIQUE NOT NULL,
    purpose VARCHAR(30) NOT NULL,             -- 'customer_login' or 'admin_login'
    identifier VARCHAR(100) NOT NULL,          -- customer phone or admin username
    otp_code VARCHAR(10) NOT NULL,             -- 6-digit cryptographic OTP
    admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,       -- Track verification attempts (max 3-5)
    is_used BOOLEAN NOT NULL DEFAULT FALSE,    -- Single-use protection
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for challenge validation and cleanup
CREATE INDEX IF NOT EXISTS idx_auth_challenges_id ON auth_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_lookup ON auth_challenges(identifier, purpose, is_used);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);


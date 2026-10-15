-- ============================================================================
-- Migration 005: Add Three Distinct Roles & Customer Onboarding Support
-- Safe & Additive: Preserves all existing tables and data
-- ============================================================================

-- 1. Add is_profile_completed flag to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_profile_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for fast lookup on onboarding status
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users(is_profile_completed);

-- 2. Backfill existing customer profile completion status
-- A customer is complete ONLY when required name and a valid delivery address exist
UPDATE users u
SET is_profile_completed = TRUE
WHERE u.name IS NOT NULL 
  AND LENGTH(TRIM(u.name)) > 0
  AND EXISTS (
      SELECT 1 FROM customer_addresses ca
      WHERE ca.user_id = u.id
        AND ca.street_address IS NOT NULL 
        AND LENGTH(TRIM(ca.street_address)) > 0
        AND ca.city IS NOT NULL 
        AND LENGTH(TRIM(ca.city)) > 0
        AND ca.pincode IS NOT NULL 
        AND LENGTH(TRIM(ca.pincode)) > 0
  );

-- 3. Add explicit purpose check constraint to auth_challenges
-- Supports customer OTPs, admin 2FA challenges, and owner OTP challenges
ALTER TABLE auth_challenges 
DROP CONSTRAINT IF EXISTS chk_auth_challenges_purpose;

ALTER TABLE auth_challenges 
ADD CONSTRAINT chk_auth_challenges_purpose 
CHECK (purpose IN ('customer_login', 'admin_login', 'owner_login'));


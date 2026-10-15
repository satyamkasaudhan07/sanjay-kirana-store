-- ============================================================================
-- Migration 006: Support Email Login, Phone Verification & Multi-Identifier Accounts
-- Safe & Additive: Preserves all existing tables, customer records, and orders
-- ============================================================================

-- 1. Make users.phone nullable (email-registered customers add phone during onboarding)
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- 2. Add email column and verification status flags
ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Backfill existing phone-based users as phone-verified
UPDATE users SET is_phone_verified = TRUE WHERE phone IS NOT NULL;

-- 4. Case-insensitive unique index on email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email)) WHERE email IS NOT NULL;

-- 5. Guarantee that every user account has at least one valid identifier
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_has_identifier;
ALTER TABLE users ADD CONSTRAINT chk_users_has_identifier CHECK (phone IS NOT NULL OR email IS NOT NULL);

-- 6. Expand auth_challenges identifier size for email addresses & add phone_verification purpose
ALTER TABLE auth_challenges ALTER COLUMN identifier TYPE VARCHAR(255);

ALTER TABLE auth_challenges DROP CONSTRAINT IF EXISTS chk_auth_challenges_purpose;
ALTER TABLE auth_challenges ADD CONSTRAINT chk_auth_challenges_purpose 
CHECK (purpose IN ('customer_login', 'admin_login', 'owner_login', 'phone_verification'));


-- ==========================================================
-- Schema for Sanjay Kirana Store: Orders & Order Items Tables
-- ==========================================================

-- 1. Users Table (multi-identifier support: phone and/or email, no OTPs stored here)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    phone VARCHAR(15) UNIQUE,
    email VARCHAR(255),
    name VARCHAR(150),
    is_phone_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    is_profile_completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_has_identifier CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

-- Index for fast phone-number, email lookup and onboarding queries
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users(LOWER(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_profile_completed ON users(is_profile_completed);

-- 2. Orders Table
-- Internal primary key is `id` (SERIAL).
-- Customer-facing unique order number is `order_id` (e.g., 'SK172461...').
-- user_id is nullable to preserve existing orders that were placed without a user account.
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_id VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id),
    customer_name VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20) NOT NULL,
    delivery_address TEXT NOT NULL,
    city VARCHAR(100) NOT NULL,
    pincode VARCHAR(20) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'cod',
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_items INTEGER NOT NULL DEFAULT 0,
    delivery_latitude NUMERIC(9, 6),
    delivery_longitude NUMERIC(9, 6),
    delivery_distance_meters NUMERIC(10, 2),
    status VARCHAR(50) NOT NULL DEFAULT 'Order Placed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Order Items Table
-- `order_id` references the internal `orders.id` primary key.
-- `product_id` is an INTEGER NOT NULL referencing `products(id)`.
CREATE TABLE IF NOT EXISTS order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    product_name VARCHAR(255) NOT NULL,
    product_size VARCHAR(100),
    product_image VARCHAR(500),
    unit_price NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    total_price NUMERIC(10, 2) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);

-- 4. Owner Admin Accounts Table
CREATE TABLE IF NOT EXISTS admin_accounts (
    id SERIAL PRIMARY KEY,
    username VARCHAR(80) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_admin_accounts_username ON admin_accounts(username);

-- 5. Authentication Challenges & OTP Table
CREATE TABLE IF NOT EXISTS auth_challenges (
    id SERIAL PRIMARY KEY,
    challenge_id VARCHAR(64) UNIQUE NOT NULL,
    purpose VARCHAR(30) NOT NULL CHECK (purpose IN ('customer_login', 'admin_login', 'owner_login')),
    identifier VARCHAR(100) NOT NULL,          -- customer phone or admin username
    otp_code VARCHAR(10) NOT NULL,
    admin_id INTEGER REFERENCES admin_accounts(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    is_used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auth_challenges_id ON auth_challenges(challenge_id);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_lookup ON auth_challenges(identifier, purpose, is_used);
CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires ON auth_challenges(expires_at);

-- 6. Customer Saved Delivery Addresses Table
CREATE TABLE IF NOT EXISTS customer_addresses (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    recipient_name VARCHAR(150) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    street_address TEXT NOT NULL,
    landmark VARCHAR(200),
    locality VARCHAR(150),
    city VARCHAR(100) NOT NULL DEFAULT 'Harraiya',
    state VARCHAR(100) NOT NULL DEFAULT 'Uttar Pradesh',
    pincode VARCHAR(20) NOT NULL DEFAULT '272155',
    delivery_latitude NUMERIC(9, 6),
    delivery_longitude NUMERIC(9, 6),
    label VARCHAR(50) NOT NULL DEFAULT 'Home',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_default_address ON customer_addresses (user_id) WHERE is_default = TRUE;

-- 7. Product Reviews and Ratings Table
CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_order_product_review UNIQUE (user_id, order_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_order_id ON product_reviews(order_id);

-- 8. Order Status History Table
CREATE TABLE IF NOT EXISTS order_status_history (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL,
    actor_role VARCHAR(50) NOT NULL DEFAULT 'system',
    actor_name VARCHAR(150),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON order_status_history(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_history_created_at ON order_status_history(created_at DESC);

-- 9. Owner Website Notifications Table
CREATE TABLE IF NOT EXISTS owner_notifications (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    order_number VARCHAR(64) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_is_read ON owner_notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_owner_notifications_created_at ON owner_notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_owner_notifications_order_id ON owner_notifications(order_id);

-- 10. WhatsApp Outbox Table
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    recipient_phone VARCHAR(20) NOT NULL,
    message_text TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status ON whatsapp_outbox(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_order_id ON whatsapp_outbox(order_id);



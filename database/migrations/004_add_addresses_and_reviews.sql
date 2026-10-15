-- ============================================================================
-- Migration 004: Add Customer Addresses and Product Reviews Tables
-- Safe & Additive: Preserves existing users, orders, order_items, products tables
-- ============================================================================

-- 1. Customer Saved Delivery Addresses Table
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
    label VARCHAR(50) NOT NULL DEFAULT 'Home', -- 'Home', 'Work', 'Other'
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast user addresses lookup
CREATE INDEX IF NOT EXISTS idx_customer_addresses_user_id ON customer_addresses(user_id);

-- Enforce at the database level that each customer has at most ONE default address
CREATE UNIQUE INDEX IF NOT EXISTS idx_single_default_address 
ON customer_addresses (user_id) 
WHERE is_default = TRUE;

-- 2. Product Reviews and Ratings Table
CREATE TABLE IF NOT EXISTS product_reviews (
    id SERIAL PRIMARY KEY,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    -- Prevent duplicate reviews for the same product purchase in an order
    CONSTRAINT uq_user_order_product_review UNIQUE (user_id, order_id, product_id)
);

-- Indexes for product review retrieval and customer lookup
CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id ON product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user_id ON product_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_order_id ON product_reviews(order_id);


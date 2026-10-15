-- ============================================================================
-- Migration 007: Order Tracking, Order Status History, In-Site Notifications & WhatsApp Outbox
-- Safe & Additive: Preserves all existing tables, orders, products, and customer records
-- ============================================================================

-- 1. Add tracking_token and idempotency_key to orders table
ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS tracking_token VARCHAR(64) UNIQUE;

ALTER TABLE orders 
ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(64) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_orders_tracking_token ON orders(tracking_token);
CREATE INDEX IF NOT EXISTS idx_orders_idempotency_key ON orders(idempotency_key);

-- Backfill tracking_token for existing orders using md5 random seed if null
UPDATE orders
SET tracking_token = MD5(id::text || '-' || order_id || '-' || RANDOM()::text)
WHERE tracking_token IS NULL;

-- 2. Order Status History Table (Tracks all lifecycle status transitions)
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

-- Backfill initial status history for existing orders if none exists
INSERT INTO order_status_history (order_id, status, actor_role, actor_name, notes, created_at)
SELECT o.id, o.status, 'system', 'Sanjay Kirana Store', 'Initial order status', o.created_at
FROM orders o
WHERE NOT EXISTS (
    SELECT 1 FROM order_status_history osh WHERE osh.order_id = o.id
);

-- 3. Owner Website Notifications Table (Persistent notifications for new orders)
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

-- 4. WhatsApp Outbox Table (Persistent queue & delivery logging for WhatsApp alerts)
CREATE TABLE IF NOT EXISTS whatsapp_outbox (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    recipient_phone VARCHAR(20) NOT NULL,
    message_text TEXT NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_status ON whatsapp_outbox(status);
CREATE INDEX IF NOT EXISTS idx_whatsapp_outbox_order_id ON whatsapp_outbox(order_id);


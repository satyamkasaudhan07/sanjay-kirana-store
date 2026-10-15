-- Migration 003: Add delivery coordinates and calculated distance to orders table
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS delivery_latitude NUMERIC(9, 6),
ADD COLUMN IF NOT EXISTS delivery_longitude NUMERIC(9, 6),
ADD COLUMN IF NOT EXISTS delivery_distance_meters NUMERIC(10, 2);


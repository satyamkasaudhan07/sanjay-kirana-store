-- ============================================================================
-- Sanjay Kirana Store: Cleanup Legacy Demo Orders Script
-- ============================================================================
-- NOTE: This script is prepared as a safe migration procedure.
-- It must NOT be executed on production without explicit user approval.
--
-- Target records:
-- Legacy demo orders created during initial development in August 2026
-- (Order IDs 2 through 12, where user_id IS NULL and created_at < '2026-09-01').
-- Also optionally cleans up legacy unassigned test orders 13 and 14 if approved.
--
-- All genuine customer orders (IDs 15+, tied to authenticated users) are preserved.
-- ============================================================================

BEGIN;

-- 1. Display summary of target records before deletion
DO $$
DECLARE
    target_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO target_count
    FROM orders
    WHERE id IN (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

    RAISE NOTICE 'Found % legacy demo orders to purge.', target_count;
END $$;

-- 2. Delete child records in order_items for legacy demo orders
DELETE FROM order_items
WHERE order_id IN (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

-- 3. Delete parent records in orders table
DELETE FROM orders
WHERE id IN (2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12);

-- 4. Check if rows 13 and 14 should also be purged (legacy unassigned test orders)
-- Uncomment the following if user requests purging test rows 13 and 14:
-- DELETE FROM order_items WHERE order_id IN (13, 14);
-- DELETE FROM orders WHERE id IN (13, 14);

COMMIT;


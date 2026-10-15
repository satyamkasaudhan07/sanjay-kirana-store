"""
Comprehensive Test Suite for Order Tracking, Order Notifications & WhatsApp Outbox
Sanjay Kirana Store Backend

Scenarios Covered:
 1. Idempotent order creation (same idempotency_key returns identical order without creating duplicate in DB).
 2. Non-idempotent/consecutive order placement creates distinct orders.
 3. Order creation generates unique tracking_token and records initial 'Order Placed' status in order_status_history.
 4. Order creation records in-site notification in owner_notifications.
 5. Order creation records outbox entry in whatsapp_outbox without failing checkout.
 6. Order tracking endpoint returns accurate timeline stages and status history.
 7. Tracking endpoint enforces customer ownership (Customer A cannot view Customer B's order without tracking token).
 8. Public tracking link with ?token= allows tracking with masked customer PII.
 9. Status transition validation: staff can advance order through valid stages.
10. Status transition validation: invalid transition rejected (e.g. Order Placed directly to Delivered).
11. Cancellation restores product inventory (products.stock increases by ordered quantity).
12. Terminal status enforcement (cannot transition from Delivered or Cancelled).
13. Owner notification endpoints: GET list, PATCH read, POST mark-all-read.
"""

import os
import sys
import unittest
import secrets

os.environ["FLASK_ENV"] = "development"
os.environ["DEBUG"] = "true"
os.environ["SMS_PROVIDER"] = "mock"
os.environ["WHATSAPP_ENABLED"] = "false"

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app, get_db_connection
from auth_utils import generate_access_token


class OrderTrackingNotificationsTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.conn = get_db_connection()
        cls.cur = cls.conn.cursor()

        # Create test users
        cls.phone_a = "9870000001"
        cls.phone_b = "9870000002"
        cls.admin_phone = "9554384886"
        cls.owner_phone = "9919193538"

        # Clean prior test records
        cls._clean_test_data()

        cls.cur.execute("INSERT INTO users (phone, name, is_phone_verified) VALUES (%s, %s, TRUE) RETURNING id;", (cls.phone_a, "Customer Alice"))
        cls.user_a_id = cls.cur.fetchone()[0]

        cls.cur.execute("INSERT INTO users (phone, name, is_phone_verified) VALUES (%s, %s, TRUE) RETURNING id;", (cls.phone_b, "Customer Bob"))
        cls.user_b_id = cls.cur.fetchone()[0]
        cls.conn.commit()

        # Auth tokens
        cls.token_a = generate_access_token(user_id=cls.user_a_id, role="customer", phone=cls.phone_a)
        cls.token_b = generate_access_token(user_id=cls.user_b_id, role="customer", phone=cls.phone_b)
        cls.token_admin = generate_access_token(user_id=999, role="admin", phone=cls.admin_phone)
        cls.token_owner = generate_access_token(user_id=1, role="owner", phone=cls.owner_phone)

        cls.headers_a = {"Authorization": f"Bearer {cls.token_a}"}
        cls.headers_b = {"Authorization": f"Bearer {cls.token_b}"}
        cls.headers_admin = {"Authorization": f"Bearer {cls.token_admin}"}
        cls.headers_owner = {"Authorization": f"Bearer {cls.token_owner}"}

        # Find or create a test product with known stock
        cls.cur.execute("SELECT id, stock FROM products LIMIT 1;")
        prod = cls.cur.fetchone()
        cls.product_id = prod[0]
        cls.initial_stock = prod[1]
        cls.cur.execute("UPDATE products SET stock = stock + 500 WHERE id = %s;", (cls.product_id,))
        cls.conn.commit()

        # Valid delivery coordinate (Harraiya Main Chowk - within 2 km)
        cls.test_lat = 26.794500
        cls.test_lon = 82.463000

    @classmethod
    def _clean_test_data(cls):
        phones = (cls.phone_a, cls.phone_b)
        cls.cur.execute("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE customer_phone IN (%s, %s));", phones)
        cls.cur.execute("DELETE FROM order_status_history WHERE order_id IN (SELECT id FROM orders WHERE customer_phone IN (%s, %s));", phones)
        cls.cur.execute("DELETE FROM owner_notifications WHERE order_id IN (SELECT id FROM orders WHERE customer_phone IN (%s, %s));", phones)
        cls.cur.execute("DELETE FROM whatsapp_outbox WHERE order_id IN (SELECT id FROM orders WHERE customer_phone IN (%s, %s));", phones)
        cls.cur.execute("DELETE FROM orders WHERE customer_phone IN (%s, %s);", phones)
        cls.cur.execute("DELETE FROM users WHERE phone IN (%s, %s);", phones)
        cls.conn.commit()

    @classmethod
    def tearDownClass(cls):
        # Reset product stock
        cls.cur.execute("UPDATE products SET stock = %s WHERE id = %s;", (cls.initial_stock, cls.product_id))
        cls._clean_test_data()
        cls.cur.close()
        cls.conn.close()

    def test_01_idempotent_order_creation(self):
        """Scenario 1: Same idempotency_key returns identical order without creating duplicate in DB."""
        idempotency_key = f"idem_test_{secrets.token_hex(8)}"

        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Near Harraiya Chowk",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "idempotency_key": idempotency_key,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }

        # First request
        res1 = self.client.post("/orders", json=payload, headers=self.headers_a)
        self.assertEqual(res1.status_code, 201)
        data1 = res1.get_json()
        order_id_1 = data1["order"]["orderId"]

        # Duplicate request with same idempotency_key
        res2 = self.client.post("/orders", json=payload, headers=self.headers_a)
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        order_id_2 = data2["order"]["orderId"]

        self.assertEqual(order_id_1, order_id_2, "Idempotent request must return the exact same order ID")
        self.assertTrue(data2.get("is_idempotent_replay", False))

        # Check DB has only 1 order with this idempotency key
        self.cur.execute("SELECT COUNT(*) FROM orders WHERE idempotency_key = %s;", (idempotency_key,))
        count = self.cur.fetchone()[0]
        self.assertEqual(count, 1, "Database must not duplicate the order row")

    def test_02_consecutive_orders_distinct(self):
        """Scenario 2: Distinct orders placed create distinct database records."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Purani Bazar, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }

        res1 = self.client.post("/orders", json=payload, headers=self.headers_a)
        res2 = self.client.post("/orders", json=payload, headers=self.headers_a)

        self.assertEqual(res1.status_code, 201)
        self.assertEqual(res2.status_code, 201)

        oid1 = res1.get_json()["order"]["orderId"]
        oid2 = res2.get_json()["order"]["orderId"]
        self.assertNotEqual(oid1, oid2, "Two distinct orders must have different IDs")

    def test_03_order_creation_tracking_token_and_status_history(self):
        """Scenario 3: Unique tracking_token generated and 'Order Placed' recorded in order_status_history."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Tehsil Road, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        res = self.client.post("/orders", json=payload, headers=self.headers_a)
        self.assertEqual(res.status_code, 201)
        order = res.get_json()["order"]

        tracking_token = order.get("trackingToken") or order.get("tracking_token")
        self.assertTrue(tracking_token, "Order response must include trackingToken")
        self.assertTrue(len(tracking_token) >= 20, "tracking_token must be a high-entropy string")

        internal_id = order["id"]
        self.cur.execute("""
            SELECT status, actor_role, notes 
            FROM order_status_history 
            WHERE order_id = %s;
        """, (internal_id,))
        history = self.cur.fetchall()
        self.assertGreaterEqual(len(history), 1)
        self.assertEqual(history[0][0], "Order Placed")
        self.assertEqual(history[0][1], "customer")

    def test_04_owner_in_site_notification_created(self):
        """Scenario 4: Order creation records an in-site notification in owner_notifications."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Police Station Road",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "upi",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        res = self.client.post("/orders", json=payload, headers=self.headers_a)
        self.assertEqual(res.status_code, 201)
        order_number = res.get_json()["order"]["orderId"]

        self.cur.execute("""
            SELECT title, message, is_read 
            FROM owner_notifications 
            WHERE order_number = %s;
        """, (order_number,))
        notif = self.cur.fetchone()
        self.assertIsNotNone(notif, "Notification must be persisted in owner_notifications")
        self.assertIn(order_number, notif[0])
        self.assertFalse(notif[2], "Notification must initially be unread")

    def test_05_whatsapp_outbox_entry_created_non_blocking(self):
        """Scenario 5: Order creation persists outbox entry in whatsapp_outbox without checkout failure."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "CHC Road, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        res = self.client.post("/orders", json=payload, headers=self.headers_a)
        self.assertEqual(res.status_code, 201)
        internal_id = res.get_json()["order"]["id"]

        self.cur.execute("""
            SELECT recipient_phone, message_text, status 
            FROM whatsapp_outbox 
            WHERE order_id = %s;
        """, (internal_id,))
        row = self.cur.fetchone()
        self.assertIsNotNone(row, "WhatsApp outbox row must exist")
        self.assertIn("9919193538", row[0])
        self.assertIn("Sanjay Kirana Store", row[1])

    def test_06_order_tracking_endpoint_timeline(self):
        """Scenario 6: Order tracking endpoint returns accurate timeline stages and status history."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Block Road, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        order_data = create_res.get_json()["order"]
        order_id = order_data["orderId"]

        # Track order as authenticated customer
        track_res = self.client.get(f"/orders/{order_id}/tracking", headers=self.headers_a)
        self.assertEqual(track_res.status_code, 200)
        track_data = track_res.get_json()["order"]

        self.assertEqual(track_data["status"], "Order Placed")
        timeline = track_data["timeline"]
        self.assertEqual(len(timeline), 6, "Timeline must contain all 6 stages")
        self.assertTrue(timeline[0]["completed"], "First stage (Order Placed) must be completed")
        self.assertTrue(timeline[0]["current"], "First stage must be current")
        self.assertFalse(timeline[1]["completed"], "Second stage must not be completed yet")

    def test_07_tracking_ownership_enforcement(self):
        """Scenario 7: Customer B cannot view Customer A's order without tracking token."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "NH-27 Bypass",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        order_id = create_res.get_json()["order"]["orderId"]

        # Customer B tries to track Customer A's order without token
        unauth_res = self.client.get(f"/orders/{order_id}/tracking", headers=self.headers_b)
        self.assertEqual(unauth_res.status_code, 403, "Customer B must be denied access to Customer A's order")

    def test_08_public_tracking_link_with_masked_pii(self):
        """Scenario 8: Public tracking link with ?token= allows tracking with masked customer PII."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Babhnan Road, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        order_data = create_res.get_json()["order"]
        order_id = order_data["orderId"]
        token = order_data["trackingToken"]

        # Track with token and NO authorization header
        pub_res = self.client.get(f"/orders/{order_id}/tracking?token={token}")
        self.assertEqual(pub_res.status_code, 200)
        pub_order = pub_res.get_json()["order"]

        self.assertTrue(pub_order["isPublicView"])
        self.assertIn("*", pub_order["customerPhone"], "Phone must be masked for public token visitors")
        self.assertNotEqual(pub_order["customerPhone"], self.phone_a, "Original phone must not be exposed")

    def test_09_valid_status_transitions_by_staff(self):
        """Scenario 9: Staff can advance order sequentially: Order Placed -> Order Confirmed -> Order Packed -> Order Dispatched -> Out for Delivery -> Delivered."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Purani Bazar, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        order_id = create_res.get_json()["order"]["orderId"]

        transitions = [
            "Order Confirmed",
            "Order Packed",
            "Order Dispatched",
            "Out for Delivery",
            "Delivered",
        ]

        for next_st in transitions:
            res = self.client.patch(
                f"/orders/{order_id}/status",
                json={"status": next_st, "notes": f"Staff advanced to {next_st}"},
                headers=self.headers_admin,
            )
            self.assertEqual(res.status_code, 200, f"Transition to {next_st} must succeed")
            self.assertEqual(res.get_json()["status"], next_st)

        # Check tracking endpoint reflects final status
        track_res = self.client.get(f"/orders/{order_id}/tracking", headers=self.headers_a)
        self.assertEqual(track_res.get_json()["order"]["status"], "Delivered")
        timeline = track_res.get_json()["order"]["timeline"]
        for stage in timeline:
            self.assertTrue(stage["completed"], f"Stage {stage['status']} must be marked completed")

    def test_10_invalid_status_transition_rejected(self):
        """Scenario 10: Invalid status transitions (e.g. Order Placed -> Delivered directly) return HTTP 400."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Tehsil Complex",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        order_id = create_res.get_json()["order"]["orderId"]

        # Attempt to jump straight to Delivered
        res = self.client.patch(
            f"/orders/{order_id}/status",
            json={"status": "Delivered"},
            headers=self.headers_admin,
        )
        self.assertEqual(res.status_code, 400, "Skipping sequential stages must be rejected")
        self.assertIn("Invalid status transition", res.get_json()["error"])

    def test_11_cancellation_restores_product_stock(self):
        """Scenario 11: Cancelling an order restores product inventory in PostgreSQL."""
        # Get current stock
        self.cur.execute("SELECT stock FROM products WHERE id = %s;", (self.product_id,))
        stock_before_order = self.cur.fetchone()[0]

        # Place order for 2 units
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Purani Bazar, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 2}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        self.assertEqual(create_res.status_code, 201)
        order_id = create_res.get_json()["order"]["orderId"]

        # Verify stock decreased by 2
        self.cur.execute("SELECT stock FROM products WHERE id = %s;", (self.product_id,))
        stock_after_order = self.cur.fetchone()[0]
        self.assertEqual(stock_after_order, stock_before_order - 2)

        # Cancel order
        cancel_res = self.client.post(
            f"/orders/{order_id}/cancel",
            json={"notes": "Customer cancelled via app"},
            headers=self.headers_a,
        )
        self.assertEqual(cancel_res.status_code, 200)

        # Verify stock restored back to stock_before_order
        self.cur.execute("SELECT stock FROM products WHERE id = %s;", (self.product_id,))
        stock_after_cancel = self.cur.fetchone()[0]
        self.assertEqual(stock_after_cancel, stock_before_order, "Product stock must be restored on cancellation")

    def test_12_terminal_status_enforcement(self):
        """Scenario 12: Terminal states (Delivered or Cancelled) cannot transition to any other status."""
        payload = {
            "customer_name": "Customer Alice",
            "customer_phone": self.phone_a,
            "delivery_address": "Purani Bazar, Harraiya",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": self.test_lat,
            "longitude": self.test_lon,
            "items": [{"product_id": self.product_id, "quantity": 1}],
        }
        create_res = self.client.post("/orders", json=payload, headers=self.headers_a)
        order_id = create_res.get_json()["order"]["orderId"]

        # Cancel the order
        self.client.patch(
            f"/orders/{order_id}/status",
            json={"status": "Cancelled"},
            headers=self.headers_admin,
        )

        # Attempt to transition from Cancelled to Order Confirmed
        res = self.client.patch(
            f"/orders/{order_id}/status",
            json={"status": "Order Confirmed"},
            headers=self.headers_admin,
        )
        self.assertEqual(res.status_code, 400, "Cannot transition out of terminal state Cancelled")

    def test_13_owner_notification_endpoints(self):
        """Scenario 13: Owner notification endpoints: GET list, PATCH read, POST mark-all-read."""
        # GET notifications
        res_list = self.client.get("/owner/notifications", headers=self.headers_owner)
        self.assertEqual(res_list.status_code, 200)
        notifs = res_list.get_json()["notifications"]
        self.assertIsInstance(notifs, list)

        if notifs:
            first_id = notifs[0]["id"]

            # PATCH mark single read
            patch_res = self.client.patch(f"/owner/notifications/{first_id}/read", headers=self.headers_owner)
            self.assertEqual(patch_res.status_code, 200)
            self.assertTrue(patch_res.get_json()["success"])

        # POST mark all read
        all_res = self.client.post("/owner/notifications/mark-all-read", headers=self.headers_owner)
        self.assertEqual(all_res.status_code, 200)
        self.assertTrue(all_res.get_json()["success"])

        # Verify unread count is now 0
        verify_res = self.client.get("/owner/notifications", headers=self.headers_owner)
        self.assertEqual(verify_res.get_json()["unread_count"], 0)


if __name__ == "__main__":
    unittest.main()

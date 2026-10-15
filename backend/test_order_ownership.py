import json
import os
import unittest
from dotenv import load_dotenv

load_dotenv()

from app import app, get_db_connection
from auth_utils import generate_access_token

class TestOrderOwnershipAndIsolation(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()

        # Connect to DB to fetch or seed test users
        conn = get_db_connection()
        cur = conn.cursor()

        # Customer A: phone 9811111111
        cur.execute("""
            INSERT INTO users (phone, name, is_profile_completed)
            VALUES ('9811111111', 'Customer Alpha', TRUE)
            ON CONFLICT (phone) DO UPDATE SET name = 'Customer Alpha', is_profile_completed = TRUE
            RETURNING id;
        """)
        cls.cust_a_id = cur.fetchone()[0]

        # Customer B: phone 9822222222 (no orders yet)
        cur.execute("""
            INSERT INTO users (phone, name, is_profile_completed)
            VALUES ('9822222222', 'Customer Beta Empty', TRUE)
            ON CONFLICT (phone) DO UPDATE SET name = 'Customer Beta Empty', is_profile_completed = TRUE
            RETURNING id;
        """)
        cls.cust_b_id = cur.fetchone()[0]

        # Remove any stray orders for Customer B to guarantee 0 orders
        cur.execute("DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE user_id = %s);", (cls.cust_b_id,))
        cur.execute("DELETE FROM orders WHERE user_id = %s;", (cls.cust_b_id,))

        conn.commit()
        cur.close()
        conn.close()

        # Tokens
        cls.token_a = generate_access_token(cls.cust_a_id, "customer", phone="9811111111")
        cls.token_b = generate_access_token(cls.cust_b_id, "customer", phone="9822222222")

    def test_unauthenticated_get_orders_rejected(self):
        """Unauthenticated request to GET /orders must be rejected with 401."""
        res = self.client.get("/orders")
        self.assertEqual(res.status_code, 401)

    def test_customer_b_with_zero_orders_gets_empty_list(self):
        """Customer B with 0 orders must receive empty list [] with status 200, never demo orders."""
        res = self.client.get("/orders", headers={"Authorization": f"Bearer {self.token_b}"})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIsInstance(data, list)
        self.assertEqual(len(data), 0, "Customer with 0 orders must receive an empty list, not demo orders.")

    def test_customer_a_orders_isolated_from_customer_b(self):
        """Customer A can place an order, and Customer B cannot see it."""
        # 1. Place order as Customer A
        order_payload = {
            "customer_name": "Customer Alpha",
            "customer_phone": "+91 98111-11111",  # Test phone normalization
            "delivery_address": "Near Harraiya Chowk",
            "city": "Harraiya",
            "pincode": "272155",
            "payment_method": "cod",
            "latitude": 26.794500,
            "longitude": 82.463000,
            "items": [{"product_id": 1, "quantity": 1}]
        }
        res_create = self.client.post(
            "/orders",
            headers={"Authorization": f"Bearer {self.token_a}"},
            json=order_payload
        )
        self.assertEqual(res_create.status_code, 201)
        created_order = res_create.get_json().get("order")
        self.assertIsNotNone(created_order)
        order_id = created_order.get("orderId") or created_order.get("order_id")

        # 2. Customer A fetches orders -> sees their order
        res_a = self.client.get("/orders", headers={"Authorization": f"Bearer {self.token_a}"})
        self.assertEqual(res_a.status_code, 200)
        orders_a = res_a.get_json()
        a_order_ids = [o.get("orderId") or o.get("order_id") for o in orders_a]
        self.assertIn(order_id, a_order_ids)

        # 3. Customer B fetches orders -> MUST NOT see Customer A's order
        res_b = self.client.get("/orders", headers={"Authorization": f"Bearer {self.token_b}"})
        self.assertEqual(res_b.status_code, 200)
        orders_b = res_b.get_json()
        b_order_ids = [o.get("orderId") or o.get("order_id") for o in orders_b]
        self.assertNotIn(order_id, b_order_ids, "Customer B must never see Customer A's order!")
        self.assertEqual(len(orders_b), 0)

    def test_admin_role_cannot_call_customer_orders_endpoint(self):
        """Admin JWT attempting to call /orders receives 403."""
        admin_token = generate_access_token(1, "admin", username="admin")
        res = self.client.get("/orders", headers={"Authorization": f"Bearer {admin_token}"})
        self.assertEqual(res.status_code, 403)

if __name__ == "__main__":
    unittest.main()

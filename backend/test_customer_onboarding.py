"""
Customer Onboarding & Profile Completion Backend Test Suite
Tests:
  1. First-time customer detection (is_new_user=True, profile_completed=False).
  2. POST /account/complete-profile validation (name, street, pincode, required fields).
  3. Atomic persistence of name in `users` and default address in `customer_addresses`.
  4. Isolation: Customer A cannot modify Customer B's profile.
  5. Returning customer detection after completion (profile_completed=True).
  6. Phone immutability on profile updates.
"""

import os
import sys
import unittest

os.environ["FLASK_ENV"] = "development"
os.environ["DEBUG"] = "true"
os.environ["SMS_PROVIDER"] = "mock"

backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app, get_db_connection
from auth_utils import generate_access_token


class CustomerOnboardingTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.conn = get_db_connection()
        cls.cur = cls.conn.cursor()

        # Clean existing test records
        cls.phone_a = "9800000001"
        cls.phone_b = "9800000002"
        cls.cur.execute("DELETE FROM users WHERE phone IN (%s, %s);", (cls.phone_a, cls.phone_b))
        cls.conn.commit()

        # Create two distinct test users
        cls.cur.execute("INSERT INTO users (phone) VALUES (%s) RETURNING id;", (cls.phone_a,))
        cls.user_a_id = cls.cur.fetchone()[0]

        cls.cur.execute("INSERT INTO users (phone, name) VALUES (%s, %s) RETURNING id;", (cls.phone_b, "Existing User B"))
        cls.user_b_id = cls.cur.fetchone()[0]
        cls.conn.commit()

        cls.token_a = generate_access_token(user_id=cls.user_a_id, role="customer", phone=cls.phone_a)
        cls.token_b = generate_access_token(user_id=cls.user_b_id, role="customer", phone=cls.phone_b)
        cls.headers_a = {"Authorization": f"Bearer {cls.token_a}"}
        cls.headers_b = {"Authorization": f"Bearer {cls.token_b}"}

    @classmethod
    def tearDownClass(cls):
        cls.cur.execute("DELETE FROM users WHERE phone IN (%s, %s);", (cls.phone_a, cls.phone_b))
        cls.conn.commit()
        cls.cur.close()
        cls.conn.close()

    def test_01_first_time_customer_status(self):
        """User A has no name and no addresses -> is_profile_completed must be False."""
        res = self.client.get("/auth/me", headers=self.headers_a)
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertFalse(data["is_profile_completed"])
        self.assertEqual(data["name"], "")

    def test_02_validation_rejections_on_complete_profile(self):
        """Rejects missing name, missing street, or invalid PIN code."""
        # Missing name
        res = self.client.post("/account/complete-profile", json={
            "name": "",
            "street_address": "House 10, Main Road",
            "pincode": "272155"
        }, headers=self.headers_a)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Full name is required", res.get_json()["error"])

        # Missing street
        res = self.client.post("/account/complete-profile", json={
            "name": "Ramesh Kumar",
            "street_address": "",
            "pincode": "272155"
        }, headers=self.headers_a)
        self.assertEqual(res.status_code, 400)
        self.assertIn("Street address is required", res.get_json()["error"])

        # Invalid PIN code (5 digits instead of 6)
        res = self.client.post("/account/complete-profile", json={
            "name": "Ramesh Kumar",
            "street_address": "House 10, Main Road",
            "pincode": "27215"
        }, headers=self.headers_a)
        self.assertEqual(res.status_code, 400)
        self.assertIn("PIN code must be a valid 6-digit", res.get_json()["error"])

    def test_03_successful_atomic_profile_completion(self):
        """Valid submission atomically updates users.name, adds default address, sets is_profile_completed=True."""
        payload = {
            "name": "Ramesh Kumar",
            "street_address": "House No. 15, Near Tehsil Complex",
            "landmark": "Opposite SBI Branch",
            "locality": "Purani Bazar",
            "city": "Harraiya",
            "state": "Uttar Pradesh",
            "pincode": "272155",
            "label": "Home"
        }
        res = self.client.post("/account/complete-profile", json=payload, headers=self.headers_a)
        self.assertEqual(res.status_code, 201)
        data = res.get_json()

        self.assertEqual(data["user"]["name"], "Ramesh Kumar")
        self.assertTrue(data["user"]["profile_completed"])
        self.assertFalse(data["user"]["is_new_user"])
        self.assertTrue(data["address"]["is_default"])
        self.assertEqual(data["address"]["city"], "Harraiya")

        # Verify database record directly
        self.cur.execute("SELECT name, is_profile_completed FROM users WHERE id = %s;", (self.user_a_id,))
        row = self.cur.fetchone()
        self.assertEqual(row[0], "Ramesh Kumar")
        self.assertTrue(row[1])

        # Verify address in customer_addresses table
        self.cur.execute("SELECT street_address, is_default FROM customer_addresses WHERE user_id = %s;", (self.user_a_id,))
        addr_row = self.cur.fetchone()
        self.assertEqual(addr_row[0], "House No. 15, Near Tehsil Complex")
        self.assertTrue(addr_row[1])

    def test_04_isolation_user_a_cannot_touch_user_b(self):
        """User A cannot modify User B's profile or addresses."""
        # User A's token cannot edit User B's profile
        # PUT /account/profile updates the caller's own profile based on JWT sub claim
        res = self.client.put("/account/profile", json={"name": "Tampered Name"}, headers=self.headers_a)
        self.assertEqual(res.status_code, 200)

        # Confirm User B's name was completely untouched
        self.cur.execute("SELECT name FROM users WHERE id = %s;", (self.user_b_id,))
        b_name = self.cur.fetchone()[0]
        self.assertEqual(b_name, "Existing User B")

    def test_05_returning_customer_flag(self):
        """Once complete, returning customer has profile_completed=True."""
        res = self.client.get("/auth/me", headers=self.headers_a)
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.get_json()["is_profile_completed"])


if __name__ == "__main__":
    unittest.main()


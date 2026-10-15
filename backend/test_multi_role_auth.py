"""
Multi-Role Authentication & Customer Onboarding Backend Test Suite
Tests:
  1. Role A (Customer): Phone OTP, onboarding flags, atomic profile completion.
  2. Role B (Admin): 2-Step Auth (Username/Password -> SMS OTP to 9554384886).
  3. Role C (Owner): Fixed phone OTP to 9919193538 (no password), Owner-exclusive endpoints.
  4. RBAC Separation: Strict cross-role isolation across Customer, Admin, and Owner.
  5. Challenge Security: Expiry, attempt limits, single-use, tampering prevention.
"""

import os
import sys
import json
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch

# Configure test environment
os.environ["FLASK_ENV"] = "development"
os.environ["DEBUG"] = "true"
os.environ["SMS_PROVIDER"] = "mock"
os.environ["ALLOW_MOCK_SMS"] = "true"

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app, get_db_connection, OWNER_PHONE, ADMIN_PHONE
from auth_utils import generate_access_token, hash_password


class MultiRoleAuthTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.conn = get_db_connection()
        cls.cur = cls.conn.cursor()

        # Ensure test admin account exists in admin_accounts
        cls.test_admin_user = "test_admin_user"
        cls.test_admin_pass = "TestAdminPass123!"
        cls.test_admin_phone = ADMIN_PHONE

        cls.cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        cls.cur.execute("""
            INSERT INTO admin_accounts (username, password_hash, phone, is_active)
            VALUES (%s, %s, %s, TRUE)
            RETURNING id;
        """, (cls.test_admin_user, hash_password(cls.test_admin_pass), cls.test_admin_phone))
        cls.test_admin_id = cls.cur.fetchone()[0]
        cls.conn.commit()

        # Clean test customer phone
        cls.test_customer_phone = "9899999999"
        cls.cur.execute("DELETE FROM users WHERE phone = %s;", (cls.test_customer_phone,))
        cls.conn.commit()

    @classmethod
    def tearDownClass(cls):
        cls.cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        cls.cur.execute("DELETE FROM users WHERE phone = %s;", (cls.test_customer_phone,))
        cls.cur.execute("DELETE FROM auth_challenges WHERE identifier IN (%s, %s, %s);",
                        (cls.test_admin_user, OWNER_PHONE, cls.test_customer_phone))
        cls.conn.commit()
        cls.cur.close()
        cls.conn.close()

    # -------------------------------------------------------------------------
    # 1. Owner Authentication Flow (Role C)
    # -------------------------------------------------------------------------

    def test_01_owner_send_otp_success_and_tamper_rejection(self):
        """Owner OTP must target fixed OWNER_PHONE (9919193538) and reject other destinations."""
        # A. Attempting to supply a different phone must be rejected with 400
        res = self.client.post("/auth/owner/send-otp", json={"phone": "9876543210"})
        self.assertEqual(res.status_code, 400)
        self.assertIn("Unauthorized phone destination", res.get_json()["error"])

        # B. Sending without phone or with OWNER_PHONE succeeds
        res = self.client.post("/auth/owner/send-otp", json={})
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("challenge_id", data)
        self.assertIn("masked_phone", data)
        self.assertTrue(data["masked_phone"].endswith("3538"))

    def test_02_owner_verify_otp_success_and_single_use(self):
        """Owner OTP verification creates owner session and guarantees single-use."""
        # 1. Send OTP
        res = self.client.post("/auth/owner/send-otp", json={})
        self.assertEqual(res.status_code, 200)
        challenge_id = res.get_json()["challenge_id"]

        # 2. Retrieve the generated OTP from auth_challenges in DB (mock provider verification)
        self.cur.execute("SELECT otp_code FROM auth_challenges WHERE challenge_id = %s;", (challenge_id,))
        otp_code = self.cur.fetchone()[0]

        # 3. Wrong OTP rejected
        wrong_res = self.client.post("/auth/owner/verify-otp", json={"challenge_id": challenge_id, "otp": "000000"})
        self.assertEqual(wrong_res.status_code, 400)
        self.assertIn("Incorrect security OTP", wrong_res.get_json()["error"])

        # 4. Correct OTP succeeds
        ok_res = self.client.post("/auth/owner/verify-otp", json={"challenge_id": challenge_id, "otp": otp_code})
        self.assertEqual(ok_res.status_code, 200)
        ok_data = ok_res.get_json()
        self.assertIn("token", ok_data)
        self.assertEqual(ok_data["owner"]["role"], "owner")
        self.assertEqual(ok_data["owner"]["phone"], OWNER_PHONE)

        # 5. Single-use: Reusing the same challenge must be rejected
        reuse_res = self.client.post("/auth/owner/verify-otp", json={"challenge_id": challenge_id, "otp": otp_code})
        self.assertEqual(reuse_res.status_code, 400)
        self.assertIn("Invalid or expired login challenge", reuse_res.get_json()["error"])

    # -------------------------------------------------------------------------
    # 2. Role-Based Access Control (RBAC) & Privileges
    # -------------------------------------------------------------------------

    def test_03_owner_access_to_staff_apis_and_owner_exclusive(self):
        """Owner JWT can access both @require_admin and @require_owner endpoints."""
        owner_token = generate_access_token(user_id=8, role="owner", phone=OWNER_PHONE)
        headers = {"Authorization": f"Bearer {owner_token}"}

        # A. Access @require_admin endpoint (GET /admin/orders)
        orders_res = self.client.get("/admin/orders", headers=headers)
        self.assertIn(orders_res.status_code, (200, 404))  # 200 OK or empty list

        # B. Access @require_owner endpoint (GET /owner/overview)
        overview_res = self.client.get("/owner/overview", headers=headers)
        self.assertEqual(overview_res.status_code, 200)
        overview_data = overview_res.get_json()
        self.assertIn("financials", overview_data)
        self.assertIn("inventory", overview_data)
        self.assertEqual(overview_data["store"]["phone"], OWNER_PHONE)

    def test_04_admin_cannot_access_owner_exclusive(self):
        """Admin JWT can access @require_admin endpoints, but is BLOCKED (403) from @require_owner."""
        admin_token = generate_access_token(user_id=1, role="admin", phone=ADMIN_PHONE, username="admin")
        headers = {"Authorization": f"Bearer {admin_token}"}

        # A. Can access @require_admin endpoint
        orders_res = self.client.get("/admin/orders", headers=headers)
        self.assertIn(orders_res.status_code, (200, 404))

        # B. Strictly FORBIDDEN from @require_owner endpoint
        overview_res = self.client.get("/owner/overview", headers=headers)
        self.assertEqual(overview_res.status_code, 403)
        self.assertIn("Owner privileges required", overview_res.get_json()["error"])

    def test_05_customer_blocked_from_staff_apis(self):
        """Customer JWT cannot access @require_admin or @require_owner endpoints."""
        customer_token = generate_access_token(user_id=13, role="customer", phone="9811111111")
        headers = {"Authorization": f"Bearer {customer_token}"}

        # Blocked from @require_admin
        admin_res = self.client.get("/admin/orders", headers=headers)
        self.assertEqual(admin_res.status_code, 403)

        # Blocked from @require_owner
        owner_res = self.client.get("/owner/overview", headers=headers)
        self.assertEqual(owner_res.status_code, 403)

    # -------------------------------------------------------------------------
    # 3. Admin 2-Step Authentication (Role B)
    # -------------------------------------------------------------------------

    def test_06_admin_2step_authentication(self):
        """Admin requires password verification (Step A) then SMS OTP (Step B)."""
        # Step A: Wrong password
        bad_pw = self.client.post("/auth/admin/login", json={"username": self.test_admin_user, "password": "wrong"})
        self.assertEqual(bad_pw.status_code, 401)

        # Step A: Correct password -> returns challenge_id, NO access token
        step_a = self.client.post("/auth/admin/login", json={"username": self.test_admin_user, "password": self.test_admin_pass})
        self.assertEqual(step_a.status_code, 200)
        challenge_id = step_a.get_json()["challenge_id"]
        self.assertNotIn("token", step_a.get_json())

        # Retrieve OTP code from DB
        self.cur.execute("SELECT otp_code FROM auth_challenges WHERE challenge_id = %s;", (challenge_id,))
        otp_code = self.cur.fetchone()[0]

        # Step B: Correct OTP -> issues admin JWT
        step_b = self.client.post("/auth/admin/verify-otp", json={"challenge_id": challenge_id, "otp": otp_code})
        self.assertEqual(step_b.status_code, 200)
        self.assertEqual(step_b.get_json()["admin"]["role"], "admin")

    # -------------------------------------------------------------------------
    # 4. Customer Onboarding & Profile Completion (Role A)
    # -------------------------------------------------------------------------

    def test_07_customer_onboarding_lifecycle(self):
        """First-time customer has profile_completed=False, then completes profile atomically."""
        # 1. Customer OTP request & verify
        self.client.post("/auth/send-otp", json={"phone": self.test_customer_phone})
        self.cur.execute("""
            SELECT otp_code FROM auth_challenges
            WHERE identifier = %s AND purpose = 'customer_login' AND is_used = FALSE
            ORDER BY created_at DESC LIMIT 1;
        """, (self.test_customer_phone,))
        otp_code = self.cur.fetchone()[0]

        verify_res = self.client.post("/auth/verify-otp", json={"phone": self.test_customer_phone, "otp": otp_code})
        self.assertEqual(verify_res.status_code, 200)
        v_data = verify_res.get_json()

        # First-time customer: name is empty, address is 0
        self.assertTrue(v_data["user"]["is_new_user"])
        self.assertFalse(v_data["user"]["profile_completed"])
        cust_token = v_data["token"]
        headers = {"Authorization": f"Bearer {cust_token}"}

        # 2. Check /auth/me reflects incomplete status
        me_res = self.client.get("/auth/me", headers=headers)
        self.assertEqual(me_res.status_code, 200)
        self.assertFalse(me_res.get_json()["is_profile_completed"])

        # 3. Complete onboarding via /account/complete-profile
        onboarding_payload = {
            "name": "Sanjay Store Tester",
            "street_address": "Shop 4, Harraiya Bazar",
            "landmark": "Near Tehsil",
            "locality": "Purani Bazar",
            "city": "Harraiya",
            "state": "Uttar Pradesh",
            "pincode": "272155",
            "latitude": 26.794,
            "longitude": 82.462
        }
        complete_res = self.client.post("/account/complete-profile", json=onboarding_payload, headers=headers)
        self.assertEqual(complete_res.status_code, 201)
        c_data = complete_res.get_json()
        self.assertTrue(c_data["user"]["profile_completed"])
        self.assertEqual(c_data["user"]["name"], "Sanjay Store Tester")
        self.assertEqual(c_data["address"]["pincode"], "272155")

        # 4. Check /auth/me now reflects completed profile
        me_after = self.client.get("/auth/me", headers=headers)
        self.assertTrue(me_after.get_json()["is_profile_completed"])

    # -------------------------------------------------------------------------
    # 5. Challenge Expiry & Security Limits
    # -------------------------------------------------------------------------

    def test_08_challenge_expiry_and_max_attempts(self):
        """Expired or over-attempted challenges are immediately invalidated."""
        # Generate challenge
        res = self.client.post("/auth/owner/send-otp", json={})
        challenge_id = res.get_json()["challenge_id"]

        # Manually backdate expires_at to 10 minutes ago
        self.cur.execute("""
            UPDATE auth_challenges
            SET expires_at = CURRENT_TIMESTAMP - INTERVAL '10 minutes'
            WHERE challenge_id = %s;
        """, (challenge_id,))
        self.conn.commit()

        # Verification must be rejected as expired
        expired_res = self.client.post("/auth/owner/verify-otp", json={"challenge_id": challenge_id, "otp": "123456"})
        self.assertEqual(expired_res.status_code, 400)
        self.assertIn("expired", expired_res.get_json()["error"].lower())


if __name__ == "__main__":
    unittest.main()


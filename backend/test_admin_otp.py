"""
Admin Authentication & OTP Flow Backend Test Suite
Tests:
  1. Admin Step 1 (Username + Password) credential verification.
  2. Admin Step 2 (Direct Phone OTP verification) & Single-Use Challenge.
  3. Incorrect OTP & Expired Challenge handling.
  4. Max OTP attempts enforcement.
  5. Resend OTP with strict 30-second cooldown enforcement.
  6. Resend OTP max attempts limit (max 3 resends per session).
  7. MSG91 Widget verification for Admin with valid token -> Admin JWT issued.
  8. MSG91 Widget verification rejection for unauthorized phone number (403).
  9. MSG91 Widget verification rejection for email identifier (403).
  10. Customer vs Admin vs Owner RBAC isolation.
  11. Production mock SMS guard.
"""

import os
import sys
import json
import unittest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock

# Configure test environment
os.environ["FLASK_ENV"] = "development"
os.environ["DEBUG"] = "true"
os.environ["SMS_PROVIDER"] = "mock"
os.environ["ALLOW_MOCK_SMS"] = "true"

# Ensure backend directory is in sys.path
backend_dir = os.path.dirname(os.path.abspath(__file__))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app import app, get_db_connection, ADMIN_PHONE, OWNER_PHONE, reset_rate_limit
from auth_utils import generate_access_token, hash_password
from sms import send_sms_otp


class AdminOtpTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.conn = get_db_connection()
        cls.cur = cls.conn.cursor()

        # Create or update dedicated test admin account
        cls.test_admin_user = "test_admin_otp_user"
        cls.test_admin_pass = "AdminSecurePass2026!"
        cls.test_admin_phone = ADMIN_PHONE  # 9554384886

        cls.cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        cls.cur.execute("""
            INSERT INTO admin_accounts (username, password_hash, phone, is_active)
            VALUES (%s, %s, %s, TRUE)
            RETURNING id;
        """, (cls.test_admin_user, hash_password(cls.test_admin_pass), cls.test_admin_phone))
        cls.test_admin_id = cls.cur.fetchone()[0]
        cls.conn.commit()

        cls.test_customer_phone = "9898989898"
        cls.test_customer_id = 9999

    @classmethod
    def tearDownClass(cls):
        cls.cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        cls.cur.execute("DELETE FROM auth_challenges WHERE identifier = %s;", (cls.test_admin_user,))
        cls.conn.commit()
        cls.cur.close()
        cls.conn.close()

    def setUp(self):
        # Reset rate limits before each test
        reset_rate_limit(f"admin_login:{self.test_admin_user}")

    # -------------------------------------------------------------------------
    # 1. Step 1: Credential Verification
    # -------------------------------------------------------------------------

    def test_01_step1_valid_credentials_creates_challenge(self):
        """Step 1 with correct credentials generates challenge and dispatches OTP to admin phone."""
        res = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertIn("challenge_id", data)
        self.assertIn("masked_phone", data)
        self.assertTrue(data["masked_phone"].endswith("4886"))

        # Verify challenge is recorded in database
        self.cur.execute("""
            SELECT otp_code, is_used, admin_id FROM auth_challenges
            WHERE challenge_id = %s AND purpose = 'admin_login';
        """, (data["challenge_id"],))
        record = self.cur.fetchone()
        self.assertIsNotNone(record)
        self.assertEqual(len(record[0]), 6)
        self.assertFalse(record[1])
        self.assertEqual(record[2], self.test_admin_id)

    def test_02_step1_invalid_credentials_rejected(self):
        """Step 1 with wrong password returns 401."""
        res = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": "WrongPassword123"
        })
        self.assertEqual(res.status_code, 401)
        self.assertIn("Invalid username or password", res.get_json()["error"])

    # -------------------------------------------------------------------------
    # 2. Step 2: Direct OTP Verification
    # -------------------------------------------------------------------------

    def test_03_step2_verify_otp_success_issues_admin_jwt(self):
        """Step 2 with valid OTP marks challenge used and issues full admin JWT."""
        # 1. Step 1
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        # Fetch the generated OTP from DB
        self.cur.execute("SELECT otp_code FROM auth_challenges WHERE challenge_id = %s;", (challenge_id,))
        otp_code = self.cur.fetchone()[0]

        # 2. Step 2
        res2 = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": otp_code
        })
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertIn("token", data2)
        self.assertEqual(data2["admin"]["role"], "admin")
        self.assertEqual(data2["admin"]["username"], self.test_admin_user)

        # 3. Single-use: Reusing the same challenge must fail
        res3 = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": otp_code
        })
        self.assertEqual(res3.status_code, 400)
        self.assertIn("Invalid or expired login challenge", res3.get_json()["error"])

    def test_04_step2_incorrect_otp_rejected(self):
        """Step 2 with incorrect OTP returns 400 and increments attempts."""
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        # Submit wrong OTP
        res2 = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": "000000"
        })
        self.assertEqual(res2.status_code, 400)
        self.assertIn("Incorrect security OTP", res2.get_json()["error"])

        # Confirm attempt count increased
        self.cur.execute("SELECT attempts FROM auth_challenges WHERE challenge_id = %s;", (challenge_id,))
        attempts = self.cur.fetchone()[0]
        self.assertEqual(attempts, 1)

    def test_05_step2_expired_challenge_rejected(self):
        """Expired challenge is rejected with 400 and marked used."""
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        # Backdate expiry to the past
        self.cur.execute("""
            UPDATE auth_challenges
            SET expires_at = CURRENT_TIMESTAMP - INTERVAL '1 minute'
            WHERE challenge_id = %s;
        """, (challenge_id,))
        self.conn.commit()

        res2 = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": "123456"
        })
        self.assertEqual(res2.status_code, 400)
        self.assertIn("Security OTP has expired", res2.get_json()["error"])

    def test_06_step2_max_attempts_invalidates_challenge(self):
        """After 5 failed attempts, the challenge is invalidated."""
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        # Set attempts to 5
        self.cur.execute("""
            UPDATE auth_challenges
            SET attempts = 5
            WHERE challenge_id = %s;
        """, (challenge_id,))
        self.conn.commit()

        res2 = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": "123456"
        })
        self.assertEqual(res2.status_code, 400)
        self.assertIn("Maximum OTP attempts exceeded", res2.get_json()["error"])

    # -------------------------------------------------------------------------
    # 3. Resend OTP & Cooldown
    # -------------------------------------------------------------------------

    def test_07_resend_otp_enforces_30s_cooldown(self):
        """Resend OTP succeeds on first attempt, but immediate second attempt within 30s returns 429."""
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        # Reset rate limits for this challenge specifically
        reset_rate_limit(f"admin_resend:{challenge_id}")
        reset_rate_limit(f"admin_resend_count:{challenge_id}")

        # First resend should succeed
        res2 = self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(data2["cooldown_seconds"], 30)
        self.assertIn("fresh security OTP", data2["message"])

        # Immediate second resend within 30s must return 429 Cooldown
        res3 = self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
        self.assertEqual(res3.status_code, 429)
        self.assertIn("30-second cooldown", res3.get_json()["error"])

    def test_08_resend_otp_generates_fresh_otp_and_resets_attempts(self):
        """Resend OTP updates the database record with a new OTP and resets attempts to 0."""
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        self.cur.execute("SELECT otp_code FROM auth_challenges WHERE challenge_id = %s;", (challenge_id,))
        initial_otp = self.cur.fetchone()[0]

        # Simulate 2 failed attempts
        self.cur.execute("UPDATE auth_challenges SET attempts = 2 WHERE challenge_id = %s;", (challenge_id,))
        self.conn.commit()

        reset_rate_limit(f"admin_resend:{challenge_id}")
        reset_rate_limit(f"admin_resend_count:{challenge_id}")

        # Perform resend
        res2 = self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
        self.assertEqual(res2.status_code, 200)

        # Inspect updated DB record
        self.cur.execute("SELECT otp_code, attempts FROM auth_challenges WHERE challenge_id = %s;", (challenge_id,))
        updated_row = self.cur.fetchone()
        new_otp = updated_row[0]
        attempts = updated_row[1]

        self.assertEqual(attempts, 0)
        self.assertEqual(len(new_otp), 6)

        # Verify that verifying with new OTP succeeds
        res3 = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": new_otp
        })
        self.assertEqual(res3.status_code, 200)
        self.assertIn("token", res3.get_json())

    def test_09_resend_otp_max_limit_enforced(self):
        """Exceeding 3 resends triggers 429 Maximum OTP resend limit reached."""
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        resend_count_key = f"admin_resend_count:{challenge_id}"
        # Pre-fill 3 resends in rate limiter
        for _ in range(3):
            self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
            # Clear 30s cooldown between calls so we can test the max count limit
            reset_rate_limit(f"admin_resend:{challenge_id}")

        # 4th resend must fail with max resends reached
        res_overflow = self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
        self.assertEqual(res_overflow.status_code, 429)
        self.assertIn("Maximum OTP resend limit reached", res_overflow.get_json()["error"])

    # -------------------------------------------------------------------------
    # 4. MSG91 Widget Verification for Admin
    # -------------------------------------------------------------------------

    @patch("requests.post")
    def test_10_admin_msg91_widget_verify_success(self, mock_post):
        """MSG91 widget verification with registered admin phone (9554384886) issues admin JWT."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {
            "type": "success",
            "message": "919554384886"  # Verified admin phone
        }
        mock_post.return_value = mock_response

        # Initiate Step 1
        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        # Call MSG91 token verification
        res2 = self.client.post("/auth/admin/msg91/verify", json={
            "challenge_id": challenge_id,
            "access_token": "valid_msg91_widget_token"
        })
        self.assertEqual(res2.status_code, 200)
        data = res2.get_json()
        self.assertIn("token", data)
        self.assertEqual(data["admin"]["role"], "admin")
        self.assertEqual(data["admin"]["username"], self.test_admin_user)

    @patch("requests.post")
    def test_11_admin_msg91_widget_verify_unauthorized_phone_rejected(self, mock_post):
        """MSG91 widget verification returning an unauthorized phone is rejected with 403 Forbidden."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {
            "type": "success",
            "message": "919876543210"  # Non-admin phone
        }
        mock_post.return_value = mock_response

        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        res2 = self.client.post("/auth/admin/msg91/verify", json={
            "challenge_id": challenge_id,
            "access_token": "token_for_wrong_phone"
        })
        self.assertEqual(res2.status_code, 403)
        self.assertIn("Unauthorized phone number", res2.get_json()["error"])

    @patch("requests.post")
    def test_12_admin_msg91_widget_verify_email_rejected(self, mock_post):
        """MSG91 widget verification returning an email identifier is rejected with 403 Forbidden."""
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.headers = {"content-type": "application/json"}
        mock_response.json.return_value = {
            "type": "success",
            "message": "admin@example.com"  # Email is not authorized
        }
        mock_post.return_value = mock_response

        res1 = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        challenge_id = res1.get_json()["challenge_id"]

        res2 = self.client.post("/auth/admin/msg91/verify", json={
            "challenge_id": challenge_id,
            "access_token": "token_for_email"
        })
        self.assertEqual(res2.status_code, 403)
        self.assertIn("Email verification is not authorized", res2.get_json()["error"])

    # -------------------------------------------------------------------------
    # 5. Role Isolation & Security Guards
    # -------------------------------------------------------------------------

    def test_13_role_isolation_customer_cannot_access_admin_endpoints(self):
        """Customer JWT cannot access admin endpoints (403 Forbidden)."""
        customer_jwt = generate_access_token(
            user_id=self.test_customer_id,
            role="customer",
            phone=self.test_customer_phone,
            username="Customer"
        )
        headers = {"Authorization": f"Bearer {customer_jwt}"}

        res = self.client.get("/admin/orders", headers=headers)
        self.assertEqual(res.status_code, 403)

    def test_14_admin_cannot_access_owner_exclusive_endpoints(self):
        """Admin JWT cannot access Owner-exclusive endpoints (403 Forbidden)."""
        admin_jwt = generate_access_token(
            user_id=self.test_admin_id,
            role="admin",
            phone=self.test_admin_phone,
            username=self.test_admin_user
        )
        headers = {"Authorization": f"Bearer {admin_jwt}"}

        res = self.client.get("/owner/overview", headers=headers)
        self.assertEqual(res.status_code, 403)
        self.assertIn("Owner privileges required", res.get_json()["error"])

    def test_15_production_mock_guard(self):
        """In production environment, mock SMS cannot be activated even if ALLOW_MOCK_SMS=true."""
        with patch.dict(os.environ, {
            "FLASK_ENV": "production",
            "SMS_PROVIDER": "mock",
            "ALLOW_MOCK_SMS": "true",
            "MSG91_AUTHKEY": ""
        }):
            res = send_sms_otp("9554384886", "123456")
            self.assertFalse(res["success"])
            self.assertIn("disabled in production", res["error"])


if __name__ == "__main__":
    unittest.main()

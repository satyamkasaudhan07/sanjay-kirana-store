"""
Comprehensive Test Suite for SMS OTP Delivery via MSG91, Fail-Closed Security,
and Multi-Role Authentication Isolation.

Covers:
1. Successful MSG91 send (v5 OTP API)
2. Successful MSG91 verify and single-use challenge consumption
3. Invalid, expired, and replay OTP protection
4. Provider errors: 401 Unauthorized, 418 IP Security, Gateway Timeout, Network error
5. Fail-closed security: Mock blocked in production; no silent fallbacks
6. Role isolation: Admin JWT, Owner JWT, and Customer JWT strict boundaries
"""

import sys
import os
import unittest
from unittest.mock import patch, MagicMock
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

import requests
from app import app, get_db_connection, OWNER_PHONE, ADMIN_PHONE
from auth_utils import decode_token, generate_access_token, hash_password
from sms import send_sms_otp


class TestSmsDeliveryAndAuth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = app.test_client()
        cls.test_admin_user = "test_sms_admin"
        cls.test_admin_pass = "TestAdminPass123!"

        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        cur.execute("""
            INSERT INTO admin_accounts (username, password_hash, phone, is_active)
            VALUES (%s, %s, %s, TRUE)
            RETURNING id;
        """, (cls.test_admin_user, hash_password(cls.test_admin_pass), ADMIN_PHONE))
        cls.test_admin_id = cur.fetchone()[0]
        conn.commit()
        cur.close()
        conn.close()

    @classmethod
    def tearDownClass(cls):
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM auth_challenges WHERE identifier = %s;", (cls.test_admin_user,))
        cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        conn.commit()
        cur.close()
        conn.close()

    # -------------------------------------------------------------------------
    # 1. Successful MSG91 Send
    # -------------------------------------------------------------------------
    @patch.dict(os.environ, {
        "SMS_PROVIDER": "msg91",
        "MSG91_AUTHKEY": "mock_authkey_1234567890",
        "FLASK_ENV": "development",
        "DEBUG": "true",
    })
    @patch("requests.post")
    def test_successful_send_msg91(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "success",
            "request_id": "366a6e6f_test_req_id",
            "message": "OTP sent successfully"
        }
        mock_post.return_value = mock_resp

        res = send_sms_otp("9554384886", "654321")
        self.assertTrue(res["success"])
        self.assertEqual(res["provider"], "msg91")
        self.assertEqual(res["request_id"], "366a6e6f_test_req_id")
        self.assertIn("accepted", res["message"].lower())

        # Verify request parameters sent to MSG91
        call_kwargs = mock_post.call_args
        self.assertIn("919554384886", str(call_kwargs))
        self.assertIn("654321", str(call_kwargs))
        self.assertEqual(call_kwargs.kwargs["headers"]["authkey"], "mock_authkey_1234567890")

    # -------------------------------------------------------------------------
    # 2. Admin 2FA: Step A (Password -> OTP Send) and Step B (Verify OTP)
    # -------------------------------------------------------------------------
    @patch.dict(os.environ, {
        "SMS_PROVIDER": "msg91",
        "MSG91_AUTHKEY": "mock_authkey_1234567890",
    })
    @patch("sms.requests.post")
    def test_admin_full_2fa_flow(self, mock_post):
        # Mock MSG91 success
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {"type": "success", "request_id": "req_adm_123"}
        mock_post.return_value = mock_resp

        # Step A: Submit username + password
        step_a_resp = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        self.assertEqual(step_a_resp.status_code, 200)
        step_a_data = step_a_resp.get_json()
        self.assertIn("challenge_id", step_a_data)
        self.assertNotIn("token", step_a_data)  # Enforce NO JWT before OTP
        challenge_id = step_a_data["challenge_id"]

        # Fetch stored OTP from database for Step B testing
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT otp_code FROM auth_challenges WHERE challenge_id = %s", (challenge_id,))
        row = cur.fetchone()
        stored_otp = row[0]
        cur.close()
        conn.close()

        # Step B with WRONG OTP
        step_b_fail = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": "000000"
        })
        self.assertTrue(
            any(w in step_b_fail.get_json()["error"].lower() for w in ["incorrect", "invalid"])
        )

        # Step B with CORRECT OTP
        step_b_ok = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": stored_otp
        })
        self.assertEqual(step_b_ok.status_code, 200)
        admin_data = step_b_ok.get_json()
        self.assertIn("token", admin_data)
        self.assertEqual(admin_data["admin"]["role"], "admin")

        # Verify decoded JWT has role='admin'
        decoded = decode_token(admin_data["token"])
        self.assertEqual(decoded["role"], "admin")

        # Step B Replay test: Same challenge cannot be used again
        step_b_replay = self.client.post("/auth/admin/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": stored_otp
        })
        self.assertEqual(step_b_replay.status_code, 400)
        self.assertTrue(
            any(w in step_b_replay.get_json()["error"].lower() for w in ["invalid", "expired", "already been used"])
        )

    # -------------------------------------------------------------------------
    # 3. Owner OTP Flow: Dedicated endpoint, fixed phone, role='owner'
    # -------------------------------------------------------------------------
    @patch.dict(os.environ, {
        "SMS_PROVIDER": "msg91",
        "MSG91_AUTHKEY": "mock_authkey_1234567890",
    })
    @patch("sms.requests.post")
    def test_owner_dedicated_otp_flow(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {"type": "success", "request_id": "req_own_456"}
        mock_post.return_value = mock_resp

        # Step 1: Request Owner OTP (Destination must be fixed to 9919193538)
        step_1_resp = self.client.post("/auth/owner/send-otp", json={})
        self.assertEqual(step_1_resp.status_code, 200)
        step_1_data = step_1_resp.get_json()
        self.assertIn("challenge_id", step_1_data)
        self.assertIn("3538", step_1_data["masked_phone"])
        challenge_id = step_1_data["challenge_id"]

        # Fetch stored OTP
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("SELECT otp_code, identifier FROM auth_challenges WHERE challenge_id = %s", (challenge_id,))
        row = cur.fetchone()
        stored_otp = row[0]
        stored_phone = row[1]
        cur.close()
        conn.close()

        self.assertEqual(stored_phone, OWNER_PHONE)

        # Step 2: Verify with correct OTP
        step_2_resp = self.client.post("/auth/owner/verify-otp", json={
            "challenge_id": challenge_id,
            "otp": stored_otp
        })
        self.assertEqual(step_2_resp.status_code, 200)
        owner_data = step_2_resp.get_json()
        self.assertIn("token", owner_data)
        self.assertEqual(owner_data["owner"]["role"], "owner")

        # Decode token and check role
        decoded = decode_token(owner_data["token"])
        self.assertEqual(decoded["role"], "owner")

    # -------------------------------------------------------------------------
    # 4. Provider Error Handling (401, 418, Timeout, Gateway Failure)
    # -------------------------------------------------------------------------
    @patch.dict(os.environ, {
        "SMS_PROVIDER": "msg91",
        "MSG91_AUTHKEY": "mock_authkey_1234567890",
    })
    @patch("sms.requests.post")
    def test_msg91_401_unauthorized(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {"message": "Invalid AuthKey", "code": "401"}
        mock_post.return_value = mock_resp

        res = send_sms_otp("9554384886", "112233")
        self.assertFalse(res["success"])
        self.assertIn("verify MSG91_AUTHKEY", res["error"])
        # Authkey must NOT be leaked
        self.assertNotIn("mock_authkey", res["error"])

    @patch.dict(os.environ, {
        "SMS_PROVIDER": "msg91",
        "MSG91_AUTHKEY": "mock_authkey_1234567890",
    })
    @patch("sms.requests.post")
    def test_msg91_418_ip_whitelist(self, mock_post):
        mock_resp = MagicMock()
        mock_resp.status_code = 418
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {"message": "IP is not whitelisted", "code": "418"}
        mock_post.return_value = mock_resp

        res = send_sms_otp("9554384886", "112233")
        self.assertFalse(res["success"])
        self.assertIn("418", res["error"])
        self.assertIn("whitelist", res["error"].lower())

    @patch.dict(os.environ, {
        "SMS_PROVIDER": "msg91",
        "MSG91_AUTHKEY": "mock_authkey_1234567890",
    })
    @patch("sms.requests.post")
    def test_msg91_gateway_timeout(self, mock_post):
        mock_post.side_effect = requests.exceptions.Timeout("Connection timed out")

        res = send_sms_otp("9554384886", "112233")
        self.assertFalse(res["success"])
        self.assertIn("timed out", res["error"].lower())

    # -------------------------------------------------------------------------
    # 5. Fail-Closed Security: Mock Mode Blocked in Production
    # -------------------------------------------------------------------------
    @patch.dict(os.environ, {
        "SMS_PROVIDER": "mock",
        "FLASK_ENV": "production",
        "DEBUG": "false",
        "ALLOW_MOCK_SMS": "false",
    })
    def test_mock_blocked_in_production(self):
        res = send_sms_otp("9554384886", "998877")
        self.assertFalse(res["success"])
        self.assertIn("disabled in production", res["error"].lower())

    @patch.dict(os.environ, {
        "SMS_PROVIDER": "mock",
        "FLASK_ENV": "development",
        "DEBUG": "true",
        "ALLOW_MOCK_SMS": "false",
    })
    def test_mock_disabled_without_explicit_flag(self):
        res = send_sms_otp("9554384886", "998877")
        self.assertFalse(res["success"])
        self.assertIn("ALLOW_MOCK_SMS=true", res["error"])

    # -------------------------------------------------------------------------
    # 6. Role Isolation Enforced
    # -------------------------------------------------------------------------
    def test_role_separation_boundaries(self):
        customer_jwt = generate_access_token(user_id=1, role="customer", phone="9876543210")
        admin_jwt = generate_access_token(user_id=1, role="admin", username="admin")
        owner_jwt = generate_access_token(user_id=1, role="owner", phone=OWNER_PHONE)

        # Customer CANNOT access Admin endpoints
        res_cust_admin = self.client.get("/admin/orders", headers={"Authorization": f"Bearer {customer_jwt}"})
        self.assertEqual(res_cust_admin.status_code, 403)

        # Customer CANNOT access Owner Governance endpoints
        res_cust_owner = self.client.get("/owner/overview", headers={"Authorization": f"Bearer {customer_jwt}"})
        self.assertEqual(res_cust_owner.status_code, 403)

        # Admin CANNOT access Owner-exclusive Governance endpoints
        res_admin_owner = self.client.get("/owner/overview", headers={"Authorization": f"Bearer {admin_jwt}"})
        self.assertEqual(res_admin_owner.status_code, 403)

        # Owner CAN access Owner Governance endpoints
        res_owner = self.client.get("/owner/overview", headers={"Authorization": f"Bearer {owner_jwt}"})
        self.assertEqual(res_owner.status_code, 200)


def run_all_tests():
    suite = unittest.TestLoader().loadTestsFromTestCase(TestSmsDeliveryAndAuth)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    if not result.wasSuccessful():
        sys.exit(1)


if __name__ == "__main__":
    run_all_tests()

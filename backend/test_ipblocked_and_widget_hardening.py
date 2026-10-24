"""
Unit and Integration Tests for MSG91 IPBlocked Handling, Throttling Defense,
and Authentication Security Hardening for Sanjay Kirana Store.
"""

import unittest
from unittest.mock import patch, MagicMock
import os
import sys
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import app, get_db_connection, ADMIN_PHONE
from auth_utils import decode_token, hash_password


class TestIPBlockedAndWidgetHardening(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.config["TESTING"] = True
        cls.client = app.test_client()
        cls.conn = get_db_connection()
        cls.cur = cls.conn.cursor()

        cls.test_admin_user = "test_hardening_admin"
        cls.test_admin_pass = "HardeningPass2026!"
        cls.test_admin_phone = ADMIN_PHONE

        cls.cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
        cls.cur.execute("""
            INSERT INTO admin_accounts (username, password_hash, phone, is_active)
            VALUES (%s, %s, %s, TRUE)
            RETURNING id;
        """, (cls.test_admin_user, hash_password(cls.test_admin_pass), cls.test_admin_phone))
        cls.test_admin_id = cls.cur.fetchone()[0]
        cls.conn.commit()

    @classmethod
    def tearDownClass(cls):
        try:
            cls.cur.execute("DELETE FROM admin_accounts WHERE username = %s;", (cls.test_admin_user,))
            cls.conn.commit()
            cls.cur.close()
            cls.conn.close()
        except Exception:
            pass

    def test_01_customer_verify_ipblocked_returns_429_no_jwt(self):
        """When MSG91 returns IPBlocked, backend must respond with 429 and NEVER issue a session."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "error",
            "message": "IPBlocked",
            "code": "IPBlocked"
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/msg91/verify", json={
                "access_token": "msg91_token_test_blocked"
            })
            self.assertEqual(res.status_code, 429)
            data = res.get_json()
            self.assertEqual(data.get("code"), "IPBlocked")
            self.assertIn("anti-flood firewall", data.get("error", ""))
            self.assertNotIn("token", data)
            self.assertNotIn("user", data)

    def test_02_customer_verify_code_418_returns_429_no_jwt(self):
        """Code 418 (whitelist / IP restriction) returns 429 IPBlocked."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "error",
            "message": "IP is not whitelisted",
            "code": "418"
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/msg91/verify", json={
                "access_token": "msg91_token_test_418"
            })
            self.assertEqual(res.status_code, 429)
            data = res.get_json()
            self.assertEqual(data.get("code"), "IPBlocked")
            self.assertNotIn("token", data)

    def test_03_customer_verify_throttle_limit_returns_429(self):
        """MSG91 Throttle Limit Triggered returns 429 Throttled."""
        mock_resp = MagicMock()
        mock_resp.status_code = 429
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "error",
            "message": "Throttle Limit Triggered for OTP Widget"
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/msg91/verify", json={
                "access_token": "msg91_token_test_throttle"
            })
            self.assertEqual(res.status_code, 429)
            data = res.get_json()
            self.assertEqual(data.get("code"), "Throttled")
            self.assertNotIn("token", data)

    def test_04_customer_verify_invalid_token_rejected_with_400(self):
        """MSG91 701 invalid access-token returns 400 and issues NO session."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "error",
            "message": "invalid access-token",
            "code": 701
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/msg91/verify", json={
                "access_token": "msg91_token_invalid_123"
            })
            self.assertEqual(res.status_code, 400)
            data = res.get_json()
            self.assertIn("invalid access-token", data.get("error", ""))
            self.assertNotIn("token", data)

    def test_05_admin_verify_ipblocked_returns_429_no_admin_jwt(self):
        """Admin step 2 returns 429 when provider IP is blocked, issuing NO admin JWT."""
        # Step 1: Valid admin credentials
        step1_res = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        self.assertEqual(step1_res.status_code, 200)
        challenge_id = step1_res.get_json().get("challenge_id")
        self.assertTrue(bool(challenge_id))

        # Step 2: Attempt token verify while provider returns IPBlocked
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "error",
            "message": "IPBlocked",
            "code": "IPBlocked"
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/admin/msg91/verify", json={
                "challenge_id": challenge_id,
                "access_token": "msg91_token_admin_ipblocked"
            })
            self.assertEqual(res.status_code, 429)
            data = res.get_json()
            self.assertEqual(data.get("code"), "IPBlocked")
            self.assertNotIn("token", data)
            self.assertNotIn("admin", data)

    def test_06_admin_verify_rejects_email_identifier(self):
        """Admin verification rejects email identifier even if successfully verified by MSG91."""
        step1_res = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        self.assertEqual(step1_res.status_code, 200)
        challenge_id = step1_res.get_json().get("challenge_id")

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "success",
            "message": "someadmin@gmail.com"
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/admin/msg91/verify", json={
                "challenge_id": challenge_id,
                "access_token": "msg91_token_email_for_admin"
            })
            self.assertEqual(res.status_code, 403)
            data = res.get_json()
            self.assertIn("Email verification is not authorized for admin", data.get("error", ""))
            self.assertNotIn("token", data)

    def test_07_admin_resend_cooldown_enforced(self):
        """Admin OTP resend enforces strict 30-second cooldown."""
        step1_res = self.client.post("/auth/admin/login", json={
            "username": self.test_admin_user,
            "password": self.test_admin_pass
        })
        self.assertEqual(step1_res.status_code, 200)
        challenge_id = step1_res.get_json().get("challenge_id")

        # First resend should succeed (mocked sms)
        with patch("app.send_sms_otp", return_value={"success": True}):
            res1 = self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
            self.assertEqual(res1.status_code, 200)

            # Immediate second resend must be rejected with 429 cooldown error
            res2 = self.client.post("/auth/admin/resend-otp", json={"challenge_id": challenge_id})
            self.assertEqual(res2.status_code, 429)
            self.assertIn("cooldown", res2.get_json().get("error", "").lower())

    def test_08_customer_session_cannot_access_admin_api(self):
        """Customer JWT cannot access admin APIs (RBAC separation)."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.headers = {"content-type": "application/json"}
        mock_resp.json.return_value = {
            "type": "success",
            "message": "917307399973"
        }

        with patch("requests.post", return_value=mock_resp):
            res = self.client.post("/auth/msg91/verify", json={
                "access_token": "valid_token_customer_rbac"
            })
            self.assertEqual(res.status_code, 200)
            token = res.get_json().get("token")
            self.assertTrue(bool(token))

            # Attempt accessing admin orders
            admin_res = self.client.get("/admin/orders", headers={
                "Authorization": f"Bearer {token}"
            })
            self.assertEqual(admin_res.status_code, 403)


if __name__ == "__main__":
    unittest.main()

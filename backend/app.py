import os
import re
import secrets
import time
from datetime import datetime, timezone, timedelta

import sys
from pathlib import Path
import psycopg
from dotenv import load_dotenv

_backend_dir = Path(__file__).resolve().parent
if str(_backend_dir) not in sys.path:
    sys.path.insert(0, str(_backend_dir))

_env_path = _backend_dir / ".env"
load_dotenv(dotenv_path=_env_path)

from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import threading

from sms import send_sms_otp, normalize_indian_phone
from whatsapp import (
    format_order_whatsapp_message,
    record_whatsapp_outbox,
    dispatch_whatsapp_message,
    OWNER_WHATSAPP_DEFAULT,
)
from auth_utils import (
    check_rate_limit,
    reset_rate_limit,
    mask_phone,
    verify_password,
    generate_access_token,
    require_auth,
    require_admin,
    require_owner,
    require_customer,
    optional_auth,
)

try:
    from geocoding import (
        STORE_NAME,
        STORE_OWNER,
        STORE_PHONE,
        STORE_LATITUDE,
        STORE_LONGITUDE,
        STORE_PINCODE,
        STORE_LOCATION,
        MAX_DELIVERY_RADIUS_METERS,
        validate_coordinates,
        calculate_store_distance,
        get_curated_landmarks,
        geocode_address_nominatim,
    )
except ImportError:
    from backend.geocoding import (
        STORE_NAME,
        STORE_OWNER,
        STORE_PHONE,
        STORE_LATITUDE,
        STORE_LONGITUDE,
        STORE_PINCODE,
        STORE_LOCATION,
        MAX_DELIVERY_RADIUS_METERS,
        validate_coordinates,
        calculate_store_distance,
        get_curated_landmarks,
        geocode_address_nominatim,
    )


app = Flask(__name__)

CORS(app)


_INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")  # 10-digit, starts with 6-9
_EMAIL_RE = re.compile(r"^[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+$")
_OTP_TTL_SECONDS = 300          # 5 minutes
ADMIN_PHONE = os.getenv("ADMIN_PHONE", "9554384886")
OWNER_PHONE = os.getenv("OWNER_PHONE", "9919193538")

ORDER_STATUSES = [
    "Order Placed",
    "Order Confirmed",
    "Order Packed",
    "Order Dispatched",
    "Out for Delivery",
    "Delivered",
    "Cancelled",
]

VALID_STATUS_TRANSITIONS = {
    "Order Placed": ["Order Confirmed", "Cancelled"],
    "Order Confirmed": ["Order Packed", "Cancelled"],
    "Order Packed": ["Order Dispatched", "Cancelled"],
    "Order Dispatched": ["Out for Delivery", "Cancelled"],
    "Out for Delivery": ["Delivered", "Cancelled"],
    "Delivered": [],
    "Cancelled": [],
}


def get_db_connection():
    return psycopg.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        dbname=os.getenv("DB_NAME", "sanjay_kirana"),
        user=os.getenv("DB_USER", "postgres"),
        password=os.getenv("DB_PASSWORD"),
        sslmode=os.getenv("DB_SSLMODE", "disable"),
    )


def check_customer_profile_completed(cursor, user_id: int) -> bool:
    """
    Checks if a customer has completed their onboarding profile.
    Criteria:
      1. User has a non-empty name.
      2. User has a verified Indian mobile number (phone IS NOT NULL AND is_phone_verified = TRUE).
      3. User has at least one valid delivery address with non-empty street_address, city, and pincode.
    Synchronizes the database column `users.is_profile_completed`.
    """
    cursor.execute("""
        SELECT u.name,
               u.phone,
               u.email,
               u.is_phone_verified,
               EXISTS (
                   SELECT 1 FROM customer_addresses ca
                   WHERE ca.user_id = u.id
                     AND LENGTH(TRIM(COALESCE(ca.street_address, ''))) > 0
                     AND LENGTH(TRIM(COALESCE(ca.city, ''))) > 0
                     AND LENGTH(TRIM(COALESCE(ca.pincode, ''))) > 0
               ) AS has_valid_address
        FROM users u
        WHERE u.id = %s;
    """, (user_id,))
    row = cursor.fetchone()
    if not row:
        return False
    name = row[0]
    phone = row[1]
    email = row[2]
    is_phone_verified = bool(row[3])
    has_valid_address = bool(row[4])

    phone_valid = bool(phone and len(str(phone).strip()) > 0 and (is_phone_verified or not email))

    is_completed = bool(
        name and len(str(name).strip()) > 0
        and phone_valid
        and has_valid_address
    )

    cursor.execute("""
        UPDATE users
        SET is_profile_completed = %s
        WHERE id = %s AND is_profile_completed != %s;
    """, (is_completed, user_id, is_completed))

    return is_completed


# ---------------------------------------------------------------------------
# Auth routes — Customer & Owner
# ---------------------------------------------------------------------------

@app.route("/auth/send-otp", methods=["POST"])
def send_otp():
    """Customer OTP Dispatch (database-backed, rate-limited, single-use)."""
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    phone = data.get("phone")
    if phone is None:
        return jsonify({"error": "Missing required field: 'phone'."}), 400
    if not isinstance(phone, str):
        return jsonify({"error": "'phone' must be a string."}), 400

    phone = phone.strip()
    if not phone:
        return jsonify({"error": "'phone' must not be blank."}), 400

    if not _INDIAN_MOBILE_RE.match(phone):
        return jsonify({
            "error": "Invalid phone number. Enter a valid 10-digit Indian mobile number (starting with 6–9)."
        }), 400

    # Rate limiting: max 5 OTP requests per phone per 15 minutes
    if not check_rate_limit(f"otp_request:{phone}", max_attempts=5, window_seconds=900):
        return jsonify({
            "error": "Too many OTP requests for this number. Please wait 15 minutes before trying again."
        }), 429

    # Generate cryptographically secure 6-digit OTP
    otp = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = secrets.token_urlsafe(32)

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Invalidate any prior unused customer OTP challenges for this phone
        cursor.execute("""
            UPDATE auth_challenges
            SET is_used = TRUE
            WHERE identifier = %s AND purpose = 'customer_login' AND is_used = FALSE;
        """, (phone,))

        # Store challenge in PostgreSQL with 5-minute expiry
        cursor.execute("""
            INSERT INTO auth_challenges (
                challenge_id, purpose, identifier, otp_code, expires_at
            ) VALUES (
                %s, 'customer_login', %s, %s, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            );
        """, (challenge_id, phone, otp))

        connection.commit()
        cursor.close()
        connection.close()

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error while saving challenge: {str(e)}"}), 500

    # Dispatch via SMS Provider (Mock in dev, MSG91 in prod)
    sms_res = send_sms_otp(phone, otp)
    if not sms_res.get("success"):
        return jsonify({
            "error": sms_res.get("error", "Failed to deliver SMS OTP. Please try again.")
        }), 502

    return jsonify({
        "message": "OTP sent successfully.",
        "phone": phone,
        "expires_in_seconds": _OTP_TTL_SECONDS,
    }), 200


@app.route("/auth/verify-otp", methods=["POST"])
def verify_otp():
    """Customer OTP Verification (issues customer JWT with role='customer')."""
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    phone = data.get("phone")
    if not phone or not isinstance(phone, str) or not _INDIAN_MOBILE_RE.match(phone.strip()):
        return jsonify({
            "error": "Invalid phone number. Enter a valid 10-digit Indian mobile number."
        }), 400
    phone = phone.strip()

    submitted_otp = data.get("otp")
    if not submitted_otp or not isinstance(submitted_otp, str) or not re.fullmatch(r"\d{6}", submitted_otp.strip()):
        return jsonify({"error": "Invalid OTP format. OTP must be a 6-digit numeric string."}), 400
    submitted_otp = submitted_otp.strip()

    # Rate limiting on verification attempts
    if not check_rate_limit(f"otp_verify:{phone}", max_attempts=10, window_seconds=900):
        return jsonify({
            "error": "Too many verification attempts. Please request a fresh OTP."
        }), 429

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Retrieve the latest unused customer challenge for this phone
        cursor.execute("""
            SELECT id, otp_code, attempts, expires_at
            FROM auth_challenges
            WHERE identifier = %s AND purpose = 'customer_login' AND is_used = FALSE
            ORDER BY created_at DESC
            LIMIT 1
            FOR UPDATE;
        """, (phone,))

        record = cursor.fetchone()
        if not record:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({
                "error": "No active OTP request found for this phone number. Please request a new one."
            }), 400

        challenge_db_id = record[0]
        actual_otp = record[1]
        attempts = record[2]
        expires_at = record[3]

        now_utc = datetime.now(timezone.utc)

        # Check expiry
        if now_utc > expires_at:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "OTP has expired. Please request a new one."}), 400

        # Check maximum attempts (max 5 per OTP code)
        if attempts >= 5:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Maximum verification attempts exceeded. Please request a new OTP."}), 400

        # Increment attempts count
        cursor.execute("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = %s;", (challenge_db_id,))

        # Constant-time comparison
        if not secrets.compare_digest(actual_otp, submitted_otp):
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Incorrect OTP. Please check and try again."}), 400

        # OTP matched — mark as used (single-use guaranteed)
        cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))

        # Upsert user record in PostgreSQL
        cursor.execute("""
            INSERT INTO users (phone)
            VALUES (%s)
            ON CONFLICT (phone) DO UPDATE
                SET phone = EXCLUDED.phone
            RETURNING id, phone, name, is_profile_completed;
        """, (phone,))

        user_row = cursor.fetchone()
        user_id = user_row[0]
        user_phone = user_row[1]
        user_name = user_row[2]

        is_new_user = (user_name is None or len(str(user_name).strip()) == 0)
        profile_completed = check_customer_profile_completed(cursor, user_id)

        connection.commit()
        cursor.close()
        connection.close()

        reset_rate_limit(f"otp_request:{phone}")
        reset_rate_limit(f"otp_verify:{phone}")

        # Issue customer JWT with explicit role claim
        token = generate_access_token(user_id=user_id, role="customer", phone=user_phone)

        return jsonify({
            "message": "OTP verified successfully.",
            "token": token,
            "user": {
                "id": user_id,
                "phone": user_phone,
                "name": user_name or "",
                "role": "customer",
                "is_new_user": is_new_user,
                "profile_completed": profile_completed,
            },
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during verification: {str(e)}"}), 500


@app.route("/auth/msg91/verify", methods=["POST"])
def verify_msg91_token():
    """
    Customer verification via MSG91 OTP Widget access token.
    Validates token with MSG91's Verify Access Token API using MSG91_AUTHKEY.
    On success, retrieves/creates customer in PostgreSQL and issues our application JWT.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    access_token = data.get("access_token") or data.get("accessToken") or data.get("access-token")
    if not access_token or not isinstance(access_token, str) or not access_token.strip():
        return jsonify({"error": "Missing or invalid 'access_token'."}), 400
    access_token = access_token.strip()

    # Rate limiting: max 15 token verification attempts per client IP per 15 minutes
    client_ip = request.remote_addr or "unknown"
    if not check_rate_limit(f"msg91_verify:{client_ip}", max_attempts=15, window_seconds=900):
        return jsonify({
            "error": "Too many verification attempts. Please wait a few minutes before trying again."
        }), 429

    msg91_authkey = os.getenv("MSG91_AUTHKEY") or os.getenv("MSG91_AUTH_KEY")
    is_dev = os.getenv("FLASK_ENV", "development").lower() == "development" or os.getenv("DEBUG", "true").lower() == "true"

    raw_identifier = ""
    # Testing & development bypass for automated tests or local mock tokens
    if access_token.startswith("mock_access_token_") and is_dev:
        raw_identifier = access_token.replace("mock_access_token_", "").strip()
    else:
        if not msg91_authkey:
            return jsonify({
                "error": "SMS gateway authentication is not configured on the server (missing MSG91_AUTHKEY)."
            }), 503

        # Call MSG91 official Verify Access Token API
        verify_url = "https://control.msg91.com/api/v5/widget/verifyAccessToken"
        headers = {
            "authkey": msg91_authkey.strip(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "access-token": access_token
        }

        try:
            resp = requests.post(verify_url, headers=headers, json=payload, timeout=8)
            resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        except requests.exceptions.RequestException:
            # Fallback to secondary domain if control.msg91.com times out
            try:
                resp = requests.post("https://api.msg91.com/api/v5/widget/verifyAccessToken", headers=headers, json=payload, timeout=8)
                resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            except Exception:
                return jsonify({
                    "error": "Unable to verify access token with SMS gateway provider. Please try again."
                }), 502

        # Verify response: must be HTTP 200 and type == "success"
        if resp.status_code != 200 or resp_data.get("type") != "success":
            error_reason = str(resp_data.get("message") or "Access token verification failed. The code may be invalid or expired.")
            code_str = str(resp_data.get("code", ""))

            if "ipblock" in error_reason.lower() or "blocked" in error_reason.lower() or code_str == "418":
                error_reason = (
                    "MSG91 Gateway Restriction (IPBlocked): Request was blocked by the SMS provider's anti-flood firewall. "
                    "Please wait for the 15-minute cooldown to expire or unblock your IP in MSG91 Token Settings."
                )
                return jsonify({"error": error_reason, "code": "IPBlocked"}), 429
            elif "throttle" in error_reason.lower() or resp.status_code == 429:
                error_reason = "MSG91 Throttle Limit: Too many verification attempts. Please wait 15 minutes before trying again."
                return jsonify({"error": error_reason, "code": "Throttled"}), 429

            return jsonify({"error": error_reason}), 400

        raw_identifier = str(resp_data.get("message", "")).strip()

    if not raw_identifier:
        return jsonify({"error": "SMS gateway provider did not return a verified identifier."}), 400

    # Distinguish Email vs Indian Mobile Phone identifier
    if "@" in raw_identifier:
        email = raw_identifier.strip().lower()
        if not _EMAIL_RE.match(email):
            return jsonify({"error": "Verified identifier is not a valid email address."}), 400
        verified_type = "email"
        phone = None
    else:
        is_valid, phone, _, norm_err = normalize_indian_phone(raw_identifier)
        if not is_valid:
            return jsonify({
                "error": f"Verified identifier is not a valid 10-digit Indian phone number: {norm_err}"
            }), 400
        verified_type = "phone"
        email = None

    # Retrieve or create user record in PostgreSQL
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        if verified_type == "email":
            # Lookup existing customer by email
            cursor.execute("""
                SELECT id, phone, email, name, is_phone_verified, is_email_verified, is_profile_completed
                FROM users
                WHERE LOWER(email) = %s;
            """, (email,))
            user_row = cursor.fetchone()

            if user_row:
                user_id = user_row[0]
                user_phone = user_row[1]
                user_email = user_row[2]
                user_name = user_row[3]
                is_phone_verified = bool(user_row[4])
                is_email_verified = True
                if not user_row[5]:
                    cursor.execute("UPDATE users SET is_email_verified = TRUE WHERE id = %s;", (user_id,))
            else:
                # First-time email registration: phone is NULL, is_phone_verified = FALSE
                cursor.execute("""
                    INSERT INTO users (email, is_email_verified, phone, is_phone_verified)
                    VALUES (%s, TRUE, NULL, FALSE)
                    RETURNING id, phone, email, name, is_phone_verified, is_email_verified, is_profile_completed;
                """, (email,))
                user_row = cursor.fetchone()
                user_id = user_row[0]
                user_phone = user_row[1]
                user_email = user_row[2]
                user_name = user_row[3]
                is_phone_verified = False
                is_email_verified = True

        else:
            # Lookup existing customer by phone
            cursor.execute("""
                SELECT id, phone, email, name, is_phone_verified, is_email_verified, is_profile_completed
                FROM users
                WHERE phone = %s;
            """, (phone,))
            user_row = cursor.fetchone()

            if user_row:
                user_id = user_row[0]
                user_phone = user_row[1]
                user_email = user_row[2]
                user_name = user_row[3]
                is_phone_verified = True
                is_email_verified = bool(user_row[5])
                if not user_row[4]:
                    cursor.execute("UPDATE users SET is_phone_verified = TRUE WHERE id = %s;", (user_id,))
            else:
                # First-time phone registration
                cursor.execute("""
                    INSERT INTO users (phone, is_phone_verified, email, is_email_verified)
                    VALUES (%s, TRUE, NULL, FALSE)
                    RETURNING id, phone, email, name, is_phone_verified, is_email_verified, is_profile_completed;
                """, (phone,))
                user_row = cursor.fetchone()
                user_id = user_row[0]
                user_phone = user_row[1]
                user_email = user_row[2]
                user_name = user_row[3]
                is_phone_verified = True
                is_email_verified = False

        is_new_user = (user_name is None or len(str(user_name).strip()) == 0)
        profile_completed = check_customer_profile_completed(cursor, user_id)

        connection.commit()
        cursor.close()
        connection.close()

        reset_rate_limit(f"msg91_verify:{client_ip}")

        # Issue customer JWT with explicit role claim
        token = generate_access_token(
            user_id=user_id,
            role="customer",
            phone=user_phone,
            username=user_name or user_email or user_phone,
            email=user_email
        )

        return jsonify({
            "message": "OTP verified successfully via MSG91.",
            "token": token,
            "user": {
                "id": user_id,
                "phone": user_phone,
                "email": user_email,
                "name": user_name or "",
                "role": "customer",
                "is_phone_verified": is_phone_verified,
                "is_email_verified": is_email_verified,
                "is_new_user": is_new_user,
                "profile_completed": profile_completed,
                "login_identifier_type": verified_type,
            },
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during user record creation: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# Owner Admin 2-Step Authentication Routes
# ---------------------------------------------------------------------------

@app.route("/auth/admin/login", methods=["POST"])
def admin_login_step_a():
    """
    Step A: Owner Username & Password verification.
    If valid, dispatches OTP to owner's registered phone and returns a temporary challenge ID.
    DOES NOT issue an admin access token at this stage.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    username = data.get("username")
    password = data.get("password")

    if not username or not isinstance(username, str) or not username.strip():
        return jsonify({"error": "Missing or invalid 'username'."}), 400
    if not password or not isinstance(password, str) or not password.strip():
        return jsonify({"error": "Missing or invalid 'password'."}), 400

    username = username.strip()

    # Rate limiting: max 5 login attempts per username/IP per 15 mins
    if not check_rate_limit(f"admin_login:{username}", max_attempts=5, window_seconds=900):
        return jsonify({
            "error": "Too many failed login attempts. Account temporarily locked for 15 minutes."
        }), 429

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, username, password_hash, phone, is_active
            FROM admin_accounts
            WHERE username = %s;
        """, (username,))

        admin_row = cursor.fetchone()
        if not admin_row or not admin_row[4]:  # not found or is_active is False
            cursor.close()
            connection.close()
            return jsonify({"error": "Invalid username or password."}), 401

        admin_id = admin_row[0]
        admin_username = admin_row[1]
        stored_hash = admin_row[2]
        admin_phone = os.getenv("ADMIN_PHONE") or admin_row[3] or ADMIN_PHONE

        # Verify password securely using Werkzeug
        if not verify_password(password, stored_hash):
            cursor.close()
            connection.close()
            return jsonify({"error": "Invalid username or password."}), 401

        # Password verified! Generate Step B Phone OTP challenge
        otp = f"{secrets.randbelow(1_000_000):06d}"
        challenge_id = secrets.token_urlsafe(32)

        # Invalidate any prior active admin challenges for this account
        cursor.execute("""
            UPDATE auth_challenges
            SET is_used = TRUE
            WHERE admin_id = %s AND purpose = 'admin_login' AND is_used = FALSE;
        """, (admin_id,))

        # Insert new challenge with 5-minute expiry
        cursor.execute("""
            INSERT INTO auth_challenges (
                challenge_id, purpose, identifier, otp_code, admin_id, expires_at
            ) VALUES (
                %s, 'admin_login', %s, %s, %s, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            );
        """, (challenge_id, admin_username, otp, admin_id))

        connection.commit()
        cursor.close()
        connection.close()

        # Check if in dev/mock SMS mode (for automated test environments)
        sms_provider = os.getenv("SMS_PROVIDER", "msg91").lower()
        if sms_provider == "mock" or os.getenv("ALLOW_MOCK_SMS", "false").lower() == "true":
            try:
                send_sms_otp(admin_phone, otp)
            except Exception:
                pass

        # Return restricted challenge (NO admin token issued yet)
        return jsonify({
            "message": "Password verified. Please complete OTP verification via MSG91 widget.",
            "challenge_id": challenge_id,
            "masked_phone": mask_phone(admin_phone),
            "admin_phone": admin_phone,
            "requires_msg91_widget": True,
            "expires_in_seconds": _OTP_TTL_SECONDS,
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error: {str(e)}"}), 500


@app.route("/auth/admin/verify-otp", methods=["POST"])
def admin_login_step_b():
    """
    Step B: Owner Phone OTP Verification.
    Only after passing both password and OTP verification, issues the full admin JWT.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    challenge_id = data.get("challenge_id")
    submitted_otp = data.get("otp")

    if not challenge_id or not isinstance(challenge_id, str) or not challenge_id.strip():
        return jsonify({"error": "Missing or invalid 'challenge_id'."}), 400
    if not submitted_otp or not isinstance(submitted_otp, str) or not re.fullmatch(r"\d{6}", submitted_otp.strip()):
        return jsonify({"error": "Invalid OTP format. OTP must be a 6-digit numeric string."}), 400

    challenge_id = challenge_id.strip()
    submitted_otp = submitted_otp.strip()

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, otp_code, attempts, expires_at, admin_id
            FROM auth_challenges
            WHERE challenge_id = %s AND purpose = 'admin_login' AND is_used = FALSE
            FOR UPDATE;
        """, (challenge_id,))

        record = cursor.fetchone()
        if not record:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({
                "error": "Invalid or expired login challenge. Please log in again."
            }), 400

        challenge_db_id = record[0]
        actual_otp = record[1]
        attempts = record[2]
        expires_at = record[3]
        admin_id = record[4]

        now_utc = datetime.now(timezone.utc)

        # Check expiry
        if now_utc > expires_at:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Security OTP has expired. Please log in again."}), 400

        # Check attempt limits
        if attempts >= 5:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Maximum OTP attempts exceeded. Challenge invalidated."}), 400

        # Increment attempts count
        cursor.execute("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = %s;", (challenge_db_id,))

        # Constant-time comparison
        if not secrets.compare_digest(actual_otp, submitted_otp):
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Incorrect security OTP."}), 400

        # Step B passed! Mark challenge as used
        cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))

        # Update last_login_at on admin account
        cursor.execute("""
            UPDATE admin_accounts
            SET last_login_at = CURRENT_TIMESTAMP
            WHERE id = %s
            RETURNING id, username, phone;
        """, (admin_id,))

        admin_data = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        # Reset rate limits
        reset_rate_limit(f"admin_login:{admin_data[1]}")

        # Issue full Admin JWT with role='admin'
        admin_jwt = generate_access_token(
            user_id=admin_data[0],
            role="admin",
            phone=admin_data[2],
            username=admin_data[1],
        )

        return jsonify({
            "message": "Owner authentication successful.",
            "token": admin_jwt,
            "admin": {
                "id": admin_data[0],
                "username": admin_data[1],
                "phone": admin_data[2],
                "role": "admin",
            },
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during admin verification: {str(e)}"}), 500


@app.route("/auth/admin/resend-otp", methods=["POST"])
def admin_resend_otp():
    """
    Resends OTP for an active Step B admin login challenge.
    Enforces a strict 30-second cooldown and a maximum of 3 resends per challenge.
    Dispatches exclusively to the configured admin phone (9554384886).
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    challenge_id = data.get("challenge_id")
    if not challenge_id or not isinstance(challenge_id, str) or not challenge_id.strip():
        return jsonify({"error": "Missing or invalid 'challenge_id'."}), 400

    challenge_id = challenge_id.strip()

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, identifier, otp_code, admin_id, expires_at, created_at, attempts
            FROM auth_challenges
            WHERE challenge_id = %s AND purpose = 'admin_login' AND is_used = FALSE
            FOR UPDATE;
        """, (challenge_id,))

        challenge = cursor.fetchone()
        if not challenge:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": "Invalid or expired login challenge. Please log in again."}), 400

        ch_db_id = challenge[0]
        identifier = challenge[1]
        admin_id = challenge[3]
        expires_at = challenge[4]
        created_at = challenge[5]
        attempts = challenge[6]

        now_utc = datetime.now(timezone.utc)

        # Check if challenge has expired
        if now_utc > expires_at:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (ch_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Login session has expired. Please log in again with your credentials."}), 400

        # Retrieve admin phone
        cursor.execute("SELECT phone FROM admin_accounts WHERE id = %s AND is_active = TRUE;", (admin_id,))
        acc = cursor.fetchone()
        if not acc:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": "Admin account not found or deactivated."}), 401

        admin_phone = os.getenv("ADMIN_PHONE") or acc[0] or ADMIN_PHONE

        # Check cooldown: at least 30 seconds between requests
        resend_rl_key = f"admin_resend:{challenge_id}"
        if not check_rate_limit(resend_rl_key, max_attempts=1, window_seconds=30):
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({
                "error": "Please wait for the 30-second cooldown before requesting another OTP.",
                "cooldown_remaining_seconds": 30
            }), 429

        # Enforce max 3 resends per challenge
        max_resends_key = f"admin_resend_count:{challenge_id}"
        if not check_rate_limit(max_resends_key, max_attempts=3, window_seconds=600):
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({
                "error": "Maximum OTP resend limit reached for this login session. Please restart login."
            }), 429

        # Generate fresh 6-digit OTP code
        new_otp = f"{secrets.randbelow(1_000_000):06d}"

        # Update challenge: new OTP code, reset attempts, extend expiry by 5 minutes
        cursor.execute("""
            UPDATE auth_challenges
            SET otp_code = %s,
                attempts = 0,
                expires_at = CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            WHERE id = %s;
        """, (new_otp, ch_db_id))

        connection.commit()
        cursor.close()
        connection.close()

        # Dispatch fresh OTP to admin phone
        sms_res = send_sms_otp(admin_phone, new_otp)
        if not sms_res.get("success"):
            return jsonify({
                "error": sms_res.get("error", "Failed to dispatch resend security OTP. Please try again.")
            }), 502

        return jsonify({
            "message": "A fresh security OTP has been sent to your registered phone.",
            "masked_phone": mask_phone(admin_phone),
            "expires_in_seconds": _OTP_TTL_SECONDS,
            "cooldown_seconds": 30
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during OTP resend: {str(e)}"}), 500


@app.route("/auth/admin/msg91/verify", methods=["POST"])
def admin_verify_msg91_token():
    """
    Verifies admin login using the MSG91 OTP Widget access token.
    Enforces 2-step verification: requires a valid challenge_id issued from Step 1 (password verification).
    Validates token with MSG91's Verify Access Token API.
    Verifies that the phone number returned by MSG91 is strictly ADMIN_PHONE (9554384886).
    Rejects any email address or other phone numbers.
    Issues full admin JWT with role='admin'.
    """
    client_ip = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()

    if not check_rate_limit(f"admin_msg91_verify:{client_ip}", max_attempts=10, window_seconds=300):
        return jsonify({"error": "Too many verification requests. Please wait a few minutes."}), 429

    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    challenge_id = data.get("challenge_id")
    access_token = data.get("access_token")

    if not challenge_id or not isinstance(challenge_id, str) or not challenge_id.strip():
        return jsonify({"error": "Missing or invalid 'challenge_id'. You must complete password verification first."}), 400

    if not access_token or not isinstance(access_token, str) or not access_token.strip():
        return jsonify({"error": "Missing or invalid 'access_token' from MSG91 widget."}), 400

    challenge_id = challenge_id.strip()
    access_token = access_token.strip()

    # Step 1: Validate challenge_id in auth_challenges
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, admin_id, expires_at
            FROM auth_challenges
            WHERE challenge_id = %s AND purpose = 'admin_login' AND is_used = FALSE
            FOR UPDATE;
        """, (challenge_id,))

        challenge = cursor.fetchone()
        if not challenge:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": "Invalid or expired login challenge. Please enter password first."}), 400

        ch_db_id = challenge[0]
        admin_id = challenge[1]
        expires_at = challenge[2]

        now_utc = datetime.now(timezone.utc)
        if now_utc > expires_at:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (ch_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Login session has expired. Please restart login."}), 400

        # Retrieve admin account
        cursor.execute("""
            SELECT id, username, phone, is_active
            FROM admin_accounts
            WHERE id = %s AND is_active = TRUE;
        """, (admin_id,))
        acc = cursor.fetchone()
        if not acc:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": "Admin account not found or deactivated."}), 401

        admin_data = acc

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during admin challenge verification: {str(e)}"}), 500

    # Step 2: Validate access_token with MSG91
    is_mock = (
        os.getenv("SMS_PROVIDER", "").lower() == "mock" or
        os.getenv("ALLOW_MOCK_SMS", "false").lower() == "true"
    ) and os.getenv("FLASK_ENV", "").lower() != "production"

    if is_mock and access_token == "mock_admin_access_token_success":
        verified_phone = ADMIN_PHONE
    else:
        msg91_authkey = (os.getenv("MSG91_AUTHKEY") or os.getenv("MSG91_AUTH_KEY") or "").strip()
        if not msg91_authkey:
            if connection:
                connection.close()
            return jsonify({"error": "MSG91_AUTHKEY is not configured on the server."}), 503

        verify_url = "https://control.msg91.com/api/v5/widget/verifyAccessToken"
        headers = {
            "authkey": msg91_authkey,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {"access-token": access_token}

        try:
            resp = requests.post(verify_url, headers=headers, json=payload, timeout=8)
            resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        except requests.exceptions.RequestException:
            try:
                resp = requests.post("https://api.msg91.com/api/v5/widget/verifyAccessToken", headers=headers, json=payload, timeout=8)
                resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            except Exception:
                if connection:
                    connection.close()
                return jsonify({"error": "Unable to verify access token with SMS gateway provider. Please try again."}), 502

        if resp.status_code != 200 or resp_data.get("type") != "success":
            err_msg = str(resp_data.get("message") or "Access token verification failed. Invalid or expired token.")
            code_str = str(resp_data.get("code", ""))
            if connection:
                connection.close()

            if "ipblock" in err_msg.lower() or "blocked" in err_msg.lower() or code_str == "418" or "whitelist" in err_msg.lower():
                err_msg = (
                    "MSG91 Gateway Restriction (IPBlocked): Request was blocked by the SMS provider's anti-flood firewall or IP whitelist. "
                    "Please wait for the 15-minute cooldown to expire or unblock your IP in MSG91 Token Settings."
                )
                return jsonify({"error": err_msg, "code": "IPBlocked"}), 429
            elif "throttle" in err_msg.lower() or resp.status_code == 429:
                err_msg = "MSG91 Throttle Limit: Too many verification attempts. Please wait 15 minutes before trying again."
                return jsonify({"error": err_msg, "code": "Throttled"}), 429

            return jsonify({"error": err_msg}), 400

        raw_identifier = str(resp_data.get("message", "")).strip()

        # Reject if identifier contains '@' (email is not authorized for admin)
        if "@" in raw_identifier:
            if connection:
                connection.close()
            return jsonify({
                "error": "Email verification is not authorized for admin accounts. You must verify via the registered admin mobile phone."
            }), 403

        is_valid, verified_phone, _, norm_err = normalize_indian_phone(raw_identifier)
        if not is_valid:
            if connection:
                connection.close()
            return jsonify({"error": f"Verified identifier is not a valid 10-digit Indian mobile number: {norm_err}"}), 400

    # Step 3: Strictly verify that the verified phone matches ADMIN_PHONE (9554384886)
    expected_admin_phone = os.getenv("ADMIN_PHONE") or admin_data[2] or ADMIN_PHONE
    is_val_exp, norm_expected_phone, _, _ = normalize_indian_phone(expected_admin_phone)
    if not is_val_exp:
        norm_expected_phone = expected_admin_phone

    if verified_phone != norm_expected_phone:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({
            "error": "Unauthorized phone number. The verified phone does not match the registered admin account mobile number."
        }), 403

    # Step 4: Mark challenge as used and issue Admin JWT
    try:
        cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (ch_db_id,))
        cursor.execute("UPDATE admin_accounts SET last_login_at = CURRENT_TIMESTAMP WHERE id = %s;", (admin_data[0],))
        connection.commit()
        cursor.close()
        connection.close()
    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error finalizing admin login: {str(e)}"}), 500

    admin_jwt = generate_access_token(
        user_id=admin_data[0],
        role="admin",
        phone=admin_data[2],
        username=admin_data[1],
    )

    return jsonify({
        "message": "Admin authentication successful.",
        "token": admin_jwt,
        "admin": {
            "id": admin_data[0],
            "username": admin_data[1],
            "phone": admin_data[2],
            "role": "admin",
        },
    }), 200


# ---------------------------------------------------------------------------
# Owner Authentication Routes (Role C: Store Owner)
# Fixed Phone: 9919193538 (Sanjay) — Phone OTP ONLY (NO password required)
# ---------------------------------------------------------------------------

@app.route("/auth/owner/send-otp", methods=["POST"])
def owner_send_otp():
    """
    Dispatches OTP exclusively to the fixed store owner phone (9919193538).
    Rejects any request attempting to override the phone number with another destination.
    """
    data = request.get_json(silent=True) or {}
    requested_phone = data.get("phone")
    if requested_phone:
        clean_req = re.sub(r"\D", "", str(requested_phone).strip())
        if clean_req.startswith("91") and len(clean_req) == 12:
            clean_req = clean_req[2:]
        if clean_req != OWNER_PHONE:
            return jsonify({
                "error": "Unauthorized phone destination. Owner OTP can only be sent to the registered store owner phone."
            }), 400

    client_ip = request.remote_addr or "unknown"
    if not check_rate_limit(f"owner_otp_request:{OWNER_PHONE}", max_attempts=5, window_seconds=900):
        return jsonify({
            "error": "Too many OTP requests. Please wait 15 minutes before requesting again."
        }), 429

    otp = f"{secrets.randbelow(1_000_000):06d}"
    challenge_id = secrets.token_urlsafe(32)

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Invalidate any prior active owner challenges
        cursor.execute("""
            UPDATE auth_challenges
            SET is_used = TRUE
            WHERE identifier = %s AND purpose = 'owner_login' AND is_used = FALSE;
        """, (OWNER_PHONE,))

        # Insert new challenge with 5-minute expiry
        cursor.execute("""
            INSERT INTO auth_challenges (
                challenge_id, purpose, identifier, otp_code, expires_at
            ) VALUES (
                %s, 'owner_login', %s, %s, CURRENT_TIMESTAMP + INTERVAL '5 minutes'
            );
        """, (challenge_id, OWNER_PHONE, otp))

        connection.commit()
        cursor.close()
        connection.close()

        # Dispatch via SMS provider
        sms_res = send_sms_otp(OWNER_PHONE, otp)
        if not sms_res.get("success"):
            return jsonify({
                "error": sms_res.get("error", "Failed to dispatch security OTP to owner.")
            }), 502

        return jsonify({
            "message": "Security OTP sent to store owner's registered phone.",
            "challenge_id": challenge_id,
            "masked_phone": mask_phone(OWNER_PHONE),
            "expires_in_seconds": _OTP_TTL_SECONDS,
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during owner OTP dispatch: {str(e)}"}), 500


@app.route("/auth/owner/verify-otp", methods=["POST"])
def owner_verify_otp():
    """
    Verifies owner phone OTP and issues an owner JWT with role='owner'.
    Does NOT require any password. Guarantees single-use and rate-limited attempts.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    challenge_id = data.get("challenge_id")
    submitted_otp = data.get("otp")

    if not challenge_id or not isinstance(challenge_id, str) or not challenge_id.strip():
        return jsonify({"error": "Missing or invalid 'challenge_id'."}), 400
    if not submitted_otp or not isinstance(submitted_otp, str) or not re.fullmatch(r"\d{6}", submitted_otp.strip()):
        return jsonify({"error": "Invalid OTP format. OTP must be a 6-digit numeric string."}), 400

    challenge_id = challenge_id.strip()
    submitted_otp = submitted_otp.strip()

    client_ip = request.remote_addr or "unknown"
    if not check_rate_limit(f"owner_otp_verify:{client_ip}", max_attempts=10, window_seconds=900):
        return jsonify({
            "error": "Too many verification attempts. Please request a fresh OTP."
        }), 429

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, otp_code, attempts, expires_at, identifier
            FROM auth_challenges
            WHERE challenge_id = %s AND purpose = 'owner_login' AND is_used = FALSE
            FOR UPDATE;
        """, (challenge_id,))

        record = cursor.fetchone()
        if not record:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({
                "error": "Invalid or expired login challenge. Please request a new OTP."
            }), 400

        challenge_db_id = record[0]
        actual_otp = record[1]
        attempts = record[2]
        expires_at = record[3]

        now_utc = datetime.now(timezone.utc)

        if now_utc > expires_at:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Security OTP has expired. Please request a new one."}), 400

        if attempts >= 5:
            cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Maximum OTP verification attempts exceeded. Challenge invalidated."}), 400

        cursor.execute("UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = %s;", (challenge_db_id,))

        if not secrets.compare_digest(actual_otp, submitted_otp):
            connection.commit()
            cursor.close()
            connection.close()
            return jsonify({"error": "Incorrect security OTP."}), 400

        # Mark challenge as used (single-use guaranteed)
        cursor.execute("UPDATE auth_challenges SET is_used = TRUE WHERE id = %s;", (challenge_db_id,))

        # Upsert owner user record in PostgreSQL
        cursor.execute("""
            INSERT INTO users (phone, name)
            VALUES (%s, %s)
            ON CONFLICT (phone) DO UPDATE
                SET name = COALESCE(users.name, EXCLUDED.name)
            RETURNING id, phone, name;
        """, (OWNER_PHONE, "Sanjay (Owner)"))

        owner_row = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        reset_rate_limit(f"owner_otp_request:{OWNER_PHONE}")
        reset_rate_limit(f"owner_otp_verify:{client_ip}")

        owner_id = owner_row[0]
        owner_phone = owner_row[1]
        owner_name = owner_row[2] or "Sanjay (Owner)"

        # Issue owner JWT with explicit role='owner'
        token = generate_access_token(
            user_id=owner_id,
            role="owner",
            phone=owner_phone,
            username="owner_sanjay",
        )

        return jsonify({
            "message": "Owner authentication successful.",
            "token": token,
            "owner": {
                "id": owner_id,
                "phone": owner_phone,
                "name": owner_name,
                "role": "owner",
            },
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during owner verification: {str(e)}"}), 500


@app.route("/auth/owner/msg91/verify", methods=["POST"])
def owner_verify_msg91_token():
    """
    Verifies owner login using MSG91 OTP Widget access token.
    Validates token with MSG91's Verify Access Token API.
    Verifies that the phone number returned by MSG91 is strictly OWNER_PHONE.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    access_token = data.get("access_token") or data.get("accessToken") or data.get("access-token")
    if not access_token or not isinstance(access_token, str) or not access_token.strip():
        return jsonify({"error": "Missing or invalid 'access_token'."}), 400
    access_token = access_token.strip()

    client_ip = request.remote_addr or "unknown"
    if not check_rate_limit(f"owner_msg91_verify:{client_ip}", max_attempts=15, window_seconds=900):
        return jsonify({
            "error": "Too many verification attempts. Please wait a few minutes before trying again."
        }), 429

    msg91_authkey = os.getenv("MSG91_AUTHKEY") or os.getenv("MSG91_AUTH_KEY")
    is_dev = os.getenv("FLASK_ENV", "development").lower() == "development" or os.getenv("DEBUG", "true").lower() == "true"

    if access_token.startswith("mock_access_token_") and is_dev:
        mock_phone = access_token.replace("mock_access_token_", "").strip()
        phone = mock_phone
    else:
        if not msg91_authkey:
            return jsonify({
                "error": "SMS gateway authentication is not configured on the server (missing MSG91_AUTHKEY)."
            }), 503

        verify_url = "https://control.msg91.com/api/v5/widget/verifyAccessToken"
        headers = {
            "authkey": msg91_authkey.strip(),
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        payload = {
            "access-token": access_token
        }

        try:
            resp = requests.post(verify_url, headers=headers, json=payload, timeout=8)
            resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
        except requests.exceptions.RequestException:
            try:
                resp = requests.post("https://api.msg91.com/api/v5/widget/verifyAccessToken", headers=headers, json=payload, timeout=8)
                resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}
            except Exception:
                return jsonify({
                    "error": "Unable to verify access token with SMS gateway provider. Please try again."
                }), 502

        if resp.status_code != 200 or resp_data.get("type") != "success":
            error_reason = resp_data.get("message") or "Access token verification failed. The code may be invalid or expired."
            return jsonify({"error": error_reason}), 400

        raw_identifier = str(resp_data.get("message", "")).strip()
        is_valid, phone, _, norm_err = normalize_indian_phone(raw_identifier)
        if not is_valid:
            return jsonify({"error": f"Verified identifier is not a valid 10-digit Indian phone number: {norm_err}"}), 400

    # Security: Enforce that the verified phone is strictly the OWNER_PHONE
    if phone != OWNER_PHONE:
        return jsonify({
            "error": "Forbidden. This mobile number is not authorized as the store owner."
        }), 403

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            INSERT INTO users (phone, name)
            VALUES (%s, %s)
            ON CONFLICT (phone) DO UPDATE
                SET name = COALESCE(users.name, EXCLUDED.name)
            RETURNING id, phone, name;
        """, (OWNER_PHONE, "Sanjay (Owner)"))

        owner_row = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        reset_rate_limit(f"owner_msg91_verify:{client_ip}")

        owner_id = owner_row[0]
        owner_phone = owner_row[1]
        owner_name = owner_row[2] or "Sanjay (Owner)"

        token = generate_access_token(
            user_id=owner_id,
            role="owner",
            phone=owner_phone,
            username="owner_sanjay",
        )

        return jsonify({
            "message": "Owner authentication successful via MSG91.",
            "token": token,
            "owner": {
                "id": owner_id,
                "phone": owner_phone,
                "name": owner_name,
                "role": "owner",
            },
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during owner record creation: {str(e)}"}), 500


@app.route("/auth/me", methods=["GET"])
@require_auth
def get_current_user():
    """Returns the authenticated user, admin, or owner identity based on token claims."""
    user = request.user
    user_id = user.get("sub")
    role = user.get("role")

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        if role == "owner":
            cursor.execute("SELECT id, phone, name FROM users WHERE phone = %s;", (OWNER_PHONE,))
            row = cursor.fetchone()
            owner_id = row[0] if row else int(user_id) if str(user_id).isdigit() else 0
            owner_name = row[2] if (row and row[2]) else "Sanjay (Owner)"
            cursor.close()
            connection.close()
            return jsonify({
                "id": owner_id,
                "phone": OWNER_PHONE,
                "name": owner_name,
                "role": "owner",
            }), 200

        elif role == "admin":
            cursor.execute("SELECT id, username, phone, is_active FROM admin_accounts WHERE id = %s;", (user_id,))
            row = cursor.fetchone()
            cursor.close()
            connection.close()
            if not row or not row[3]:
                return jsonify({"error": "Admin account not found or deactivated."}), 401
            return jsonify({
                "id": row[0],
                "username": row[1],
                "phone": row[2],
                "role": "admin",
            }), 200

        else:
            cursor.execute("""
                SELECT id, phone, email, name, is_phone_verified, is_email_verified, is_profile_completed
                FROM users WHERE id = %s;
            """, (user_id,))
            row = cursor.fetchone()
            if not row:
                cursor.close()
                connection.close()
                return jsonify({"error": "Customer account not found."}), 401

            is_completed = check_customer_profile_completed(cursor, row[0])
            connection.commit()
            cursor.close()
            connection.close()

            return jsonify({
                "id": row[0],
                "phone": row[1],
                "email": row[2],
                "name": row[3] or "",
                "role": "customer",
                "is_phone_verified": bool(row[4]),
                "is_email_verified": bool(row[5]),
                "is_profile_completed": is_completed,
            }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# Owner-Exclusive Portal Endpoints (Role C)
# ---------------------------------------------------------------------------

@app.route("/owner/overview", methods=["GET"])
@require_owner
def get_owner_overview():
    """
    Owner-exclusive endpoint: returns comprehensive store business metrics.
    Forbidden to customers and admins.
    """
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Orders aggregate metrics
        cursor.execute("""
            SELECT 
                COUNT(*),
                COALESCE(SUM(total_amount), 0),
                COALESCE(SUM(subtotal), 0),
                COALESCE(SUM(delivery_charge), 0)
            FROM orders;
        """)
        order_metrics = cursor.fetchone()

        # Order status breakdown
        cursor.execute("""
            SELECT status, COUNT(*)
            FROM orders
            GROUP BY status;
        """)
        status_counts = dict(cursor.fetchall())

        # Customer count
        cursor.execute("SELECT COUNT(*) FROM users;")
        total_customers = cursor.fetchone()[0]

        # Products count and low stock (< 10)
        cursor.execute("SELECT COUNT(*), COUNT(*) FILTER (WHERE stock < 10) FROM products;")
        prod_stats = cursor.fetchone()
        total_products = prod_stats[0]
        low_stock_count = prod_stats[1]

        # Admin staff list
        cursor.execute("SELECT id, username, phone, is_active, last_login_at FROM admin_accounts;")
        admins = [
            {
                "id": r[0],
                "username": r[1],
                "phone": r[2],
                "is_active": r[3],
                "last_login_at": r[4].isoformat() if r[4] else None,
            }
            for r in cursor.fetchall()
        ]

        cursor.close()
        connection.close()

        return jsonify({
            "store": {
                "name": STORE_NAME,
                "owner": STORE_OWNER,
                "phone": OWNER_PHONE,
                "location": STORE_LOCATION,
            },
            "financials": {
                "total_orders": order_metrics[0],
                "total_revenue": float(order_metrics[1]),
                "total_subtotal": float(order_metrics[2]),
                "total_delivery_fees": float(order_metrics[3]),
                "status_breakdown": status_counts,
            },
            "inventory": {
                "total_products": total_products,
                "low_stock_alerts": low_stock_count,
            },
            "customers": {
                "total_registered": total_customers,
            },
            "admin_staff": admins,
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error fetching owner overview: {str(e)}"}), 500


# ---------------------------------------------------------------------------
# Customer Onboarding & Profile Completion
# ---------------------------------------------------------------------------

@app.route("/account/complete-profile", methods=["POST"])
@require_auth
def complete_customer_profile():
    """
    Customer Onboarding Profile Completion:
    Atomically saves full name and primary delivery address.
    Updates `users.name` and inserts into `customer_addresses` as default address.
    Marks `users.is_profile_completed = TRUE`.
    """
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    name = data.get("name")
    if not name or not isinstance(name, str) or not name.strip() or len(name.strip()) > 150:
        return jsonify({"error": "Full name is required (1 to 150 characters)."}), 400
    name = name.strip()

    street_address = data.get("street_address")
    if not street_address or not isinstance(street_address, str) or not street_address.strip():
        return jsonify({"error": "Street address is required."}), 400
    street_address = street_address.strip()

    city = data.get("city", "Harraiya")
    if not city or not isinstance(city, str) or not city.strip():
        city = "Harraiya"
    city = city.strip()

    state = data.get("state", "Uttar Pradesh")
    if not state or not isinstance(state, str) or not state.strip():
        state = "Uttar Pradesh"
    state = state.strip()

    pincode = str(data.get("pincode", "272155")).strip()
    if not re.fullmatch(r"\d{6}", pincode):
        return jsonify({"error": "PIN code must be a valid 6-digit Indian postal code."}), 400

    landmark = data.get("landmark")
    landmark = landmark.strip() if landmark and isinstance(landmark, str) else None

    locality = data.get("locality")
    locality = locality.strip() if locality and isinstance(locality, str) else None

    label = data.get("label", "Home")
    if label not in ("Home", "Work", "Other"):
        label = "Home"

    # Optional delivery coordinates
    lat = data.get("latitude")
    lon = data.get("longitude")
    delivery_lat = None
    delivery_lon = None
    if lat is not None and lon is not None:
        try:
            valid_lat, valid_lon, _ = validate_coordinates(lat, lon)
            delivery_lat = valid_lat
            delivery_lon = valid_lon
        except Exception:
            pass

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # 1. Update customer name in users
        cursor.execute("""
            UPDATE users
            SET name = %s
            WHERE id = %s
            RETURNING id, phone, name;
        """, (name, user_id))

        updated_user = cursor.fetchone()
        if not updated_user:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": "Customer account not found."}), 404

        # 2. Unset any existing default address
        cursor.execute("""
            UPDATE customer_addresses
            SET is_default = FALSE
            WHERE user_id = %s;
        """, (user_id,))

        # 3. Insert new default address
        cursor.execute("""
            INSERT INTO customer_addresses (
                user_id, recipient_name, phone, street_address, landmark,
                locality, city, state, pincode, delivery_latitude, delivery_longitude,
                label, is_default
            ) VALUES (
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s,
                %s, TRUE
            )
            RETURNING id, recipient_name, phone, street_address, landmark,
                      locality, city, state, pincode, delivery_latitude,
                      delivery_longitude, label, is_default, created_at;
        """, (
            user_id, name, updated_user[1], street_address, landmark,
            locality, city, state, pincode, delivery_lat, delivery_lon,
            label
        ))

        addr_row = cursor.fetchone()

        # 4. Synchronize profile completed status
        is_completed = check_customer_profile_completed(cursor, user_id)

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Profile and delivery address completed successfully.",
            "user": {
                "id": updated_user[0],
                "phone": updated_user[1],
                "name": updated_user[2],
                "role": "customer",
                "is_new_user": False,
                "profile_completed": is_completed,
            },
            "address": {
                "id": addr_row[0],
                "recipient_name": addr_row[1],
                "phone": addr_row[2],
                "street_address": addr_row[3],
                "landmark": addr_row[4],
                "locality": addr_row[5],
                "city": addr_row[6],
                "state": addr_row[7],
                "pincode": addr_row[8],
                "latitude": float(addr_row[9]) if addr_row[9] is not None else None,
                "longitude": float(addr_row[10]) if addr_row[10] is not None else None,
                "label": addr_row[11],
                "is_default": addr_row[12],
            }
        }), 201

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": f"Database error during profile completion: {str(e)}"}), 500


@app.route("/")
def home():
    return {
        "message": "Sanjay Kirana Store API is running!"
    }


@app.route("/db-test")
def db_test():
    try:
        connection = get_db_connection()
        connection.close()

        return {
            "message": "PostgreSQL connected successfully!"
        }

    except Exception as e:
        return {
            "error": str(e)
        }, 500


# Get all products
@app.route("/products")
def get_products():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                id,
                name,
                brand,
                category,
                sub_category,
                size,
                description,
                price,
                original_price,
                discount,
                stock,
                featured,
                bestseller,
                rating,
                total_reviews,
                image
            FROM products
            ORDER BY id;
        """)

        rows = cursor.fetchall()

        cursor.close()
        connection.close()

        products = []

        for row in rows:
            products.append({
                "id": row[0],
                "name": row[1],
                "brand": row[2],
                "category": row[3],
                "subCategory": row[4],
                "size": row[5],
                "description": row[6],
                "price": float(row[7]),
                "originalPrice": float(row[8]),
                "discount": row[9],
                "stock": row[10],
                "featured": row[11],
                "bestseller": row[12],
                "rating": float(row[13]),
                "totalReviews": row[14],
                "image": row[15]
            })

        return jsonify(products)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# Get all categories dynamically with product count and sample image
@app.route("/categories")
def get_categories():
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                category,
                COUNT(*) AS product_count,
                MIN(image) AS sample_image
            FROM products
            WHERE category IS NOT NULL AND TRIM(category) != ''
            GROUP BY category
            ORDER BY category;
        """)

        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        categories = []
        for row in rows:
            categories.append({
                "name": row[0],
                "count": int(row[1]),
                "productCount": int(row[1]),
                "product_count": int(row[1]),
                "image": row[2]
            })

        return jsonify(categories)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# Get one product by ID
@app.route("/products/<int:product_id>")
def get_product(product_id):
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT
                id,
                name,
                brand,
                category,
                sub_category,
                size,
                description,
                price,
                original_price,
                discount,
                stock,
                featured,
                bestseller,
                rating,
                total_reviews,
                image
            FROM products
            WHERE id = %s;
        """, (product_id,))

        row = cursor.fetchone()

        cursor.close()
        connection.close()

        # Product not found
        if row is None:
            return jsonify({
                "error": "Product not found"
            }), 404

        product = {
            "id": row[0],
            "name": row[1],
            "brand": row[2],
            "category": row[3],
            "subCategory": row[4],
            "size": row[5],
            "description": row[6],
            "price": float(row[7]),
            "originalPrice": float(row[8]),
            "discount": row[9],
            "stock": row[10],
            "featured": row[11],
            "bestseller": row[12],
            "rating": float(row[13]),
            "totalReviews": row[14],
            "image": row[15]
        }

        return jsonify(product)

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500


# ---------------------------------------------------------------------------
# Delivery Area Validation Routes (2 km radius from Harraiya)
# ---------------------------------------------------------------------------

@app.route("/delivery/info", methods=["GET"])
def get_delivery_info():
    """Returns store location, coordinates, delivery notice, and Harraiya landmarks."""
    return jsonify({
        "store_name": STORE_NAME,
        "owner": STORE_OWNER,
        "phone": STORE_PHONE,
        "pincode": STORE_PINCODE,
        "location": STORE_LOCATION,
        "latitude": STORE_LATITUDE,
        "longitude": STORE_LONGITUDE,
        "max_radius_meters": MAX_DELIVERY_RADIUS_METERS,
        "max_radius_km": round(MAX_DELIVERY_RADIUS_METERS / 1000.0, 1),
        "notice": f"We deliver within a 2 km radius of {STORE_NAME}, Harraiya, Basti (PIN {STORE_PINCODE}). For assistance, call {STORE_PHONE}.",
        "landmarks": get_curated_landmarks()
    }), 200


@app.route("/delivery/validate", methods=["POST"])
def validate_delivery_area():
    """
    Authoritative backend endpoint to validate delivery coordinates.
    Computes straight-line distance from store using Haversine formula.
    """
    data = request.get_json(silent=True) or {}
    latitude = data.get("latitude") if data.get("latitude") is not None else data.get("delivery_latitude")
    longitude = data.get("longitude") if data.get("longitude") is not None else data.get("delivery_longitude")
    address_query = data.get("address")
    pincode = data.get("pincode")

    # If coordinates provided (e.g. from GPS or landmark picker)
    if latitude is not None and longitude is not None:
        is_valid, is_eligible, distance_meters, error_msg = validate_coordinates(latitude, longitude)
        if not is_valid:
            return jsonify({"is_eligible": False, "error": error_msg}), 400

        distance_km = round(distance_meters / 1000.0, 2)
        return jsonify({
            "is_eligible": is_eligible,
            "distance_meters": distance_meters,
            "distance_km": distance_km,
            "max_radius_km": 2.0,
            "latitude": float(latitude),
            "longitude": float(longitude),
            "store": {
                "name": STORE_NAME,
                "phone": STORE_PHONE,
                "latitude": STORE_LATITUDE,
                "longitude": STORE_LONGITUDE,
            },
            "message": (
                f"Your location is {distance_km} km away, within our 2 km delivery radius!"
                if is_eligible else
                f"Your location is {distance_km} km away. We currently deliver within a 2 km radius of Sanjay Kirana Store, Harraiya, Basti (PIN 272155). For assistance, call 9919193538."
            )
        }), 200

    # Fallback to address geocoding via OpenStreetMap Nominatim
    if address_query:
        result, error_msg = geocode_address_nominatim(address_query, pincode)
        if result:
            return jsonify({
                "is_eligible": result["is_eligible"],
                "distance_meters": result["distance_meters"],
                "distance_km": result["distance_km"],
                "latitude": result["latitude"],
                "longitude": result["longitude"],
                "display_name": result["display_name"],
                "max_radius_km": 2.0,
                "message": (
                    f"Location verified ({result['distance_km']} km away). Delivery available!"
                    if result["is_eligible"] else
                    f"Address is {result['distance_km']} km away, outside our 2 km delivery radius. For assistance, call 9919193538."
                )
            }), 200
        else:
            return jsonify({
                "is_eligible": False,
                "error": error_msg or "Could not locate this address. Please choose your nearest Harraiya landmark or use GPS location.",
            }), 404

    return jsonify({
        "is_eligible": False,
        "error": "Please provide latitude & longitude or select a local landmark."
    }), 400


# Create a new order
@app.route("/orders", methods=["POST"])
@optional_auth
def create_order():
    data = request.get_json()
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    # Validate required top-level fields
    customer_name = data.get("customer_name")
    customer_phone = data.get("customer_phone")
    delivery_address = data.get("delivery_address")
    city = data.get("city")
    pincode = data.get("pincode")
    payment_method = data.get("payment_method", "cod")
    items = data.get("items")

    if not customer_name or not isinstance(customer_name, str) or not customer_name.strip():
        return jsonify({"error": "Missing or invalid 'customer_name'."}), 400
    if not customer_phone or not isinstance(customer_phone, str) or not customer_phone.strip():
        return jsonify({"error": "Missing or invalid 'customer_phone'."}), 400
    if not delivery_address or not isinstance(delivery_address, str) or not delivery_address.strip():
        return jsonify({"error": "Missing or invalid 'delivery_address'."}), 400
    if not city or not isinstance(city, str) or not city.strip():
        return jsonify({"error": "Missing or invalid 'city'."}), 400
    if not pincode or not isinstance(pincode, str) or not pincode.strip():
        return jsonify({"error": "Missing or invalid 'pincode'."}), 400
    if not payment_method or not isinstance(payment_method, str) or not payment_method.strip():
        return jsonify({"error": "Missing or invalid 'payment_method'."}), 400

    customer_name = customer_name.strip()
    customer_phone = customer_phone.strip()
    delivery_address = delivery_address.strip()
    city = city.strip()
    pincode = pincode.strip()
    payment_method = payment_method.strip()

    is_valid_phone, norm_phone, _, _ = normalize_indian_phone(customer_phone)
    if is_valid_phone:
        customer_phone = norm_phone

    # -----------------------------------------------------------------------
    # Authoritative Delivery Radius Validation (Haversine <= 2,000 metres)
    # -----------------------------------------------------------------------
    latitude = data.get("latitude") if data.get("latitude") is not None else data.get("delivery_latitude")
    longitude = data.get("longitude") if data.get("longitude") is not None else data.get("delivery_longitude")

    if latitude is None or longitude is None:
        # Fallback: attempt Nominatim geocoding of the given delivery address
        geo_res, _ = geocode_address_nominatim(f"{delivery_address}, {city}", pincode)
        if geo_res:
            latitude = geo_res["latitude"]
            longitude = geo_res["longitude"]
        else:
            return jsonify({
                "error": "Delivery location coordinates are required to verify the 2 km delivery radius. Please use 'Detect GPS Location' or pick your nearest Harraiya landmark on checkout, or call 9919193538 for assistance."
            }), 400

    is_valid_coord, is_eligible_coord, distance_meters, coord_err = validate_coordinates(latitude, longitude)
    if not is_valid_coord:
        return jsonify({"error": f"Invalid delivery coordinates: {coord_err}"}), 400

    if not is_eligible_coord:
        distance_km = round(distance_meters / 1000.0, 2)
        return jsonify({
            "error": f"Delivery address is outside our 2 km service area ({distance_km} km away). We deliver within a 2 km radius of Sanjay Kirana Store, Harraiya, Basti (PIN 272155). For assistance, call 9919193538.",
            "distance_km": distance_km,
            "max_radius_km": 2.0
        }), 400

    if not isinstance(items, list) or len(items) == 0:
        return jsonify({"error": "The 'items' array must be a non-empty list."}), 400

    # Validate each item structure
    parsed_items = []
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            return jsonify({"error": f"Item at index {idx} must be a valid JSON object."}), 400

        product_id = item.get("product_id")
        quantity = item.get("quantity")

        if product_id is None or not isinstance(product_id, int):
            return jsonify({"error": f"Item at index {idx} must have an integer 'product_id'."}), 400

        if quantity is None or not isinstance(quantity, int) or quantity <= 0:
            return jsonify({"error": f"Item at index {idx} must have an integer 'quantity' greater than 0."}), 400

        parsed_items.append({
            "product_id": product_id,
            "quantity": quantity
        })

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Check idempotency key to prevent accidental duplicate orders on network retries
        idempotency_key = request.headers.get("Idempotency-Key") or data.get("idempotency_key")
        if idempotency_key and isinstance(idempotency_key, str) and idempotency_key.strip():
            idempotency_key = idempotency_key.strip()
            cursor.execute("""
                SELECT 
                    id, order_id, user_id, customer_name, customer_phone, delivery_address,
                    city, pincode, payment_method, subtotal, delivery_charge,
                    total_amount, total_items, status, created_at, tracking_token
                FROM orders
                WHERE idempotency_key = %s;
            """, (idempotency_key,))
            existing_order_row = cursor.fetchone()
            if existing_order_row:
                e_id = existing_order_row[0]
                cursor.execute("""
                    SELECT id, product_id, product_name, product_size, product_image,
                           unit_price, quantity, total_price
                    FROM order_items
                    WHERE order_id = %s;
                """, (e_id,))
                e_item_rows = cursor.fetchall()
                e_items = []
                for it in e_item_rows:
                    e_items.append({
                        "id": it[0],
                        "productId": it[1],
                        "product_id": it[1],
                        "productName": it[2],
                        "product_name": it[2],
                        "name": it[2],
                        "size": it[3],
                        "image": it[4],
                        "unitPrice": float(it[5]),
                        "unit_price": float(it[5]),
                        "price": float(it[5]),
                        "quantity": it[6],
                        "totalPrice": float(it[7]),
                        "total_price": float(it[7])
                    })
                created_dt = existing_order_row[14]
                tr_token = existing_order_row[15]
                cursor.close()
                connection.close()
                return jsonify({
                    "message": "Order already recorded (idempotent replay).",
                    "is_idempotent_replay": True,
                    "order": {
                        "id": e_id,
                        "orderId": existing_order_row[1],
                        "order_id": existing_order_row[1],
                        "userId": existing_order_row[2],
                        "user_id": existing_order_row[2],
                        "customerName": existing_order_row[3],
                        "customer_name": existing_order_row[3],
                        "customerPhone": existing_order_row[4],
                        "customer_phone": existing_order_row[4],
                        "deliveryAddress": existing_order_row[5],
                        "delivery_address": existing_order_row[5],
                        "city": existing_order_row[6],
                        "pincode": existing_order_row[7],
                        "paymentMethod": existing_order_row[8],
                        "payment_method": existing_order_row[8],
                        "subtotal": float(existing_order_row[9]),
                        "deliveryCharge": float(existing_order_row[10]),
                        "delivery_charge": float(existing_order_row[10]),
                        "total": float(existing_order_row[11]),
                        "totalAmount": float(existing_order_row[11]),
                        "total_amount": float(existing_order_row[11]),
                        "totalItems": existing_order_row[12],
                        "total_items": existing_order_row[12],
                        "status": existing_order_row[13],
                        "createdAt": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                        "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                        "trackingToken": tr_token,
                        "tracking_token": tr_token,
                        "trackingUrl": f"/track-order/{existing_order_row[1]}?token={tr_token}",
                        "idempotencyKey": idempotency_key,
                        "idempotency_key": idempotency_key,
                        "items": e_items
                    }
                }), 200
        else:
            idempotency_key = f"auto_{secrets.token_hex(16)}"

        # Consolidate duplicate product_ids if provided in the payload
        aggregated_items = {}
        for item in parsed_items:
            pid = item["product_id"]
            qty = item["quantity"]
            aggregated_items[pid] = aggregated_items.get(pid, 0) + qty

        # Fetch product information and lock rows using SELECT ... FOR UPDATE
        sorted_pids = sorted(aggregated_items.keys())
        placeholders = ', '.join(['%s'] * len(sorted_pids))

        cursor.execute(f"""
            SELECT id, name, size, image, price, stock
            FROM products
            WHERE id IN ({placeholders})
            FOR UPDATE;
        """, tuple(sorted_pids))

        product_rows = cursor.fetchall()
        products_by_id = {row[0]: row for row in product_rows}

        # Check that every requested product exists
        for pid in sorted_pids:
            if pid not in products_by_id:
                connection.rollback()
                cursor.close()
                connection.close()
                return jsonify({"error": f"Product with id {pid} not found."}), 404

        # Validate stock and calculate prices
        subtotal = 0.0
        total_items = 0
        prepared_order_items = []

        for pid, qty in aggregated_items.items():
            prod = products_by_id[pid]
            # row: 0: id, 1: name, 2: size, 3: image, 4: price, 5: stock
            name = prod[1]
            size = prod[2]
            image = prod[3]
            unit_price = float(prod[4])
            available_stock = prod[5]

            if qty > available_stock:
                connection.rollback()
                cursor.close()
                connection.close()
                return jsonify({
                    "error": f"Insufficient stock for product '{name}' (ID: {pid}). Requested: {qty}, Available: {available_stock}."
                }), 400

            item_total = round(unit_price * qty, 2)
            subtotal += item_total
            total_items += qty

            prepared_order_items.append({
                "product_id": pid,
                "product_name": name,
                "product_size": size,
                "product_image": image,
                "unit_price": unit_price,
                "quantity": qty,
                "total_price": item_total
            })

        subtotal = round(subtotal, 2)
        # Fixed delivery charge: ₹40 when subtotal < ₹500, ₹0 when subtotal >= ₹500
        delivery_charge = 0.0 if subtotal >= 500.0 else 40.0
        total_amount = round(subtotal + delivery_charge, 2)

        # Generate unique order ID beginning with SK
        order_id = f"SK{int(time.time() * 1000)}{secrets.randbelow(1000):03d}"
        tracking_token = secrets.token_urlsafe(32)

        # Resolve user_id from auth token or existing/new customer record
        user_id = None
        if getattr(request, "user", None):
            user_role = request.user.get("role")
            if user_role == "customer":
                try:
                    user_id = int(request.user.get("sub"))
                except (ValueError, TypeError):
                    pass

        if user_id is None:
            cursor.execute("SELECT id FROM users WHERE phone = %s;", (customer_phone,))
            u_row = cursor.fetchone()
            if u_row:
                user_id = u_row[0]
            else:
                cursor.execute("""
                    INSERT INTO users (phone, name)
                    VALUES (%s, %s)
                    ON CONFLICT (phone) DO UPDATE
                        SET name = COALESCE(users.name, EXCLUDED.name)
                    RETURNING id;
                """, (customer_phone, customer_name))
                user_id = cursor.fetchone()[0]
        else:
            cursor.execute("""
                UPDATE users
                SET name = COALESCE(name, %s)
                WHERE id = %s;
            """, (customer_name, user_id))

        # Insert order into orders table with linked user_id, validated coordinates, tracking token & idempotency key
        cursor.execute("""
            INSERT INTO orders (
                order_id, user_id, customer_name, customer_phone, delivery_address, city, pincode,
                payment_method, subtotal, delivery_charge, total_amount, total_items, status,
                delivery_latitude, delivery_longitude, delivery_distance_meters,
                idempotency_key, tracking_token
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING id, created_at;
        """, (
            order_id, user_id, customer_name, customer_phone, delivery_address, city, pincode,
            payment_method, subtotal, delivery_charge, total_amount, total_items, "Order Placed",
            float(latitude), float(longitude), distance_meters,
            idempotency_key, tracking_token
        ))

        order_res = cursor.fetchone()
        internal_order_id = order_res[0]
        created_at = order_res[1]

        # Insert each item into order_items and decrease product stock
        created_items = []
        for item in prepared_order_items:
            cursor.execute("""
                INSERT INTO order_items (
                    order_id, product_id, product_name, product_size, product_image,
                    unit_price, quantity, total_price
                ) VALUES (
                    %s, %s, %s, %s, %s, %s, %s, %s
                ) RETURNING id;
            """, (
                internal_order_id,
                item["product_id"],
                item["product_name"],
                item["product_size"],
                item["product_image"],
                item["unit_price"],
                item["quantity"],
                item["total_price"]
            ))
            item_id = cursor.fetchone()[0]

            # Decrease product stock
            cursor.execute("""
                UPDATE products
                SET stock = stock - %s
                WHERE id = %s;
            """, (item["quantity"], item["product_id"]))

            created_items.append({
                "id": item_id,
                "productId": item["product_id"],
                "product_id": item["product_id"],
                "productName": item["product_name"],
                "product_name": item["product_name"],
                "name": item["product_name"],
                "size": item["product_size"],
                "image": item["product_image"],
                "unitPrice": item["unit_price"],
                "unit_price": item["unit_price"],
                "price": item["unit_price"],
                "quantity": item["quantity"],
                "totalPrice": item["total_price"],
                "total_price": item["total_price"]
            })

        # Record initial status entry in order_status_history
        cursor.execute("""
            INSERT INTO order_status_history (
                order_id, status, actor_role, actor_name, notes, created_at
            ) VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
        """, (internal_order_id, "Order Placed", "customer", customer_name, "Order placed successfully by customer."))

        # Record in-site notification for store owner
        cursor.execute("""
            INSERT INTO owner_notifications (
                order_id, order_number, title, message, is_read, created_at
            ) VALUES (%s, %s, %s, %s, FALSE, CURRENT_TIMESTAMP);
        """, (
            internal_order_id,
            order_id,
            f"New Order #{order_id}",
            f"New order from {customer_name} for ₹{total_amount:.2f} ({total_items} items) via {payment_method.upper()}."
        ))

        # Record non-blocking WhatsApp alert into outbox
        wa_recipient = os.getenv("OWNER_WHATSAPP_PHONE") or OWNER_PHONE or OWNER_WHATSAPP_DEFAULT
        wa_msg = format_order_whatsapp_message({
            "order_id": order_id,
            "customer_name": customer_name,
            "total_amount": f"{total_amount:.2f}",
            "payment_method": payment_method,
            "delivery_address": delivery_address,
            "city": city,
            "items": prepared_order_items,
            "total_items": total_items
        })
        outbox_id = record_whatsapp_outbox(cursor, internal_order_id, wa_recipient, wa_msg)

        # Commit PostgreSQL transaction
        connection.commit()
        cursor.close()
        connection.close()

        # Non-blocking async dispatch of WhatsApp alert
        try:
            threading.Thread(
                target=dispatch_whatsapp_message,
                args=(outbox_id, wa_recipient, wa_msg, get_db_connection),
                daemon=True
            ).start()
        except Exception as dispatch_err:
            app.logger.warning(f"Could not spawn WhatsApp dispatch thread: {dispatch_err}")

        return jsonify({
            "message": "Order placed successfully!",
            "order": {
                "id": internal_order_id,
                "orderId": order_id,
                "order_id": order_id,
                "userId": user_id,
                "user_id": user_id,
                "customerName": customer_name,
                "customer_name": customer_name,
                "customerPhone": customer_phone,
                "customer_phone": customer_phone,
                "deliveryAddress": delivery_address,
                "delivery_address": delivery_address,
                "city": city,
                "pincode": pincode,
                "deliveryLatitude": float(latitude),
                "delivery_latitude": float(latitude),
                "deliveryLongitude": float(longitude),
                "delivery_longitude": float(longitude),
                "deliveryDistanceMeters": float(distance_meters),
                "delivery_distance_meters": float(distance_meters),
                "deliveryDistanceKm": round(distance_meters / 1000.0, 2),
                "paymentMethod": payment_method,
                "payment_method": payment_method,
                "subtotal": subtotal,
                "deliveryCharge": delivery_charge,
                "delivery_charge": delivery_charge,
                "total": total_amount,
                "totalAmount": total_amount,
                "total_amount": total_amount,
                "totalItems": total_items,
                "total_items": total_items,
                "status": "Order Placed",
                "trackingToken": tracking_token,
                "tracking_token": tracking_token,
                "trackingUrl": f"/track-order/{order_id}?token={tracking_token}",
                "idempotencyKey": idempotency_key,
                "idempotency_key": idempotency_key,
                "createdAt": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
                "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
                "items": created_items
            }
        }), 201

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Customer Order History (Requires role='customer')
# ---------------------------------------------------------------------------

@app.route("/orders", methods=["GET"])
@require_auth
def get_user_orders():
    """Returns past orders for the authenticated customer."""
    user = request.user
    role = user.get("role")
    if role != "customer":
        return jsonify({"error": "This endpoint is for customer orders. For admin orders, use /admin/orders."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                id, order_id, customer_name, customer_phone, delivery_address,
                city, pincode, payment_method, subtotal, delivery_charge,
                total_amount, total_items, status, created_at,
                delivery_latitude, delivery_longitude, delivery_distance_meters
            FROM orders
            WHERE user_id = %s
            ORDER BY created_at DESC;
        """, (user_id,))
        order_rows = cursor.fetchall()

        if not order_rows:
            cursor.close()
            connection.close()
            return jsonify([]), 200

        order_ids = [row[0] for row in order_rows]
        cursor.execute("""
            SELECT 
                id, order_id, product_id, product_name, product_size,
                product_image, unit_price, quantity, total_price
            FROM order_items
            WHERE order_id = ANY(%s)
            ORDER BY id;
        """, (order_ids,))
        item_rows = cursor.fetchall()

        cursor.close()
        connection.close()

        items_by_order = {}
        for it in item_rows:
            internal_oid = it[1]
            if internal_oid not in items_by_order:
                items_by_order[internal_oid] = []
            items_by_order[internal_oid].append({
                "id": it[0],
                "productId": it[2],
                "product_id": it[2],
                "name": it[3],
                "productName": it[3],
                "product_name": it[3],
                "size": it[4],
                "image": it[5],
                "unitPrice": float(it[6]),
                "unit_price": float(it[6]),
                "price": float(it[6]),
                "quantity": it[7],
                "totalPrice": float(it[8]),
                "total_price": float(it[8]),
            })

        orders = []
        for row in order_rows:
            oid = row[0]
            created_dt = row[13]
            orders.append({
                "id": oid,
                "orderId": row[1],
                "order_id": row[1],
                "customerName": row[2],
                "customer_name": row[2],
                "customerPhone": row[3],
                "customer_phone": row[3],
                "deliveryAddress": row[4],
                "delivery_address": row[4],
                "city": row[5],
                "pincode": row[6],
                "deliveryLatitude": float(row[14]) if row[14] is not None else None,
                "delivery_latitude": float(row[14]) if row[14] is not None else None,
                "deliveryLongitude": float(row[15]) if row[15] is not None else None,
                "delivery_longitude": float(row[15]) if row[15] is not None else None,
                "deliveryDistanceMeters": float(row[16]) if row[16] is not None else None,
                "delivery_distance_meters": float(row[16]) if row[16] is not None else None,
                "deliveryDistanceKm": round(float(row[16]) / 1000.0, 2) if row[16] is not None else None,
                "paymentMethod": row[7],
                "payment_method": row[7],
                "subtotal": float(row[8]),
                "deliveryCharge": float(row[9]),
                "delivery_charge": float(row[9]),
                "total": float(row[10]),
                "totalAmount": float(row[10]),
                "total_amount": float(row[10]),
                "totalItems": row[11],
                "total_items": row[11],
                "status": row[12],
                "createdAt": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "items": items_by_order.get(oid, [])
            })

        return jsonify(orders), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Order Tracking & Status Management (Customer & Staff)
# ---------------------------------------------------------------------------

STANDARD_TRACKING_STAGES = [
    {
        "status": "Order Placed",
        "title": "Order Placed",
        "message": "Your order has been placed.",
        "description": "Your order has been received and committed to our system.",
    },
    {
        "status": "Order Confirmed",
        "title": "Order Confirmed",
        "message": "Your order has been confirmed.",
        "description": "Your order details have been verified by store staff.",
    },
    {
        "status": "Order Packed",
        "title": "Order Packed",
        "message": "Your order is being packed.",
        "description": "Your items have been carefully packed at Sanjay Kirana Store.",
    },
    {
        "status": "Order Dispatched",
        "title": "Order Dispatched",
        "message": "Your order has been dispatched.",
        "description": "Your package has left Sanjay Kirana Store and is on its way.",
    },
    {
        "status": "Out for Delivery",
        "title": "Out for Delivery",
        "message": "Your order is out for delivery and will reach your doorstep soon.",
        "description": "Our delivery partner is in your neighbourhood and approaching your address.",
    },
    {
        "status": "Delivered",
        "title": "Delivered",
        "message": "Your order has been delivered.",
        "description": "Package delivered to your doorstep. Thank you for shopping with Sanjay Kirana Store!",
    },
]


def execute_order_status_update(cursor, order_id_param, new_status, actor_role, actor_name, notes=None):
    """
    Core authoritative status updater with transition validation and inventory restoration.
    """
    cursor.execute("""
        SELECT id, order_id, status
        FROM orders
        WHERE order_id = %s OR id::text = %s
        FOR UPDATE;
    """, (str(order_id_param), str(order_id_param)))
    order_row = cursor.fetchone()
    if not order_row:
        return None, "Order not found", 404

    internal_id = order_row[0]
    public_id = order_row[1]
    current_status = order_row[2]

    # Normalize Confirmed -> Order Confirmed
    if current_status == "Confirmed":
        current_status = "Order Confirmed"

    if current_status == new_status:
        return {
            "id": internal_id,
            "order_id": public_id,
            "status": current_status,
            "message": f"Order is already in '{new_status}' status."
        }, None, 200

    allowed_next = VALID_STATUS_TRANSITIONS.get(current_status, [])
    if new_status not in allowed_next:
        return None, f"Invalid status transition from '{current_status}' to '{new_status}'. Allowed transitions: {', '.join(allowed_next) if allowed_next else 'None (Terminal state)'}.", 400

    # If transitioning to Cancelled: automatically restore stock for all products in this order
    if new_status == "Cancelled":
        cursor.execute("""
            SELECT product_id, quantity
            FROM order_items
            WHERE order_id = %s;
        """, (internal_id,))
        order_items = cursor.fetchall()
        for pid, qty in order_items:
            cursor.execute("""
                UPDATE products
                SET stock = stock + %s
                WHERE id = %s;
            """, (qty, pid))

    # Update orders table
    cursor.execute("""
        UPDATE orders
        SET status = %s
        WHERE id = %s
        RETURNING id, order_id, status;
    """, (new_status, internal_id))
    updated = cursor.fetchone()

    # Log into order_status_history
    history_notes = notes or f"Status changed from {current_status} to {new_status}"
    cursor.execute("""
        INSERT INTO order_status_history (
            order_id, status, actor_role, actor_name, notes, created_at
        ) VALUES (%s, %s, %s, %s, %s, CURRENT_TIMESTAMP);
    """, (internal_id, new_status, actor_role, actor_name, history_notes))

    return {
        "id": updated[0],
        "order_id": updated[1],
        "orderId": updated[1],
        "status": updated[2],
        "message": f"Order status successfully updated to '{new_status}'."
    }, None, 200


@app.route("/orders/<order_param>/tracking", methods=["GET"])
@optional_auth
def get_order_tracking(order_param):
    """
    Dedicated order tracking endpoint.
    Accessible by:
      - Authenticated customer owner of the order.
      - Authenticated staff (admin or owner).
      - Public tracking URL with ?token=<tracking_token> (with masked PII).
    Returns order details, timeline stages, latest update timestamp, and status history.
    """
    token_param = request.args.get("token", "").strip()
    auth_user = getattr(request, "user", None)

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                id, order_id, user_id, customer_name, customer_phone, delivery_address,
                city, pincode, payment_method, subtotal, delivery_charge,
                total_amount, total_items, status, created_at, tracking_token,
                delivery_latitude, delivery_longitude, delivery_distance_meters
            FROM orders
            WHERE order_id = %s OR id::text = %s;
        """, (str(order_param), str(order_param)))
        order_row = cursor.fetchone()

        if not order_row:
            cursor.close()
            connection.close()
            return jsonify({"error": "Order not found."}), 404

        internal_id = order_row[0]
        order_id = order_row[1]
        order_user_id = order_row[2]
        customer_name = order_row[3]
        customer_phone = order_row[4]
        delivery_address = order_row[5]
        city = order_row[6]
        pincode = order_row[7]
        payment_method = order_row[8]
        subtotal = float(order_row[9])
        delivery_charge = float(order_row[10])
        total_amount = float(order_row[11])
        total_items = order_row[12]
        status = order_row[13]
        created_at = order_row[14]
        db_tracking_token = order_row[15]
        delivery_lat = float(order_row[16]) if order_row[16] is not None else None
        delivery_lon = float(order_row[17]) if order_row[17] is not None else None
        delivery_dist = float(order_row[18]) if order_row[18] is not None else None

        # Normalize Confirmed -> Order Confirmed
        if status == "Confirmed":
            status = "Order Confirmed"

        # Authorization evaluation
        is_staff = False
        is_owner = False
        is_token_authorized = bool(token_param and token_param == db_tracking_token)

        if auth_user:
            role = auth_user.get("role")
            if role in ("admin", "owner"):
                is_staff = True
            elif role == "customer":
                sub_id = auth_user.get("sub")
                u_phone = auth_user.get("phone")
                if (sub_id and int(sub_id) == order_user_id) or (u_phone and u_phone == customer_phone):
                    is_owner = True

        if not (is_staff or is_owner or is_token_authorized):
            cursor.close()
            connection.close()
            return jsonify({
                "error": "You are not authorized to track this order. Please log in to your customer account or use your secure tracking link."
            }), 403

        # Fetch items
        cursor.execute("""
            SELECT id, product_id, product_name, product_size, product_image,
                   unit_price, quantity, total_price
            FROM order_items
            WHERE order_id = %s
            ORDER BY id;
        """, (internal_id,))
        item_rows = cursor.fetchall()
        items = []
        for it in item_rows:
            items.append({
                "id": it[0],
                "productId": it[1],
                "product_id": it[1],
                "name": it[2],
                "productName": it[2],
                "product_name": it[2],
                "size": it[3],
                "image": it[4],
                "unitPrice": float(it[5]),
                "unit_price": float(it[5]),
                "price": float(it[5]),
                "quantity": it[6],
                "totalPrice": float(it[7]),
                "total_price": float(it[7]),
            })

        # Fetch status history
        cursor.execute("""
            SELECT status, actor_role, actor_name, notes, created_at
            FROM order_status_history
            WHERE order_id = %s
            ORDER BY created_at ASC;
        """, (internal_id,))
        history_rows = cursor.fetchall()
        status_history = []
        history_timestamps = {}
        last_updated_at = created_at
        for h in history_rows:
            h_status = h[0]
            if h_status == "Confirmed":
                h_status = "Order Confirmed"
            h_dt = h[4]
            history_timestamps[h_status] = h_dt.isoformat() if hasattr(h_dt, "isoformat") else str(h_dt)
            last_updated_at = h_dt
            status_history.append({
                "status": h_status,
                "actorRole": h[1],
                "actor_role": h[1],
                "actorName": h[2],
                "actor_name": h[2],
                "notes": h[3],
                "createdAt": h_dt.isoformat() if hasattr(h_dt, "isoformat") else str(h_dt),
                "created_at": h_dt.isoformat() if hasattr(h_dt, "isoformat") else str(h_dt),
            })

        cursor.close()
        connection.close()

        # Build timeline
        stage_names = [s["status"] for s in STANDARD_TRACKING_STAGES]
        current_idx = stage_names.index(status) if status in stage_names else -1
        is_cancelled = (status == "Cancelled")

        timeline = []
        for idx, stage in enumerate(STANDARD_TRACKING_STAGES):
            s_name = stage["status"]
            completed = False
            current = False
            if not is_cancelled and current_idx >= 0:
                completed = (idx <= current_idx)
                current = (idx == current_idx)

            timestamp = history_timestamps.get(s_name)
            if not timestamp and idx == 0:
                timestamp = created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at)

            timeline.append({
                "status": s_name,
                "title": stage["title"],
                "message": stage["message"],
                "description": stage["description"],
                "completed": completed,
                "current": current,
                "timestamp": timestamp if completed else None
            })

        # Mask sensitive PII for unauthenticated public token visitors
        is_public_view = not (is_staff or is_owner)
        resp_phone = mask_phone(customer_phone) if is_public_view else customer_phone
        resp_address = delivery_address
        if is_public_view and len(delivery_address) > 15:
            resp_address = f"{delivery_address[:10]}... ({city})"

        # Cancellation rules: customer can cancel only when 'Order Placed'; staff can cancel any non-delivered
        can_cancel = False
        if is_owner and status == "Order Placed":
            can_cancel = True
        elif is_staff and status not in ("Delivered", "Cancelled"):
            can_cancel = True

        return jsonify({
            "order": {
                "id": internal_id,
                "orderId": order_id,
                "order_id": order_id,
                "status": status,
                "isCancelled": is_cancelled,
                "is_cancelled": is_cancelled,
                "customerName": customer_name,
                "customer_name": customer_name,
                "customerPhone": resp_phone,
                "customer_phone": resp_phone,
                "deliveryAddress": resp_address,
                "delivery_address": resp_address,
                "city": city,
                "pincode": pincode,
                "latitude": delivery_lat,
                "longitude": delivery_lon,
                "deliveryDistanceKm": round(delivery_dist / 1000.0, 2) if delivery_dist is not None else None,
                "paymentMethod": payment_method,
                "payment_method": payment_method,
                "subtotal": subtotal,
                "deliveryCharge": delivery_charge,
                "delivery_charge": delivery_charge,
                "total": total_amount,
                "totalAmount": total_amount,
                "total_amount": total_amount,
                "totalItems": total_items,
                "total_items": total_items,
                "items": items,
                "timeline": timeline,
                "statusHistory": status_history,
                "status_history": status_history,
                "createdAt": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
                "created_at": created_at.isoformat() if hasattr(created_at, "isoformat") else str(created_at),
                "lastUpdatedAt": last_updated_at.isoformat() if hasattr(last_updated_at, "isoformat") else str(last_updated_at),
                "last_updated_at": last_updated_at.isoformat() if hasattr(last_updated_at, "isoformat") else str(last_updated_at),
                "canCancel": can_cancel,
                "can_cancel": can_cancel,
                "isPublicView": is_public_view,
                "trackingToken": db_tracking_token if not is_public_view else None
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/orders/<order_param>/status", methods=["PATCH"])
@require_admin
def update_order_status_route(order_param):
    """
    Staff status update endpoint (supports both internal ID and public SK... order_id).
    Validates transition, automatically restores stock if Cancelled, and logs history.
    """
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    new_status = data.get("status")
    notes = data.get("notes")

    if not new_status or new_status not in ORDER_STATUSES:
        return jsonify({
            "error": f"Invalid status. Must be one of: {', '.join(ORDER_STATUSES)}"
        }), 400

    admin_role = request.user.get("role", "admin")
    admin_name = request.user.get("username") or request.user.get("name") or "Store Staff"

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        res, err, code = execute_order_status_update(
            cursor, order_param, new_status, admin_role, admin_name, notes
        )
        if err:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": err}), code

        connection.commit()
        cursor.close()
        connection.close()
        return jsonify(res), code

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/orders/<order_param>/cancel", methods=["POST"])
@require_auth
def customer_cancel_order(order_param):
    """
    Customer cancellation endpoint.
    Customers may only cancel while status is 'Order Placed'.
    Restores product inventory and logs the cancellation event.
    """
    auth_user = request.user
    role = auth_user.get("role")
    user_id = int(auth_user.get("sub")) if auth_user.get("sub") else None

    data = request.get_json(silent=True) or {}
    notes = data.get("notes", "Cancelled by customer")

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Check ownership
        cursor.execute("""
            SELECT id, user_id, customer_phone, status
            FROM orders
            WHERE order_id = %s OR id::text = %s
            FOR UPDATE;
        """, (str(order_param), str(order_param)))
        order_row = cursor.fetchone()
        if not order_row:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": "Order not found."}), 404

        order_owner_id = order_row[1]
        order_owner_phone = order_row[2]
        current_status = order_row[3]

        if role == "customer":
            u_phone = auth_user.get("phone")
            if (user_id and user_id != order_owner_id) and (u_phone and u_phone != order_owner_phone):
                connection.rollback()
                cursor.close()
                connection.close()
                return jsonify({"error": "Forbidden. You can only cancel your own orders."}), 403

            if current_status != "Order Placed":
                connection.rollback()
                cursor.close()
                connection.close()
                return jsonify({
                    "error": f"Order cannot be cancelled in '{current_status}' status. Orders can only be cancelled while in 'Order Placed' status. Please call 9919193538 for assistance."
                }), 400

        actor_name = auth_user.get("name") or auth_user.get("username") or "Customer"
        res, err, code = execute_order_status_update(
            cursor, order_param, "Cancelled", role, actor_name, notes
        )
        if err:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": err}), code

        connection.commit()
        cursor.close()
        connection.close()
        return jsonify(res), code

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Owner Notification Centre & WhatsApp Outbox Endpoints
# ---------------------------------------------------------------------------

@app.route("/owner/notifications", methods=["GET"])
@require_admin
def get_owner_notifications():
    """
    Returns the persistent notifications list for the store owner/admin.
    Includes unread badge count.
    """
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT id, order_id, order_number, title, message, is_read, created_at
            FROM owner_notifications
            ORDER BY created_at DESC
            LIMIT 50;
        """)
        rows = cursor.fetchall()

        cursor.execute("""
            SELECT COUNT(*)
            FROM owner_notifications
            WHERE is_read = FALSE;
        """)
        unread_count = cursor.fetchone()[0]

        cursor.close()
        connection.close()

        notifications = []
        for r in rows:
            dt = r[6]
            notifications.append({
                "id": r[0],
                "orderId": r[1],
                "order_id": r[1],
                "orderNumber": r[2],
                "order_number": r[2],
                "title": r[3],
                "message": r[4],
                "isRead": r[5],
                "is_read": r[5],
                "createdAt": dt.isoformat() if hasattr(dt, "isoformat") else str(dt),
                "created_at": dt.isoformat() if hasattr(dt, "isoformat") else str(dt),
            })

        return jsonify({
            "notifications": notifications,
            "unread_count": unread_count,
            "unreadCount": unread_count
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/owner/notifications/<int:notification_id>/read", methods=["PATCH"])
@require_admin
def mark_owner_notification_read(notification_id):
    """Marks a single notification as read."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE owner_notifications
            SET is_read = TRUE
            WHERE id = %s
            RETURNING id, is_read;
        """, (notification_id,))
        updated = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        if not updated:
            return jsonify({"error": "Notification not found."}), 404

        return jsonify({"success": True, "id": updated[0], "is_read": updated[1]}), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/owner/notifications/mark-all-read", methods=["POST"])
@require_admin
def mark_all_owner_notifications_read():
    """Marks all owner notifications as read."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE owner_notifications
            SET is_read = TRUE
            WHERE is_read = FALSE;
        """)
        count = cursor.rowcount
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"success": True, "marked_count": count}), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/owner/whatsapp/status", methods=["GET"])
@require_admin
def get_owner_whatsapp_status():
    """
    Returns WhatsApp notification status and outbox statistics.
    """
    enabled = os.getenv("WHATSAPP_ENABLED", "false").lower() in ("true", "1", "yes")
    has_token = bool(os.getenv("WHATSAPP_ACCESS_TOKEN", "").strip())
    target_phone = os.getenv("OWNER_WHATSAPP_PHONE") or OWNER_PHONE or OWNER_WHATSAPP_DEFAULT

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT status, COUNT(*)
            FROM whatsapp_outbox
            GROUP BY status;
        """)
        stats_rows = cursor.fetchall()
        cursor.close()
        connection.close()

        counts = {r[0]: r[1] for r in stats_rows}
        return jsonify({
            "enabled": enabled,
            "configured": bool(enabled and has_token),
            "recipient_phone": target_phone,
            "outbox_counts": counts,
            "setup_guidance": "Set WHATSAPP_ENABLED=true and WHATSAPP_ACCESS_TOKEN in backend/.env to activate live Meta Cloud API message delivery to owner."
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Customer Account & Profile APIs (role='customer' strictly enforced)
# ---------------------------------------------------------------------------

@app.route("/account/profile", methods=["GET"])
@require_auth
def get_customer_profile():
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, phone, name, created_at FROM users WHERE id = %s;", (user_id,))
        user_row = cursor.fetchone()
        if not user_row:
            cursor.close()
            connection.close()
            return jsonify({"error": "Customer not found."}), 404

        cursor.execute("SELECT COUNT(*) FROM orders WHERE user_id = %s;", (user_id,))
        total_orders = cursor.fetchone()[0]

        cursor.execute("""
            SELECT order_id, created_at, status, total_amount
            FROM orders
            WHERE user_id = %s
            ORDER BY created_at DESC
            LIMIT 1;
        """, (user_id,))
        recent_order_row = cursor.fetchone()
        recent_order = None
        if recent_order_row:
            recent_order = {
                "order_id": recent_order_row[0],
                "created_at": recent_order_row[1].isoformat() if hasattr(recent_order_row[1], "isoformat") else str(recent_order_row[1]),
                "status": recent_order_row[2],
                "total_amount": float(recent_order_row[3]),
            }

        cursor.execute("SELECT COUNT(*) FROM customer_addresses WHERE user_id = %s;", (user_id,))
        saved_addresses_count = cursor.fetchone()[0]

        cursor.close()
        connection.close()

        created_dt = user_row[3]
        return jsonify({
            "id": user_row[0],
            "phone": user_row[1],
            "name": user_row[2] or "",
            "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
            "total_orders": total_orders,
            "recent_order": recent_order,
            "saved_addresses_count": saved_addresses_count,
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/profile", methods=["PUT"])
@require_auth
def update_customer_profile():
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    # Phone is immutable through this endpoint
    if "phone" in data and str(data["phone"]).strip() != str(user.get("phone", "")).strip():
        return jsonify({"error": "Phone number cannot be changed directly."}), 400

    name = data.get("name")
    if name is not None:
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 150:
            return jsonify({"error": "Name must be a valid string between 1 and 150 characters."}), 400
        name = name.strip()

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        if name is not None:
            cursor.execute("""
                UPDATE users
                SET name = %s
                WHERE id = %s
                RETURNING id, phone, name, created_at;
            """, (name, user_id))
            updated_row = cursor.fetchone()
            check_customer_profile_completed(cursor, user_id)
            connection.commit()
        else:
            cursor.execute("SELECT id, phone, name, created_at FROM users WHERE id = %s;", (user_id,))
            updated_row = cursor.fetchone()

        cursor.close()
        connection.close()

        if not updated_row:
            return jsonify({"error": "Customer not found."}), 404

        created_dt = updated_row[3]
        return jsonify({
            "message": "Profile updated successfully.",
            "profile": {
                "id": updated_row[0],
                "phone": updated_row[1],
                "name": updated_row[2] or "",
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Customer Saved Addresses APIs
# ---------------------------------------------------------------------------

@app.route("/account/addresses", methods=["GET"])
@require_auth
def get_customer_addresses():
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                id, recipient_name, phone, street_address, landmark,
                locality, city, state, pincode, delivery_latitude,
                delivery_longitude, label, is_default, created_at, updated_at
            FROM customer_addresses
            WHERE user_id = %s
            ORDER BY is_default DESC, updated_at DESC;
        """, (user_id,))
        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        addresses = []
        for r in rows:
            addresses.append({
                "id": r[0],
                "recipient_name": r[1],
                "recipientName": r[1],
                "phone": r[2],
                "street_address": r[3],
                "streetAddress": r[3],
                "landmark": r[4] or "",
                "locality": r[5] or "",
                "city": r[6],
                "state": r[7],
                "pincode": r[8],
                "delivery_latitude": float(r[9]) if r[9] is not None else None,
                "deliveryLatitude": float(r[9]) if r[9] is not None else None,
                "delivery_longitude": float(r[10]) if r[10] is not None else None,
                "deliveryLongitude": float(r[10]) if r[10] is not None else None,
                "label": r[11],
                "is_default": bool(r[12]),
                "isDefault": bool(r[12]),
                "created_at": r[13].isoformat() if hasattr(r[13], "isoformat") else str(r[13]),
                "updated_at": r[14].isoformat() if hasattr(r[14], "isoformat") else str(r[14]),
            })

        return jsonify(addresses), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/addresses", methods=["POST"])
@require_auth
def create_customer_address():
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    recipient_name = data.get("recipient_name") or data.get("recipientName")
    phone = data.get("phone")
    street_address = data.get("street_address") or data.get("streetAddress")
    landmark = data.get("landmark", "")
    locality = data.get("locality", "")
    city = data.get("city", "Harraiya")
    state = data.get("state", "Uttar Pradesh")
    pincode = data.get("pincode", "272155")
    label = data.get("label", "Home")
    is_default = bool(data.get("is_default", data.get("isDefault", False)))

    lat = data.get("delivery_latitude") if data.get("delivery_latitude") is not None else data.get("deliveryLatitude")
    lng = data.get("delivery_longitude") if data.get("delivery_longitude") is not None else data.get("deliveryLongitude")

    if not recipient_name or not isinstance(recipient_name, str) or not recipient_name.strip() or len(recipient_name.strip()) > 150:
        return jsonify({"error": "Invalid recipient_name. Must be between 1 and 150 characters."}), 400
    if not phone or not isinstance(phone, str) or not _INDIAN_MOBILE_RE.match(phone.strip()):
        return jsonify({"error": "Invalid phone. Must be a valid 10-digit Indian mobile number."}), 400
    if not street_address or not isinstance(street_address, str) or not street_address.strip():
        return jsonify({"error": "street_address is required."}), 400

    recipient_name = recipient_name.strip()
    phone = phone.strip()
    street_address = street_address.strip()
    landmark = landmark.strip() if isinstance(landmark, str) else ""
    locality = locality.strip() if isinstance(locality, str) else ""
    city = city.strip() if isinstance(city, str) else "Harraiya"
    state = state.strip() if isinstance(state, str) else "Uttar Pradesh"
    pincode = pincode.strip() if isinstance(pincode, str) else "272155"
    label = label.strip() if isinstance(label, str) and label.strip() else "Home"

    # Validate coordinates if provided
    if lat is not None and lng is not None:
        try:
            lat = float(lat)
            lng = float(lng)
            is_valid, _, _, err = validate_coordinates(lat, lng)
            if not is_valid:
                return jsonify({"error": f"Invalid coordinates: {err}"}), 400
        except (ValueError, TypeError):
            return jsonify({"error": "Coordinates must be valid numbers."}), 400
    else:
        lat = None
        lng = None

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Check existing count. If 0, automatically make this default
        cursor.execute("SELECT COUNT(*) FROM customer_addresses WHERE user_id = %s;", (user_id,))
        count = cursor.fetchone()[0]
        if count == 0:
            is_default = True

        if is_default:
            cursor.execute("UPDATE customer_addresses SET is_default = FALSE WHERE user_id = %s;", (user_id,))

        cursor.execute("""
            INSERT INTO customer_addresses (
                user_id, recipient_name, phone, street_address, landmark,
                locality, city, state, pincode, delivery_latitude, delivery_longitude,
                label, is_default
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING id, recipient_name, phone, street_address, landmark, locality, city, state, pincode, delivery_latitude, delivery_longitude, label, is_default, created_at, updated_at;
        """, (
            user_id, recipient_name, phone, street_address, landmark,
            locality, city, state, pincode, lat, lng, label, is_default
        ))
        r = cursor.fetchone()
        check_customer_profile_completed(cursor, user_id)
        connection.commit()
        cursor.close()
        connection.close()

        created_address = {
            "id": r[0],
            "recipient_name": r[1],
            "recipientName": r[1],
            "phone": r[2],
            "street_address": r[3],
            "streetAddress": r[3],
            "landmark": r[4] or "",
            "locality": r[5] or "",
            "city": r[6],
            "state": r[7],
            "pincode": r[8],
            "delivery_latitude": float(r[9]) if r[9] is not None else None,
            "deliveryLatitude": float(r[9]) if r[9] is not None else None,
            "delivery_longitude": float(r[10]) if r[10] is not None else None,
            "deliveryLongitude": float(r[10]) if r[10] is not None else None,
            "label": r[11],
            "is_default": bool(r[12]),
            "isDefault": bool(r[12]),
            "created_at": r[13].isoformat() if hasattr(r[13], "isoformat") else str(r[13]),
            "updated_at": r[14].isoformat() if hasattr(r[14], "isoformat") else str(r[14]),
        }
        return jsonify(created_address), 201

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/addresses/<int:address_id>", methods=["PUT"])
@require_auth
def update_customer_address(address_id):
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, is_default FROM customer_addresses WHERE id = %s AND user_id = %s;", (address_id, user_id))
        existing = cursor.fetchone()
        if not existing:
            cursor.close()
            connection.close()
            return jsonify({"error": "Address not found."}), 404

        current_is_default = existing[1]

        recipient_name = data.get("recipient_name") or data.get("recipientName")
        phone = data.get("phone")
        street_address = data.get("street_address") or data.get("streetAddress")
        landmark = data.get("landmark")
        locality = data.get("locality")
        city = data.get("city", "Harraiya")
        state = data.get("state", "Uttar Pradesh")
        pincode = data.get("pincode", "272155")
        label = data.get("label", "Home")
        is_default = data.get("is_default") if data.get("is_default") is not None else data.get("isDefault")

        if recipient_name is not None:
            if not isinstance(recipient_name, str) or not recipient_name.strip() or len(recipient_name.strip()) > 150:
                return jsonify({"error": "Invalid recipient_name."}), 400
            recipient_name = recipient_name.strip()

        if phone is not None:
            if not isinstance(phone, str) or not _INDIAN_MOBILE_RE.match(phone.strip()):
                return jsonify({"error": "Invalid phone. Must be a 10-digit Indian mobile number."}), 400
            phone = phone.strip()

        if street_address is not None:
            if not isinstance(street_address, str) or not street_address.strip():
                return jsonify({"error": "street_address cannot be blank."}), 400
            street_address = street_address.strip()

        lat = data.get("delivery_latitude") if data.get("delivery_latitude") is not None else data.get("deliveryLatitude")
        lng = data.get("delivery_longitude") if data.get("delivery_longitude") is not None else data.get("deliveryLongitude")

        if lat is not None and lng is not None:
            try:
                lat = float(lat)
                lng = float(lng)
                is_valid, _, _, err = validate_coordinates(lat, lng)
                if not is_valid:
                    return jsonify({"error": f"Invalid coordinates: {err}"}), 400
            except (ValueError, TypeError):
                return jsonify({"error": "Coordinates must be valid numbers."}), 400

        target_is_default = bool(is_default) if is_default is not None else current_is_default

        if target_is_default and not current_is_default:
            cursor.execute("UPDATE customer_addresses SET is_default = FALSE WHERE user_id = %s AND id != %s;", (user_id, address_id))

        cursor.execute("""
            UPDATE customer_addresses
            SET recipient_name = COALESCE(%s, recipient_name),
                phone = COALESCE(%s, phone),
                street_address = COALESCE(%s, street_address),
                landmark = COALESCE(%s, landmark),
                locality = COALESCE(%s, locality),
                city = COALESCE(%s, city),
                state = COALESCE(%s, state),
                pincode = COALESCE(%s, pincode),
                delivery_latitude = COALESCE(%s, delivery_latitude),
                delivery_longitude = COALESCE(%s, delivery_longitude),
                label = COALESCE(%s, label),
                is_default = %s,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
            RETURNING id, recipient_name, phone, street_address, landmark, locality, city, state, pincode, delivery_latitude, delivery_longitude, label, is_default, created_at, updated_at;
        """, (
            recipient_name, phone, street_address, landmark, locality, city, state, pincode,
            lat, lng, label, target_is_default, address_id, user_id
        ))
        r = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        updated_address = {
            "id": r[0],
            "recipient_name": r[1],
            "recipientName": r[1],
            "phone": r[2],
            "street_address": r[3],
            "streetAddress": r[3],
            "landmark": r[4] or "",
            "locality": r[5] or "",
            "city": r[6],
            "state": r[7],
            "pincode": r[8],
            "delivery_latitude": float(r[9]) if r[9] is not None else None,
            "deliveryLatitude": float(r[9]) if r[9] is not None else None,
            "delivery_longitude": float(r[10]) if r[10] is not None else None,
            "deliveryLongitude": float(r[10]) if r[10] is not None else None,
            "label": r[11],
            "is_default": bool(r[12]),
            "isDefault": bool(r[12]),
            "created_at": r[13].isoformat() if hasattr(r[13], "isoformat") else str(r[13]),
            "updated_at": r[14].isoformat() if hasattr(r[14], "isoformat") else str(r[14]),
        }
        return jsonify(updated_address), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/addresses/<int:address_id>", methods=["DELETE"])
@require_auth
def delete_customer_address(address_id):
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, is_default FROM customer_addresses WHERE id = %s AND user_id = %s;", (address_id, user_id))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            connection.close()
            return jsonify({"error": "Address not found."}), 404

        was_default = row[1]
        cursor.execute("DELETE FROM customer_addresses WHERE id = %s AND user_id = %s;", (address_id, user_id))

        # If it was default, elect the next available address as default
        if was_default:
            cursor.execute("""
                UPDATE customer_addresses
                SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
                WHERE id = (
                    SELECT id FROM customer_addresses
                    WHERE user_id = %s
                    ORDER BY updated_at DESC
                    LIMIT 1
                );
            """, (user_id,))

        check_customer_profile_completed(cursor, user_id)
        connection.commit()
        cursor.close()
        connection.close()
        return jsonify({"message": "Address deleted successfully."}), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/addresses/<int:address_id>/default", methods=["PATCH"])
@require_auth
def set_default_customer_address(address_id):
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id FROM customer_addresses WHERE id = %s AND user_id = %s;", (address_id, user_id))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({"error": "Address not found."}), 404

        cursor.execute("UPDATE customer_addresses SET is_default = FALSE WHERE user_id = %s;", (user_id,))
        cursor.execute("""
            UPDATE customer_addresses
            SET is_default = TRUE, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
            RETURNING id, recipient_name, phone, street_address, landmark, locality, city, state, pincode, label, is_default;
        """, (address_id, user_id))
        r = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Default address updated.",
            "address": {
                "id": r[0],
                "recipient_name": r[1],
                "phone": r[2],
                "street_address": r[3],
                "is_default": bool(r[10])
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Reorder Preview API (Safe, Live Verification, Zero Unintended Order Creation)
# ---------------------------------------------------------------------------

@app.route("/account/orders/<order_id_param>/reorder-preview", methods=["POST"])
@require_auth
def reorder_preview(order_id_param):
    """
    Validates past order items against current catalog prices and inventory.
    Returns comparison payload. Never places an order or debits inventory.
    """
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Find order by internal integer id or SK order_id
        cursor.execute("""
            SELECT id, order_id, status, subtotal, delivery_charge, total_amount, total_items, created_at
            FROM orders
            WHERE (id::text = %s OR order_id = %s) AND user_id = %s;
        """, (order_id_param, order_id_param, user_id))
        order_row = cursor.fetchone()
        if not order_row:
            cursor.close()
            connection.close()
            return jsonify({"error": "Order not found."}), 404

        internal_order_id = order_row[0]
        sk_order_id = order_row[1]

        # Fetch past order items joined with current catalog products
        cursor.execute("""
            SELECT 
                oi.product_id, oi.product_name, oi.product_size, oi.product_image,
                oi.unit_price, oi.quantity, oi.total_price,
                p.id, p.name, p.price, p.stock, p.image, p.size
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = %s
            ORDER BY oi.id;
        """, (internal_order_id,))
        item_rows = cursor.fetchall()
        cursor.close()
        connection.close()

        items = []
        all_available = True
        any_price_changed = False
        original_subtotal = 0.0
        current_subtotal = 0.0

        for row in item_rows:
            past_pid = row[0]
            past_name = row[1]
            past_size = row[2]
            past_image = row[3]
            past_unit_price = float(row[4])
            past_qty = row[5]

            p_id = row[7]
            curr_name = row[8] if p_id is not None else past_name
            curr_price = float(row[9]) if (p_id is not None and row[9] is not None) else past_unit_price
            curr_stock = int(row[10]) if (p_id is not None and row[10] is not None) else 0
            curr_image = row[11] if p_id is not None else past_image
            curr_size = row[12] if p_id is not None else past_size

            is_in_catalog = (p_id is not None)
            is_available = is_in_catalog and (curr_stock >= past_qty)
            price_changed = round(curr_price, 2) != round(past_unit_price, 2)

            if not is_available:
                all_available = False
            if price_changed:
                any_price_changed = True

            original_subtotal += (past_unit_price * past_qty)
            if is_available:
                current_subtotal += (curr_price * past_qty)

            items.append({
                "product_id": past_pid,
                "productId": past_pid,
                "name": curr_name,
                "product_name": curr_name,
                "size": curr_size,
                "image": curr_image,
                "requested_quantity": past_qty,
                "requestedQuantity": past_qty,
                "available_stock": curr_stock,
                "availableStock": curr_stock,
                "is_in_catalog": is_in_catalog,
                "is_available": is_available,
                "isAvailable": is_available,
                "original_price": past_unit_price,
                "originalPrice": past_unit_price,
                "current_price": curr_price,
                "currentPrice": curr_price,
                "price_changed": price_changed,
                "priceChanged": price_changed,
            })

        return jsonify({
            "order_id": sk_order_id,
            "orderId": sk_order_id,
            "internal_order_id": internal_order_id,
            "all_available": all_available,
            "allAvailable": all_available,
            "any_price_changed": any_price_changed,
            "anyPriceChanged": any_price_changed,
            "items": items,
            "summary": {
                "total_items": len(items),
                "available_items_count": sum(1 for it in items if it["is_available"]),
                "original_subtotal": round(original_subtotal, 2),
                "current_subtotal": round(current_subtotal, 2),
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Verified Product Reviews & Ratings APIs
# ---------------------------------------------------------------------------

def _mask_customer_name(name, phone):
    if name and isinstance(name, str) and name.strip():
        parts = name.strip().split()
        if len(parts) == 1:
            return parts[0]
        return f"{parts[0]} {parts[-1][0]}."
    if phone and isinstance(phone, str) and len(phone.strip()) >= 10:
        clean = phone.strip()
        return f"{clean[:2]}****{clean[-4:]}"
    return "Verified Buyer"


def _recalculate_product_rating(cursor, product_id):
    cursor.execute("""
        SELECT COUNT(*), AVG(rating)
        FROM product_reviews
        WHERE product_id = %s;
    """, (product_id,))
    row = cursor.fetchone()
    count = row[0] or 0
    avg_rating = round(float(row[1]), 1) if (row[1] is not None) else 0.0
    cursor.execute("""
        UPDATE products
        SET rating = %s, total_reviews = %s
        WHERE id = %s;
    """, (avg_rating, count, product_id))


@app.route("/products/<int:product_id>/reviews", methods=["GET"])
def get_product_reviews(product_id):
    """Public endpoint to fetch verified customer reviews and rating breakdown."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, name FROM products WHERE id = %s;", (product_id,))
        prod = cursor.fetchone()
        if not prod:
            cursor.close()
            connection.close()
            return jsonify({"error": "Product not found."}), 404

        cursor.execute("""
            SELECT 
                pr.id, pr.rating, pr.review_text, pr.created_at, pr.updated_at,
                u.id, u.name, u.phone
            FROM product_reviews pr
            JOIN users u ON pr.user_id = u.id
            WHERE pr.product_id = %s
            ORDER BY pr.created_at DESC;
        """, (product_id,))
        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        breakdown = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0}
        total_rating_sum = 0
        reviews = []

        for r in rows:
            rating = int(r[1])
            breakdown[rating] = breakdown.get(rating, 0) + 1
            total_rating_sum += rating
            created_dt = r[3]
            reviews.append({
                "id": r[0],
                "rating": rating,
                "review_text": r[2] or "",
                "reviewText": r[2] or "",
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "customer_name": _mask_customer_name(r[6], r[7]),
                "customerName": _mask_customer_name(r[6], r[7]),
                "verified_purchase": True,
                "verifiedPurchase": True,
            })

        total_reviews = len(reviews)
        average_rating = round(total_rating_sum / total_reviews, 1) if total_reviews > 0 else 0.0

        return jsonify({
            "product_id": product_id,
            "product_name": prod[1],
            "summary": {
                "average_rating": average_rating,
                "averageRating": average_rating,
                "total_reviews": total_reviews,
                "totalReviews": total_reviews,
                "rating_breakdown": breakdown,
                "ratingBreakdown": breakdown,
            },
            "reviews": reviews,
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/products/<int:product_id>/review-eligibility", methods=["GET"])
@require_auth
def check_review_eligibility(product_id):
    """
    Checks if authenticated customer has purchased this product in a Delivered order
    and hasn't already reviewed it for that order.
    """
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Check delivered orders containing this product
        cursor.execute("""
            SELECT o.id, o.order_id, o.created_at
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.user_id = %s AND oi.product_id = %s AND o.status = 'Delivered'
            ORDER BY o.created_at DESC;
        """, (user_id, product_id))
        delivered_orders = cursor.fetchall()

        # Check reviews already submitted by this user for this product
        cursor.execute("""
            SELECT id, order_id, rating, review_text, created_at
            FROM product_reviews
            WHERE user_id = %s AND product_id = %s;
        """, (user_id, product_id))
        existing_reviews = cursor.fetchall()

        cursor.close()
        connection.close()

        reviewed_order_ids = {r[1] for r in existing_reviews}
        unreviewed_orders = [
            {"id": o[0], "order_id": o[1], "created_at": o[2].isoformat() if hasattr(o[2], "isoformat") else str(o[2])}
            for o in delivered_orders
            if o[0] not in reviewed_order_ids
        ]

        return jsonify({
            "product_id": product_id,
            "eligible": len(unreviewed_orders) > 0,
            "eligible_orders": unreviewed_orders,
            "already_reviewed": len(existing_reviews) > 0,
            "total_delivered_purchases": len(delivered_orders),
            "total_reviews_submitted": len(existing_reviews),
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/products/<int:product_id>/reviews", methods=["POST"])
@require_auth
def create_product_review(product_id):
    """
    Submits a verified product review. Customer MUST have a Delivered order
    containing the product that hasn't been reviewed yet.
    """
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    rating = data.get("rating")
    if rating is None or not isinstance(rating, int) or rating < 1 or rating > 5:
        return jsonify({"error": "Invalid rating. Rating must be an integer between 1 and 5."}), 400

    review_text = data.get("review_text") or data.get("reviewText", "")
    if review_text and not isinstance(review_text, str):
        return jsonify({"error": "review_text must be a string."}), 400
    if review_text and len(review_text.strip()) > 1000:
        return jsonify({"error": "review_text must not exceed 1000 characters."}), 400
    review_text = review_text.strip() if review_text else None

    target_order_id = data.get("order_id") or data.get("orderId")

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Check product exists
        cursor.execute("SELECT id FROM products WHERE id = %s;", (product_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({"error": "Product not found."}), 404

        # Query all delivered orders for this user containing product
        cursor.execute("""
            SELECT o.id, o.order_id
            FROM orders o
            JOIN order_items oi ON oi.order_id = o.id
            WHERE o.user_id = %s AND oi.product_id = %s AND o.status = 'Delivered'
            ORDER BY o.created_at DESC;
        """, (user_id, product_id))
        delivered_orders = cursor.fetchall()

        if not delivered_orders:
            cursor.close()
            connection.close()
            return jsonify({
                "error": "Only verified buyers who have received this product in a delivered order can submit a review."
            }), 403

        # Check which orders are already reviewed
        cursor.execute("""
            SELECT order_id FROM product_reviews
            WHERE user_id = %s AND product_id = %s;
        """, (user_id, product_id))
        reviewed_orders = {r[0] for r in cursor.fetchall()}

        chosen_order_id = None
        if target_order_id:
            # Match target_order_id to delivered_orders
            for d in delivered_orders:
                if str(d[0]) == str(target_order_id) or d[1] == str(target_order_id):
                    chosen_order_id = d[0]
                    break
            if not chosen_order_id:
                cursor.close()
                connection.close()
                return jsonify({"error": "The specified order is not a delivered order containing this product."}), 400
            if chosen_order_id in reviewed_orders:
                cursor.close()
                connection.close()
                return jsonify({"error": "You have already reviewed this product for this order."}), 409
        else:
            # Pick first unreviewed delivered order
            for d in delivered_orders:
                if d[0] not in reviewed_orders:
                    chosen_order_id = d[0]
                    break

        if not chosen_order_id:
            cursor.close()
            connection.close()
            return jsonify({
                "error": "You have already submitted reviews for all delivered orders of this product."
            }), 409

        cursor.execute("""
            INSERT INTO product_reviews (product_id, user_id, order_id, rating, review_text)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, product_id, user_id, order_id, rating, review_text, created_at;
        """, (product_id, user_id, chosen_order_id, rating, review_text))
        r = cursor.fetchone()

        # Recalculate rating aggregates on products table
        _recalculate_product_rating(cursor, product_id)

        connection.commit()
        cursor.close()
        connection.close()

        created_dt = r[6]
        return jsonify({
            "message": "Review submitted successfully.",
            "review": {
                "id": r[0],
                "product_id": r[1],
                "productId": r[1],
                "user_id": r[2],
                "order_id": r[3],
                "rating": r[4],
                "review_text": r[5] or "",
                "reviewText": r[5] or "",
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
            }
        }), 201

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/reviews", methods=["GET"])
@require_auth
def get_customer_reviews():
    """Returns all product reviews submitted by the authenticated customer."""
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                pr.id, pr.product_id, pr.order_id, pr.rating, pr.review_text,
                pr.created_at, pr.updated_at,
                p.name, p.image, p.price,
                o.order_id
            FROM product_reviews pr
            JOIN products p ON pr.product_id = p.id
            JOIN orders o ON pr.order_id = o.id
            WHERE pr.user_id = %s
            ORDER BY pr.created_at DESC;
        """, (user_id,))
        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        reviews = []
        for r in rows:
            created_dt = r[5]
            updated_dt = r[6]
            reviews.append({
                "id": r[0],
                "product_id": r[1],
                "productId": r[1],
                "order_id": r[2],
                "orderId": r[2],
                "sk_order_id": r[10],
                "rating": r[3],
                "review_text": r[4] or "",
                "reviewText": r[4] or "",
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "updated_at": updated_dt.isoformat() if hasattr(updated_dt, "isoformat") else str(updated_dt),
                "product_name": r[7],
                "productName": r[7],
                "product_image": r[8],
                "productImage": r[8],
                "product_price": float(r[9]) if r[9] is not None else 0.0,
            })

        return jsonify(reviews), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/reviews/<int:review_id>", methods=["PUT"])
@require_auth
def update_customer_review(review_id):
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    rating = data.get("rating")
    if rating is not None:
        if not isinstance(rating, int) or rating < 1 or rating > 5:
            return jsonify({"error": "Invalid rating. Must be between 1 and 5."}), 400

    review_text = data.get("review_text") or data.get("reviewText")
    if review_text is not None:
        if not isinstance(review_text, str):
            return jsonify({"error": "review_text must be a string."}), 400
        if len(review_text.strip()) > 1000:
            return jsonify({"error": "review_text must not exceed 1000 characters."}), 400
        review_text = review_text.strip()

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, product_id, rating, review_text FROM product_reviews WHERE id = %s AND user_id = %s;", (review_id, user_id))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            connection.close()
            return jsonify({"error": "Review not found."}), 404

        product_id = row[1]
        new_rating = rating if rating is not None else row[2]
        new_text = review_text if review_text is not None else row[3]

        cursor.execute("""
            UPDATE product_reviews
            SET rating = %s, review_text = %s, updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND user_id = %s
            RETURNING id, product_id, order_id, rating, review_text, updated_at;
        """, (new_rating, new_text, review_id, user_id))
        updated = cursor.fetchone()

        _recalculate_product_rating(cursor, product_id)
        connection.commit()
        cursor.close()
        connection.close()

        updated_dt = updated[5]
        return jsonify({
            "message": "Review updated successfully.",
            "review": {
                "id": updated[0],
                "product_id": updated[1],
                "order_id": updated[2],
                "rating": updated[3],
                "review_text": updated[4] or "",
                "updated_at": updated_dt.isoformat() if hasattr(updated_dt, "isoformat") else str(updated_dt),
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/account/reviews/<int:review_id>", methods=["DELETE"])
@require_auth
def delete_customer_review(review_id):
    user = request.user
    if user.get("role") != "customer":
        return jsonify({"error": "Forbidden. Customer account required."}), 403

    user_id = int(user.get("sub"))
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, product_id FROM product_reviews WHERE id = %s AND user_id = %s;", (review_id, user_id))
        row = cursor.fetchone()
        if not row:
            cursor.close()
            connection.close()
            return jsonify({"error": "Review not found."}), 404

        product_id = row[1]
        cursor.execute("DELETE FROM product_reviews WHERE id = %s AND user_id = %s;", (review_id, user_id))
        _recalculate_product_rating(cursor, product_id)

        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"message": "Review deleted successfully."}), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


# ---------------------------------------------------------------------------
# Protected Owner Admin APIs (role='admin' strictly enforced)
# ---------------------------------------------------------------------------

@app.route("/admin/orders", methods=["GET"])
@require_admin
def admin_get_orders():
    """Returns all orders across all customers with items and details."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                id, order_id, user_id, customer_name, customer_phone, delivery_address,
                city, pincode, payment_method, subtotal, delivery_charge,
                total_amount, total_items, status, created_at,
                delivery_latitude, delivery_longitude, delivery_distance_meters
            FROM orders
            ORDER BY created_at DESC;
        """)
        order_rows = cursor.fetchall()

        if not order_rows:
            cursor.close()
            connection.close()
            return jsonify([]), 200

        order_ids = [row[0] for row in order_rows]
        cursor.execute("""
            SELECT 
                id, order_id, product_id, product_name, product_size,
                product_image, unit_price, quantity, total_price
            FROM order_items
            WHERE order_id = ANY(%s)
            ORDER BY id;
        """, (order_ids,))
        item_rows = cursor.fetchall()

        cursor.close()
        connection.close()

        items_by_order = {}
        for it in item_rows:
            internal_oid = it[1]
            if internal_oid not in items_by_order:
                items_by_order[internal_oid] = []
            items_by_order[internal_oid].append({
                "id": it[0],
                "productId": it[2],
                "product_id": it[2],
                "name": it[3],
                "productName": it[3],
                "product_name": it[3],
                "size": it[4],
                "image": it[5],
                "unitPrice": float(it[6]),
                "unit_price": float(it[6]),
                "price": float(it[6]),
                "quantity": it[7],
                "totalPrice": float(it[8]),
                "total_price": float(it[8]),
            })

        orders = []
        for row in order_rows:
            oid = row[0]
            created_dt = row[14]
            orders.append({
                "id": oid,
                "order_id": row[1],
                "orderId": row[1],
                "user_id": row[2],
                "customer_name": row[3],
                "customerName": row[3],
                "customer_phone": row[4],
                "customerPhone": row[4],
                "delivery_address": row[5],
                "deliveryAddress": row[5],
                "city": row[6],
                "pincode": row[7],
                "deliveryLatitude": float(row[15]) if row[15] is not None else None,
                "delivery_latitude": float(row[15]) if row[15] is not None else None,
                "deliveryLongitude": float(row[16]) if row[16] is not None else None,
                "delivery_longitude": float(row[16]) if row[16] is not None else None,
                "deliveryDistanceMeters": float(row[17]) if row[17] is not None else None,
                "delivery_distance_meters": float(row[17]) if row[17] is not None else None,
                "deliveryDistanceKm": round(float(row[17]) / 1000.0, 2) if row[17] is not None else None,
                "payment_method": row[8],
                "paymentMethod": row[8],
                "subtotal": float(row[9]),
                "delivery_charge": float(row[10]),
                "deliveryCharge": float(row[10]),
                "total_amount": float(row[11]),
                "total": float(row[11]),
                "totalItems": row[12],
                "total_items": row[12],
                "status": row[13],
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "createdAt": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "items": items_by_order.get(oid, [])
            })

        return jsonify(orders), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/admin/orders/<int:order_id>/status", methods=["PATCH"])
@require_admin
def admin_update_order_status(order_id):
    """Updates order status using execute_order_status_update with transition rules and stock restoration."""
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    new_status = data.get("status")
    notes = data.get("notes")

    # Map legacy Confirmed to Order Confirmed
    if new_status == "Confirmed":
        new_status = "Order Confirmed"

    if not new_status or new_status not in ORDER_STATUSES:
        return jsonify({
            "error": f"Invalid status. Must be one of: {', '.join(ORDER_STATUSES)}"
        }), 400

    admin_role = request.user.get("role", "admin")
    admin_name = request.user.get("username") or request.user.get("name") or "Store Staff"

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        res, err, code = execute_order_status_update(
            cursor, order_id, new_status, admin_role, admin_name, notes
        )
        if err:
            connection.rollback()
            cursor.close()
            connection.close()
            return jsonify({"error": err}), code

        connection.commit()
        cursor.close()
        connection.close()
        return jsonify(res), code

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/admin/products", methods=["POST"])
@require_admin
def admin_create_product():
    """Adds a new product to the catalog."""
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body."}), 400

    name = data.get("name")
    category = data.get("category")
    price = data.get("price")

    if not name or not isinstance(name, str) or not name.strip():
        return jsonify({"error": "Product 'name' is required."}), 400
    if not category or not isinstance(category, str) or not category.strip():
        return jsonify({"error": "Product 'category' is required."}), 400
    try:
        price = float(price)
        if price <= 0:
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "Product 'price' must be a positive number."}), 400

    original_price = data.get("original_price", data.get("originalPrice", price))
    try:
        original_price = float(original_price)
    except (ValueError, TypeError):
        original_price = price

    brand = (data.get("brand") or "").strip()
    sub_category = (data.get("subCategory") or data.get("sub_category") or "").strip()
    size = (data.get("size") or "").strip()
    description = (data.get("description") or "").strip()
    raw_discount = data.get("discount")
    discount = 0
    if raw_discount is not None:
        try:
            if isinstance(raw_discount, str):
                digits = re.sub(r"\D", "", raw_discount)
                discount = int(digits) if digits else 0
            else:
                discount = int(raw_discount)
        except (ValueError, TypeError):
            discount = 0
    elif original_price > price:
        discount = int(round(((original_price - price) / original_price) * 100))

    stock = int(data.get("stock", 0))
    featured = bool(data.get("featured", False))
    bestseller = bool(data.get("bestseller", False))
    image = (data.get("image") or "").strip()

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT COALESCE(MAX(id), 0) + 1 FROM products;")
        next_id = cursor.fetchone()[0]

        cursor.execute("""
            INSERT INTO products (
                id, name, brand, category, sub_category, size, description,
                price, original_price, discount, stock, featured, bestseller,
                rating, total_reviews, image
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 4.5, 10, %s
            ) RETURNING id;
        """, (
            next_id, name.strip(), brand, category.strip(), sub_category, size, description,
            price, original_price, discount, stock, featured, bestseller, image
        ))

        new_id = cursor.fetchone()[0]
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Product created successfully.",
            "product": {
                "id": new_id,
                "name": name.strip(),
                "brand": brand,
                "category": category.strip(),
                "subCategory": sub_category,
                "size": size,
                "price": price,
                "originalPrice": original_price,
                "discount": discount,
                "stock": stock,
                "featured": featured,
                "bestseller": bestseller,
                "image": image
            }
        }), 201

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/admin/products/<int:product_id>", methods=["PUT"])
@require_admin
def admin_update_product(product_id):
    """Updates an existing product in the catalog."""
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body."}), 400

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id FROM products WHERE id = %s;", (product_id,))
        if not cursor.fetchone():
            cursor.close()
            connection.close()
            return jsonify({"error": f"Product with ID {product_id} not found."}), 404

        name = data.get("name")
        brand = data.get("brand")
        category = data.get("category")
        sub_category = data.get("subCategory") or data.get("sub_category")
        size = data.get("size")
        description = data.get("description")
        price = data.get("price")
        original_price = data.get("originalPrice") or data.get("original_price")
        raw_discount = data.get("discount")
        discount = None
        if raw_discount is not None:
            try:
                if isinstance(raw_discount, str):
                    digits = re.sub(r"\D", "", raw_discount)
                    discount = int(digits) if digits else 0
                else:
                    discount = int(raw_discount)
            except (ValueError, TypeError):
                discount = 0
        stock = data.get("stock")
        featured = data.get("featured")
        bestseller = data.get("bestseller")
        image = data.get("image")

        cursor.execute("""
            UPDATE products
            SET 
                name = COALESCE(%s, name),
                brand = COALESCE(%s, brand),
                category = COALESCE(%s, category),
                sub_category = COALESCE(%s, sub_category),
                size = COALESCE(%s, size),
                description = COALESCE(%s, description),
                price = COALESCE(%s, price),
                original_price = COALESCE(%s, original_price),
                discount = COALESCE(%s, discount),
                stock = COALESCE(%s, stock),
                featured = COALESCE(%s, featured),
                bestseller = COALESCE(%s, bestseller),
                image = COALESCE(%s, image)
            WHERE id = %s
            RETURNING id, name, category, price, stock;
        """, (
            name, brand, category, sub_category, size, description,
            price, original_price, discount, stock, featured, bestseller,
            image, product_id
        ))

        updated = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Product updated successfully.",
            "product": {
                "id": updated[0],
                "name": updated[1],
                "category": updated[2],
                "price": float(updated[3]),
                "stock": updated[4]
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/admin/products/<int:product_id>", methods=["DELETE"])
@require_admin
def admin_delete_product(product_id):
    """Deletes a product from the catalog."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("SELECT id, name FROM products WHERE id = %s;", (product_id,))
        prod = cursor.fetchone()
        if not prod:
            cursor.close()
            connection.close()
            return jsonify({"error": f"Product with ID {product_id} not found."}), 404

        cursor.execute("DELETE FROM products WHERE id = %s RETURNING id;", (product_id,))
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({"message": f"Product '{prod[1]}' (ID: {product_id}) deleted successfully."}), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/admin/products/<int:product_id>/stock", methods=["PATCH"])
@require_admin
def admin_update_stock(product_id):
    """Quickly updates the stock quantity of a product."""
    data = request.get_json(silent=True)
    if not data or "stock" not in data:
        return jsonify({"error": "Missing 'stock' in request body."}), 400

    try:
        new_stock = int(data["stock"])
        if new_stock < 0:
            return jsonify({"error": "'stock' cannot be negative."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "'stock' must be an integer."}), 400

    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            UPDATE products
            SET stock = %s
            WHERE id = %s
            RETURNING id, name, stock;
        """, (new_stock, product_id))

        updated = cursor.fetchone()
        connection.commit()
        cursor.close()
        connection.close()

        if not updated:
            return jsonify({"error": f"Product with ID {product_id} not found."}), 404

        return jsonify({
            "message": "Stock updated successfully.",
            "product": {
                "id": updated[0],
                "name": updated[1],
                "stock": updated[2]
            }
        }), 200

    except Exception as e:
        if connection:
            try:
                connection.rollback()
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


@app.route("/admin/customers", methods=["GET"])
@require_admin
def admin_get_customers():
    """Returns registered customers with their order count and total spend."""
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        cursor.execute("""
            SELECT 
                u.id, 
                u.phone, 
                u.name, 
                u.created_at,
                COUNT(o.id) AS total_orders,
                COALESCE(SUM(o.total_amount), 0) AS total_spent
            FROM users u
            LEFT JOIN orders o ON o.user_id = u.id
            GROUP BY u.id, u.phone, u.name, u.created_at
            ORDER BY u.id DESC;
        """)

        rows = cursor.fetchall()
        cursor.close()
        connection.close()

        customers = []
        for r in rows:
            created_dt = r[3]
            customers.append({
                "id": r[0],
                "phone": r[1],
                "name": r[2] or "Customer",
                "created_at": created_dt.isoformat() if hasattr(created_dt, "isoformat") else str(created_dt),
                "total_orders": int(r[4]),
                "total_spent": float(r[5])
            })

        return jsonify(customers), 200

    except Exception as e:
        if connection:
            try:
                connection.close()
            except Exception:
                pass
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", 5000))
    app.run(debug=True, host="0.0.0.0", port=port)

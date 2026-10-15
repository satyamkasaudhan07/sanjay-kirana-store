import os
import re
import logging
import requests

logger = logging.getLogger("sanjay_kirana_sms")

def normalize_indian_phone(raw_phone: str) -> tuple[bool, str, str, str]:
    """
    Normalizes an Indian phone number.
    Returns: (is_valid, domestic_10_digit, international_12_digit, error_message)
    Handles:
      - 9554384886
      - +919554384886, 919554384886
      - +91 95543 84886
      - 09554384886, 00919554384886
      - Duplicate prefixes like +91+919554384886, 91919554384886
    """
    if not raw_phone or not str(raw_phone).strip():
        return False, "", "", "Phone number cannot be blank."

    cleaned = str(raw_phone).strip()
    digits = re.sub(r"\D", "", cleaned)

    changed = True
    while changed:
        changed = False
        if digits.startswith("0") and len(digits) > 10:
            digits = re.sub(r"^0+", "", digits)
            changed = True
        if len(digits) > 10 and digits.startswith("91"):
            digits = digits[2:]
            changed = True

    if digits.startswith("0") and len(digits) == 11:
        digits = digits[1:]

    if len(digits) != 10:
        return False, "", "", f"Invalid phone length ({len(digits)} digits). Must be a 10-digit Indian mobile number."

    if not re.match(r"^[6-9]\d{9}$", digits):
        return False, "", "", "Invalid Indian mobile number. Must start with digits 6, 7, 8, or 9."

    return True, digits, f"91{digits}", ""


def send_sms_otp(phone: str, otp: str) -> dict:
    """
    Sends an OTP to the specified phone number via the configured SMS provider.
    Supports:
      - 'msg91': Production MSG91 v5 OTP API (primary, fail-closed).
      - 'mock': Development-only provider. Only active when explicitly enabled
                via ALLOW_MOCK_SMS=true in local development. Never allowed in production.
    
    Returns a dict:
      {"success": True, "provider": "...", ...} or {"success": False, "error": "..."}
    """
    # Normalize phone: ensure only digits
    is_valid, domestic_phone, intl_phone, norm_err = normalize_indian_phone(phone)
    if not is_valid:
        return {"success": False, "error": norm_err}

    # Determine environment
    flask_env = os.getenv("FLASK_ENV", "").lower().strip()
    is_prod = flask_env == "production" or os.getenv("DEBUG", "true").lower() == "false"
    is_dev = not is_prod

    # Determine configured provider
    raw_provider = os.getenv("SMS_PROVIDER", "").lower().strip()
    auth_key = (os.getenv("MSG91_AUTHKEY") or os.getenv("MSG91_AUTH_KEY") or "").strip()

    if raw_provider:
        provider = raw_provider
    elif auth_key:
        # Default to msg91 if authkey is provided
        provider = "msg91"
    else:
        # Fall back to mock only in dev if allowed
        provider = "mock"

    # -------------------------------------------------------------------------
    # 1. Mock / Development Mode (Fail-closed guard)
    # -------------------------------------------------------------------------
    if provider == "mock":
        allow_mock = os.getenv("ALLOW_MOCK_SMS", "false").lower() == "true"

        # Guard: NEVER allow mock mode in production
        if is_prod:
            logger.error("SECURITY ALERT: Attempted to use mock SMS provider in production environment!")
            return {
                "success": False,
                "error": "Mock SMS provider is disabled in production environments. Configure MSG91_AUTHKEY in backend/.env."
            }

        # Guard: In development, require explicit enablement
        if not allow_mock:
            logger.warning("Mock SMS requested but ALLOW_MOCK_SMS is not set to 'true'.")
            return {
                "success": False,
                "error": "Real SMS provider (msg91) is not configured. Set MSG91_AUTHKEY in backend/.env or set ALLOW_MOCK_SMS=true for local simulation."
            }

        # Development mock mode: log securely for local developer testing
        logger.info("[DEV MOCK SMS] OTP dispatched to %s (expires in 5 minutes)", phone)
        # Only print in explicit dev mock mode when developer asked for local simulation
        print(f"[DEV MOCK SMS] Phone: {phone} | OTP: {otp}", flush=True)
        return {
            "success": True,
            "provider": "mock",
            "message": "OTP delivered via mock provider (development mode)."
        }

    # -------------------------------------------------------------------------
    # 2. MSG91 v5 OTP Provider (Fail-closed)
    # -------------------------------------------------------------------------
    if provider == "msg91":
        if not auth_key:
            logger.error("MSG91 configuration missing: MSG91_AUTHKEY must be set in backend/.env.")
            return {
                "success": False,
                "error": "SMS service is not fully configured on the server (missing MSG91_AUTHKEY in backend/.env)."
            }

        template_id = (os.getenv("MSG91_TEMPLATE_ID") or "").strip()

        headers = {
            "authkey": auth_key,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

        # ---------------------------------------------------------------------
        # Path A: MSG91 Flow / Campaign Template API (Used when template_id is provided)
        # In MSG91, 24-char hex template IDs are Flow IDs and must be sent via /api/v5/flow/
        # ---------------------------------------------------------------------
        if template_id:
            flow_endpoints = [
                "https://control.msg91.com/api/v5/flow/",
                "https://api.msg91.com/api/v5/flow/"
            ]
            flow_payload = {
                "template_id": template_id,
                "short_url": "0",
                "recipients": [
                    {
                        "mobiles": intl_phone,
                        "otp": str(otp),
                        "OTP": str(otp),
                        "var": str(otp),
                        "VAR": str(otp),
                        "var1": str(otp),
                        "VAR1": str(otp),
                        "code": str(otp),
                        "CODE": str(otp),
                        "passcode": str(otp)
                    }
                ]
            }

            for f_url in flow_endpoints:
                try:
                    f_resp = requests.post(f_url, headers=headers, json=flow_payload, timeout=8)
                    f_data = f_resp.json() if f_resp.headers.get("content-type", "").startswith("application/json") else {}
                    if f_resp.status_code == 200 and f_data.get("type") == "success":
                        req_id = f_data.get("request_id") or f_data.get("message")
                        logger.info("MSG91 Flow OTP accepted for %s (req_id: %s)", phone, req_id)
                        return {
                            "success": True,
                            "provider": "msg91",
                            "request_id": str(req_id),
                            "message": "OTP request accepted by SMS gateway.",
                        }
                    elif f_resp.status_code == 401 or str(f_data.get("code")) == "401":
                        return {
                            "success": False,
                            "error": "SMS gateway authentication failed. Please verify MSG91_AUTHKEY in backend/.env."
                        }
                    elif f_resp.status_code == 418 or str(f_data.get("code")) == "418":
                        return {
                            "success": False,
                            "error": "MSG91 API Security restriction (Code 418): Server IP is not whitelisted. Please disable 'API Security' or whitelist server IP in MSG91 dashboard."
                        }
                except requests.exceptions.RequestException as e:
                    logger.warning("MSG91 Flow API endpoint %s failed: %s", f_url, e)

        # ---------------------------------------------------------------------
        # Path B: MSG91 v5 OTP API (Standard SendOTP fallback)
        # Custom OTP must be passed in JSON body according to MSG91 SendOTP documentation
        # ---------------------------------------------------------------------
        otp_endpoints = [
            "https://control.msg91.com/api/v5/otp",
            "https://api.msg91.com/api/v5/otp"
        ]

        params = {
            "mobile": intl_phone,
            "otp_expiry": 5,  # 5 minutes validity
        }
        if template_id:
            params["template_id"] = template_id

        otp_payload = {
            "otp": str(otp)
        }

        last_error = None
        for url in otp_endpoints:
            try:
                resp = requests.post(url, params=params, headers=headers, json=otp_payload, timeout=8)
                resp_data = resp.json() if resp.headers.get("content-type", "").startswith("application/json") else {}

                # Check HTTP status & provider response
                if resp.status_code == 200:
                    # MSG91 v5 returns {"type": "success", "request_id": "..."} or {"type": "success", "message": "..."}
                    if resp_data.get("type") == "success" and not resp_data.get("hasError"):
                        request_id = resp_data.get("request_id") or resp_data.get("message")
                        logger.info("MSG91 OTP request accepted for %s (req_id: %s)", phone, request_id)
                        return {
                            "success": True,
                            "provider": "msg91",
                            "request_id": str(request_id),
                            "message": "OTP request accepted by SMS gateway.",
                        }
                    else:
                        error_reason = resp_data.get("message") or resp_data.get("errors") or "SMS provider rejected request."
                        if str(resp_data.get("code")) == "401" or "unauthorized" in str(error_reason).lower():
                            return {
                                "success": False,
                                "error": "SMS gateway authentication failed. Please verify MSG91_AUTHKEY in backend/.env."
                            }
                        if str(resp_data.get("code")) == "418" or "whitelist" in str(error_reason).lower():
                            return {
                                "success": False,
                                "error": "MSG91 API Security restriction (Code 418): Server IP is not whitelisted. Please disable 'API Security' or whitelist server IP in MSG91 dashboard."
                            }
                        logger.error("MSG91 returned error for %s: %s", phone, error_reason)
                        return {"success": False, "error": f"Failed to send SMS OTP: {error_reason}"}

                elif resp.status_code == 401:
                    logger.error("MSG91 HTTP 401 Unauthorized for %s", phone)
                    return {
                        "success": False,
                        "error": "SMS gateway authentication failed. Please verify MSG91_AUTHKEY in backend/.env."
                    }
                elif resp.status_code == 418:
                    logger.error("MSG91 HTTP 418 IP Security restriction for %s", phone)
                    return {
                        "success": False,
                        "error": "MSG91 API Security restriction (Code 418): Server IP is not whitelisted. Please disable 'API Security' or whitelist server IP in MSG91 dashboard."
                    }
                else:
                    # Non-200 HTTP status, try fallback domain if available
                    last_error = f"SMS gateway returned HTTP {resp.status_code}"
                    continue

            except requests.exceptions.Timeout:
                last_error = "SMS gateway connection timed out. Please try again."
                continue
            except requests.exceptions.RequestException as e:
                last_error = f"SMS gateway network error: {str(e)}"
                continue

        # If all endpoints failed, fail closed
        logger.error("MSG91 dispatch failed for %s: %s", phone, last_error)
        return {
            "success": False,
            "error": last_error or "SMS gateway is temporarily unavailable. Please try again later."
        }

    # -------------------------------------------------------------------------
    # 3. Unknown or unconfigured provider
    # -------------------------------------------------------------------------
    return {
        "success": False,
        "error": f"Unsupported or unconfigured SMS provider: '{provider}'. Please configure MSG91_AUTHKEY in backend/.env."
    }

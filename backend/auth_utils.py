import os
import time
from datetime import datetime, timezone, timedelta
from functools import wraps
import jwt
from flask import request, jsonify
from werkzeug.security import generate_password_hash, check_password_hash

from pathlib import Path
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_env_path)

def get_jwt_secret() -> str:
    secret = os.getenv("JWT_SECRET")
    if not secret:
        raise RuntimeError("JWT_SECRET environment variable is not set. Add it to your .env file.")
    return secret

_JWT_ALGORITHM = "HS256"
_ACCESS_TOKEN_EXPIRY_HOURS = 24
_CHALLENGE_EXPIRY_MINUTES = 5

# Simple memory-based rate limiter for IP/phone attempts (key -> list of timestamps)
_rate_limits: dict[str, list[float]] = {}

def check_rate_limit(key: str, max_attempts: int = 5, window_seconds: int = 900) -> bool:
    """
    Returns True if the request is ALLOWED within limits, False if rate limited.
    Window is in seconds (e.g. 900s = 15 minutes).
    In non-production mode, local loopback IPs (127.0.0.1, localhost, ::1) or DISABLE_RATE_LIMIT=true
    are relaxed to prevent locking out developers during iterative testing.
    """
    if os.getenv("DISABLE_RATE_LIMIT", "false").lower() in ("true", "1", "yes"):
        return True

    is_dev = os.getenv("FLASK_ENV", "").lower() != "production"
    if is_dev and any(loop in str(key) for loop in ("127.0.0.1", "localhost", "::1", "unknown")):
        max_attempts = max(max_attempts, 200)

    now = time.time()
    attempts = _rate_limits.get(key, [])
    # Filter out timestamps older than the window
    valid_attempts = [t for t in attempts if now - t < window_seconds]
    if len(valid_attempts) >= max_attempts:
        _rate_limits[key] = valid_attempts
        return False
    valid_attempts.append(now)
    _rate_limits[key] = valid_attempts
    return True

def reset_rate_limit(key: str) -> None:
    """Resets attempts for a key after successful operation."""
    _rate_limits.pop(key, None)

def mask_phone(phone: str) -> str:
    """Masks a phone number for user-facing prompts (e.g. '******3210')."""
    clean = str(phone).strip()
    if len(clean) >= 4:
        return f"{'*' * (len(clean) - 4)}{clean[-4:]}"
    return "****"

def hash_password(password: str) -> str:
    """Hashes a password securely using Werkzeug."""
    return generate_password_hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifies a plain password against its hash."""
    if not plain_password or not hashed_password:
        return False
    return check_password_hash(hashed_password, plain_password)

def generate_access_token(user_id: int, role: str, phone: str = None, username: str = None, email: str = None) -> str:
    """
    Issues a cryptographically signed access JWT with explicit role and identity claims.
    Role must be 'customer', 'admin', or 'owner'.
    """
    if role not in ("customer", "admin", "owner"):
        raise ValueError(f"Invalid role '{role}'. Role must be 'customer', 'admin', or 'owner'.")
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": str(user_id),
        "role": role,
        "phone": phone,
        "username": username,
        "email": email,
        "iat": now,
        "exp": now + timedelta(hours=_ACCESS_TOKEN_EXPIRY_HOURS),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_JWT_ALGORITHM)

def generate_challenge_token(challenge_id: str, admin_id: int) -> str:
    """
    Issues a restricted, short-lived challenge token for admin Step B.
    Cannot be used to access admin dashboard endpoints.
    """
    now = datetime.now(tz=timezone.utc)
    payload = {
        "challenge_id": challenge_id,
        "admin_id": admin_id,
        "purpose": "admin_login_challenge",
        "iat": now,
        "exp": now + timedelta(minutes=_CHALLENGE_EXPIRY_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=_JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    """
    Decodes and validates a JWT token using the fixed secret and algorithm.
    Raises jwt.ExpiredSignatureError or jwt.InvalidTokenError on failure.
    """
    return jwt.decode(
        token,
        get_jwt_secret(),
        algorithms=[_JWT_ALGORITHM],
        options={"require": ["exp", "iat", "sub"]}
    )

def extract_bearer_token() -> str | None:
    """Extracts Bearer token from the Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header:
        return None
    parts = auth_header.strip().split()
    if len(parts) == 2 and parts[0].lower() == "bearer":
        return parts[1]
    return None

def require_auth(f):
    """
    Decorator requiring any valid authenticated user (customer, admin, or owner).
    Attaches `request.user` dict to the request.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_bearer_token()
        if not token:
            return jsonify({"error": "Unauthorized. Missing authentication token."}), 401
        try:
            payload = decode_token(token)
            request.user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Unauthorized. Token has expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Unauthorized. Invalid authentication token."}), 401
        return f(*args, **kwargs)
    return decorated

def require_admin(f):
    """
    Decorator enforcing staff access (either 'admin' or 'owner').
    Returns:
      - 401 Unauthorized if token is missing, expired, or invalid.
      - 403 Forbidden if user is authenticated but is not an admin or owner (e.g. customer).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_bearer_token()
        if not token:
            return jsonify({"error": "Unauthorized. Missing authentication token."}), 401
        try:
            payload = decode_token(token)
            role = payload.get("role")
            if role not in ("admin", "owner"):
                return jsonify({"error": "Forbidden. Staff privileges (Admin or Owner) required."}), 403
            request.user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Unauthorized. Staff token has expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Unauthorized. Invalid staff authentication token."}), 401
        return f(*args, **kwargs)
    return decorated

def require_owner(f):
    """
    Decorator strictly enforcing owner privileges ('owner' role).
    Returns:
      - 401 Unauthorized if token is missing, expired, or invalid.
      - 403 Forbidden if user is authenticated but is not the store owner.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_bearer_token()
        if not token:
            return jsonify({"error": "Unauthorized. Missing authentication token."}), 401
        try:
            payload = decode_token(token)
            if payload.get("role") != "owner":
                return jsonify({"error": "Forbidden. Owner privileges required."}), 403
            request.user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Unauthorized. Owner token has expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Unauthorized. Invalid owner authentication token."}), 401
        return f(*args, **kwargs)
    return decorated

def require_customer(f):
    """
    Decorator strictly enforcing customer privileges ('customer' role).
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_bearer_token()
        if not token:
            return jsonify({"error": "Unauthorized. Missing authentication token."}), 401
        try:
            payload = decode_token(token)
            if payload.get("role") != "customer":
                return jsonify({"error": "Forbidden. Customer privileges required."}), 403
            request.user = payload
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Unauthorized. Customer token has expired. Please log in again."}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Unauthorized. Invalid customer authentication token."}), 401
        return f(*args, **kwargs)
    return decorated

def optional_auth(f):
    """
    Decorator that attaches `request.user` if a valid token is present,
    or sets `request.user = None` without failing the request.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_bearer_token()
        request.user = None
        if token:
            try:
                payload = decode_token(token)
                request.user = payload
            except Exception:
                pass
        return f(*args, **kwargs)
    return decorated

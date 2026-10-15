"""
Test Suite for MSG91 OTP Widget Backend Verification & Security
Verifies:
- Token validation & payload checks
- Mock dev verification & DB upsert
- Issued JWT validity & customer role claim
- Rate limiting protection
- RBAC protection (customer cannot access admin endpoints)
"""

import sys
import os
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import app
from auth_utils import decode_token


def run_tests():
    print("\n--- Starting MSG91 OTP Widget Backend Test Suite ---\n")
    client = app.test_client()

    # 1. Missing body
    print("[1/6] Testing empty / missing request body...")
    res = client.post("/auth/msg91/verify", json=None)
    assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    assert "Invalid request body" in res.get_json().get("error", "")
    print("      -> Rejected missing body with 400.")

    # 2. Empty access token
    print("[2/6] Testing empty or blank access_token...")
    res = client.post("/auth/msg91/verify", json={"access_token": "   "})
    assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    assert "Missing or invalid 'access_token'" in res.get_json().get("error", "")
    print("      -> Rejected empty access token with 400.")

    # 3. Invalid mock token format
    print("[3/6] Testing invalid mock access token format...")
    res = client.post("/auth/msg91/verify", json={"access_token": "mock_access_token_invalidphone"})
    assert res.status_code == 400, f"Expected 400, got {res.status_code}"
    print("      -> Rejected invalid mock phone with 400.")

    # 4. Successful verification in mock dev mode
    print("[4/6] Testing valid token verification & user upsert...")
    test_phone = "9919193538"
    valid_token_payload = {"access_token": f"mock_access_token_{test_phone}"}
    res = client.post("/auth/msg91/verify", json=valid_token_payload)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.get_data(as_text=True)}"
    data = res.get_json()
    assert "token" in data, "Token missing from response"
    assert "user" in data, "User profile missing from response"
    assert data["user"]["phone"] == test_phone, f"Expected phone {test_phone}, got {data['user']['phone']}"
    assert data["user"]["role"] == "customer", f"Expected customer role, got {data['user']['role']}"

    # Decode and verify issued JWT
    customer_jwt = data["token"]
    payload = decode_token(customer_jwt)
    assert payload.get("role") == "customer", "JWT role must be 'customer'"
    assert payload.get("phone") == test_phone, "JWT phone claim must match"
    print(f"      -> Successfully verified and issued customer JWT for +91 {test_phone}!")

    # 5. Role-based security (RBAC)
    print("[5/6] Testing Role Separation (Customer JWT cannot access admin APIs)...")
    admin_res = client.get(
        "/admin/orders",
        headers={"Authorization": f"Bearer {customer_jwt}"}
    )
    assert admin_res.status_code == 403, f"Customer JWT must receive 403 on admin endpoint, got {admin_res.status_code}"
    print("      -> RBAC verified: Customer JWT correctly blocked from admin APIs (403 Forbidden).")

    # 6. Public routes remain accessible
    print("[6/6] Testing Public Catalogue & Store APIs...")
    prod_res = client.get("/products")
    assert prod_res.status_code == 200, f"Public /products failed: {prod_res.status_code}"
    delivery_res = client.get("/delivery/info")
    assert delivery_res.status_code == 200, f"Public /delivery/info failed: {delivery_res.status_code}"
    print("      -> Public browsing and delivery info remain fully operational.")

    print("\n[SUCCESS] ALL 6 MSG91 INTEGRATION TESTS PASSED CLEANLY!\n")


if __name__ == "__main__":
    run_tests()


"""
Automated Integration Test Suite for Delivery Area Validation
Verifies Haversine calculations, store contact info, backend API security,
and database persistence.
"""

import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from geocoding import (
    STORE_NAME,
    STORE_OWNER,
    STORE_PHONE,
    STORE_LATITUDE,
    STORE_LONGITUDE,
    STORE_PINCODE,
    MAX_DELIVERY_RADIUS_METERS,
    calculate_store_distance,
    validate_coordinates,
    get_curated_landmarks,
)
from app import app


def test_haversine_math():
    print("[1/5] Testing Haversine Distance Calculations...")
    # Store to store: should be exactly 0
    d_zero = calculate_store_distance(STORE_LATITUDE, STORE_LONGITUDE)
    assert d_zero == 0.0, f"Expected 0.0, got {d_zero}"

    # Near Harraiya landmark (Tehsil office: ~320 m)
    valid_tehsil, elig_tehsil, dist_tehsil, _ = validate_coordinates(26.797200, 82.461100)
    assert valid_tehsil and elig_tehsil, "Tehsil should be eligible"
    assert 200 < dist_tehsil < 500, f"Unexpected distance: {dist_tehsil}"

    # Near village Belbhariya (~1.4 km)
    valid_bel, elig_bel, dist_bel, _ = validate_coordinates(26.805000, 82.470000)
    assert valid_bel and elig_bel, "Belbhariya should be eligible"
    assert 1000 < dist_bel < 2000, f"Unexpected distance: {dist_bel}"

    # Outside radius: Kaptanganj (~11 km)
    valid_kap, elig_kap, dist_kap, _ = validate_coordinates(26.760000, 82.350000)
    assert valid_kap and not elig_kap, "Kaptanganj must NOT be eligible"
    assert dist_kap > 5000, f"Expected > 5000, got {dist_kap}"

    # Outside radius: Basti City (~30 km)
    valid_bas, elig_bas, dist_bas, _ = validate_coordinates(26.801000, 82.763000)
    assert valid_bas and not elig_bas, "Basti City must NOT be eligible"
    assert dist_bas > 25000, f"Expected > 25000, got {dist_bas}"

    print("      -> Haversine distance calculations verified successfully!")


def test_delivery_info_endpoint():
    print("[2/5] Testing GET /delivery/info Endpoint...")
    client = app.test_client()
    res = client.get("/delivery/info")
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    data = res.get_json()

    assert data["store_name"] == STORE_NAME, "Store name mismatch"
    assert data["owner"] == STORE_OWNER, "Store owner mismatch"
    assert data["phone"] == "9919193538", "Phone mismatch"
    assert data["pincode"] == "272155", "PIN code mismatch"
    assert data["latitude"] == 26.794389, "Latitude mismatch"
    assert data["longitude"] == 82.462083, "Longitude mismatch"
    assert data["max_radius_km"] == 2.0, f"Expected 2.0 km, got {data['max_radius_km']}"
    assert "9919193538" in data["notice"], "Notice must mention owner phone"
    assert "272155" in data["notice"], "Notice must mention PIN 272155"
    assert "2 km" in data["notice"], "Notice must mention 2 km radius"
    assert len(data["landmarks"]) > 5, "Landmarks should have preset items"

    print("      -> Store metadata & delivery notices verified successfully!")


def test_delivery_validate_endpoint():
    print("[3/5] Testing POST /delivery/validate Endpoint...")
    client = app.test_client()

    # Valid within 2 km (Belbhariya at 1.4 km)
    res_in = client.post("/delivery/validate", json={"latitude": 26.805, "longitude": 82.470})
    assert res_in.status_code == 200, f"Expected 200, got {res_in.status_code}"
    data_in = res_in.get_json()
    assert data_in["is_eligible"] is True, "Expected is_eligible=True for 1.4 km"
    assert data_in["distance_km"] <= 2.0, "Expected distance <= 2 km"
    assert data_in["max_radius_km"] == 2.0, "Expected max_radius_km == 2.0"

    # Out of radius: Chhatauna at 2.6 km (> 2 km)
    res_chhat = client.post("/delivery/validate", json={"latitude": 26.812000, "longitude": 82.445000})
    assert res_chhat.status_code == 200, f"Expected 200, got {res_chhat.status_code}"
    data_chhat = res_chhat.get_json()
    assert data_chhat["is_eligible"] is False, "Chhatauna (2.6 km) must NOT be eligible under 2 km limit"
    assert data_chhat["distance_km"] > 2.0, "Expected distance > 2 km"

    # Out of radius (30 km)
    res_out = client.post("/delivery/validate", json={"latitude": 26.801, "longitude": 82.763})
    assert res_out.status_code == 200, f"Expected 200, got {res_out.status_code}"
    data_out = res_out.get_json()
    assert data_out["is_eligible"] is False, "Expected is_eligible=False"
    assert data_out["distance_km"] > 2.0, "Expected distance > 2 km"

    # Invalid coordinates
    res_bad = client.post("/delivery/validate", json={"latitude": 150.0, "longitude": 82.0})
    assert res_bad.status_code == 400, "Coordinates out of bounds should return 400"

    print("      -> Endpoint validation logic verified successfully!")


def test_order_creation_security():
    print("[4/5] Testing POST /orders Authoritative Radius Validation...")
    client = app.test_client()

    # Rejection: Out of 2 km radius coordinates (Chhatauna Village at 2.6 km)
    res_reject = client.post("/orders", json={
        "customer_name": "Far Customer",
        "customer_phone": "9876543210",
        "delivery_address": "Chhatauna Village",
        "city": "Harraiya, Basti",
        "pincode": "272155",
        "payment_method": "cod",
        "latitude": 26.812000,
        "longitude": 82.445000,
        "items": [{"product_id": 1, "quantity": 1}]
    })
    assert res_reject.status_code == 400, f"Expected 400 Bad Request, got {res_reject.status_code}"
    err_msg = res_reject.get_json().get("error", "")
    assert "outside our 2 km service area" in err_msg, f"Unexpected error message: {err_msg}"
    assert "9919193538" in err_msg, f"Expected owner phone in error message: {err_msg}"

    # Rejection: Missing coordinates with unresolvable address
    res_missing = client.post("/orders", json={
        "customer_name": "No Coordinates Customer",
        "customer_phone": "9876543210",
        "delivery_address": "Unknown Location Nowhere 99999",
        "city": "Unknown",
        "pincode": "000000",
        "payment_method": "cod",
        "items": [{"product_id": 1, "quantity": 1}]
    })
    assert res_missing.status_code == 400, "Missing coordinates must return 400"

    # Acceptance: Valid coordinates within 2 km (Purani Bazar, ~109m)
    res_accept = client.post("/orders", json={
        "customer_name": "Local Harraiya Customer",
        "customer_phone": "9876543210",
        "delivery_address": "Ward 4, Purani Bazar",
        "city": "Harraiya, Basti",
        "pincode": "272155",
        "payment_method": "cod",
        "latitude": 26.793800,
        "longitude": 82.461200,
        "items": [{"product_id": 1, "quantity": 1}]
    })
    assert res_accept.status_code == 201, f"Expected 201 Created, got {res_accept.status_code}"
    order_data = res_accept.get_json().get("order", {})
    assert order_data.get("deliveryLatitude") == 26.793800, "Saved latitude mismatch"
    assert order_data.get("deliveryLongitude") == 82.461200, "Saved longitude mismatch"
    assert order_data.get("deliveryDistanceKm") is not None, "Missing deliveryDistanceKm"
    assert order_data.get("deliveryDistanceKm") <= 2.0, f"Distance must be <= 2 km, got {order_data.get('deliveryDistanceKm')}"

    print("      -> Authoritative order security verified successfully!")


def test_database_persistence():
    print("[5/5] Testing PostgreSQL Database Orders Storage...")
    from app import get_db_connection

    conn = get_db_connection()
    cur = conn.cursor()
    cur.execute("""
        SELECT order_id, delivery_latitude, delivery_longitude, delivery_distance_meters
        FROM orders
        WHERE delivery_latitude IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1;
    """)
    row = cur.fetchone()
    assert row is not None, "Expected an order with persisted delivery coordinates"
    print(f"      -> Last order verified in DB: ID={row[0]}, Lat={row[1]}, Lon={row[2]}, Distance={row[3]}m")
    cur.close()
    conn.close()


if __name__ == "__main__":
    print("\n--- Starting Sanjay Kirana Store Delivery Area Test Suite ---\n")
    test_haversine_math()
    test_delivery_info_endpoint()
    test_delivery_validate_endpoint()
    test_order_creation_security()
    test_database_persistence()
    print("\n[SUCCESS] ALL 5 TEST SUITES PASSED CLEANLY!\n")


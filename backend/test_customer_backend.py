"""
Customer Dashboard & Account Backend Test Suite
Tests:
1. Customer Profile (GET/PUT /account/profile, phone immutability, role isolation)
2. Saved Delivery Addresses (CRUD, single default address constraint, customer isolation)
3. Reorder Preview (Safe preview, live stock/price check, customer isolation)
4. Verified Product Reviews (Delivered purchase requirement, duplicates prevention, aggregations, CRUD)
"""

import sys
import os
from pathlib import Path

backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app import app, get_db_connection
from auth_utils import generate_access_token


def setup_test_data():
    conn = get_db_connection()
    cur = conn.cursor()

    # Create two test customers
    cur.execute("""
        INSERT INTO users (phone, name)
        VALUES ('9811111111', 'Customer Alpha')
        ON CONFLICT (phone) DO UPDATE SET name = 'Customer Alpha'
        RETURNING id;
    """)
    user_a_id = cur.fetchone()[0]

    cur.execute("""
        INSERT INTO users (phone, name)
        VALUES ('9822222222', 'Customer Beta')
        ON CONFLICT (phone) DO UPDATE SET name = 'Customer Beta'
        RETURNING id;
    """)
    user_b_id = cur.fetchone()[0]

    # Clean up any leftover test addresses and reviews for these test users
    cur.execute("DELETE FROM customer_addresses WHERE user_id IN (%s, %s);", (user_a_id, user_b_id))
    cur.execute("DELETE FROM product_reviews WHERE user_id IN (%s, %s);", (user_a_id, user_b_id))

    # Pick a product for tests (ensure at least 1 product exists)
    cur.execute("SELECT id, name, price, stock FROM products ORDER BY id LIMIT 1;")
    prod = cur.fetchone()
    if not prod:
        cur.execute("""
            INSERT INTO products (name, brand, category, size, price, stock, rating, total_reviews)
            VALUES ('Test Tata Salt', 'Tata', 'Groceries', '1 kg', 28.00, 50, 0.0, 0)
            RETURNING id, name, price, stock;
        """)
        prod = cur.fetchone()

    product_id = prod[0]
    cur.execute("UPDATE products SET stock = 50 WHERE id = %s;", (product_id,))

    # Create a test delivered order for user_a containing product_id
    order_a_id_str = "SKTESTDELIV001"
    cur.execute("DELETE FROM orders WHERE order_id = %s;", (order_a_id_str,))
    cur.execute("""
        INSERT INTO orders (
            order_id, user_id, customer_name, customer_phone, delivery_address,
            city, pincode, payment_method, subtotal, delivery_charge,
            total_amount, total_items, status
        ) VALUES (
            %s, %s, 'Customer Alpha', '9811111111', 'Main Road, Harraiya',
            'Harraiya', '272155', 'cod', 56.00, 40.00,
            96.00, 2, 'Delivered'
        ) RETURNING id;
    """, (order_a_id_str, user_a_id))
    order_a_internal_id = cur.fetchone()[0]

    cur.execute("""
        INSERT INTO order_items (
            order_id, product_id, product_name, product_size,
            unit_price, quantity, total_price
        ) VALUES (
            %s, %s, %s, '1 kg', 28.00, 2, 56.00
        );
    """, (order_a_internal_id, product_id, prod[1]))

    # Create a test pending order for user_b containing product_id
    order_b_id_str = "SKTESTPEND002"
    cur.execute("DELETE FROM orders WHERE order_id = %s;", (order_b_id_str,))
    cur.execute("""
        INSERT INTO orders (
            order_id, user_id, customer_name, customer_phone, delivery_address,
            city, pincode, payment_method, subtotal, delivery_charge,
            total_amount, total_items, status
        ) VALUES (
            %s, %s, 'Customer Beta', '9822222222', 'Ward 3, Harraiya',
            'Harraiya', '272155', 'cod', 28.00, 40.00,
            68.00, 1, 'Order Placed'
        ) RETURNING id;
    """, (order_b_id_str, user_b_id))
    order_b_internal_id = cur.fetchone()[0]

    cur.execute("""
        INSERT INTO order_items (
            order_id, product_id, product_name, product_size,
            unit_price, quantity, total_price
        ) VALUES (
            %s, %s, %s, '1 kg', 28.00, 1, 28.00
        );
    """, (order_b_internal_id, product_id, prod[1]))

    conn.commit()
    cur.close()
    conn.close()

    return {
        "user_a_id": user_a_id,
        "user_b_id": user_b_id,
        "product_id": product_id,
        "order_a_id_str": order_a_id_str,
        "order_a_internal_id": order_a_internal_id,
        "order_b_id_str": order_b_id_str,
        "order_b_internal_id": order_b_internal_id,
    }


def run_tests():
    print("\n--- Starting Customer Backend Endpoints Test Suite ---\n")
    client = app.test_client()
    data = setup_test_data()

    user_a_token = generate_access_token(user_id=data["user_a_id"], role="customer", phone="9811111111")
    user_b_token = generate_access_token(user_id=data["user_b_id"], role="customer", phone="9822222222")
    admin_token = generate_access_token(user_id=999, role="admin", username="owner", phone="9554384886")

    headers_a = {"Authorization": f"Bearer {user_a_token}"}
    headers_b = {"Authorization": f"Bearer {user_b_token}"}
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # =========================================================================
    # 1. Profile Endpoints
    # =========================================================================
    print("[1/12] Testing GET /account/profile authentication and RBAC...")
    # Unauthenticated
    res = client.get("/account/profile")
    assert res.status_code == 401, f"Expected 401, got {res.status_code}"
    # Admin rejected from customer profile
    res = client.get("/account/profile", headers=headers_admin)
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"
    # Customer A profile
    res = client.get("/account/profile", headers=headers_a)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.get_data(as_text=True)}"
    p_data = res.get_json()
    assert p_data["phone"] == "9811111111"
    assert p_data["name"] == "Customer Alpha"
    assert p_data["total_orders"] >= 1
    assert p_data["recent_order"]["order_id"] == data["order_a_id_str"]
    print("       -> Successfully retrieved customer profile with order stats.")

    print("[2/12] Testing PUT /account/profile updates and phone immutability...")
    # Attempt to change phone should fail with 400
    res = client.put("/account/profile", json={"phone": "9999999999"}, headers=headers_a)
    assert res.status_code == 400, f"Expected 400 for phone change, got {res.status_code}"
    assert "Phone number cannot be changed" in res.get_json().get("error", "")

    # Update name succeeds
    res = client.put("/account/profile", json={"name": "Alpha Verified"}, headers=headers_a)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}"
    assert res.get_json()["profile"]["name"] == "Alpha Verified"
    print("       -> Phone number protected as immutable; name successfully updated.")

    # =========================================================================
    # 2. Saved Delivery Addresses
    # =========================================================================
    print("[3/12] Testing POST /account/addresses (first address auto-default)...")
    addr1_payload = {
        "recipient_name": "Alpha Home",
        "phone": "9811111111",
        "street_address": "Near Block Office, Harraiya",
        "landmark": "Block Office",
        "locality": "Civil Lines",
        "city": "Harraiya",
        "pincode": "272155",
        "label": "Home",
        "is_default": False # even if sent false, first address becomes default
    }
    res = client.post("/account/addresses", json=addr1_payload, headers=headers_a)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.get_data(as_text=True)}"
    addr1 = res.get_json()
    assert addr1["is_default"] is True, "First address must be marked default automatically"
    addr1_id = addr1["id"]
    print(f"       -> First address created with id {addr1_id} and auto is_default=True.")

    print("[4/12] Testing POST /account/addresses second address with is_default=True...")
    addr2_payload = {
        "recipient_name": "Alpha Shop",
        "phone": "9811111111",
        "street_address": "Main Market Road, Harraiya",
        "landmark": "Near SBI ATM",
        "label": "Work",
        "is_default": True
    }
    res = client.post("/account/addresses", json=addr2_payload, headers=headers_a)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}"
    addr2 = res.get_json()
    assert addr2["is_default"] is True
    addr2_id = addr2["id"]

    # Verify addr1 is no longer default
    res = client.get("/account/addresses", headers=headers_a)
    assert res.status_code == 200
    addresses = res.get_json()
    assert len(addresses) == 2
    # Addresses ordered by is_default DESC, so addr2 must be first
    assert addresses[0]["id"] == addr2_id and addresses[0]["is_default"] is True
    assert addresses[1]["id"] == addr1_id and addresses[1]["is_default"] is False
    print("       -> Single default address rule preserved; previous default was unset.")

    print("[5/12] Testing customer isolation on addresses (Customer B cannot touch A's address)...")
    # Customer B list is empty
    res = client.get("/account/addresses", headers=headers_b)
    assert res.status_code == 200
    assert len(res.get_json()) == 0

    # Customer B cannot edit A's address
    res = client.put(f"/account/addresses/{addr1_id}", json={"recipient_name": "Hacked"}, headers=headers_b)
    assert res.status_code == 404

    # Customer B cannot delete A's address
    res = client.delete(f"/account/addresses/{addr1_id}", headers=headers_b)
    assert res.status_code == 404
    print("       -> Strict customer isolation verified on addresses.")

    print("[6/12] Testing PATCH /account/addresses/<id>/default and DELETE...")
    # Set addr1 back to default
    res = client.patch(f"/account/addresses/{addr1_id}/default", headers=headers_a)
    assert res.status_code == 200
    assert res.get_json()["address"]["is_default"] is True

    # Delete addr1 (the default). addr2 should be auto-promoted to default
    res = client.delete(f"/account/addresses/{addr1_id}", headers=headers_a)
    assert res.status_code == 200

    res = client.get("/account/addresses", headers=headers_a)
    addresses = res.get_json()
    assert len(addresses) == 1
    assert addresses[0]["id"] == addr2_id
    assert addresses[0]["is_default"] is True
    print("       -> Address deleted and remaining address promoted to default successfully.")

    # =========================================================================
    # 3. Reorder Preview
    # =========================================================================
    print("[7/12] Testing POST /account/orders/<id>/reorder-preview isolation & catalog check...")
    # Customer B cannot preview Customer A's order
    res = client.post(f"/account/orders/{data['order_a_id_str']}/reorder-preview", headers=headers_b)
    assert res.status_code == 404, f"Expected 404 for cross-customer order preview, got {res.status_code}"

    # Customer A previews own order
    res = client.post(f"/account/orders/{data['order_a_id_str']}/reorder-preview", headers=headers_a)
    assert res.status_code == 200, f"Expected 200, got {res.status_code}: {res.get_data(as_text=True)}"
    ro_data = res.get_json()
    assert ro_data["order_id"] == data["order_a_id_str"]
    assert len(ro_data["items"]) == 1
    item = ro_data["items"][0]
    assert item["product_id"] == data["product_id"]
    assert item["is_available"] is True
    assert item["requested_quantity"] == 2
    assert "summary" in ro_data
    print("       -> Reorder preview verified live catalog status without placing any order.")

    # =========================================================================
    # 4. Verified Product Reviews
    # =========================================================================
    print("[8/12] Testing review eligibility (Delivered order required)...")
    # Customer B has only an 'Order Placed' (Pending) order, so eligible should be False
    res = client.get(f"/products/{data['product_id']}/review-eligibility", headers=headers_b)
    assert res.status_code == 200
    assert res.get_json()["eligible"] is False
    print("       -> Customer B without Delivered order correctly marked NOT eligible.")

    print("[9/12] Testing review submission rejection for non-delivered customer...")
    res = client.post(
        f"/products/{data['product_id']}/reviews",
        json={"rating": 5, "review_text": "Trying to review before delivery"},
        headers=headers_b
    )
    assert res.status_code == 403, f"Expected 403, got {res.status_code}"
    print("       -> Rejected review submission with 403 for unverified delivery.")

    print("[10/12] Testing review submission for verified Customer A with Delivered order...")
    # Customer A has a Delivered order
    res = client.get(f"/products/{data['product_id']}/review-eligibility", headers=headers_a)
    assert res.status_code == 200
    assert res.get_json()["eligible"] is True

    review_payload = {
        "rating": 5,
        "review_text": "Excellent quality Tata Salt delivered promptly in Harraiya!",
    }
    res = client.post(f"/products/{data['product_id']}/reviews", json=review_payload, headers=headers_a)
    assert res.status_code == 201, f"Expected 201, got {res.status_code}: {res.get_data(as_text=True)}"
    review_obj = res.get_json()["review"]
    review_id = review_obj["id"]
    assert review_obj["rating"] == 5
    print(f"       -> Review created with id {review_id} for verified purchase.")

    print("[11/12] Testing duplicate review prevention for same order/product...")
    res = client.post(f"/products/{data['product_id']}/reviews", json=review_payload, headers=headers_a)
    assert res.status_code == 409, f"Expected 409 duplicate review error, got {res.status_code}"
    print("       -> Duplicate review prevented with 409 conflict.")

    print("[12/12] Testing public reviews summary, account review list, and review update/delete...")
    # Public view
    res = client.get(f"/products/{data['product_id']}/reviews")
    assert res.status_code == 200
    pub_data = res.get_json()
    assert pub_data["summary"]["total_reviews"] >= 1
    assert pub_data["summary"]["average_rating"] == 5.0
    assert len(pub_data["reviews"]) >= 1
    assert pub_data["reviews"][0]["verified_purchase"] is True

    # Customer A view
    res = client.get("/account/reviews", headers=headers_a)
    assert res.status_code == 200
    my_reviews = res.get_json()
    assert len(my_reviews) >= 1
    assert my_reviews[0]["id"] == review_id

    # Update review
    res = client.put(f"/account/reviews/{review_id}", json={"rating": 4, "review_text": "Good quality"}, headers=headers_a)
    assert res.status_code == 200
    assert res.get_json()["review"]["rating"] == 4

    # Delete review
    res = client.delete(f"/account/reviews/{review_id}", headers=headers_a)
    assert res.status_code == 200
    print("       -> Public reviews breakdown, customer review history, edit & delete verified.")

    print("\n[SUCCESS] All 12 Customer Backend Test Cases Passed Successfully!\n")


if __name__ == "__main__":
    run_tests()

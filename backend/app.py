import os
import re
import secrets
import time
from datetime import datetime, timezone, timedelta

import jwt

import psycopg
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS

load_dotenv()


app = Flask(__name__)

CORS(app)


# ---------------------------------------------------------------------------
# In-memory OTP store  (development only — not persisted to PostgreSQL)
# Structure:  { "9876543210": {"otp": "483921", "expires_at": <unix_timestamp>} }
# ---------------------------------------------------------------------------
_otp_store: dict[str, dict] = {}
_OTP_TTL_SECONDS = 300          # 5 minutes
_INDIAN_MOBILE_RE = re.compile(r"^[6-9]\d{9}$")  # 10-digit, starts with 6-9

# ---------------------------------------------------------------------------
# JWT configuration — secret MUST be set in the environment, never hardcoded
# ---------------------------------------------------------------------------
_JWT_SECRET = os.getenv("JWT_SECRET")
if not _JWT_SECRET:
    raise RuntimeError("JWT_SECRET environment variable is not set. Add it to your .env file.")
_JWT_ALGORITHM = "HS256"
_JWT_EXPIRY_HOURS = 24          # token valid for 24 hours


def get_db_connection():
    return psycopg.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


# ---------------------------------------------------------------------------
# Auth routes
# ---------------------------------------------------------------------------

@app.route("/auth/send-otp", methods=["POST"])
def send_otp():
    # ── 1. Parse body ──────────────────────────────────────────────────────
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    # ── 2. Validate phone field presence ───────────────────────────────────
    phone = data.get("phone")
    if phone is None:
        return jsonify({"error": "Missing required field: 'phone'."}), 400
    if not isinstance(phone, str):
        return jsonify({"error": "'phone' must be a string."}), 400

    phone = phone.strip()
    if not phone:
        return jsonify({"error": "'phone' must not be blank."}), 400

    # ── 3. Validate Indian 10-digit mobile number ──────────────────────────
    if not _INDIAN_MOBILE_RE.match(phone):
        return jsonify({
            "error": "Invalid phone number. Enter a valid 10-digit Indian mobile number (starting with 6–9)."
        }), 400

    # ── 4. Generate cryptographically secure 6-digit OTP ──────────────────
    otp = f"{secrets.randbelow(1_000_000):06d}"   # zero-padded, range 000000–999999

    # ── 5. Store OTP in memory with expiry timestamp ───────────────────────
    expires_at = time.time() + _OTP_TTL_SECONDS
    _otp_store[phone] = {
        "otp": otp,
        "expires_at": expires_at,
    }

    # ── 6. Log OTP to Flask console (DEV ONLY — remove before production) ──
    app.logger.info(
        "[DEV] OTP for %s: %s  (expires in %d seconds)",
        phone, otp, _OTP_TTL_SECONDS
    )

    # ── 7. Return success — OTP is NOT included in the response ───────────
    return jsonify({
        "message": "OTP sent successfully.",
        "phone": phone,
        "expires_in_seconds": _OTP_TTL_SECONDS,
    }), 200


@app.route("/auth/verify-otp", methods=["POST"])
def verify_otp():
    # ── 1. Parse body ──────────────────────────────────────────────────────
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({"error": "Invalid request body. JSON payload is required."}), 400

    # ── 2. Validate phone ──────────────────────────────────────────────────
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

    # ── 3. Validate OTP field ──────────────────────────────────────────────
    submitted_otp = data.get("otp")
    if submitted_otp is None:
        return jsonify({"error": "Missing required field: 'otp'."}), 400
    if not isinstance(submitted_otp, str):
        return jsonify({"error": "'otp' must be a string."}), 400
    submitted_otp = submitted_otp.strip()
    if not re.fullmatch(r"\d{6}", submitted_otp):
        return jsonify({"error": "Invalid OTP format. OTP must be a 6-digit numeric string."}), 400

    # ── 4. Look up OTP in memory ───────────────────────────────────────────
    record = _otp_store.get(phone)
    if record is None:
        return jsonify({"error": "No OTP was requested for this phone number."}), 400

    # ── 5. Check expiry ────────────────────────────────────────────────────
    if time.time() > record["expires_at"]:
        _otp_store.pop(phone, None)   # clean up stale entry
        return jsonify({"error": "OTP has expired. Please request a new one."}), 400

    # ── 6. Check OTP value (constant-time comparison to prevent timing attacks)
    if not secrets.compare_digest(record["otp"], submitted_otp):
        return jsonify({"error": "Incorrect OTP."}), 400

    # ── 7. OTP matched — delete immediately (single-use) ──────────────────
    _otp_store.pop(phone, None)

    # ── 8. Upsert user in PostgreSQL ───────────────────────────────────────
    connection = None
    try:
        connection = get_db_connection()
        cursor = connection.cursor()

        # Insert if not exists, otherwise return existing row
        cursor.execute("""
            INSERT INTO users (phone)
            VALUES (%s)
            ON CONFLICT (phone) DO UPDATE
                SET phone = EXCLUDED.phone
            RETURNING id, phone, name;
        """, (phone,))

        user_row = cursor.fetchone()
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
        return jsonify({"error": "Database error: " + str(e)}), 500

    user_id   = user_row[0]
    user_phone = user_row[1]
    user_name  = user_row[2]   # NULL until the user sets their name

    # ── 9. Issue JWT ────────────────────────────────────────────────────────
    now = datetime.now(tz=timezone.utc)
    payload = {
        "sub": user_id,                                        # subject: user's DB id
        "phone": user_phone,
        "iat": now,                                            # issued at
        "exp": now + timedelta(hours=_JWT_EXPIRY_HOURS),      # expiry
    }
    token = jwt.encode(payload, _JWT_SECRET, algorithm=_JWT_ALGORITHM)

    # ── 10. Return success ─────────────────────────────────────────────────
    return jsonify({
        "message": "OTP verified successfully.",
        "token": token,
        "user": {
            "id": user_id,
            "phone": user_phone,
            "name": user_name,
        },
    }), 200


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


# Create a new order
@app.route("/orders", methods=["POST"])
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

        # Insert order into orders table
        cursor.execute("""
            INSERT INTO orders (
                order_id, customer_name, customer_phone, delivery_address, city, pincode,
                payment_method, subtotal, delivery_charge, total_amount, total_items, status
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
            ) RETURNING id, created_at;
        """, (
            order_id, customer_name, customer_phone, delivery_address, city, pincode,
            payment_method, subtotal, delivery_charge, total_amount, total_items, "Order Placed"
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

        # Commit PostgreSQL transaction
        connection.commit()
        cursor.close()
        connection.close()

        return jsonify({
            "message": "Order placed successfully!",
            "order": {
                "id": internal_order_id,
                "orderId": order_id,
                "order_id": order_id,
                "customerName": customer_name,
                "customer_name": customer_name,
                "customerPhone": customer_phone,
                "customer_phone": customer_phone,
                "deliveryAddress": delivery_address,
                "delivery_address": delivery_address,
                "city": city,
                "pincode": pincode,
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


if __name__ == "__main__":
    app.run(debug=True)
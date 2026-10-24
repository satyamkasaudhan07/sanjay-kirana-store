# 🛒 Sanjay Kirana Store

A modern, full-stack grocery ordering, delivery management, and inventory platform purpose-built for **Sanjay Kirana Store** in **Harraiya, Basti, Uttar Pradesh**.

Built with **React + Vite**, **Flask (Python)**, and **PostgreSQL**, this platform provides a seamless, passwordless customer shopping experience, real-time visual order tracking, strict role-based access control, an owner notification center, and non-blocking asynchronous WhatsApp alerts.

---

## 🌟 Key Features

### 🛍️ Customer Experience & Ordering
- **Rich Product Catalog**: Fast browsing by grocery categories (Atta, Rice, Dal, Spices, Oils, Packaged Snacks, Personal Care, Household Essentials).
- **Search & Filters**: Real-time product search, price filtering, in-stock filtering, and category filtering.
- **Cart & Wishlist**: Persistent client cart with live total calculations, free delivery thresholds, and stock validation.
- **Idempotent Checkout**: Backend idempotency protection (`idempotency_key` via payload and HTTP header) preventing duplicate order placement from double-clicks or unstable mobile connections.
- **Order Placed Popup**: Celebratory post-checkout modal showing Order ID, total amount, payment method (Cash on Delivery / UPI), delivery estimate (*30–45 minutes across Harraiya*), and one-click tracking navigation.

### 📍 Visual Order Tracking (`/track-order/:orderId`)
- **6-Stage Visual Progress Timeline**:
  1. `Order Placed`
  2. `Order Confirmed`
  3. `Order Packed`
  4. `Order Dispatched`
  5. `Out for Delivery`
  6. `Delivered`
  *(plus terminal `Cancelled` status with automatic product inventory restoration).*
- **Dual Tracking Modes**:
  - **Authenticated Owner**: Logged-in customers view full delivery addresses and status history.
  - **Secure Public Link**: High-entropy unguessable tracking tokens (`?token=<tracking_token>`) mask customer phone numbers (`******0001`) and PII for privacy.
- **Live Polling**: Automatic 15-second background status refresh without reloading the page.
- **Customer Cancellation**: Self-service cancellation allowed while the order is in `Order Placed` status.

### 🔐 Passwordless Authentication & Security Hardening
- **MSG91 OTP Web SDK**: Native popup OTP verification for Indian mobile numbers (`+91`).
- **Strict Indian Mobile Normalization**: Standardizes mobile numbers (`+91`, leading `0`, spaces, dashes) to valid 10-digit formats starting with 6–9.
- **IPBlocked & Throttling Defense**: Application-level detection for MSG91 fraud protection (`IPBlocked`, Code 418), in-memory double-click locking (`isLaunchingRef`), and a 15-minute cooldown countdown timer.
- **Direct SMS OTP Fallback**: Secondary server-side OTP flow with 30-second resend cooldown and 5-minute single-use database challenge lifecycle.
- **Profile Completion**: Seamless onboarding for first-time customers (name, mobile verification, detailed delivery address within Harraiya).

### 👑 Store Owner Management Portal (`/owner/dashboard`)
- **Notification Centre**: Persistent bell icon with real-time unread badge counter, backed by PostgreSQL `owner_notifications` table, with individual and "Mark all as read" endpoints.
- **Order Management & Transition Machine**: Filter orders by status pills, enforce valid lifecycle transitions, restore inventory on cancellations, and log actor roles and internal notes into `order_status_history`.
- **Async WhatsApp Notifications**: Non-blocking background thread dispatches order alerts to the store owner's mobile (`9919193538`) via Meta Cloud API and the `whatsapp_outbox` table without slowing down customer checkout.
- **Sales Analytics**: Revenue metrics, order counts, and top-selling items.

### 🛡️ Multi-Role Role-Based Access Control (RBAC)
- **Three Distinct User Roles**:
  - `customer`: Browsing, ordering, personal order history, account management.
  - `admin`: Store administration, catalog updates, stock management.
  - `owner`: Master store management, order lifecycle overrides, notification centre, WhatsApp gateway settings, financial metrics.
- **JWT Cryptographic Verification**: Tamper-proof JSON Web Tokens with role claims and expiration guards. Customer tokens are blocked from admin and owner APIs (HTTP 403 Forbidden).

---

## 🏗️ Architecture & Tech Stack

```
   ┌──────────────────────────────────────────────────────────────┐
   │                  React 18 + Vite Frontend                    │
   │      (Navbar, Catalog, Cart, Checkout, Tracking, Dashboards) │
   └──────────────────────────────┬───────────────────────────────┘
                                  │ HTTPS / REST API
                                  ▼
   ┌──────────────────────────────────────────────────────────────┐
   │                     Flask Python Backend                     │
   │  (Auth, Orders, RBAC, Rate Limiting, Tracking, Geocoding)    │
   └───────────────┬──────────────────────────────┬───────────────┘
                   │                              │
                   ▼                              ▼
   ┌──────────────────────────────┐   ┌───────────────────────────┐
   │     PostgreSQL Database      │   │     External Gateways     │
   │ (Orders, Users, History,     │   │ - MSG91 OTP Widget & Flow │
   │  Notifications, WA Outbox)   │   │ - WhatsApp Cloud API      │
   └──────────────────────────────┘   │ - Nominatim Geocoding     │
                                      └───────────────────────────┘
```

| Layer | Technology | Key Libraries / Modules |
|---|---|---|
| **Frontend** | React 18, Vite | React Router DOM v7, React Icons, Axios, Rolldown / PostCSS |
| **Backend** | Python 3.10+, Flask | Psycopg2 (Binary), PyJWT, Requests, Geopy, Cryptography |
| **Database** | PostgreSQL 14+ | ACID transactions (`SELECT ... FOR UPDATE`), Trigger history, Migrations |
| **Auth & SMS** | MSG91 Web SDK / Flow API | OTP Widget, WhatsApp alerts, fallback SMS gateway |
| **Theme** | Custom CSS3 | Indian Kirana cream (`#fdfbf7`) & forest green (`#1b4d3e`) design system |

---

## 🗄️ Database Schema & Migrations

The database includes transactional tables designed for reliability and auditability:

- **`users`**: Customer accounts, verified phone/email, profile completion flag.
- **`customer_profiles` & `addresses`**: Customer address books, geocoded coordinates, landmarks.
- **`products` & `categories`**: Grocery inventory, stock levels, units (kg, gm, litre, pack), pricing, images.
- **`orders` & `order_items`**: Order headers, totals, payment methods, delivery addresses, coordinates, `idempotency_key`, and `tracking_token`.
- **`order_status_history`**: Audit trail of every status transition (`Order Placed` ➔ `Delivered`), timestamp, and actor role (`customer`, `admin`, `owner`).
- **`owner_notifications`**: In-app notifications for the store owner with read/unread tracking.
- **`whatsapp_outbox`**: Non-blocking asynchronous WhatsApp message queue.
- **`auth_challenges`**: Ephemeral single-use OTP challenges with 5-minute expiry and attempt limits.
- **`admin_accounts`**: Bcrypt-hashed administrator and owner credentials.

Database migrations are located in `database/migrations/` and managed safely via [database/run_migration.py](file:///c:/Users/satya/Desktop/Personal/Sanjay%20Kirana%20Store/database/run_migration.py).

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** (v18.x or later) and **npm**
- **Python** (v3.10 or later) and **pip**
- **PostgreSQL** (v14 or later) running locally or in the cloud

---

### 2. Database Setup
Create the database in PostgreSQL:
```sql
CREATE DATABASE sanjay_kirana;
```

Run schema migrations:
```powershell
cd "database"
python run_migration.py
```

---

### 3. Backend Setup
1. Navigate to the `backend/` directory:
   ```powershell
   cd "backend"
   ```
2. Create and activate a Python virtual environment:
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   ```
3. Install dependencies:
   ```powershell
   pip install -r requirements.txt
   ```
4. Configure environment variables in `backend/.env` (see template in `backend/.env.example`):
   ```env
   FLASK_ENV=development
   DEBUG=true
   DB_HOST=localhost
   DB_PORT=5432
   DB_NAME=sanjay_kirana
   DB_USER=postgres
   DB_PASSWORD=your_postgres_password
   JWT_SECRET=your_super_strong_jwt_secret_key

   # SMS & MSG91 Gateway
   MSG91_AUTHKEY=your_msg91_authkey
   SMS_PROVIDER=msg91
   ALLOW_MOCK_SMS=false
   MSG91_TEMPLATE_ID=your_msg91_template_id

   # Fixed Store Phones
   ADMIN_PHONE=9554384886
   OWNER_PHONE=9919193538

   # WhatsApp Gateway (Optional / Non-blocking)
   WHATSAPP_ENABLED=false
   WHATSAPP_ACCESS_TOKEN=your_meta_token
   WHATSAPP_PHONE_NUMBER_ID=your_phone_id
   OWNER_WHATSAPP_PHONE=919919193538
   ```
5. Start the Flask server:
   ```powershell
   python app.py
   ```
   *The backend runs on `http://127.0.0.1:5000`.*

---

### 4. Frontend Setup
1. Navigate to the `frontend/` directory:
   ```powershell
   cd "frontend"
   ```
2. Install dependencies:
   ```powershell
   npm install
   ```
3. Configure environment variables in `frontend/.env` (see `frontend/.env.example`):
   ```env
   VITE_API_URL=http://127.0.0.1:5000
   VITE_MSG91_WIDGET_ID=your_msg91_widget_id
   VITE_MSG91_TOKEN_AUTH=your_msg91_token_auth
   ```
4. Start the Vite development server:
   ```powershell
   npm run dev
   ```
   *The frontend runs on `http://localhost:5173`.*

---

## 🧪 Testing & Verification

The project includes a comprehensive suite of **69 automated unit and integration tests** with 100% pass rates:

```powershell
# Run the entire backend test suite
cd "backend"
python -m unittest discover backend
```

### Covered Test Suites:
- `test_order_tracking_notifications.py` (13 tests): Idempotency deduplication, tracking timeline stages, unguessable tokens, masked PII, status state machine, cancellation inventory restoration, owner notifications, and WhatsApp outbox.
- `test_ipblocked_and_widget_hardening.py` (8 tests): MSG91 `IPBlocked` and Code 418 handling, throttle limit HTTP 429 conversion, fail-closed JWT guards, email rejection for admin, and RBAC isolation.
- `test_admin_otp.py` (11 tests): Admin two-step login, password verification, single-use challenges, resend cooldown, and rate limiting.
- `test_multi_role_auth.py` (7 tests): Cross-role authorization barriers (Customer vs Admin vs Owner).
- `test_delivery_validation.py` (4 tests): Harraiya geographic delivery boundary checks.
- `test_sms_delivery.py` (9 tests): SMS provider failover, format validation, and MSG91 error parsing.
- `test_customer_backend.py` & `test_customer_onboarding.py` (17 tests): Profile completion, address book management, order placement.

### Frontend Production Build:
```powershell
cd "frontend"
npm run build
```
*(Builds with 0 errors via Vite / Rolldown).*

---

## 📂 Project Directory Structure

```
Sanjay Kirana Store/
├── backend/
│   ├── app.py                                   # Main Flask REST API & route handlers
│   ├── auth_utils.py                            # JWT tokens, password hashing & rate limiters
│   ├── sms.py                                   # MSG91 SMS dispatch & normalization logic
│   ├── whatsapp.py                              # Non-blocking async WhatsApp outbox helper
│   ├── geocoding.py                             # Geopy / Nominatim delivery boundary validation
│   ├── requirements.txt                         # Python dependencies
│   ├── test_ipblocked_and_widget_hardening.py  # IPBlocked & widget defense tests
│   ├── test_order_tracking_notifications.py     # Tracking & notification test suite
│   └── test_*.py                                # Multi-role, delivery & auth test suites
├── database/
│   ├── schema.sql                               # Base PostgreSQL schema
│   ├── run_migration.py                         # Migration runner script
│   └── migrations/                              # Incremental SQL migration scripts (001 - 007)
├── frontend/
│   ├── public/                                  # Static assets (hero banners, store logo)
│   ├── src/
│   │   ├── components/                          # Navbar, Footer, Hero, ProductCard, Categories
│   │   ├── pages/
│   │   │   ├── Home.jsx                         # Store homepage
│   │   │   ├── Products.jsx & ProductDetails.jsx# Product listing & details
│   │   │   ├── Cart.jsx & Checkout.jsx          # Shopping cart & checkout with popup
│   │   │   ├── TrackOrder.jsx                   # Customer order tracking timeline
│   │   │   ├── Login.jsx                        # Customer passwordless login (MSG91)
│   │   │   ├── CompleteProfile.jsx              # Customer profile onboarding
│   │   │   ├── Orders.jsx & Account.jsx         # Customer order history & address book
│   │   │   ├── AdminLogin.jsx & AdminDashboard  # Store admin portal
│   │   │   └── OwnerLogin.jsx & OwnerDashboard  # Owner command center & notifications
│   │   ├── utils/                               # API client, Auth state, Phone validation
│   │   ├── App.jsx                              # Route definitions & protected routes
│   │   └── main.jsx                             # Application root
│   ├── package.json
│   └── vite.config.js
└── README.md
```

---

## 🔒 Security Best Practices Implemented

1. **Fail-Closed Verification**: The application never accepts an authentication request merely because an external API returned HTTP 200. Verification tokens are inspected server-side.
2. **Environment Variable Secret Isolation**: Auth keys, database credentials, and system tokens are strictly stored in `.env` and never checked into source control or exposed to the client.
3. **Idempotency Protection**: Order submissions generate unique client keys to prevent duplicate payments or orders.
4. **PII Masking**: Customer contact details and addresses are masked on public tracking links.
5. **Anti-Flooding**: Loopback IP rate limits and MSG91 provider cooldown guards prevent bot spamming and SMS bombing.

---

## 📍 Store Information

- **Store**: Sanjay Kirana Store
- **Location**: Harraiya, Basti, Uttar Pradesh — 272155
- **Admin Phone**: `+91 9554384886`
- **Owner Phone**: `+91 9919193538`
- **License**: Private family-owned commercial platform. All rights reserved.

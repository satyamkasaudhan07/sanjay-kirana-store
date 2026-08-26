import os
import sys
from pathlib import Path
import psycopg
from dotenv import load_dotenv

# Load environment variables from backend/.env
env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)


def run(cursor, sql, description):
    """Execute a single SQL statement, printing progress."""
    try:
        cursor.execute(sql)
        print(f"  [OK] {description}")
    except Exception as e:
        print(f"  [WARN] {description}: {e}")
        raise


def create_tables():
    print("Connecting to PostgreSQL database...")
    try:
        connection = psycopg.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432"),
            dbname=os.getenv("DB_NAME", "sanjay_kirana"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD", "Sk1234@#"),
        )
        connection.autocommit = True
        cursor = connection.cursor()

        # -------------------------------------------------------
        # 1. users table (new)
        # -------------------------------------------------------
        print("\n[Step 1] Creating users table if it doesn't exist...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id SERIAL PRIMARY KEY,
                phone VARCHAR(15) UNIQUE NOT NULL,
                name VARCHAR(150),
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("  [OK] users table created/verified.")

        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
        """)
        print("  [OK] idx_users_phone index created/verified.")

        # -------------------------------------------------------
        # 2. orders table (already exists; idempotent for new dbs)
        # -------------------------------------------------------
        print("\n[Step 2] Ensuring orders table exists...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS orders (
                id SERIAL PRIMARY KEY,
                order_id VARCHAR(64) UNIQUE NOT NULL,
                user_id INTEGER REFERENCES users(id),
                customer_name VARCHAR(150) NOT NULL,
                customer_phone VARCHAR(20) NOT NULL,
                delivery_address TEXT NOT NULL,
                city VARCHAR(100) NOT NULL,
                pincode VARCHAR(20) NOT NULL,
                payment_method VARCHAR(50) NOT NULL DEFAULT 'cod',
                subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                delivery_charge NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
                total_items INTEGER NOT NULL DEFAULT 0,
                status VARCHAR(50) NOT NULL DEFAULT 'Order Placed',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("  [OK] orders table created/verified.")

        # -------------------------------------------------------
        # 3. Migrate: add user_id column to existing orders table
        # -------------------------------------------------------
        print("\n[Step 3] Checking if orders.user_id column already exists...")
        cursor.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'orders'
              AND column_name = 'user_id';
        """)
        col_exists = cursor.fetchone()

        if col_exists:
            print("  [OK] orders.user_id already exists — no action needed.")
        else:
            print("  orders.user_id not found. Adding column...")
            cursor.execute("""
                ALTER TABLE orders
                ADD COLUMN user_id INTEGER REFERENCES users(id);
            """)
            print("  [OK] orders.user_id added successfully.")

        # -------------------------------------------------------
        # 4. Ensure idx_orders_user_id index exists
        # -------------------------------------------------------
        print("\n[Step 4] Ensuring idx_orders_user_id index exists...")
        cursor.execute("""
            SELECT indexname
            FROM pg_indexes
            WHERE tablename = 'orders'
              AND indexname = 'idx_orders_user_id';
        """)
        idx_exists = cursor.fetchone()

        if idx_exists:
            print("  [OK] idx_orders_user_id already exists — no action needed.")
        else:
            print("  Creating idx_orders_user_id...")
            cursor.execute("""
                CREATE INDEX idx_orders_user_id ON orders(user_id);
            """)
            print("  [OK] idx_orders_user_id created.")

        # -------------------------------------------------------
        # 5. order_items table (already exists; idempotent)
        # -------------------------------------------------------
        print("\n[Step 5] Ensuring order_items table and indexes exist...")
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS order_items (
                id SERIAL PRIMARY KEY,
                order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
                product_id INTEGER NOT NULL REFERENCES products(id),
                product_name VARCHAR(255) NOT NULL,
                product_size VARCHAR(100),
                product_image VARCHAR(500),
                unit_price NUMERIC(10, 2) NOT NULL,
                quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
                total_price NUMERIC(10, 2) NOT NULL,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)
        print("  [OK] order_items table created/verified.")

        cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_order_id ON orders(order_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);")
        print("  [OK] All indexes created/verified.")

        cursor.close()
        connection.close()
        print("\n=== Migration complete! ===\n")

    except Exception as e:
        print(f"\nFatal error during migration: {e}")
        sys.exit(1)


if __name__ == "__main__":
    create_tables()

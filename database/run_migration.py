import os
import sys
from pathlib import Path
import psycopg
from dotenv import load_dotenv

# Load database settings from backend/.env
env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)

def apply_migration(filename=None):
    if filename:
        target_file = Path(__file__).resolve().parent / "migrations" / filename
    elif len(sys.argv) > 1:
        target_file = Path(__file__).resolve().parent / "migrations" / sys.argv[1]
    else:
        target_file = Path(__file__).resolve().parent / "migrations" / "003_add_order_coordinates.sql"

    print(f"Applying migration: {target_file.name}")
    if not target_file.exists():
        print(f"Error: Migration file not found at {target_file}")
        sys.exit(1)

    sql_content = target_file.read_text(encoding="utf-8")

    try:
        conn = psycopg.connect(
            host=os.getenv("DB_HOST", "localhost"),
            port=os.getenv("DB_PORT", "5432"),
            dbname=os.getenv("DB_NAME", "sanjay_kirana"),
            user=os.getenv("DB_USER", "postgres"),
            password=os.getenv("DB_PASSWORD"),
            sslmode=os.getenv("DB_SSLMODE", "disable")
        )
        conn.autocommit = True
        cur = conn.cursor()

        cur.execute(sql_content)
        print("Migration applied successfully!")

        # Verify columns in orders table
        cur.execute("""
            SELECT column_name, data_type 
            FROM information_schema.columns 
            WHERE table_name = 'orders' 
              AND column_name IN ('delivery_latitude', 'delivery_longitude', 'delivery_distance_meters')
            ORDER BY column_name;
        """)
        verified_columns = cur.fetchall()
        print(f"Verified orders table columns: {verified_columns}")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error applying migration: {e}")
        sys.exit(1)

if __name__ == "__main__":
    apply_migration()


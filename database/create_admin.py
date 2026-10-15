import os
import sys
import argparse
import getpass
from pathlib import Path
import psycopg
from dotenv import load_dotenv
from werkzeug.security import generate_password_hash

env_path = Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=env_path)

def provision_admin(username=None, password=None, phone=None):
    if not username:
        username = input("Enter admin username: ").strip()
    if not phone:
        default_phone = os.getenv("ADMIN_PHONE", "9554384886")
        entered = input(f"Enter admin phone number (press Enter for owner phone {default_phone}): ").strip()
        phone = entered if entered else default_phone
    if not password:
        password = getpass.getpass("Enter admin password: ").strip()
        confirm = getpass.getpass("Confirm admin password: ").strip()
        if password != confirm:
            print("Error: Passwords do not match.")
            sys.exit(1)

    if not username:
        print("Error: Username cannot be blank.")
        sys.exit(1)
    if not phone or len(phone) < 10:
        print("Error: A valid 10-digit phone number is required.")
        sys.exit(1)
    if len(password) < 8:
        print("Error: Password must be at least 8 characters long.")
        sys.exit(1)

    password_hash = generate_password_hash(password)

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

        cur.execute("""
            INSERT INTO admin_accounts (username, password_hash, phone, is_active)
            VALUES (%s, %s, %s, TRUE)
            ON CONFLICT (username) DO UPDATE
                SET password_hash = EXCLUDED.password_hash,
                    phone = EXCLUDED.phone,
                    is_active = TRUE
            RETURNING id, username, phone, is_active;
        """, (username, password_hash, phone))

        row = cur.fetchone()
        print(f"\nAdmin account provisioned successfully!")
        print(f"ID: {row[0]}")
        print(f"Username: {row[1]}")
        print(f"Registered Phone: {row[2]}")
        print(f"Active: {row[3]}\n")

        cur.close()
        conn.close()
    except Exception as e:
        print(f"Error provisioning admin: {e}")
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provision an owner admin account in PostgreSQL.")
    parser.add_argument("--username", help="Admin username")
    parser.add_argument("--phone", help="Admin phone number (10 digits)")
    parser.add_argument("--password", help="Admin password (optional; prompted securely if omitted)")
    args = parser.parse_args()

    provision_admin(args.username, args.password, args.phone)


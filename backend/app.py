import os

import psycopg
from flask import Flask, jsonify
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)


def get_db_connection():
    return psycopg.connect(
        host=os.getenv("DB_HOST"),
        port=os.getenv("DB_PORT"),
        dbname=os.getenv("DB_NAME"),
        user=os.getenv("DB_USER"),
        password=os.getenv("DB_PASSWORD"),
    )


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

if __name__ == "__main__":
    app.run(debug=True)
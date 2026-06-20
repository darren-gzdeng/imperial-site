from flask import Blueprint, jsonify, request

from core.auth import admin_required
from core.database import get_db
from core.utils import calculate_retail_price, normalize_quantity, sydney_timestamp
from services.stock_service import ensure_inventory_rows, record_stock_history, release_expired_reservations


products_bp = Blueprint("products", __name__)


# -------------------------
# Products
# -------------------------
@products_bp.route('/products', methods=['GET'])
def get_products():
    conn = get_db()
    cursor = conn.cursor()

    try:
        ensure_inventory_rows(cursor)
        release_expired_reservations(cursor)
        conn.commit()
        cursor.execute("""
            SELECT products.id, products.item, products.sku, products.weight, products.unit_price, products.retail_price,
                   products.updated_at, COALESCE(inventory.stock_quantity, 0)
            FROM products
            LEFT JOIN inventory ON inventory.product_id = products.id
            ORDER BY item
        """)
        products = cursor.fetchall()

        return jsonify([
            {
                "id": product[0],
                "item": product[1],
                "sku": product[2] or "",
                "weight": product[3],
                "unit_price": product[4],
                "retail_price": product[5],
                "updated_at": product[6],
                "stock_quantity": product[7],
            }
            for product in products
        ])
    finally:
        conn.close()


@products_bp.route('/products', methods=['POST'])
@admin_required
def create_product(user):
    data = request.json or {}

    item = (data.get("item") or "").strip()
    unit_price = data.get("unit_price")
    stock_quantity = normalize_quantity(data.get("stock_quantity"))
    stock_comment = (data.get("stock_comment") or "").strip()

    if stock_quantity is None:
        stock_quantity = 0

    if not item or unit_price in (None, ""):
        return jsonify({"error": "Item and unit price are required"}), 400

    try:
        unit_price = float(unit_price)
    except (TypeError, ValueError):
        return jsonify({"error": "Unit price must be a number"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        updated_at = sydney_timestamp()
        retail_price = calculate_retail_price(unit_price)
        cursor.execute(
            "INSERT INTO products (item, unit_price, retail_price, updated_at) VALUES (?, ?, ?, ?)",
            (item, unit_price, retail_price, updated_at)
        )
        product_id = cursor.lastrowid
        cursor.execute(
            "INSERT INTO inventory (product_id, stock_quantity) VALUES (?, ?)",
            (product_id, stock_quantity)
        )
        if stock_quantity > 0:
            record_stock_history(
                cursor,
                product_id,
                stock_quantity,
                stock_quantity,
                "initial_stock",
                stock_comment or "Initial stock when item was created",
                created_by=user["user_id"],
            )
        conn.commit()
        return jsonify({
            "id": product_id,
            "item": item,
            "sku": "",
            "weight": None,
            "unit_price": unit_price,
            "retail_price": retail_price,
            "updated_at": updated_at,
            "stock_quantity": stock_quantity,
        }), 201
    finally:
        conn.close()


@products_bp.route('/products/<int:product_id>', methods=['PUT'])
@admin_required
def update_product(user, product_id):
    data = request.json or {}

    item = (data.get("item") or "").strip()
    unit_price = data.get("unit_price")

    if not item or unit_price in (None, ""):
        return jsonify({"error": "Item and unit price are required"}), 400

    try:
        unit_price = float(unit_price)
    except (TypeError, ValueError):
        return jsonify({"error": "Unit price must be a number"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        updated_at = sydney_timestamp()
        retail_price = calculate_retail_price(unit_price)
        cursor.execute("""
            UPDATE products
            SET item=?, unit_price=?, retail_price=?, updated_at=?
            WHERE id=?
        """, (item, unit_price, retail_price, updated_at, product_id))

        if cursor.rowcount == 0:
            return jsonify({"error": "Product not found"}), 404

        conn.commit()
        return jsonify({
            "id": product_id,
            "item": item,
            "unit_price": unit_price,
            "retail_price": retail_price,
            "updated_at": updated_at,
        })
    finally:
        conn.close()


@products_bp.route('/products/<int:product_id>', methods=['DELETE'])
@admin_required
def delete_product(user, product_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM stock_history WHERE product_id=?", (product_id,))
        cursor.execute("DELETE FROM inventory WHERE product_id=?", (product_id,))
        cursor.execute("DELETE FROM products WHERE id=?", (product_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "Product not found"}), 404

        conn.commit()
        return jsonify({"message": "Product deleted successfully"})
    finally:
        conn.close()



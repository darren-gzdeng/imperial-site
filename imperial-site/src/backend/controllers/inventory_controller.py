from flask import Blueprint, jsonify, request

from core.auth import admin_required
from core.database import get_db
from core.utils import normalize_quantity
from services.stock_service import ensure_inventory_rows, record_stock_history, release_expired_reservations


inventory_bp = Blueprint("inventory", __name__)


# -------------------------
# Inventory
# -------------------------
@inventory_bp.route('/inventory', methods=['GET'])
@admin_required
def get_inventory(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        ensure_inventory_rows(cursor)
        release_expired_reservations(cursor)
        conn.commit()
        cursor.execute("""
            SELECT products.id, products.item, products.unit_price, products.updated_at,
                   COALESCE(inventory.stock_quantity, 0)
            FROM products
            LEFT JOIN inventory ON inventory.product_id = products.id
            ORDER BY products.item
        """)
        rows = cursor.fetchall()

        return jsonify([
            {
                "product_id": row[0],
                "item": row[1],
                "unit_price": row[2],
                "updated_at": row[3],
                "stock_quantity": row[4],
            }
            for row in rows
        ])
    finally:
        conn.close()


@inventory_bp.route('/inventory/<int:product_id>/stock-in', methods=['POST'])
@admin_required
def add_inventory_stock(user, product_id):
    data = request.json or {}
    quantity = normalize_quantity(data.get("quantity"))
    comment = (data.get("comment") or "").strip()

    if quantity is None:
        return jsonify({"error": "Quantity must be greater than zero"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id, item FROM products WHERE id=?", (product_id,))
        product = cursor.fetchone()

        if not product:
            return jsonify({"error": "Product not found"}), 404

        cursor.execute(
            "INSERT OR IGNORE INTO inventory (product_id, stock_quantity) VALUES (?, 0)",
            (product_id,)
        )
        cursor.execute("""
            UPDATE inventory
            SET stock_quantity = stock_quantity + ?
            WHERE product_id=?
        """, (quantity, product_id))
        cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
        stock = cursor.fetchone()[0]
        record_stock_history(
            cursor,
            product_id,
            quantity,
            stock,
            "stock_in",
            comment,
            created_by=user["user_id"],
        )
        conn.commit()

        return jsonify({
            "product_id": product_id,
            "item": product[1],
            "stock_quantity": stock,
        })
    finally:
        conn.close()


@inventory_bp.route('/inventory/<int:product_id>/stock-out', methods=['POST'])
@admin_required
def remove_inventory_stock(user, product_id):
    data = request.json or {}
    quantity = normalize_quantity(data.get("quantity"))
    comment = (data.get("comment") or "").strip()

    if quantity is None:
        return jsonify({"error": "Quantity must be greater than zero"}), 400

    if not comment:
        return jsonify({"error": "Comment is required when removing stock"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id, item FROM products WHERE id=?", (product_id,))
        product = cursor.fetchone()

        if not product:
            return jsonify({"error": "Product not found"}), 404

        cursor.execute(
            "INSERT OR IGNORE INTO inventory (product_id, stock_quantity) VALUES (?, 0)",
            (product_id,)
        )
        cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
        current_stock = cursor.fetchone()[0]

        if current_stock < quantity:
            return jsonify({
                "error": f"Not enough stock. Available: {current_stock}, requested: {quantity}"
            }), 400

        cursor.execute("""
            UPDATE inventory
            SET stock_quantity = stock_quantity - ?
            WHERE product_id=?
        """, (quantity, product_id))
        cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
        stock = cursor.fetchone()[0]
        record_stock_history(
            cursor,
            product_id,
            -quantity,
            stock,
            "manual_stock_out",
            comment,
            created_by=user["user_id"],
        )
        conn.commit()

        return jsonify({
            "product_id": product_id,
            "item": product[1],
            "stock_quantity": stock,
        })
    finally:
        conn.close()


@inventory_bp.route('/inventory/<int:product_id>/history', methods=['GET'])
@admin_required
def get_inventory_history(user, product_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        page = max(1, request.args.get("page", default=1, type=int))
        page_size = request.args.get("page_size", default=8, type=int)
        page_size = min(max(1, page_size), 100)
        cursor.execute("SELECT id, item FROM products WHERE id=?", (product_id,))
        product = cursor.fetchone()

        if not product:
            return jsonify({"error": "Product not found"}), 404

        cursor.execute("SELECT COUNT(*) FROM stock_history WHERE product_id=?", (product_id,))
        total_count = cursor.fetchone()[0]
        total_pages = max(1, (total_count + page_size - 1) // page_size)
        page = min(page, total_pages)
        offset = (page - 1) * page_size

        cursor.execute("""
            SELECT stock_history.id, stock_history.change_quantity, stock_history.stock_after,
                   stock_history.action_type, stock_history.reference_type,
                   stock_history.reference_id, stock_history.comment,
                   stock_history.created_at, users.first_name, users.last_name, users.email
            FROM stock_history
            LEFT JOIN users ON users.id = stock_history.created_by
            WHERE stock_history.product_id=?
            ORDER BY stock_history.id DESC
            LIMIT ? OFFSET ?
        """, (product_id, page_size, offset))
        rows = cursor.fetchall()

        return jsonify({
            "product_id": product_id,
            "item": product[1],
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total_count": total_count,
                "total_pages": total_pages,
            },
            "history": [
                {
                    "id": row[0],
                    "change_quantity": row[1],
                    "stock_after": row[2],
                    "action_type": row[3],
                    "reference_type": row[4],
                    "reference_id": row[5],
                    "comment": row[6] or "",
                    "created_at": row[7],
                    "created_by": (
                        f"{row[8] or ''} {row[9] or ''}".strip()
                        or row[10]
                        or ""
                    ),
                }
                for row in rows
            ],
        })
    finally:
        conn.close()



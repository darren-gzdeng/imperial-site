import sqlite3

from flask import Blueprint, jsonify, request

from core.auth import token_required
from core.database import get_db


account_bp = Blueprint("account", __name__)


# -------------------------
# Account
# -------------------------
@account_bp.route('/account', methods=['GET'])
@token_required
def get_account(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, first_name, last_name, email, phone, address, account_type, created_at
            FROM users
            WHERE id=?
        """, (user["user_id"],))
        account = cursor.fetchone()

        if not account:
            return jsonify({"error": "User not found"}), 404

        return jsonify({
            "id": account[0],
            "first_name": account[1] or "",
            "last_name": account[2] or "",
            "email": account[3],
            "phone": account[4] or "",
            "address": account[5] or "",
            "account_type": account[6] or "User",
            "created_at": account[7],
        })
    finally:
        conn.close()


@account_bp.route('/account', methods=['PUT'])
@token_required
def update_account(user):
    data = request.json or {}

    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    phone = (data.get("phone") or "").strip()
    address = (data.get("address") or "").strip()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            UPDATE users
            SET first_name=?, last_name=?, email=?, phone=?, address=?
            WHERE id=?
        """, (first_name, last_name, email, phone, address, user["user_id"]))

        if cursor.rowcount == 0:
            return jsonify({"error": "User not found"}), 404

        conn.commit()
        return jsonify({"message": "Account updated successfully"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email is already in use"}), 400
    finally:
        conn.close()


@account_bp.route('/account/orders', methods=['GET'])
@token_required
def get_account_orders(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT
                orders.id,
                orders.status,
                orders.subtotal,
                orders.gst,
                orders.total,
                orders.customer_name,
                orders.phone,
                orders.shipping_address,
                orders.delivery_date,
                orders.created_at,
                delivery_tracking.status,
                delivery_tracking.driver_name,
                delivery_tracking.eta_text,
                delivery_tracking.updated_at
            FROM orders
            LEFT JOIN delivery_tracking ON delivery_tracking.order_id = orders.id
            WHERE orders.user_id=?
            ORDER BY orders.created_at DESC, orders.id DESC
        """, (user["user_id"],))
        order_rows = cursor.fetchall()

        orders = []
        for row in order_rows:
            order_id = row[0]
            cursor.execute("""
                SELECT
                    orders_items.id,
                    orders_items.quantity,
                    products.id,
                    products.item,
                    products.sku,
                    products.weight,
                    products.retail_price
                FROM orders_items
                JOIN products ON products.id = orders_items.product_id
                WHERE orders_items.order_id=?
                ORDER BY orders_items.id
            """, (order_id,))
            items = [
                {
                    "id": item[0],
                    "quantity": item[1],
                    "product_id": item[2],
                    "item": item[3],
                    "sku": item[4],
                    "weight": item[5],
                    "unit_price": item[6],
                    "amount": round(float(item[1]) * float(item[6] or 0), 2),
                }
                for item in cursor.fetchall()
            ]

            orders.append({
                "id": order_id,
                "status": row[1],
                "subtotal": row[2],
                "gst": row[3],
                "total": row[4],
                "customer_name": row[5],
                "phone": row[6],
                "shipping_address": row[7],
                "delivery_date": row[8],
                "created_at": row[9],
                "tracking_status": row[10],
                "driver_name": row[11],
                "eta_text": row[12],
                "tracking_updated_at": row[13],
                "items": items,
            })

        return jsonify(orders)
    finally:
        conn.close()

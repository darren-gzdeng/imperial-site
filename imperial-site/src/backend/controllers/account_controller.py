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



from flask import Blueprint, jsonify, request

from core.auth import admin_required
from core.config import ACCOUNT_TYPES
from core.database import get_db


admin_users_bp = Blueprint("admin_users", __name__)


# -------------------------
# Admin users
# -------------------------
@admin_users_bp.route('/admin/users', methods=['GET'])
@admin_required
def get_admin_users(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, first_name, last_name, email, phone, address, account_type, created_at
            FROM users
            ORDER BY created_at DESC, id DESC
        """)
        users = cursor.fetchall()

        return jsonify([
            {
                "id": account[0],
                "first_name": account[1] or "",
                "last_name": account[2] or "",
                "email": account[3],
                "phone": account[4] or "",
                "address": account[5] or "",
                "account_type": account[6] or "User",
                "created_at": account[7],
            }
            for account in users
        ])
    finally:
        conn.close()


@admin_users_bp.route('/admin/users/<int:user_id>/account-type', methods=['PUT'])
@admin_required
def update_admin_user_account_type(user, user_id):
    data = request.json or {}
    account_type = (data.get("account_type") or "").strip()

    if account_type not in ACCOUNT_TYPES:
        return jsonify({"error": "Invalid account type"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "UPDATE users SET account_type=? WHERE id=?",
            (account_type, user_id)
        )

        if cursor.rowcount == 0:
            return jsonify({"error": "User not found"}), 404

        conn.commit()

        return jsonify({
            "id": user_id,
            "account_type": account_type,
        })
    finally:
        conn.close()


@admin_users_bp.route('/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_admin_user(user, user_id):
    if user_id == user["user_id"]:
        return jsonify({"error": "You cannot delete your own account"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM password_reset_tokens WHERE user_id=?", (user_id,))
        cursor.execute("DELETE FROM users WHERE id=?", (user_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "User not found"}), 404

        conn.commit()
        return jsonify({"message": "User deleted successfully"})
    finally:
        conn.close()



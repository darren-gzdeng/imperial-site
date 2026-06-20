from functools import wraps

import jwt
from flask import jsonify, request

from core.config import SECRET_KEY
from core.database import get_db


def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")

        if not token:
            return jsonify({"error": "Token missing"}), 401

        try:
            data = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        except jwt.PyJWTError:
            return jsonify({"error": "Invalid token"}), 401

        return f(data, *args, **kwargs)

    return decorated


def role_required(allowed_roles):
    def decorator(f):
        @wraps(f)
        @token_required
        def decorated(user, *args, **kwargs):
            conn = get_db()
            cursor = conn.cursor()

            try:
                cursor.execute("SELECT account_type FROM users WHERE id=?", (user["user_id"],))
                account = cursor.fetchone()
            finally:
                conn.close()

            if not account:
                return jsonify({"error": "User not found"}), 404

            if account[0] not in allowed_roles:
                if allowed_roles == ("Admin",):
                    return jsonify({"error": "Admin access required"}), 403
                return jsonify({"error": "Staff or admin access required"}), 403

            return f(user, *args, **kwargs)

        return decorated

    return decorator


admin_required = role_required(("Admin",))
staff_or_admin_required = role_required(("Admin", "Staff"))

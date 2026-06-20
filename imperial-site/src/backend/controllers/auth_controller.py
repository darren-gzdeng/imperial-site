import datetime
import secrets
import sqlite3

import jwt
from flask import Blueprint, jsonify, request
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from core.config import FRONTEND_BASE_URL, SECRET_KEY
from core.database import get_db
from core.security import hash_password
from services.email_service import send_password_reset_email


auth_bp = Blueprint("auth", __name__)


def create_auth_token(user_id, account_type="User", email=None):
    payload = {
        "user_id": user_id,
        "account_type": account_type or "User",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1),
    }
    if email:
        payload["email"] = email

    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.json or {}

    first_name = data.get("first_name", "").strip()
    last_name = data.get("last_name", "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)",
            (first_name, last_name, email, hash_password(password))
        )
        conn.commit()
        return jsonify({"message": "User registered successfully"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "User already exists"}), 400
    except Exception as e:
        print(f"Register error: {str(e)}")
        return jsonify({"error": f"Registration failed: {str(e)}"}), 500
    finally:
        conn.close()


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.json or {}

    email = data.get("email")
    password = data.get("password")

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT id, account_type FROM users WHERE email=? AND password=?",
            (email, hash_password(password))
        )
        user = cursor.fetchone()

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        return jsonify({"token": create_auth_token(user[0], user[1])})
    finally:
        conn.close()


@auth_bp.route("/google-login", methods=["POST"])
def google_login():
    data = request.json or {}
    token = data.get("token")

    if not token:
        return jsonify({"error": "Missing token"}), 400

    try:
        idinfo = id_token.verify_oauth2_token(
            token,
            google_requests.Request(),
            "573360926782-a3pfuc99v6r1tbpk70gj5ru3cip4rl4s.apps.googleusercontent.com",
        )

        email = idinfo.get("email")

        if not email:
            return jsonify({"error": "Could not get email from Google"}), 400

        conn = get_db()
        cursor = conn.cursor()

        try:
            cursor.execute("SELECT id, account_type FROM users WHERE email=?", (email,))
            user = cursor.fetchone()

            if not user:
                first_name = idinfo.get("given_name", "")
                last_name = idinfo.get("family_name", "")
                cursor.execute(
                    "INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)",
                    (first_name, last_name, email, hash_password(email + "_google"))
                )
                conn.commit()
                cursor.execute("SELECT id, account_type FROM users WHERE email=?", (email,))
                user = cursor.fetchone()

            return jsonify({"token": create_auth_token(user[0], user[1], email)})
        finally:
            conn.close()

    except ValueError as e:
        print(f"Google login token verification error: {str(e)}")
        return jsonify({"error": f"Invalid Google token: {str(e)}"}), 401
    except Exception as e:
        print(f"Google login server error: {str(e)}")
        return jsonify({"error": f"Google login failed: {str(e)}"}), 500


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    data = request.json or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({"error": "Email is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id, email FROM users WHERE lower(email)=?", (email,))
        user = cursor.fetchone()

        if not user:
            return jsonify({"message": "If an account exists for that email, a reset email has been sent."})

        user_id = user[0]
        reset_token = secrets.token_urlsafe(32)
        expires_at = (datetime.datetime.utcnow() + datetime.timedelta(hours=1)).isoformat()

        cursor.execute("UPDATE password_reset_tokens SET used=1 WHERE user_id=? AND used=0", (user_id,))
        cursor.execute(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)",
            (user_id, reset_token, expires_at)
        )
        conn.commit()

        reset_link = f"{FRONTEND_BASE_URL}/reset-password?token={reset_token}"

        try:
            send_password_reset_email(user[1], reset_link)
        except Exception as e:
            print(f"Password reset email error: {str(e)}")

        return jsonify({"message": "If an account exists for that email, a reset email has been sent."})
    finally:
        conn.close()

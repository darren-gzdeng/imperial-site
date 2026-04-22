from flask import Flask, request, jsonify
import os
import sqlite3
import hashlib
import jwt
import datetime
from functools import wraps
from flask_cors import CORS
from google.auth.transport import requests
from google.oauth2 import id_token

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = 'super_secret_key'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "users.db")

# -------------------------
# Database helper
# -------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=1000")
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


# -------------------------
# Create table automatically
# -------------------------
def init_db():
    conn = get_db()
    cursor = conn.cursor()

    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL
    )
    """)

    conn.commit()
    conn.close()

init_db()


# -------------------------
# Password hashing
# -------------------------
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


# -------------------------
# Register
# -------------------------
@app.route('/register', methods=['POST'])
def register():
    data = request.json

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return jsonify({"error": "Missing fields"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "INSERT INTO users (email, password) VALUES (?, ?)",
            (email, hash_password(password))
        )
        conn.commit()
        return jsonify({"message": "User registered successfully"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "User already exists"}), 400
    finally:
        conn.close()


# -------------------------
# Login
# -------------------------
@app.route('/login', methods=['POST'])
def login():
    data = request.json

    email = data.get("email")
    password = data.get("password")

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            "SELECT * FROM users WHERE email=? AND password=?",
            (email, hash_password(password))
        )

        user = cursor.fetchone()

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        token = jwt.encode({
            "user_id": user[0],
            "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
        }, app.config['SECRET_KEY'], algorithm="HS256")

        return jsonify({"token": token})
    finally:
        conn.close()


# -------------------------
# Google Login
# -------------------------
@app.route('/google-login', methods=['POST'])
def google_login():
    data = request.json
    token = data.get("token")

    if not token:
        return jsonify({"error": "Missing token"}), 400

    try:
        # Verify the Google token
        idinfo = id_token.verify_oauth2_token(
            token, 
            requests.Request(), 
            "573360926782-a3pfuc99v6r1tbpk70gj5ru3cip4rl4s.apps.googleusercontent.com"
        )

        email = idinfo.get('email')
        name = idinfo.get('name', '')

        if not email:
            return jsonify({"error": "Could not get email from Google"}), 400

        conn = get_db()
        cursor = conn.cursor()

        try:
            # Check if user exists
            cursor.execute("SELECT * FROM users WHERE email=?", (email,))
            user = cursor.fetchone()

            if not user:
                # Create new user with Google login (use email as password placeholder)
                cursor.execute(
                    "INSERT INTO users (email, password) VALUES (?, ?)",
                    (email, hash_password(email + "_google"))
                )
                conn.commit()
                cursor.execute("SELECT * FROM users WHERE email=?", (email,))
                user = cursor.fetchone()

            # Generate JWT token
            auth_token = jwt.encode({
                "user_id": user[0],
                "email": email,
                "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
            }, app.config['SECRET_KEY'], algorithm="HS256")

            return jsonify({"token": auth_token})
        finally:
            conn.close()

    except ValueError:
        return jsonify({"error": "Invalid token"}), 401


# -------------------------
# Auth middleware
# -------------------------
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = request.headers.get("Authorization")

        if not token:
            return jsonify({"error": "Token missing"}), 401

        try:
            data = jwt.decode(token, app.config['SECRET_KEY'], algorithms=["HS256"])
        except:
            return jsonify({"error": "Invalid token"}), 401

        return f(data, *args, **kwargs)

    return decorated


# -------------------------
# Protected route
# -------------------------
@app.route('/dashboard')
@token_required
def dashboard(user):
    return jsonify({"message": "Welcome! You are logged in."})


# -------------------------
# Run server
# -------------------------
if __name__ == "__main__":
    app.run(debug=True)
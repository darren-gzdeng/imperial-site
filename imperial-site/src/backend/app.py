from flask import Flask, request, jsonify
import os
import sqlite3
import hashlib
import jwt
import datetime
import secrets
import smtplib
from functools import wraps
from zoneinfo import ZoneInfo
from flask_cors import CORS
from google.auth.transport import requests
from google.oauth2 import id_token
import json
from io import BytesIO
from email.message import EmailMessage
from reportlab.lib.pagesizes import letter
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch

try:
    import stripe
except ImportError:
    stripe = None

app = Flask(__name__)
DEFAULT_CORS_ORIGINS = ",".join([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5174",
])
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", DEFAULT_CORS_ORIGINS).split(",")
    if origin.strip()
]
CORS(app, resources={r"/*": {"origins": CORS_ORIGINS}})
app.config['SECRET_KEY'] = os.getenv("SECRET_KEY", "dev_secret_key_change_me")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "users.db")


def load_local_env():
    env_paths = [
        os.path.join(BASE_DIR, ".env.local"),
        os.path.join(BASE_DIR, ".env"),
        os.path.join(os.path.dirname(BASE_DIR), ".env.local"),
        os.path.join(os.path.dirname(BASE_DIR), ".env"),
    ]

    for env_path in env_paths:
        if not os.path.exists(env_path):
            continue

        with open(env_path, "r", encoding="utf-8") as env_file:
            for line in env_file:
                stripped = line.strip()
                if not stripped or stripped.startswith("#") or "=" not in stripped:
                    continue

                key, value = stripped.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_local_env()
SYDNEY_TZ = ZoneInfo("Australia/Sydney")
ACCOUNT_TYPES = ("Admin", "Staff", "User", "Wholesale Customer")
FRONTEND_BASE_URL = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173/imperial-site")
STRIPE_CURRENCY = os.getenv("STRIPE_CURRENCY", "aud")


def sydney_timestamp():
    return datetime.datetime.now(SYDNEY_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")


def utc_iso_timestamp(minutes=0):
    return (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=minutes)).isoformat()


def utc_timestamp_to_sydney(value):
    if not value:
        return sydney_timestamp()

    try:
        cleaned_value = value.replace(" AEST", "").replace(" AEDT", "")
        utc_datetime = datetime.datetime.strptime(cleaned_value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        return utc_datetime.astimezone(SYDNEY_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")
    except ValueError:
        return value


def normalize_quantity(value):
    try:
        quantity = float(value)
    except (TypeError, ValueError):
        return None

    if quantity <= 0:
        return None

    return quantity


def calculate_retail_price(unit_price):
    return round(round(float(unit_price) * 1.3 * 10) / 10, 2)


def price_to_cents(value):
    return int(round(float(value) * 100))


def calculate_shipping(subtotal):
    if subtotal >= 85:
        return 0
    if subtotal >= 39:
        return 6.5
    return 15


def ensure_inventory_rows(cursor):
    cursor.execute("""
        INSERT INTO inventory (product_id, stock_quantity)
        SELECT products.id, 0
        FROM products
        LEFT JOIN inventory ON inventory.product_id = products.id
        WHERE inventory.id IS NULL
    """)


def release_expired_reservations(cursor):
    cursor.execute("""
        SELECT id, reservation_token
        FROM stock_reservations
        WHERE status='active' AND expires_at <= ?
    """, (utc_iso_timestamp(),))
    expired_reservations = cursor.fetchall()

    for reservation_id, reservation_token in expired_reservations:
        cursor.execute("""
            SELECT product_id, quantity
            FROM stock_reservation_items
            WHERE reservation_id=?
        """, (reservation_id,))
        items = cursor.fetchall()

        for product_id, quantity in items:
            cursor.execute("""
                UPDATE inventory
                SET stock_quantity = stock_quantity + ?
                WHERE product_id=?
            """, (quantity, product_id))
            cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
            stock_after = cursor.fetchone()[0]
            record_stock_history(
                cursor,
                product_id,
                quantity,
                stock_after,
                "checkout_reservation_expired",
                "Checkout reservation expired after 10 minutes",
                reference_type="checkout_reservation",
                reference_id=reservation_id,
            )

        cursor.execute(
            "UPDATE stock_reservations SET status='expired' WHERE id=?",
            (reservation_id,)
        )


def resolve_invoice_item_product(cursor, item):
    product_id = item.get("product_id")

    if product_id not in (None, ""):
        cursor.execute("SELECT id, item FROM products WHERE id=?", (product_id,))
        product = cursor.fetchone()
        if product:
            return product[0], product[1]

    description = (item.get("description") or "").strip()
    if not description:
        return None, ""

    cursor.execute("SELECT id, item FROM products WHERE item=? ORDER BY id LIMIT 1", (description,))
    product = cursor.fetchone()

    if not product:
        return None, description

    return product[0], product[1]


def get_invoice_stock_movements(cursor, items):
    movements = {}
    labels = {}

    for item in items:
        product_id, label = resolve_invoice_item_product(cursor, item)
        quantity = normalize_quantity(item.get("quantity"))

        if not product_id or quantity is None:
            continue

        movements[product_id] = movements.get(product_id, 0) + quantity
        labels[product_id] = label

    return movements, labels


def record_stock_history(
    cursor,
    product_id,
    change_quantity,
    stock_after,
    action_type,
    comment="",
    reference_type=None,
    reference_id=None,
    created_by=None,
):
    cursor.execute("""
        INSERT INTO stock_history (
            product_id, change_quantity, stock_after, action_type,
            reference_type, reference_id, comment, created_at, created_by
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        product_id,
        change_quantity,
        stock_after,
        action_type,
        reference_type,
        reference_id,
        comment,
        sydney_timestamp(),
        created_by,
    ))


def serialize_invoice_row(row):
    return {
        "id": row[0],
        "user_id": row[1],
        "invoice_number": row[2],
        "client_name": row[3],
        "issue_date": row[4],
        "due_date": row[5],
        "items": json.loads(row[6]),
        "subtotal": row[7],
        "tax": row[8],
        "total": row[9],
        "status": row[10],
        "created_at": row[11],
    }

# -------------------------
# Database helper
# -------------------------
def get_db():
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute("PRAGMA cache_size=1000")
    conn.execute("PRAGMA temp_store=MEMORY")
    return conn


# -------------------------
# Create table automatically
# -------------------------
def init_db():
    conn = get_db()
    conn.execute("PRAGMA journal_mode=WAL")
    cursor = conn.cursor()

    schema_path = os.path.join(BASE_DIR, "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as schema_file:
        cursor.executescript(schema_file.read())

    # Lightweight migration for existing databases created before first/last name fields existed.
    cursor.execute("PRAGMA table_info(users)")
    user_columns = {column[1] for column in cursor.fetchall()}
    if "first_name" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN first_name TEXT")
    if "last_name" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN last_name TEXT")
    if "phone" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN phone TEXT")
    if "address" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN address TEXT")
    if "account_type" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN account_type TEXT DEFAULT 'User'")
        cursor.execute("UPDATE users SET account_type = 'User' WHERE account_type IS NULL OR account_type = ''")
        cursor.execute("""
            UPDATE users
            SET account_type = 'Admin'
            WHERE id = (SELECT MIN(id) FROM users)
        """)
    if "created_at" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TIMESTAMP")
        cursor.execute("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")

    cursor.execute("PRAGMA table_info(products)")
    product_columns = {column[1] for column in cursor.fetchall()}
    expected_product_columns = {"id", "item", "sku", "weight", "unit_price", "retail_price", "updated_at"}
    if product_columns and product_columns != expected_product_columns:
        cursor.execute("ALTER TABLE products RENAME TO products_old")
        cursor.execute("""
        CREATE TABLE products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item TEXT NOT NULL,
            sku TEXT UNIQUE,
            weight REAL,
            unit_price REAL NOT NULL,
            retail_price REAL NOT NULL,
            updated_at TIMESTAMP
        )
        """)

        item_expression = "item" if "item" in product_columns else "name"
        sku_expression = "sku" if "sku" in product_columns else "NULL"
        weight_expression = "weight" if "weight" in product_columns else "NULL"
        retail_price_expression = "retail_price" if "retail_price" in product_columns else "ROUND(ROUND(unit_price * 1.3 * 10) / 10.0, 2)"
        updated_at_expression = "updated_at" if "updated_at" in product_columns else "NULL"

        cursor.execute(f"""
            INSERT INTO products (id, item, sku, weight, unit_price, retail_price, updated_at)
            SELECT id, {item_expression}, {sku_expression}, {weight_expression}, unit_price, {retail_price_expression}, {updated_at_expression}
            FROM products_old
            WHERE {item_expression} IS NOT NULL AND {item_expression} != ''
        """)
        cursor.execute("DROP TABLE products_old")
        cursor.execute("SELECT id, updated_at FROM products")
        for product_id, updated_at in cursor.fetchall():
            cursor.execute(
                "UPDATE products SET updated_at=? WHERE id=?",
                (utc_timestamp_to_sydney(updated_at), product_id)
            )
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS app_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
    )
    """)
    cursor.execute("SELECT 1 FROM app_migrations WHERE name='products_updated_at_sydney'")
    if not cursor.fetchone():
        cursor.execute("SELECT id, updated_at FROM products")
        for product_id, updated_at in cursor.fetchall():
            cursor.execute(
                "UPDATE products SET updated_at=? WHERE id=?",
                (utc_timestamp_to_sydney(updated_at), product_id)
            )
        cursor.execute(
            "INSERT INTO app_migrations (name, applied_at) VALUES (?, ?)",
            ("products_updated_at_sydney", sydney_timestamp())
        )

    cursor.execute("PRAGMA table_info(invoices)")
    invoice_columns = {column[1] for column in cursor.fetchall()}
    expected_invoice_columns = {
        "id", "user_id", "invoice_number", "client_name", "issue_date", "due_date",
        "items", "subtotal", "tax", "total", "status", "created_at"
    }
    if invoice_columns and invoice_columns != expected_invoice_columns:
        cursor.execute("ALTER TABLE invoices RENAME TO invoices_old")
        cursor.execute("""
        CREATE TABLE invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            invoice_number TEXT UNIQUE NOT NULL,
            client_name TEXT NOT NULL,
            issue_date TEXT NOT NULL,
            due_date TEXT NOT NULL,
            items TEXT NOT NULL,
            subtotal REAL NOT NULL,
            tax REAL NOT NULL,
            total REAL NOT NULL,
            status TEXT DEFAULT 'draft',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
        """)

        status_expression = "status" if "status" in invoice_columns else "'draft'"
        created_at_expression = "created_at" if "created_at" in invoice_columns else "CURRENT_TIMESTAMP"

        cursor.execute(f"""
            INSERT INTO invoices (
                id, user_id, invoice_number, client_name, issue_date, due_date,
                items, subtotal, tax, total, status, created_at
            )
            SELECT
                id, user_id, invoice_number, client_name, issue_date, due_date,
                items, subtotal, tax, total, {status_expression}, {created_at_expression}
            FROM invoices_old
        """)
        cursor.execute("DROP TABLE invoices_old")

    cursor.execute("""
        INSERT OR IGNORE INTO clients (client_name)
        SELECT DISTINCT client_name
        FROM invoices
        WHERE client_name IS NOT NULL AND client_name != ''
    """)

    cursor.execute("""
        DELETE FROM inventory
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM inventory
            GROUP BY product_id
        )
    """)
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_product_id ON inventory(product_id)")
    ensure_inventory_rows(cursor)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS stock_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            change_quantity REAL NOT NULL,
            stock_after REAL NOT NULL,
            action_type TEXT NOT NULL,
            reference_type TEXT,
            reference_id INTEGER,
            comment TEXT,
            created_at TEXT NOT NULL,
            created_by INTEGER,
            FOREIGN KEY (product_id) REFERENCES products(id),
            FOREIGN KEY (created_by) REFERENCES users(id)
        )
    """)
    cursor.execute("PRAGMA table_info(stock_history)")
    history_columns = {column[1] for column in cursor.fetchall()}
    if "created_by" not in history_columns:
        cursor.execute("ALTER TABLE stock_history ADD COLUMN created_by INTEGER")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_history_product_id_id ON stock_history(product_id, id DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_history_reference ON stock_history(reference_type, reference_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_reservations_status_expires ON stock_reservations(status, expires_at)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_stock_reservation_items_reservation ON stock_reservation_items(reservation_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON invoices(created_at DESC)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_products_item ON products(item)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_clients_client_name ON clients(client_name)")

    conn.commit()
    conn.close()

init_db()


# -------------------------
# Password hashing
# -------------------------
def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()


def send_password_reset_email(recipient_email, reset_link):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASS")
    mail_from = os.getenv("MAIL_FROM", smtp_user or "no-reply@imperial.local")

    if not smtp_host or not smtp_user or not smtp_password:
        print(f"Password reset email not sent. Missing SMTP config. Reset link for {recipient_email}: {reset_link}")
        return False, "SMTP is not configured"

    message = EmailMessage()
    message["Subject"] = "Reset your Imperial account password"
    message["From"] = mail_from
    message["To"] = recipient_email
    message.set_content(
        "We received a request to reset your password.\n\n"
        f"Use this link to continue: {reset_link}\n\n"
        "If you didn't request this, you can ignore this email."
    )

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(message)

    return True, None


# -------------------------
# Register
# -------------------------
@app.route('/register', methods=['POST'])
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
            "SELECT id, account_type FROM users WHERE email=? AND password=?",
            (email, hash_password(password))
        )

        user = cursor.fetchone()

        if not user:
            return jsonify({"error": "Invalid credentials"}), 401

        token = jwt.encode({
            "user_id": user[0],
            "account_type": user[1] or "User",
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
            cursor.execute("SELECT id, account_type FROM users WHERE email=?", (email,))
            user = cursor.fetchone()

            if not user:
                first_name = idinfo.get("given_name", "")
                last_name = idinfo.get("family_name", "")
                # Create new user with Google login (use email as password placeholder)
                cursor.execute(
                    "INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)",
                    (first_name, last_name, email, hash_password(email + "_google"))
                )
                conn.commit()
                cursor.execute("SELECT id, account_type FROM users WHERE email=?", (email,))
                user = cursor.fetchone()

            # Generate JWT token
            auth_token = jwt.encode({
                "user_id": user[0],
                "email": email,
                "account_type": user[1] or "User",
                "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=1)
            }, app.config['SECRET_KEY'], algorithm="HS256")

            return jsonify({"token": auth_token})
        finally:
            conn.close()

    except ValueError as e:
        print(f"Google login token verification error: {str(e)}")
        return jsonify({"error": f"Invalid Google token: {str(e)}"}), 401
    except Exception as e:
        print(f"Google login server error: {str(e)}")
        return jsonify({"error": f"Google login failed: {str(e)}"}), 500


@app.route('/forgot-password', methods=['POST'])
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

        # Return a generic response either way so we don't expose whether an account exists.
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

        frontend_base = os.getenv("FRONTEND_BASE_URL", "http://localhost:5173/imperial-site")
        reset_link = f"{frontend_base}/reset-password?token={reset_token}"

        try:
            send_password_reset_email(user[1], reset_link)
        except Exception as e:
            print(f"Password reset email error: {str(e)}")

        return jsonify({"message": "If an account exists for that email, a reset email has been sent."})
    finally:
        conn.close()


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


def admin_required(f):
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

        if account[0] != "Admin":
            return jsonify({"error": "Admin access required"}), 403

        return f(user, *args, **kwargs)

    return decorated


def staff_or_admin_required(f):
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

        if account[0] not in ("Admin", "Staff"):
            return jsonify({"error": "Staff or admin access required"}), 403

        return f(user, *args, **kwargs)

    return decorated


# -------------------------
# Protected route
# -------------------------
@app.route('/dashboard')
@token_required
def dashboard(user):
    return jsonify({"message": "Welcome! You are logged in."})


# -------------------------
# Products
# -------------------------
@app.route('/products', methods=['GET'])
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


@app.route('/products', methods=['POST'])
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


@app.route('/products/<int:product_id>', methods=['PUT'])
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


@app.route('/products/<int:product_id>', methods=['DELETE'])
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


# -------------------------
# Clients
# -------------------------
@app.route('/clients', methods=['GET'])
@staff_or_admin_required
def get_clients(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id, client_name FROM clients ORDER BY client_name")
        clients = cursor.fetchall()

        return jsonify([
            {
                "id": client[0],
                "client_name": client[1],
            }
            for client in clients
        ])
    finally:
        conn.close()


@app.route('/clients', methods=['POST'])
@admin_required
def create_client(user):
    data = request.json or {}
    client_name = (data.get("client_name") or "").strip()

    if not client_name:
        return jsonify({"error": "Client name is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("INSERT INTO clients (client_name) VALUES (?)", (client_name,))
        conn.commit()
        return jsonify({"id": cursor.lastrowid, "client_name": client_name}), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Client already exists"}), 400
    finally:
        conn.close()


@app.route('/clients/<int:client_id>', methods=['PUT'])
@admin_required
def update_client(user, client_id):
    data = request.json or {}
    client_name = (data.get("client_name") or "").strip()

    if not client_name:
        return jsonify({"error": "Client name is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("UPDATE clients SET client_name=? WHERE id=?", (client_name, client_id))

        if cursor.rowcount == 0:
            return jsonify({"error": "Client not found"}), 404

        conn.commit()
        return jsonify({"id": client_id, "client_name": client_name})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Client already exists"}), 400
    finally:
        conn.close()


@app.route('/clients/<int:client_id>', methods=['DELETE'])
@admin_required
def delete_client(user, client_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM clients WHERE id=?", (client_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "Client not found"}), 404

        conn.commit()
        return jsonify({"message": "Client deleted successfully"})
    finally:
        conn.close()


# -------------------------
# Account
# -------------------------
@app.route('/account', methods=['GET'])
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


@app.route('/account', methods=['PUT'])
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


@app.route('/inventory', methods=['GET'])
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


@app.route('/inventory/<int:product_id>/stock-in', methods=['POST'])
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


@app.route('/inventory/<int:product_id>/stock-out', methods=['POST'])
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


@app.route('/inventory/<int:product_id>/history', methods=['GET'])
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


# -------------------------
# Checkout stock reservations
# -------------------------
def resolve_checkout_product(cursor, item):
    product_id = item.get("product_id") or item.get("backend_product_id")

    if product_id not in (None, ""):
        cursor.execute("SELECT id, item FROM products WHERE id=?", (product_id,))
        product = cursor.fetchone()
        if product:
            return product[0], product[1]

    name = (item.get("backend_item") or item.get("name") or "").strip()
    if not name:
        return None, ""

    cursor.execute("SELECT id, item FROM products WHERE item=? ORDER BY id LIMIT 1", (name,))
    product = cursor.fetchone()
    if product:
        return product[0], product[1]

    cursor.execute("SELECT id, item FROM products WHERE item LIKE ? ORDER BY id LIMIT 1", (f"{name}%",))
    product = cursor.fetchone()
    if product:
        return product[0], product[1]

    return None, name


@app.route('/checkout/reserve', methods=['POST'])
def reserve_checkout_stock():
    data = request.json or {}
    items = data.get("items") or []

    if not items:
        return jsonify({"error": "Cart is empty"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        ensure_inventory_rows(cursor)
        release_expired_reservations(cursor)

        movements = {}
        labels = {}

        for item in items:
            product_id, label = resolve_checkout_product(cursor, item)
            quantity = normalize_quantity(item.get("quantity"))

            if not product_id:
                conn.rollback()
                return jsonify({
                    "error": f"Product is out of stock: {label or 'Unknown product'}",
                    "out_of_stock": True,
                }), 409

            if quantity is None:
                conn.rollback()
                return jsonify({"error": "Cart quantity must be greater than zero"}), 400

            movements[product_id] = movements.get(product_id, 0) + quantity
            labels[product_id] = label

        for product_id, quantity in movements.items():
            cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
            stock_row = cursor.fetchone()
            available = stock_row[0] if stock_row else 0

            if available < quantity:
                conn.rollback()
                return jsonify({
                    "error": f"{labels.get(product_id, 'Product')} is out of stock.",
                    "out_of_stock": True,
                    "available": available,
                    "requested": quantity,
                }), 409

        reservation_token = secrets.token_urlsafe(24)
        expires_at = utc_iso_timestamp(minutes=10)
        cursor.execute("""
            INSERT INTO stock_reservations (reservation_token, status, expires_at, created_at)
            VALUES (?, 'active', ?, ?)
        """, (reservation_token, expires_at, utc_iso_timestamp()))
        reservation_id = cursor.lastrowid

        for product_id, quantity in movements.items():
            cursor.execute("""
                UPDATE inventory
                SET stock_quantity = stock_quantity - ?
                WHERE product_id=?
            """, (quantity, product_id))
            cursor.execute("""
                INSERT INTO stock_reservation_items (reservation_id, product_id, quantity)
                VALUES (?, ?, ?)
            """, (reservation_id, product_id, quantity))
            cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
            stock_after = cursor.fetchone()[0]
            record_stock_history(
                cursor,
                product_id,
                -quantity,
                stock_after,
                "checkout_reserved",
                "Reserved for checkout for 10 minutes",
                reference_type="checkout_reservation",
                reference_id=reservation_id,
            )

        conn.commit()
        return jsonify({
            "reservation_token": reservation_token,
            "expires_at": expires_at,
            "expires_in_seconds": 600,
        }), 201
    finally:
        conn.close()


@app.route('/checkout/reservations/<reservation_token>/complete', methods=['POST'])
def complete_checkout_reservation(reservation_token):
    conn = get_db()
    cursor = conn.cursor()

    try:
        release_expired_reservations(cursor)
        cursor.execute("""
            SELECT id, status
            FROM stock_reservations
            WHERE reservation_token=?
        """, (reservation_token,))
        reservation = cursor.fetchone()

        if not reservation:
            conn.rollback()
            return jsonify({"error": "Reservation not found"}), 404

        reservation_id, status = reservation

        if status != "active":
            conn.rollback()
            return jsonify({"error": "Reservation is no longer active"}), 409

        cursor.execute(
            "UPDATE stock_reservations SET status='completed' WHERE id=?",
            (reservation_id,)
        )
        conn.commit()
        return jsonify({"message": "Checkout completed"})
    finally:
        conn.close()


@app.route('/checkout/stripe-session', methods=['POST'])
def create_stripe_checkout_session():
    if stripe is None:
        return jsonify({"error": "Stripe is not installed on the backend"}), 500

    stripe_secret_key = os.getenv("STRIPE_SECRET_KEY")
    if not stripe_secret_key:
        return jsonify({"error": "Stripe is not configured. Set STRIPE_SECRET_KEY in the backend environment."}), 500

    data = request.json or {}
    reservation_token = (data.get("reservation_token") or "").strip()

    if not reservation_token:
        return jsonify({"error": "Reservation token is required"}), 400

    conn = get_db()
    cursor = conn.cursor()

    try:
        release_expired_reservations(cursor)
        cursor.execute("""
            SELECT id, status
            FROM stock_reservations
            WHERE reservation_token=?
        """, (reservation_token,))
        reservation = cursor.fetchone()

        if not reservation:
            conn.rollback()
            return jsonify({"error": "Reservation not found"}), 404

        reservation_id, status = reservation

        if status != "active":
            conn.rollback()
            return jsonify({"error": "Reservation is no longer active"}), 409

        cursor.execute("""
            SELECT products.item, products.retail_price, stock_reservation_items.quantity
            FROM stock_reservation_items
            JOIN products ON products.id = stock_reservation_items.product_id
            WHERE stock_reservation_items.reservation_id=?
        """, (reservation_id,))
        reserved_items = cursor.fetchall()
        conn.commit()

        if not reserved_items:
            return jsonify({"error": "Reservation has no items"}), 400

        line_items = []
        subtotal = 0

        for item_name, retail_price, quantity in reserved_items:
            quantity_int = int(quantity)
            subtotal += float(retail_price) * quantity
            line_items.append({
                "price_data": {
                    "currency": STRIPE_CURRENCY,
                    "product_data": {"name": item_name},
                    "unit_amount": price_to_cents(retail_price),
                },
                "quantity": quantity_int,
            })

        shipping = calculate_shipping(subtotal)
        if shipping > 0:
            line_items.append({
                "price_data": {
                    "currency": STRIPE_CURRENCY,
                    "product_data": {"name": "Shipping"},
                    "unit_amount": price_to_cents(shipping),
                },
                "quantity": 1,
            })

        stripe.api_key = stripe_secret_key
        session = stripe.checkout.Session.create(
            mode="payment",
            line_items=line_items,
            success_url=f"{FRONTEND_BASE_URL}/checkout/success?reservation_token={reservation_token}&session_id={{CHECKOUT_SESSION_ID}}",
            cancel_url=f"{FRONTEND_BASE_URL}/checkout",
            metadata={
                "reservation_token": reservation_token,
                "reservation_id": str(reservation_id),
            },
        )

        return jsonify({"url": session.url})
    except stripe.error.StripeError as e:
        conn.rollback()
        return jsonify({"error": str(e)}), 502
    finally:
        conn.close()


# -------------------------
# Admin users
# -------------------------
@app.route('/admin/users', methods=['GET'])
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


@app.route('/admin/users/<int:user_id>/account-type', methods=['PUT'])
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


@app.route('/admin/users/<int:user_id>', methods=['DELETE'])
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


# -------------------------
# Create Invoice
# -------------------------
@app.route('/invoices', methods=['POST'])
@staff_or_admin_required
def create_invoice(user):
    try:
        data = request.json
        
        user_id = data.get("user_id")
        invoice_number = data.get("invoice_number")
        client_name = data.get("client_name")
        issue_date = data.get("issue_date")
        due_date = data.get("due_date")
        items = data.get("items")
        subtotal = data.get("subtotal")
        tax = data.get("tax")
        total = data.get("total")

        if not all([user_id, invoice_number, client_name, issue_date, items]):
            missing = []
            if not user_id: missing.append("user_id")
            if not invoice_number: missing.append("invoice_number")
            if not client_name: missing.append("client_name")
            if not issue_date: missing.append("issue_date")
            if not items: missing.append("items")
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

        conn = get_db()
        cursor = conn.cursor()

        try:
            for item in items:
                quantity = normalize_quantity(item.get("quantity"))
                if not (item.get("description") and quantity is not None):
                    continue

                product_id, _ = resolve_invoice_item_product(cursor, item)
                if not product_id:
                    return jsonify({
                        "error": f"Invoice item does not match an existing product: {item.get('description')}"
                    }), 400

            movements, labels = get_invoice_stock_movements(cursor, items)

            ensure_inventory_rows(cursor)
            for product_id, quantity in movements.items():
                cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
                stock_row = cursor.fetchone()
                available = stock_row[0] if stock_row else 0

                if available < quantity:
                    return jsonify({
                        "error": f"Not enough stock for {labels.get(product_id, 'item')}. Available: {available}, required: {quantity}"
                    }), 400

            cursor.execute("""
                INSERT INTO invoices (user_id, invoice_number, client_name, issue_date, due_date, items, subtotal, tax, total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, invoice_number, client_name, issue_date, due_date, json.dumps(items), subtotal, tax, total))
            invoice_id = cursor.lastrowid
            for product_id, quantity in movements.items():
                cursor.execute("""
                    UPDATE inventory
                    SET stock_quantity = stock_quantity - ?
                    WHERE product_id=?
                """, (quantity, product_id))
                cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
                stock_after = cursor.fetchone()[0]
                record_stock_history(
                    cursor,
                    product_id,
                    -quantity,
                    stock_after,
                    "invoice_sale",
                    f"Sold on invoice {invoice_number}",
                    reference_type="invoice",
                    reference_id=invoice_id,
                    created_by=user["user_id"],
                )
            conn.commit()
            cursor.execute("""
                SELECT id, user_id, invoice_number, client_name, issue_date, due_date,
                       items, subtotal, tax, total, status, created_at
                FROM invoices
                WHERE id=?
            """, (invoice_id,))
            invoice = serialize_invoice_row(cursor.fetchone())
            return jsonify(invoice), 201
        except sqlite3.IntegrityError as e:
            return jsonify({"error": f"Invoice number already exists or database error: {str(e)}"}), 400
        except sqlite3.OperationalError as e:
            return jsonify({"error": f"Database operation error: {str(e)}"}), 500
        finally:
            conn.close()
    except Exception as e:
        print(f"Error in create_invoice: {str(e)}")
        return jsonify({"error": f"Server error: {str(e)}"}), 500


# -------------------------
# Get Invoices
# -------------------------
@app.route('/invoices/<int:user_id>', methods=['GET'])
@staff_or_admin_required
def get_invoices(user, user_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, user_id, invoice_number, client_name, issue_date, due_date,
                   items, subtotal, tax, total, status, created_at
            FROM invoices
            ORDER BY created_at DESC
        """)
        invoices = cursor.fetchall()
        invoice_list = [serialize_invoice_row(inv) for inv in invoices]
        return jsonify(invoice_list)
    finally:
        conn.close()


# -------------------------
# Delete Invoice
# -------------------------
@app.route('/invoices/<int:invoice_id>', methods=['DELETE'])
@admin_required
def delete_invoice(user, invoice_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT invoice_number, items FROM invoices WHERE id=?", (invoice_id,))
        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404

        invoice_number = invoice[0]
        items = json.loads(invoice[1])
        movements, _ = get_invoice_stock_movements(cursor, items)
        ensure_inventory_rows(cursor)

        cursor.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "Invoice not found"}), 404

        for product_id, quantity in movements.items():
            cursor.execute("""
                UPDATE inventory
                SET stock_quantity = stock_quantity + ?
                WHERE product_id=?
            """, (quantity, product_id))
            cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
            stock_after = cursor.fetchone()[0]
            record_stock_history(
                cursor,
                product_id,
                quantity,
                stock_after,
                "invoice_deleted",
                f"Stock return from {invoice_number}",
                reference_type="invoice",
                reference_id=invoice_id,
                created_by=user["user_id"],
            )

        conn.commit()
        return jsonify({"message": "Invoice deleted successfully"})
    finally:
        conn.close()


# -------------------------
# Generate Invoice PDF
# -------------------------
@app.route('/invoices/<int:invoice_id>/pdf', methods=['GET'])
@staff_or_admin_required
def generate_invoice_pdf(user, invoice_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,))
        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404

        pdf_buffer = BytesIO()
        doc = SimpleDocTemplate(
            pdf_buffer,
            pagesize=letter,
            topMargin=0.55 * inch,
            bottomMargin=0.45 * inch,
            leftMargin=0.5 * inch,
            rightMargin=0.5 * inch
        )
        elements = []
        styles = getSampleStyleSheet()

        black = colors.HexColor('#111111')
        grey = colors.HexColor('#6b6b6b')
        light_line = colors.HexColor('#cfcfcf')

        def format_au_date(date_str):
            if not date_str:
                return ""
            try:
                return datetime.datetime.strptime(date_str, "%Y-%m-%d").strftime("%d %b %Y")
            except ValueError:
                return date_str

        title_style = ParagraphStyle(
            'TaxTitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=24,
            textColor=black,
            leading=28,
        )
        company_under_title_style = ParagraphStyle(
            'CompanyUnderTitle',
            parent=styles['Normal'],
            fontSize=10,
            textColor=black,
            alignment=1,
            leading=12,
        )
        bill_to_label_style = ParagraphStyle(
            'BillToLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=10,
            textColor=black,
            leading=12,
        )
        bill_to_name_style = ParagraphStyle(
            'BillToName',
            parent=styles['Normal'],
            fontSize=10,
            textColor=black,
            leading=12,
        )
        small_label_style = ParagraphStyle(
            'SmallLabel',
            parent=styles['Normal'],
            fontName='Helvetica-Bold',
            fontSize=9,
            textColor=black,
            leading=11,
        )
        small_value_style = ParagraphStyle(
            'SmallValue',
            parent=styles['Normal'],
            fontSize=9,
            textColor=black,
            leading=11,
        )
        body_style = ParagraphStyle(
            'Body',
            parent=styles['Normal'],
            fontSize=9.5,
            textColor=black,
            leading=12,
        )
        body_bold_style = ParagraphStyle(
            'BodyBold',
            parent=body_style,
            fontName='Helvetica-Bold',
        )
        payment_title_style = ParagraphStyle(
            'PaymentTitle',
            parent=styles['Normal'],
            fontName='Helvetica',
            fontSize=24,
            textColor=black,
            leading=26,
        )
        payment_hint_style = ParagraphStyle(
            'PaymentHint',
            parent=styles['Normal'],
            fontSize=8.5,
            textColor=grey,
            leading=10,
        )
        advice_value_bold_style = ParagraphStyle(
            'AdviceValueBold',
            parent=body_style,
            fontName='Helvetica-Bold',
        )
        totals_label_style = ParagraphStyle(
            'TotalsLabel',
            parent=styles['Normal'],
            fontSize=9.5,
            textColor=black,
            alignment=2,
        )
        totals_value_style = ParagraphStyle(
            'TotalsValue',
            parent=styles['Normal'],
            fontSize=9.5,
            textColor=black,
            alignment=2,
        )
        totals_total_label_style = ParagraphStyle(
            'TotalsTotalLabel',
            parent=totals_label_style,
            fontName='Helvetica-Bold',
        )
        totals_total_value_style = ParagraphStyle(
            'TotalsTotalValue',
            parent=totals_value_style,
            fontName='Helvetica-Bold',
        )

        items = json.loads(invoice[6])
        item_count = len(items)
        issue_date = format_au_date(invoice[4])
        due_date = format_au_date(invoice[5] or invoice[4])

        business_name = "ONE PACIFIC TRADING PTY LTD"
        business_address_lines = [
            "4 Gatwood Close",
            "Padstow Sydney NSW 2211",
        ]
        business_abn = "16 643 396 203"
        eft_lines = [
            "EFT Bank Payments:",
            "Account Name: ONE PACIFIC TRADING PTY LTD",
            "BSB: 633 000",
            "Account Number: 2149 1026 7",
            "Please Use Quote Or Invoice number As Ref",
        ]

        top_spacer = Table([[""]], colWidths=[7.5 * inch], rowHeights=[0.25 * inch])
        top_spacer.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(top_spacer)

        left_header = Table([
            [Paragraph("TAX INVOICE", title_style)],
            [Paragraph("", company_under_title_style)],
        ], colWidths=[3.9 * inch])
        left_header.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))

        right_info_rows = [
            [
                Paragraph("Invoice Date", small_label_style),
                Paragraph(business_name, small_value_style),
            ],
            [
                Paragraph(issue_date, small_value_style),
                Paragraph("<br/>".join(business_address_lines), small_value_style),
            ],
            [
                Paragraph("Invoice Number", small_label_style),
                Paragraph("", small_value_style),
            ],
            [
                Paragraph(str(invoice[2]), small_value_style),
                Paragraph("", small_value_style),
            ],
            [
                Paragraph("ABN", small_label_style),
                Paragraph("", small_value_style),
            ],
            [
                Paragraph(business_abn, small_value_style),
                Paragraph("", small_value_style),
            ],
        ]
        right_info_table = Table(right_info_rows, colWidths=[1.45 * inch, 1.95 * inch])
        right_info_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))

        header_table = Table([[left_header, right_info_table]], colWidths=[3.95 * inch, 3.05 * inch])
        header_table.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(header_table)

        bill_to_table = Table([
            [Paragraph("Bill To:", bill_to_label_style)],
            [Paragraph(invoice[3], bill_to_name_style)],
        ], colWidths=[3.9 * inch], hAlign='LEFT')
        bill_to_table.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        bill_to_row = Table([[bill_to_table, ""]], colWidths=[3.95 * inch, 3.05 * inch])
        bill_to_row.setStyle(TableStyle([
            ('ALIGN', (0, 0), (0, 0), 'LEFT'),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        elements.append(bill_to_row)
        before_items_space = max(0.45, 1.25 - (0.08 * max(0, item_count - 1)))
        elements.append(Spacer(1, before_items_space * inch))

        table_data = [["Item", "Quantity", "Unit Price", "Amount AUD"]]
        for item in items:
            item_amount = float(item.get('amount', 0))
            table_data.append([
                item.get("description", ""),
                f"{float(item.get('quantity', 0)):.2f}",
                f"{float(item.get('unit_price', 0)):.2f}",
                f"{item_amount:.2f}",
            ])

        items_table = Table(table_data, colWidths=[4.25 * inch, 1.0 * inch, 1.05 * inch, 1.2 * inch])
        items_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8.5),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('TEXTCOLOR', (0, 0), (-1, -1), black),
            ('LINEBELOW', (0, 0), (-1, 0), 1, black),
            ('LINEBELOW', (0, 1), (-1, -1), 0.35, light_line),
            ('ALIGN', (0, 0), (0, -1), 'LEFT'),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ]))
        elements.append(items_table)
        elements.append(Spacer(1, 0.04 * inch))

        totals_rows = [
            [Paragraph("Subtotal", totals_label_style), Paragraph(f"{float(invoice[7]):.2f}", totals_value_style)],
            [Paragraph("TOTAL GST 10%", totals_label_style), Paragraph(f"{float(invoice[8]):.2f}", totals_value_style)],
            [Paragraph("TOTAL AUD", totals_total_label_style), Paragraph(f"{float(invoice[9]):.2f}", totals_total_value_style)],
        ]
        totals_table = Table(totals_rows, colWidths=[1.3 * inch, 1.2 * inch])
        totals_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'RIGHT'),
            ('LINEABOVE', (0, 2), (-1, 2), 1, black),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
            ('LEFTPADDING', (0, 0), (-1, -1), 3),
            ('RIGHTPADDING', (0, 0), (-1, -1), 3),
        ]))

        totals_wrap = Table([["", totals_table]], colWidths=[4.95 * inch, 2.5 * inch])
        totals_wrap.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))
        elements.append(totals_wrap)
        elements.append(Spacer(1, 0.18 * inch))

        bank_details_lines = [Paragraph(f"Due Date: {due_date}", body_bold_style)]
        bank_details_lines.extend(Paragraph(line_text, body_style) for line_text in eft_lines)
        bank_details = Table([[line] for line in bank_details_lines], colWidths=[7.5 * inch], hAlign='LEFT')
        bank_details.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
        ]))
        elements.append(bank_details)
        before_advice_space = max(0.12, 2.05 - (0.20 * max(0, item_count - 1)))
        elements.append(Spacer(1, before_advice_space * inch))

        advice_dash = Table([[""]], colWidths=[7.5 * inch], rowHeights=[0.08 * inch])
        advice_dash.setStyle(TableStyle([
            ('LINEABOVE', (0, 0), (-1, 0), 1, grey, None, (4, 4)),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        payment_advice_elements = [advice_dash]

        to_block = Table([
            [Paragraph("To:", body_style), Paragraph(f"{business_name}<br/>{'<br/>'.join(business_address_lines)}", body_style)],
        ], colWidths=[0.55 * inch, 2.95 * inch])
        to_block.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))

        advice_rows = [
            ["Customer", invoice[3]],
            ["Invoice Number", str(invoice[2])],
            ["Amount Due", Paragraph(f"{float(invoice[9]):.2f}", advice_value_bold_style)],
            ["Due Date", due_date],
            ["Amount Enclosed", ""],
        ]
        advice_table = Table(advice_rows, colWidths=[1.2 * inch, 2.3 * inch])
        advice_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('LINEBELOW', (0, 1), (-1, 1), 0.35, light_line),
            ('LINEBELOW', (0, 3), (-1, 3), 0.35, light_line),
            ('LINEBELOW', (1, 4), (1, 4), 1, black),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ]))
        amount_hint = Table([[ "", Paragraph("Enter the amount you are paying above", payment_hint_style) ]], colWidths=[1.2 * inch, 2.3 * inch])
        amount_hint.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 2),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        advice_block = Table([[advice_table], [amount_hint]], colWidths=[3.5 * inch])
        advice_block.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))

        indented_to_block = Table([["", to_block]], colWidths=[0.35 * inch, 3.45 * inch])
        indented_to_block.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))

        payment_left_block = Table([
            [Paragraph("PAYMENT ADVICE", payment_title_style)],
            [""],
            [indented_to_block],
        ], colWidths=[3.9 * inch], rowHeights=[0.32 * inch, 0.35 * inch, None])
        payment_left_block.setStyle(TableStyle([
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ]))

        payment_section = Table([[payment_left_block, advice_block]], colWidths=[3.9 * inch, 3.6 * inch])
        payment_section.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        payment_advice_elements.append(payment_section)
        elements.append(KeepTogether(payment_advice_elements))

        # Build PDF
        doc.build(elements)
        pdf_buffer.seek(0)

        return pdf_buffer.getvalue(), 200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': f'attachment; filename="invoice_{invoice[2]}.pdf"'
        }
    except Exception as e:
        print(f"PDF generation error: {str(e)}")
        return jsonify({"error": f"PDF generation error: {str(e)}"}), 500
    finally:
        conn.close()


# -------------------------
# Run server
# -------------------------
if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "1") == "1",
    )

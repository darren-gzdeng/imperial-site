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

app = Flask(__name__)
CORS(app)
app.config['SECRET_KEY'] = 'super_secret_key'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "users.db")
SYDNEY_TZ = ZoneInfo("Australia/Sydney")


def sydney_timestamp():
    return datetime.datetime.now(SYDNEY_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")


def utc_timestamp_to_sydney(value):
    if not value:
        return sydney_timestamp()

    try:
        cleaned_value = value.replace(" AEST", "").replace(" AEDT", "")
        utc_datetime = datetime.datetime.strptime(cleaned_value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=datetime.timezone.utc)
        return utc_datetime.astimezone(SYDNEY_TZ).strftime("%Y-%m-%d %H:%M:%S %Z")
    except ValueError:
        return value

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
    if "created_at" not in user_columns:
        cursor.execute("ALTER TABLE users ADD COLUMN created_at TIMESTAMP")
        cursor.execute("UPDATE users SET created_at = CURRENT_TIMESTAMP WHERE created_at IS NULL")

    cursor.execute("PRAGMA table_info(products)")
    product_columns = {column[1] for column in cursor.fetchall()}
    expected_product_columns = {"id", "item", "sku", "weight", "unit_price", "updated_at"}
    if product_columns and product_columns != expected_product_columns:
        cursor.execute("ALTER TABLE products RENAME TO products_old")
        cursor.execute("""
        CREATE TABLE products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            item TEXT NOT NULL,
            sku TEXT UNIQUE,
            weight REAL,
            unit_price REAL NOT NULL,
            updated_at TIMESTAMP
        )
        """)

        item_expression = "item" if "item" in product_columns else "name"
        sku_expression = "sku" if "sku" in product_columns else "NULL"
        weight_expression = "weight" if "weight" in product_columns else "NULL"
        updated_at_expression = "updated_at" if "updated_at" in product_columns else "NULL"

        cursor.execute(f"""
            INSERT INTO products (id, item, sku, weight, unit_price, updated_at)
            SELECT id, {item_expression}, {sku_expression}, {weight_expression}, unit_price, {updated_at_expression}
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
                first_name = idinfo.get("given_name", "")
                last_name = idinfo.get("family_name", "")
                # Create new user with Google login (use email as password placeholder)
                cursor.execute(
                    "INSERT INTO users (first_name, last_name, email, password) VALUES (?, ?, ?, ?)",
                    (first_name, last_name, email, hash_password(email + "_google"))
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
        cursor.execute("""
            SELECT id, item, sku, weight, unit_price, updated_at
            FROM products
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
                "updated_at": product[5],
            }
            for product in products
        ])
    finally:
        conn.close()


@app.route('/products', methods=['POST'])
def create_product():
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
        cursor.execute(
            "INSERT INTO products (item, unit_price, updated_at) VALUES (?, ?, ?)",
            (item, unit_price, updated_at)
        )
        product_id = cursor.lastrowid
        conn.commit()
        return jsonify({
            "id": product_id,
            "item": item,
            "sku": "",
            "weight": None,
            "unit_price": unit_price,
            "updated_at": updated_at,
        }), 201
    finally:
        conn.close()


@app.route('/products/<int:product_id>', methods=['PUT'])
def update_product(product_id):
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
        cursor.execute("""
            UPDATE products
            SET item=?, unit_price=?, updated_at=?
            WHERE id=?
        """, (item, unit_price, updated_at, product_id))

        if cursor.rowcount == 0:
            return jsonify({"error": "Product not found"}), 404

        conn.commit()
        return jsonify({
            "id": product_id,
            "item": item,
            "unit_price": unit_price,
            "updated_at": updated_at,
        })
    finally:
        conn.close()


@app.route('/products/<int:product_id>', methods=['DELETE'])
def delete_product(product_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
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
def get_clients():
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
def create_client():
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
def update_client(client_id):
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
def delete_client(client_id):
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
            SELECT id, first_name, last_name, email, phone, address, created_at
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
            "created_at": account[6],
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


# -------------------------
# Create Invoice
# -------------------------
@app.route('/invoices', methods=['POST'])
def create_invoice():
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
            cursor.execute("""
                INSERT INTO invoices (user_id, invoice_number, client_name, issue_date, due_date, items, subtotal, tax, total)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, invoice_number, client_name, issue_date, due_date, json.dumps(items), subtotal, tax, total))
            conn.commit()
            return jsonify({"message": "Invoice created successfully", "invoice_id": cursor.lastrowid}), 201
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
# Get User Invoices
# -------------------------
@app.route('/invoices/<int:user_id>', methods=['GET'])
def get_invoices(user_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM invoices WHERE user_id=? ORDER BY created_at DESC", (user_id,))
        invoices = cursor.fetchall()
        
        invoice_list = []
        for inv in invoices:
            invoice_list.append({
                "id": inv[0],
                "user_id": inv[1],
                "invoice_number": inv[2],
                "client_name": inv[3],
                "issue_date": inv[4],
                "due_date": inv[5],
                "items": json.loads(inv[6]),
                "subtotal": inv[7],
                "tax": inv[8],
                "total": inv[9],
                "status": inv[10],
                "created_at": inv[11]
            })
        
        return jsonify(invoice_list)
    finally:
        conn.close()


# -------------------------
# Delete Invoice
# -------------------------
@app.route('/invoices/<int:invoice_id>', methods=['DELETE'])
def delete_invoice(invoice_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "Invoice not found"}), 404

        conn.commit()
        return jsonify({"message": "Invoice deleted successfully"})
    finally:
        conn.close()


# -------------------------
# Generate Invoice PDF
# -------------------------
@app.route('/invoices/<int:invoice_id>/pdf', methods=['GET'])
def generate_invoice_pdf(invoice_id):
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

        table_data = [["Item", "Quantity", "Unit Price", "GST", "Amount AUD"]]
        for item in items:
            table_data.append([
                item.get("description", ""),
                f"{float(item.get('quantity', 0)):.2f}",
                f"{float(item.get('unit_price', 0)):.2f}",
                "10%",
                f"{float(item.get('amount', 0)):.2f}",
            ])

        items_table = Table(table_data, colWidths=[4.0 * inch, 0.85 * inch, 0.9 * inch, 0.55 * inch, 1.2 * inch])
        items_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
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
    app.run(debug=True)

from flask import Flask
import os
from flask_cors import CORS

from controllers.account_controller import account_bp
from controllers.admin_users_controller import admin_users_bp
from controllers.auth_controller import auth_bp
from controllers.checkout_controller import checkout_bp
from controllers.clients_controller import clients_bp
from controllers.dashboard_controller import dashboard_bp
from controllers.delivery_controller import delivery_bp
from controllers.inventory_controller import inventory_bp
from controllers.invoices_controller import invoices_bp
from controllers.payment_companies_controller import payment_companies_bp
from controllers.products_controller import products_bp
from core.config import BASE_DIR, CORS_ORIGINS, SECRET_KEY
from core.database import get_db
from core.utils import sydney_timestamp, utc_timestamp_to_sydney
from services.delivery_service import record_delivery_log
from services.stock_service import ensure_inventory_rows

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": CORS_ORIGINS}})
app.config['SECRET_KEY'] = SECRET_KEY
app.register_blueprint(account_bp)
app.register_blueprint(admin_users_bp)
app.register_blueprint(auth_bp)
app.register_blueprint(checkout_bp)
app.register_blueprint(clients_bp)
app.register_blueprint(dashboard_bp)
app.register_blueprint(delivery_bp)
app.register_blueprint(inventory_bp)
app.register_blueprint(invoices_bp)
app.register_blueprint(payment_companies_bp)
app.register_blueprint(products_bp)

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

    cursor.execute("PRAGMA table_info(orders)")
    order_columns = {column[1] for column in cursor.fetchall()}
    order_migrations = {
        "reservation_token": "ALTER TABLE orders ADD COLUMN reservation_token TEXT",
        "customer_name": "ALTER TABLE orders ADD COLUMN customer_name TEXT",
        "phone": "ALTER TABLE orders ADD COLUMN phone TEXT",
        "delivery_date": "ALTER TABLE orders ADD COLUMN delivery_date TEXT",
        "delivery_note": "ALTER TABLE orders ADD COLUMN delivery_note TEXT",
    }
    for column_name, statement in order_migrations.items():
        if order_columns and column_name not in order_columns:
            cursor.execute(statement)

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
        "items", "subtotal", "tax", "total", "status", "created_at", "payment_company_id"
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
            payment_company_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES users(id),
            FOREIGN KEY (payment_company_id) REFERENCES payment_companies(id)
        )
        """)

        status_expression = "status" if "status" in invoice_columns else "'draft'"
        created_at_expression = "created_at" if "created_at" in invoice_columns else "CURRENT_TIMESTAMP"
        payment_company_expression = "payment_company_id" if "payment_company_id" in invoice_columns else "NULL"

        cursor.execute(f"""
            INSERT INTO invoices (
                id, user_id, invoice_number, client_name, issue_date, due_date,
                items, subtotal, tax, total, status, created_at, payment_company_id
            )
            SELECT
                id, user_id, invoice_number, client_name, issue_date, due_date,
                items, subtotal, tax, total, {status_expression}, {created_at_expression}, {payment_company_expression}
            FROM invoices_old
        """)
        cursor.execute("DROP TABLE invoices_old")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payment_companies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            company_name TEXT UNIQUE NOT NULL,
            abn TEXT,
            address_line_1 TEXT,
            address_line_2 TEXT,
            bsb TEXT,
            account_name TEXT,
            account_number TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    cursor.execute("SELECT COUNT(*) FROM payment_companies")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
            INSERT INTO payment_companies (
                company_name, abn, address_line_1, address_line_2, bsb, account_name, account_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            "ONE PACIFIC TRADING PTY LTD",
            "16 643 396 203",
            "4 Gatwood Close",
            "Padstow Sydney NSW 2211",
            "633 000",
            "ONE PACIFIC TRADING PTY LTD",
            "2149 1026 7",
            "Please Use Quote Or Invoice number As Ref"
        ))

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
    cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_reservation_token ON orders(reservation_token)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_delivery_tracking_order_id ON delivery_tracking(order_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_delivery_logs_order_id_id ON delivery_logs(order_id, id DESC)")

    seed_james_test_order(cursor)

    conn.commit()
    conn.close()


def seed_james_test_order(cursor):
    cursor.execute("""
        SELECT id
        FROM users
        WHERE LOWER(email)=LOWER(?)
    """, ("james.inbox.inbox@gmail.com",))
    user = cursor.fetchone()
    if not user:
        return

    user_id = user[0]
    reservation_token = "seed-james-he-test-order"
    cursor.execute("SELECT id FROM orders WHERE reservation_token=?", (reservation_token,))
    if cursor.fetchone():
        return

    cursor.execute("""
        INSERT INTO products (item, sku, weight, unit_price, retail_price, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(sku) DO UPDATE SET
            item=excluded.item,
            weight=excluded.weight,
            unit_price=excluded.unit_price,
            retail_price=excluded.retail_price,
            updated_at=excluded.updated_at
    """, (
        "Raw Snow Crab Claws 400g/pkg",
        "SNOW-CLAW-RAW-400",
        400,
        28.38,
        36.90,
        sydney_timestamp(),
    ))
    cursor.execute("SELECT id FROM products WHERE sku=?", ("SNOW-CLAW-RAW-400",))
    product_id = cursor.fetchone()[0]

    cursor.execute("""
        INSERT INTO inventory (product_id, stock_quantity)
        VALUES (?, 20)
        ON CONFLICT(product_id) DO NOTHING
    """, (product_id,))

    quantity = 2
    subtotal = 73.80
    shipping = 6.50
    total = 80.30
    gst = round(total / 11, 2)
    shipping_address = "4 Gatwood Close, Padstow NSW 2211, Australia"

    cursor.execute("""
        INSERT INTO orders (
            user_id, reservation_token, status, subtotal, gst, total,
            customer_name, phone, shipping_address, delivery_date, delivery_note
        )
        VALUES (?, ?, 'out_for_delivery', ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        user_id,
        reservation_token,
        subtotal,
        gst,
        total,
        "James He",
        "424855889",
        shipping_address,
        "2026-06-24",
        "",
    ))
    order_id = cursor.lastrowid

    cursor.execute("""
        INSERT INTO orders_items (order_id, quantity, product_id)
        VALUES (?, ?, ?)
    """, (order_id, quantity, product_id))
    cursor.execute("""
        INSERT INTO delivery_tracking (
            order_id, driver_name, driver_lat, driver_lng, destination_address,
            status, eta_text, updated_at
        )
        VALUES (?, ?, ?, ?, ?, 'out_for_delivery', ?, ?)
    """, (
        order_id,
        "Test Driver",
        -33.8688,
        151.2093,
        shipping_address,
        "25 mins",
        sydney_timestamp(),
    ))
    record_delivery_log(cursor, order_id, "order_placed", "Test order placed for James He.", created_by=user_id)
    record_delivery_log(cursor, order_id, "assigned_to_driver", "Test order assigned to Test Driver.", created_by=user_id)
    record_delivery_log(cursor, order_id, "out_for_delivery", "Driver started delivery.", created_by=user_id)

init_db()


# -------------------------
# Run server
# -------------------------
if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "127.0.0.1"),
        port=int(os.getenv("FLASK_PORT", "5000")),
        debug=os.getenv("FLASK_DEBUG", "1") == "1",
    )

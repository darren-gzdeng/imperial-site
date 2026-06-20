from core.utils import normalize_quantity, sydney_timestamp, utc_iso_timestamp


def ensure_inventory_rows(cursor):
    cursor.execute("""
        INSERT INTO inventory (product_id, stock_quantity)
        SELECT products.id, 0
        FROM products
        LEFT JOIN inventory ON inventory.product_id = products.id
        WHERE inventory.id IS NULL
    """)


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


def resolve_checkout_product(cursor, item):
    product_id = item.get("product_id") or item.get("backend_product_id")

    if product_id not in (None, ""):
        cursor.execute("SELECT id, item FROM products WHERE id=?", (product_id,))
        product = cursor.fetchone()
        if product:
            return product[0], product[1]

    item_name = (item.get("backend_item") or item.get("item") or item.get("name") or "").strip()
    if not item_name:
        return None, ""

    cursor.execute("SELECT id, item FROM products WHERE item=? ORDER BY id LIMIT 1", (item_name,))
    product = cursor.fetchone()

    if product:
        return product[0], product[1]

    cursor.execute("SELECT id, item FROM products WHERE item LIKE ? ORDER BY id LIMIT 1", (f"{item_name}%",))
    product = cursor.fetchone()

    if product:
        return product[0], product[1]

    return None, item_name

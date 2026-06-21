import os
import secrets

from flask import Blueprint, jsonify, request

try:
    import stripe
except ImportError:
    stripe = None

from core.config import FRONTEND_BASE_URL, STRIPE_CURRENCY
from core.database import get_db
from core.utils import calculate_shipping, normalize_quantity, price_to_cents, sydney_timestamp, utc_iso_timestamp
from services.delivery_service import record_delivery_log
from services.stock_service import (
    ensure_inventory_rows,
    record_stock_history,
    release_expired_reservations,
    resolve_checkout_product,
)


checkout_bp = Blueprint("checkout", __name__)


# -------------------------
# Checkout
# -------------------------
@checkout_bp.route('/checkout/reserve', methods=['POST'])
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


@checkout_bp.route('/checkout/reservations/<reservation_token>/complete', methods=['POST'])
def complete_checkout_reservation(reservation_token):
    data = request.json or {}
    checkout_details = data.get("checkout_details") or {}
    shipping_address = (checkout_details.get("shipping_address") or "").strip()
    customer_name = (checkout_details.get("customer_name") or "").strip()
    phone = (checkout_details.get("phone") or "").strip()
    delivery_note = (checkout_details.get("delivery_note") or "").strip()

    if not shipping_address:
        return jsonify({"error": "Shipping address is required to create the delivery order"}), 400

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

        cursor.execute("SELECT id FROM orders WHERE reservation_token=?", (reservation_token,))
        existing_order = cursor.fetchone()
        if existing_order:
            conn.commit()
            return jsonify({"message": "Checkout completed", "order_id": existing_order[0]})

        if status != "active":
            conn.rollback()
            return jsonify({"error": "Reservation is no longer active"}), 409

        cursor.execute("""
            SELECT products.id, products.retail_price, stock_reservation_items.quantity
            FROM stock_reservation_items
            JOIN products ON products.id = stock_reservation_items.product_id
            WHERE stock_reservation_items.reservation_id=?
        """, (reservation_id,))
        reserved_items = cursor.fetchall()

        if not reserved_items:
            conn.rollback()
            return jsonify({"error": "Reservation has no items"}), 400

        cursor.execute("SELECT id FROM users ORDER BY id LIMIT 1")
        fallback_user = cursor.fetchone()
        user_id = checkout_details.get("user_id") or (fallback_user[0] if fallback_user else None)

        if not user_id:
            conn.rollback()
            return jsonify({"error": "A user account is required to create an order"}), 400

        subtotal = sum(float(retail_price) * float(quantity) for _, retail_price, quantity in reserved_items)
        shipping = calculate_shipping(subtotal)
        total = round(subtotal + shipping, 2)
        gst = round(total / 11, 2)

        cursor.execute("""
            INSERT INTO orders (
                user_id, reservation_token, status, subtotal, gst, total,
                customer_name, phone, shipping_address, delivery_note
            )
            VALUES (?, ?, 'paid', ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id,
            reservation_token,
            round(subtotal, 2),
            gst,
            total,
            customer_name,
            phone,
            shipping_address,
            delivery_note,
        ))
        order_id = cursor.lastrowid

        for product_id, _, quantity in reserved_items:
            cursor.execute("""
                INSERT INTO orders_items (order_id, quantity, product_id)
                VALUES (?, ?, ?)
            """, (order_id, int(quantity), product_id))

        cursor.execute("""
            INSERT INTO delivery_tracking (
                order_id, destination_address, status, updated_at
            )
            VALUES (?, ?, 'preparing', ?)
        """, (order_id, shipping_address, sydney_timestamp()))
        record_delivery_log(
            cursor,
            order_id,
            "order_placed",
            f"Order placed for delivery to {shipping_address}.",
            created_by=user_id,
        )

        cursor.execute(
            "UPDATE stock_reservations SET status='completed' WHERE id=?",
            (reservation_id,)
        )
        conn.commit()
        return jsonify({"message": "Checkout completed", "order_id": order_id})
    finally:
        conn.close()


@checkout_bp.route('/checkout/stripe-session', methods=['POST'])
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

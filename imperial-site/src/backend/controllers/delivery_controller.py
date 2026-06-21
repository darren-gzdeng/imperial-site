from flask import Blueprint, jsonify, request

from core.auth import staff_or_admin_required, token_required
from core.database import get_db
from core.utils import sydney_timestamp
from services.delivery_service import record_delivery_log


delivery_bp = Blueprint("delivery", __name__)


def serialize_delivery(row):
    return {
        "order_id": row[0],
        "status": row[1],
        "destination_address": row[2],
        "driver_name": row[3] or "",
        "driver_lat": row[4],
        "driver_lng": row[5],
        "eta_text": row[6] or "",
        "updated_at": row[7],
        "customer_name": row[8] or "",
        "phone": row[9] or "",
        "order_total": row[10],
    }


def serialize_delivery_log(row):
    return {
        "id": row[0],
        "event_type": row[1],
        "message": row[2],
        "created_at": row[3],
        "created_by": row[4] or "",
    }


@delivery_bp.route("/orders/<int:order_id>/tracking", methods=["GET"])
@token_required
def get_order_tracking(user, order_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT account_type FROM users WHERE id=?", (user["user_id"],))
        account = cursor.fetchone()
        is_staff = account and account[0] in ("Admin", "Staff")

        cursor.execute("""
            SELECT orders.user_id, delivery_tracking.status,
                   delivery_tracking.destination_address, delivery_tracking.driver_name,
                   delivery_tracking.driver_lat, delivery_tracking.driver_lng,
                   delivery_tracking.eta_text, delivery_tracking.updated_at,
                   orders.customer_name, orders.phone, orders.total
            FROM orders
            JOIN delivery_tracking ON delivery_tracking.order_id = orders.id
            WHERE orders.id=?
        """, (order_id,))
        row = cursor.fetchone()

        if not row:
            return jsonify({"error": "Tracking not found"}), 404

        if not is_staff and row[0] != user["user_id"]:
            return jsonify({"error": "You cannot view this delivery"}), 403

        return jsonify(serialize_delivery((order_id, *row[1:])))
    finally:
        conn.close()


@delivery_bp.route("/driver/orders", methods=["GET"])
@staff_or_admin_required
def get_driver_orders(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT orders.id, delivery_tracking.status,
                   delivery_tracking.destination_address, delivery_tracking.driver_name,
                   delivery_tracking.driver_lat, delivery_tracking.driver_lng,
                   delivery_tracking.eta_text, delivery_tracking.updated_at,
                   orders.customer_name, orders.phone, orders.total
            FROM orders
            JOIN delivery_tracking ON delivery_tracking.order_id = orders.id
            WHERE delivery_tracking.status != 'delivered'
            ORDER BY orders.created_at DESC
        """)
        return jsonify([serialize_delivery(row) for row in cursor.fetchall()])
    finally:
        conn.close()


@delivery_bp.route("/delivery-checks", methods=["GET"])
@staff_or_admin_required
def get_delivery_checks(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT orders.id, delivery_tracking.status,
                   delivery_tracking.destination_address, delivery_tracking.driver_name,
                   delivery_tracking.driver_lat, delivery_tracking.driver_lng,
                   delivery_tracking.eta_text, delivery_tracking.updated_at,
                   orders.customer_name, orders.phone, orders.total
            FROM orders
            JOIN delivery_tracking ON delivery_tracking.order_id = orders.id
            ORDER BY orders.created_at DESC, orders.id DESC
        """)
        deliveries = [serialize_delivery(row) for row in cursor.fetchall()]

        for delivery in deliveries:
            cursor.execute("""
                SELECT delivery_logs.id, delivery_logs.event_type, delivery_logs.message,
                       delivery_logs.created_at,
                       COALESCE(NULLIF(TRIM(users.first_name || ' ' || users.last_name), ''), users.email)
                FROM delivery_logs
                LEFT JOIN users ON users.id = delivery_logs.created_by
                WHERE delivery_logs.order_id=?
                ORDER BY delivery_logs.id DESC
            """, (delivery["order_id"],))
            delivery["logs"] = [serialize_delivery_log(row) for row in cursor.fetchall()]

        return jsonify(deliveries)
    finally:
        conn.close()


@delivery_bp.route("/driver/orders/<int:order_id>/tracking", methods=["PUT"])
@staff_or_admin_required
def update_driver_tracking(user, order_id):
    data = request.json or {}
    driver_name = (data.get("driver_name") or "").strip()
    status = (data.get("status") or "out_for_delivery").strip()
    eta_text = (data.get("eta_text") or "").strip()

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT id FROM orders WHERE id=?", (order_id,))
        if not cursor.fetchone():
            return jsonify({"error": "Order not found"}), 404

        cursor.execute("SELECT driver_lat, driver_lng, driver_name, status FROM delivery_tracking WHERE order_id=?", (order_id,))
        current_tracking = cursor.fetchone()

        try:
            driver_lat = float(data.get("driver_lat"))
            driver_lng = float(data.get("driver_lng"))
        except (TypeError, ValueError):
            if current_tracking and current_tracking[0] is not None and current_tracking[1] is not None:
                driver_lat, driver_lng = current_tracking
            else:
                return jsonify({"error": "Driver latitude and longitude are required"}), 400

        cursor.execute("""
            UPDATE delivery_tracking
            SET driver_name=?, driver_lat=?, driver_lng=?, status=?, eta_text=?, updated_at=?
            WHERE order_id=?
        """, (
            driver_name,
            driver_lat,
            driver_lng,
            status,
            eta_text,
            sydney_timestamp(),
            order_id,
        ))

        if cursor.rowcount == 0:
            cursor.execute("""
                INSERT INTO delivery_tracking (
                    order_id, driver_name, driver_lat, driver_lng,
                    destination_address, status, eta_text, updated_at
                )
                SELECT id, ?, ?, ?, shipping_address, ?, ?, ?
                FROM orders
                WHERE id=?
            """, (
                driver_name,
                driver_lat,
                driver_lng,
                status,
                eta_text,
                sydney_timestamp(),
                order_id,
            ))

        current_driver_name = current_tracking[2] if current_tracking else ""
        current_status = current_tracking[3] if current_tracking else ""
        if driver_name and driver_name != current_driver_name:
            record_delivery_log(
                cursor,
                order_id,
                "assigned_to_driver",
                f"Order assigned to driver {driver_name}.",
                created_by=user["user_id"],
            )

        if status == "out_for_delivery" and current_status != "out_for_delivery":
            record_delivery_log(
                cursor,
                order_id,
                "out_for_delivery",
                "Driver started delivery.",
                created_by=user["user_id"],
            )
        elif status == "delivered" and current_status != "delivered":
            record_delivery_log(
                cursor,
                order_id,
                "order_delivered",
                "Order marked as delivered.",
                created_by=user["user_id"],
            )
        elif status != "delivered":
            record_delivery_log(
                cursor,
                order_id,
                "driver_location_updated",
                "Driver location updated.",
                created_by=user["user_id"],
            )

        if status == "delivered":
            cursor.execute("UPDATE orders SET status='delivered' WHERE id=?", (order_id,))
        elif status == "out_for_delivery":
            cursor.execute("UPDATE orders SET status='out_for_delivery' WHERE id=?", (order_id,))

        conn.commit()
        return jsonify({"message": "Tracking updated"})
    finally:
        conn.close()

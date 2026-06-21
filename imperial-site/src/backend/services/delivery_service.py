from core.utils import sydney_timestamp


def record_delivery_log(cursor, order_id, event_type, message, created_by=None):
    cursor.execute("""
        INSERT INTO delivery_logs (order_id, event_type, message, created_at, created_by)
        VALUES (?, ?, ?, ?, ?)
    """, (
        order_id,
        event_type,
        message,
        sydney_timestamp(),
        created_by,
    ))

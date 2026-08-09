import json


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
        "payment_company_id": row[12] if len(row) > 12 else None,
    }

import sqlite3

from flask import Blueprint, jsonify, request

from core.auth import admin_required, staff_or_admin_required
from core.database import get_db


payment_companies_bp = Blueprint("payment_companies", __name__)


@payment_companies_bp.route('/payment-companies', methods=['GET'])
@staff_or_admin_required
def get_payment_companies(user):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, company_name, abn, address_line_1, address_line_2, bsb, account_name, account_number, notes, created_at
            FROM payment_companies
            ORDER BY company_name ASC
        """)
        companies = cursor.fetchall()

        return jsonify([
            {
                "id": company[0],
                "company_name": company[1],
                "abn": company[2] or "",
                "address_line_1": company[3] or "",
                "address_line_2": company[4] or "",
                "bsb": company[5] or "",
                "account_name": company[6] or "",
                "account_number": company[7] or "",
                "notes": company[8] or "",
                "created_at": company[9],
            }
            for company in companies
        ])
    finally:
        conn.close()


@payment_companies_bp.route('/payment-companies', methods=['POST'])
@admin_required
def create_payment_company(user):
    data = request.json or {}
    company_name = (data.get("company_name") or "").strip()

    if not company_name:
        return jsonify({"error": "Company name is required"}), 400

    payload = {
        "company_name": company_name,
        "abn": (data.get("abn") or "").strip(),
        "address_line_1": (data.get("address_line_1") or "").strip(),
        "address_line_2": (data.get("address_line_2") or "").strip(),
        "bsb": (data.get("bsb") or "").strip(),
        "account_name": (data.get("account_name") or "").strip(),
        "account_number": (data.get("account_number") or "").strip(),
        "notes": (data.get("notes") or "").strip(),
    }

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            INSERT INTO payment_companies (
                company_name, abn, address_line_1, address_line_2, bsb, account_name, account_number, notes
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                payload["company_name"],
                payload["abn"],
                payload["address_line_1"],
                payload["address_line_2"],
                payload["bsb"],
                payload["account_name"],
                payload["account_number"],
                payload["notes"],
            ),
        )
        conn.commit()
        return jsonify({
            "id": cursor.lastrowid,
            **payload,
        }), 201
    except sqlite3.IntegrityError:
        return jsonify({"error": "Company already exists"}), 400
    finally:
        conn.close()


@payment_companies_bp.route('/payment-companies/<int:company_id>', methods=['PUT'])
@admin_required
def update_payment_company(user, company_id):
    data = request.json or {}
    company_name = (data.get("company_name") or "").strip()

    if not company_name:
        return jsonify({"error": "Company name is required"}), 400

    payload = {
        "company_name": company_name,
        "abn": (data.get("abn") or "").strip(),
        "address_line_1": (data.get("address_line_1") or "").strip(),
        "address_line_2": (data.get("address_line_2") or "").strip(),
        "bsb": (data.get("bsb") or "").strip(),
        "account_name": (data.get("account_name") or "").strip(),
        "account_number": (data.get("account_number") or "").strip(),
        "notes": (data.get("notes") or "").strip(),
    }

    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute(
            """
            UPDATE payment_companies
            SET company_name=?, abn=?, address_line_1=?, address_line_2=?, bsb=?, account_name=?, account_number=?, notes=?
            WHERE id=?
            """,
            (
                payload["company_name"],
                payload["abn"],
                payload["address_line_1"],
                payload["address_line_2"],
                payload["bsb"],
                payload["account_name"],
                payload["account_number"],
                payload["notes"],
                company_id,
            ),
        )

        if cursor.rowcount == 0:
            return jsonify({"error": "Company not found"}), 404

        conn.commit()
        return jsonify({"id": company_id, **payload})
    except sqlite3.IntegrityError:
        return jsonify({"error": "Company already exists"}), 400
    finally:
        conn.close()


@payment_companies_bp.route('/payment-companies/<int:company_id>', methods=['DELETE'])
@admin_required
def delete_payment_company(user, company_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("DELETE FROM payment_companies WHERE id=?", (company_id,))
        if cursor.rowcount == 0:
            return jsonify({"error": "Company not found"}), 404

        conn.commit()
        return jsonify({"message": "Company deleted successfully"})
    except sqlite3.IntegrityError:
        return jsonify({"error": "This company is used by existing invoices and cannot be deleted"}), 400
    finally:
        conn.close()

import sqlite3

from flask import Blueprint, jsonify, request

from core.auth import admin_required, staff_or_admin_required
from core.database import get_db


clients_bp = Blueprint("clients", __name__)


# -------------------------
# Clients
# -------------------------
@clients_bp.route('/clients', methods=['GET'])
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


@clients_bp.route('/clients', methods=['POST'])
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


@clients_bp.route('/clients/<int:client_id>', methods=['PUT'])
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


@clients_bp.route('/clients/<int:client_id>', methods=['DELETE'])
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



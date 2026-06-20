from flask import Blueprint, jsonify

from core.auth import token_required


dashboard_bp = Blueprint("dashboard", __name__)


# -------------------------
# Protected route
# -------------------------
@dashboard_bp.route('/dashboard')
@token_required
def dashboard(user):
    return jsonify({"message": "Welcome! You are logged in."})



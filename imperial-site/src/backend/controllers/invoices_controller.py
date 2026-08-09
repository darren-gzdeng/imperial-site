import datetime
import json
import sqlite3
from io import BytesIO

from flask import Blueprint, jsonify, request
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from core.auth import admin_required, staff_or_admin_required
from core.database import get_db
from core.utils import normalize_quantity
from services.invoice_service import serialize_invoice_row
from services.stock_service import (
    ensure_inventory_rows,
    get_invoice_stock_movements,
    record_stock_history,
    resolve_invoice_item_product,
)


invoices_bp = Blueprint("invoices", __name__)


# -------------------------
# Create Invoice
# -------------------------
@invoices_bp.route('/invoices', methods=['POST'])
@staff_or_admin_required
def create_invoice(user):
    try:
        data = request.json
        
        user_id = data.get("user_id")
        invoice_number = data.get("invoice_number")
        client_name = data.get("client_name")
        payment_company_id = data.get("payment_company_id")
        issue_date = data.get("issue_date")
        due_date = data.get("due_date")
        items = data.get("items")
        subtotal = data.get("subtotal")
        tax = data.get("tax")
        total = data.get("total")

        if not all([user_id, invoice_number, client_name, payment_company_id, issue_date, items]):
            missing = []
            if not user_id: missing.append("user_id")
            if not invoice_number: missing.append("invoice_number")
            if not client_name: missing.append("client_name")
            if not payment_company_id: missing.append("payment_company_id")
            if not issue_date: missing.append("issue_date")
            if not items: missing.append("items")
            return jsonify({"error": f"Missing required fields: {', '.join(missing)}"}), 400

        conn = get_db()
        cursor = conn.cursor()

        try:
            for item in items:
                quantity = normalize_quantity(item.get("quantity"))
                if not (item.get("description") and quantity is not None):
                    continue

                product_id, _ = resolve_invoice_item_product(cursor, item)
                if not product_id:
                    return jsonify({
                        "error": f"Invoice item does not match an existing product: {item.get('description')}"
                    }), 400

            movements, labels = get_invoice_stock_movements(cursor, items)

            ensure_inventory_rows(cursor)
            for product_id, quantity in movements.items():
                cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
                stock_row = cursor.fetchone()
                available = stock_row[0] if stock_row else 0

                if available < quantity:
                    return jsonify({
                        "error": f"Not enough stock for {labels.get(product_id, 'item')}. Available: {available}, required: {quantity}"
                    }), 400

            cursor.execute("""
                INSERT INTO invoices (user_id, invoice_number, client_name, issue_date, due_date, items, subtotal, tax, total, payment_company_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (user_id, invoice_number, client_name, issue_date, due_date, json.dumps(items), subtotal, tax, total, payment_company_id))
            invoice_id = cursor.lastrowid
            for product_id, quantity in movements.items():
                cursor.execute("""
                    UPDATE inventory
                    SET stock_quantity = stock_quantity - ?
                    WHERE product_id=?
                """, (quantity, product_id))
                cursor.execute("SELECT stock_quantity FROM inventory WHERE product_id=?", (product_id,))
                stock_after = cursor.fetchone()[0]
                record_stock_history(
                    cursor,
                    product_id,
                    -quantity,
                    stock_after,
                    "invoice_sale",
                    f"Sold on invoice {invoice_number}",
                    reference_type="invoice",
                    reference_id=invoice_id,
                    created_by=user["user_id"],
                )
            conn.commit()
            cursor.execute("""
                SELECT id, user_id, invoice_number, client_name, issue_date, due_date,
                       items, subtotal, tax, total, status, created_at, payment_company_id
                FROM invoices
                WHERE id=?
            """, (invoice_id,))
            invoice = serialize_invoice_row(cursor.fetchone())
            return jsonify(invoice), 201
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
# Get Invoices
# -------------------------
@invoices_bp.route('/invoices/<int:user_id>', methods=['GET'])
@staff_or_admin_required
def get_invoices(user, user_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("""
            SELECT id, user_id, invoice_number, client_name, issue_date, due_date,
                   items, subtotal, tax, total, status, created_at, payment_company_id
            FROM invoices
            ORDER BY created_at DESC
        """)
        invoices = cursor.fetchall()
        invoice_list = [serialize_invoice_row(inv) for inv in invoices]
        return jsonify(invoice_list)
    finally:
        conn.close()


# -------------------------
# Delete Invoice
# -------------------------
@invoices_bp.route('/invoices/<int:invoice_id>', methods=['DELETE'])
@admin_required
def delete_invoice(user, invoice_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT invoice_number, items FROM invoices WHERE id=?", (invoice_id,))
        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404

        invoice_number = invoice[0]
        items = json.loads(invoice[1])
        movements, _ = get_invoice_stock_movements(cursor, items)
        ensure_inventory_rows(cursor)

        cursor.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))

        if cursor.rowcount == 0:
            return jsonify({"error": "Invoice not found"}), 404

        for product_id, quantity in movements.items():
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
                "invoice_deleted",
                f"Stock return from {invoice_number}",
                reference_type="invoice",
                reference_id=invoice_id,
                created_by=user["user_id"],
            )

        conn.commit()
        return jsonify({"message": "Invoice deleted successfully"})
    finally:
        conn.close()


# -------------------------
# Generate Invoice PDF
# -------------------------
@invoices_bp.route('/invoices/<int:invoice_id>/pdf', methods=['GET'])
@staff_or_admin_required
def generate_invoice_pdf(user, invoice_id):
    conn = get_db()
    cursor = conn.cursor()

    try:
        cursor.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,))
        invoice = cursor.fetchone()

        if not invoice:
            return jsonify({"error": "Invoice not found"}), 404

        payment_company_id = invoice[12] if len(invoice) > 12 else None
        payment_company = None
        if payment_company_id:
            cursor.execute("SELECT company_name, abn, address_line_1, address_line_2, bsb, account_name, account_number, notes FROM payment_companies WHERE id=?", (payment_company_id,))
            payment_company = cursor.fetchone()

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

        business_name = payment_company[0] if payment_company else "ONE PACIFIC TRADING PTY LTD"
        business_address_lines = []
        if payment_company:
            if payment_company[2]:
                business_address_lines.append(payment_company[2])
            if payment_company[3]:
                business_address_lines.append(payment_company[3])
        if not business_address_lines:
            business_address_lines = [
                "4 Gatwood Close",
                "Padstow Sydney NSW 2211",
            ]
        business_abn = payment_company[1] if payment_company else "16 643 396 203"
        eft_lines = [
            "EFT Bank Payments:",
            f"Account Name: {payment_company[5] if payment_company and payment_company[5] else business_name}",
            f"BSB: {payment_company[4] if payment_company and payment_company[4] else '633 000'}",
            f"Account Number: {payment_company[6] if payment_company and payment_company[6] else '2149 1026 7'}",
            payment_company[7] if payment_company and payment_company[7] else "Please Use Quote Or Invoice number As Ref",
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

        table_data = [["Item", "Quantity", "Unit Price", "Amount AUD"]]
        for item in items:
            item_amount = float(item.get('amount', 0))
            table_data.append([
                item.get("description", ""),
                f"{float(item.get('quantity', 0)):.2f}",
                f"{float(item.get('unit_price', 0)):.2f}",
                f"{item_amount:.2f}",
            ])

        items_table = Table(table_data, colWidths=[4.25 * inch, 1.0 * inch, 1.05 * inch, 1.2 * inch])
        items_table.setStyle(TableStyle([
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 8.5),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
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



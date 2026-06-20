import os
import smtplib
from email.message import EmailMessage


def send_password_reset_email(recipient_email, reset_link):
    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_user = os.getenv("SMTP_USER")
    smtp_password = os.getenv("SMTP_PASS")
    mail_from = os.getenv("MAIL_FROM", smtp_user or "no-reply@imperial.local")

    if not smtp_host or not smtp_user or not smtp_password:
        print(f"Password reset email not sent. Missing SMTP config. Reset link for {recipient_email}: {reset_link}")
        return False, "SMTP is not configured"

    message = EmailMessage()
    message["Subject"] = "Reset your Imperial account password"
    message["From"] = mail_from
    message["To"] = recipient_email
    message.set_content(
        "We received a request to reset your password.\n\n"
        f"Use this link to continue: {reset_link}\n\n"
        "If you didn't request this, you can ignore this email."
    )

    with smtplib.SMTP(smtp_host, smtp_port) as server:
        server.starttls()
        server.login(smtp_user, smtp_password)
        server.send_message(message)

    return True, None

import { useState } from "react";
import { requestPasswordReset } from "../api/authApi";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const data = await requestPasswordReset({ email });
      setMessage(data.message || data.error || "Please check your email.");
    } catch (err) {
      setMessage("We couldn't send the reset email right now.");
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <h1 className="auth-title auth-title--compact">Reset your password</h1>
        <p className="auth-subtitle">We will send you an email to reset your password</p>

        <form onSubmit={handleSubmit} className="auth-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            required
          />

          <div className="auth-submit-row">
            <button type="submit" className="auth-submit-button">
              Submit
            </button>
          </div>
        </form>

        <div className="auth-link-row">
          <a href="/imperial-site/login" className="auth-link">
            Cancel
          </a>
        </div>

        {message ? <p className="auth-message">{message}</p> : null}
      </div>
    </div>
  );
}

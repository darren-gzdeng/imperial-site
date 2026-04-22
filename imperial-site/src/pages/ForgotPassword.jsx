import { useState } from "react";

const styles = {
  page: {
    minHeight: "100vh",
    padding: "32px 20px 56px",
    background: "#ffffff",
    color: "#1c1e23",
  },
  shell: {
    maxWidth: "860px",
    margin: "0 auto",
    textAlign: "center",
  },
  title: {
    margin: "0 0 26px",
    fontSize: "4rem",
    fontWeight: 400,
    letterSpacing: "-0.06em",
    lineHeight: 1,
  },
  subtitle: {
    margin: "0 0 54px",
    color: "#5f6368",
    fontSize: "1.05rem",
    lineHeight: 1.5,
  },
  form: {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "22px",
  },
  input: {
    width: "100%",
    height: "76px",
    padding: "0 28px",
    border: "1.5px solid #9b9b9b",
    borderRadius: "18px",
    fontSize: "1rem",
    color: "#111111",
    outline: "none",
    background: "#ffffff",
  },
  submitWrap: {
    marginTop: "18px",
    display: "flex",
    justifyContent: "center",
  },
  submitButton: {
    minWidth: "180px",
    height: "64px",
    borderRadius: "16px",
    border: "1.5px solid #23252a",
    background: "#7fa8df",
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  cancelWrap: {
    marginTop: "18px",
  },
  cancelLink: {
    color: "#3b3d42",
    fontSize: "0.95rem",
    textDecoration: "underline",
    textUnderlineOffset: "6px",
  },
  message: {
    marginTop: "14px",
    color: "#4b5563",
    fontSize: "0.92rem",
  },
};

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await fetch("http://127.0.0.1:5000/forgot-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      setMessage(data.message || data.error || "Please check your email.");
    } catch (err) {
      setMessage("We couldn't send the reset email right now.");
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.shell}>
        <h1 style={styles.title}>Reset your password</h1>
        <p style={styles.subtitle}>We will send you an email to reset your password</p>

        <form onSubmit={handleSubmit} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />

          <div style={styles.submitWrap}>
            <button type="submit" style={styles.submitButton}>
              Submit
            </button>
          </div>
        </form>

        <div style={styles.cancelWrap}>
          <a href="/imperial-site/login" style={styles.cancelLink}>
            Cancel
          </a>
        </div>

        {message ? <p style={styles.message}>{message}</p> : null}
      </div>
    </div>
  );
}

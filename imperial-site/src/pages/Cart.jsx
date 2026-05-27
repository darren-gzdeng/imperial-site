import { useEffect, useState } from "react";
import { Link } from "react-router";

const styles = {
  page: {
    minHeight: "620px",
    color: "#1b1d22",
  },
  emptyState: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    paddingTop: "56px",
    textAlign: "center",
  },
  title: {
    margin: 0,
    fontSize: "2.75rem",
    fontWeight: 400,
    lineHeight: 1,
    letterSpacing: "-0.06em",
  },
  continueLink: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "188px",
    marginTop: "32px",
    padding: "16px 24px",
    borderRadius: "14px",
    background: "#7fa8df",
    color: "#ffffff",
    fontSize: "0.92rem",
    fontWeight: 500,
    lineHeight: 1,
    letterSpacing: "0.06em",
  },
  accountBlock: {
    marginTop: "62px",
    textAlign: "center",
  },
  accountTitle: {
    margin: 0,
    fontSize: "1.45rem",
    fontWeight: 400,
    lineHeight: 1.2,
    letterSpacing: "0",
  },
  accountText: {
    marginTop: "16px",
    color: "#4d4f52",
    fontSize: "0.95rem",
    lineHeight: 1.45,
  },
  inlineLink: {
    color: "#1f2933",
    textDecoration: "underline",
    textUnderlineOffset: "5px",
  },
  notes: {
    marginTop: "78px",
    maxWidth: "760px",
    color: "#55575a",
    fontSize: "0.95rem",
    lineHeight: 1.55,
  },
  noteHeading: {
    margin: "0 0 24px",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#55575a",
    letterSpacing: "0.02em",
  },
  noteText: {
    margin: "0 0 26px",
  },
  deliveryHeading: {
    margin: "0 0 18px",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#55575a",
    letterSpacing: "0.02em",
  },
  list: {
    margin: 0,
    paddingLeft: "26px",
  },
  listItem: {
    marginBottom: "8px",
  },
  strong: {
    fontWeight: 700,
  },
};

export default function Cart() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem("token"));
  }, []);

  return (
    <div style={styles.page}>
      <section style={styles.emptyState}>
        <h1 style={styles.title}>Your cart is empty</h1>

        <Link to="/new-arrivals" style={styles.continueLink}>
          Continue shopping
        </Link>

        {!isLoggedIn && (
          <div style={styles.accountBlock}>
            <h2 style={styles.accountTitle}>Have an account?</h2>
            <p style={styles.accountText}>
              <Link to="/login" style={styles.inlineLink}>Log in</Link> to check out faster.
            </p>
          </div>
        )}
      </section>

      <section style={styles.notes}>
        <h2 style={styles.noteHeading}>Please Note:</h2>

        <p style={styles.noteText}>
          <Link to="/login" style={styles.inlineLink}>Login</Link> to find your balance in your account page.
        </p>
      </section>
    </div>
  );
}

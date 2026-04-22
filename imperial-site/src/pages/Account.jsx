import { useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import heroImage from "../assets/hero.png";

const styles = {
  page: {
    maxWidth: "1500px",
    margin: "0 auto",
    padding: "56px 72px 80px",
    color: "#1b1d22",
    background: "#ffffff",
  },
  title: {
    margin: 0,
    fontSize: "4.5rem",
    fontWeight: 400,
    letterSpacing: "-0.06em",
    lineHeight: 1,
  },
  logoutButton: {
    display: "inline-flex",
    alignItems: "center",
    gap: "14px",
    marginTop: "34px",
    padding: 0,
    background: "transparent",
    border: "none",
    color: "#3b3d42",
    fontSize: "1.05rem",
    cursor: "pointer",
    textDecoration: "underline",
    textUnderlineOffset: "6px",
  },
  heroSection: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 560px",
    gap: "52px",
    alignItems: "center",
    marginTop: "48px",
    marginBottom: "88px",
  },
  passTitleRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "26px",
  },
  passTitle: {
    margin: 0,
    fontSize: "2.1rem",
    fontWeight: 400,
    letterSpacing: "-0.04em",
  },
  badge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "6px 16px",
    borderRadius: "999px",
    background: "#555555",
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: 600,
  },
  leadText: {
    margin: "0 0 16px",
    color: "#595d63",
    fontSize: "1.12rem",
    lineHeight: 1.55,
  },
  balanceText: {
    margin: "0 0 32px",
    color: "#595d63",
    fontSize: "1.12rem",
    lineHeight: 1.55,
  },
  balanceStrong: {
    color: "#2e3136",
    fontWeight: 700,
  },
  buttonRow: {
    display: "flex",
    gap: "14px",
    flexWrap: "wrap",
    marginBottom: "20px",
  },
  primaryButton: {
    minWidth: "246px",
    padding: "22px 28px",
    border: "none",
    borderRadius: "20px",
    background: "#7fa8df",
    color: "#ffffff",
    fontSize: "1rem",
    fontWeight: 500,
    letterSpacing: "0.06em",
    cursor: "pointer",
  },
  wideButton: {
    minWidth: "512px",
  },
  imageCard: {
    position: "relative",
    overflow: "hidden",
    borderRadius: "18px",
    minHeight: "262px",
    boxShadow: "0 18px 40px rgba(22, 33, 61, 0.12)",
  },
  image: {
    display: "block",
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  imageOverlay: {
    position: "absolute",
    top: "34%",
    left: "18%",
    padding: "18px 34px",
    borderRadius: "26px",
    background: "#7fa8df",
    color: "#ffffff",
    fontSize: "1.05rem",
    fontWeight: 600,
    textAlign: "center",
    lineHeight: 1.35,
    letterSpacing: "0.04em",
  },
  section: {
    marginBottom: "78px",
  },
  sectionTitle: {
    margin: "0 0 24px",
    fontSize: "2.1rem",
    fontWeight: 400,
    letterSpacing: "-0.04em",
  },
  sectionText: {
    margin: 0,
    color: "#595d63",
    fontSize: "1.12rem",
    lineHeight: 1.6,
  },
  detailValue: {
    margin: "0 0 14px",
    color: "#595d63",
    fontSize: "1.12rem",
    lineHeight: 1.6,
  },
};

export default function Account() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    setUser({
      email: "user@example.com",
      name: "John Doe",
      address: "123 Main St, City, State 12345",
      phone: "+1 (555) 123-4567",
      country: "Australia",
      creditBalance: 0,
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/imperial-site/";
  };

  const handlePlaceholderAction = () => {
    alert("This action is not set up yet.");
  };

  if (!user) {
    return <div style={{ textAlign: "center", padding: "50px" }}>Loading...</div>;
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Account</h1>

      <button onClick={handleLogout} style={styles.logoutButton}>
        <LogOut size={22} strokeWidth={1.7} />
        <span>Log out</span>
      </button>

      <section style={styles.heroSection}>
        <div>
          <div style={styles.passTitleRow}>
            <h2 style={styles.passTitle}>Imperial Pass</h2>
            <span style={styles.badge}>Inactive</span>
          </div>

          <p style={styles.leadText}>Your account: {user.email}</p>
          <p style={styles.balanceText}>
            Your credit balance: <span style={styles.balanceStrong}>£{user.creditBalance.toFixed(2)}</span>
          </p>

          <div style={styles.buttonRow}>
            <button onClick={handlePlaceholderAction} style={styles.primaryButton}>
              Top Up
            </button>
            <button
              onClick={handlePlaceholderAction}
              style={{ ...styles.primaryButton, ...styles.wideButton }}
            >
              Explore Celebrate Pass Sale
            </button>
          </div>

          <button onClick={handlePlaceholderAction} style={styles.primaryButton}>
            Continue Checkout
          </button>
        </div>

        <div style={styles.imageCard}>
          <img src={heroImage} alt="Celebrate pass promotion" style={styles.image} />
          <div style={styles.imageOverlay}>
            Refer a Friend,
            <br />
            Double the Celebration!
          </div>
        </div>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Order history</h2>
        <p style={styles.sectionText}>You haven&apos;t placed any orders yet.</p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Account details</h2>
        <p style={styles.detailValue}>{user.country}</p>
        <p style={styles.detailValue}>{user.name}</p>
        <p style={styles.detailValue}>{user.phone}</p>
        <p style={styles.detailValue}>{user.address}</p>
      </section>
    </div>
  );
}

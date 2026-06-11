import { useEffect, useState } from "react";
import { LogOut, Save } from "lucide-react";

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
  detailsForm: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "18px",
    maxWidth: "820px",
  },
  field: {
    display: "grid",
    gap: "8px",
  },
  fullField: {
    gridColumn: "1 / -1",
  },
  label: {
    color: "#3b3d42",
    fontSize: "0.86rem",
    fontWeight: 600,
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #d7dbe2",
    borderRadius: "8px",
    padding: "12px 14px",
    color: "#1b1d22",
    fontSize: "1rem",
    lineHeight: 1.35,
    background: "#ffffff",
  },
  disabledInput: {
    color: "#6b7280",
    background: "#f4f5f7",
  },
  saveButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    width: "fit-content",
    marginTop: "20px",
    padding: "13px 20px",
    border: "none",
    borderRadius: "8px",
    background: "#1e40af",
    color: "#ffffff",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  message: {
    margin: "14px 0 0",
    color: "#4b5563",
    fontSize: "0.95rem",
  },
};

export default function Account() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    const fetchAccount = async () => {
      try {
        const res = await fetch("http://127.0.0.1:5000/account", {
          headers: {
            Authorization: token,
          },
        });

        const data = await res.json();

        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/imperial-site/login";
          return;
        }

        if (!res.ok) {
          setMessage(data.error || "Failed to load account details");
          return;
        }

        setUser(data);
        setFormData(data);
      } catch (err) {
        setMessage(`Failed to load account details: ${err.message}`);
      }
    };

    fetchAccount();
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/imperial-site/";
  };

  const handleAccountChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      const res = await fetch("http://127.0.0.1:5000/account", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email,
          phone: formData.phone,
          address: formData.address,
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/imperial-site/login";
        return;
      }

      if (!res.ok) {
        setMessage(data.error || "Failed to update account");
        return;
      }

      setUser(formData);
      setMessage("Account details updated.");
    } catch (err) {
      setMessage(`Failed to update account: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  if (!user || !formData) {
    if (message) {
      return <div style={{ textAlign: "center", padding: "50px" }}>{message}</div>;
    }

    return <div style={{ textAlign: "center", padding: "50px" }}>Loading...</div>;
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.title}>Account</h1>

      <button onClick={handleLogout} style={styles.logoutButton}>
        <LogOut size={22} strokeWidth={1.7} />
        <span>Log out</span>
      </button>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Order history</h2>
        <p style={styles.sectionText}>You haven&apos;t placed any orders yet.</p>
      </section>

      <section style={styles.section}>
        <h2 style={styles.sectionTitle}>Account details</h2>
        <form onSubmit={handleAccountSave}>
          <div style={styles.detailsForm}>
            <label style={styles.field}>
              <span style={styles.label}>Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                disabled
                style={{ ...styles.input, ...styles.disabledInput }}
              />
            </label>

            {formData.account_type === "Admin" && (
              <label style={styles.field}>
                <span style={styles.label}>Account type</span>
                <input
                  value={formData.account_type}
                  disabled
                  style={{ ...styles.input, ...styles.disabledInput }}
                />
              </label>
            )}

            <label style={styles.field}>
              <span style={styles.label}>First name</span>
              <input
                name="first_name"
                value={formData.first_name}
                onChange={handleAccountChange}
                style={styles.input}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>Last name</span>
              <input
                name="last_name"
                value={formData.last_name}
                onChange={handleAccountChange}
                style={styles.input}
              />
            </label>

            <label style={styles.field}>
              <span style={styles.label}>Phone</span>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleAccountChange}
                style={styles.input}
              />
            </label>

            <label style={{ ...styles.field, ...styles.fullField }}>
              <span style={styles.label}>Address</span>
              <input
                name="address"
                value={formData.address}
                onChange={handleAccountChange}
                style={styles.input}
              />
            </label>
          </div>

          <button type="submit" disabled={isSaving} style={styles.saveButton}>
            <Save size={18} strokeWidth={1.8} />
            <span>{isSaving ? "Saving..." : "Save details"}</span>
          </button>
          {message && <p style={styles.message}>{message}</p>}
        </form>
      </section>
    </div>
  );
}

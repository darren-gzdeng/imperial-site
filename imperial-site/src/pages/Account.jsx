import { useEffect, useState } from "react";
import { FileText, LogOut, Save, Trash2, Users } from "lucide-react";

const ACCOUNT_TYPES = ["Admin", "Staff", "User", "Wholesale Customer"];

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
  accountActions: {
    display: "flex",
    alignItems: "center",
    gap: "24px",
    marginTop: "34px",
    marginBottom: "64px",
    flexWrap: "wrap",
  },
  actionLink: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    border: "1px solid #d7dbe2",
    borderRadius: "8px",
    background: "#ffffff",
    color: "#1b1d22",
    fontSize: "0.95rem",
    fontWeight: 600,
    cursor: "pointer",
    textDecoration: "none",
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
  adminHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    margin: "0 0 24px",
  },
  adminTitle: {
    margin: 0,
    fontSize: "2.1rem",
    fontWeight: 400,
    letterSpacing: "-0.04em",
  },
  tableWrap: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid #e1e5eb",
    borderRadius: "8px",
  },
  table: {
    width: "100%",
    minWidth: "920px",
    borderCollapse: "collapse",
    textAlign: "left",
  },
  th: {
    padding: "14px 16px",
    borderBottom: "1px solid #e1e5eb",
    background: "#f7f8fa",
    color: "#3b3d42",
    fontSize: "0.82rem",
    fontWeight: 700,
    textTransform: "uppercase",
  },
  td: {
    padding: "14px 16px",
    borderBottom: "1px solid #edf0f4",
    color: "#343840",
    fontSize: "0.95rem",
    verticalAlign: "middle",
  },
  select: {
    width: "100%",
    minWidth: "180px",
    border: "1px solid #d7dbe2",
    borderRadius: "8px",
    padding: "10px 12px",
    color: "#1b1d22",
    fontSize: "0.95rem",
    background: "#ffffff",
  },
  compactButton: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minWidth: "88px",
    height: "40px",
    border: "none",
    borderRadius: "8px",
    background: "#1e40af",
    color: "#ffffff",
    fontSize: "0.9rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  dangerButton: {
    background: "#b42318",
  },
  actionGroup: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },
};

export default function Account() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);

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

        if (data.account_type === "Admin") {
          fetchAdminUsers(token);
        }
      } catch (err) {
        setMessage(`Failed to load account details: ${err.message}`);
      }
    };

    fetchAccount();
  }, []);

  const fetchAdminUsers = async (token) => {
    try {
      const res = await fetch("http://127.0.0.1:5000/admin/users", {
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
        setAdminMessage(data.error || "Failed to load users");
        return;
      }

      setAdminUsers(data);
      setAdminMessage("");
    } catch (err) {
      setAdminMessage(`Failed to load users: ${err.message}`);
    }
  };

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

  const handleManagedUserChange = (userId, accountType) => {
    setAdminUsers((prev) =>
      prev.map((managedUser) =>
        managedUser.id === userId
          ? { ...managedUser, account_type: accountType, isDirty: true }
          : managedUser
      )
    );
  };

  const handleManagedUserSave = async (managedUser) => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    setSavingUserId(managedUser.id);
    setAdminMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/admin/users/${managedUser.id}/account-type`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: token,
        },
        body: JSON.stringify({
          account_type: managedUser.account_type,
        }),
      });

      const data = await res.json();

      if (res.status === 401) {
        localStorage.removeItem("token");
        window.location.href = "/imperial-site/login";
        return;
      }

      if (!res.ok) {
        setAdminMessage(data.error || "Failed to update user");
        return;
      }

      setAdminUsers((prev) =>
        prev.map((item) =>
          item.id === managedUser.id
            ? { ...item, account_type: data.account_type, isDirty: false }
            : item
        )
      );

      if (managedUser.id === user.id) {
        setUser((prev) => ({ ...prev, account_type: data.account_type }));
        setFormData((prev) => ({ ...prev, account_type: data.account_type }));
      }

      setAdminMessage("User account type updated.");
    } catch (err) {
      setAdminMessage(`Failed to update user: ${err.message}`);
    } finally {
      setSavingUserId(null);
    }
  };

  const handleManagedUserDelete = async (managedUser) => {
    const token = localStorage.getItem("token");

    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    const confirmed = window.confirm(`Delete ${managedUser.email}? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    setDeletingUserId(managedUser.id);
    setAdminMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/admin/users/${managedUser.id}`, {
        method: "DELETE",
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
        setAdminMessage(data.error || "Failed to delete user");
        return;
      }

      setAdminUsers((prev) => prev.filter((item) => item.id !== managedUser.id));
      setAdminMessage("User deleted.");
    } catch (err) {
      setAdminMessage(`Failed to delete user: ${err.message}`);
    } finally {
      setDeletingUserId(null);
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

      <div style={styles.accountActions}>
        <button onClick={handleLogout} style={{ ...styles.logoutButton, marginTop: 0 }}>
          <LogOut size={22} strokeWidth={1.7} />
          <span>Log out</span>
        </button>

        {["Admin", "Staff"].includes(user.account_type) && (
          <a href="/imperial-site/invoice" style={styles.actionLink}>
            <FileText size={18} strokeWidth={1.8} />
            <span>Invoices</span>
          </a>
        )}
      </div>

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

      {user.account_type === "Admin" && (
        <section style={styles.section}>
          <div style={styles.adminHeader}>
            <Users size={28} strokeWidth={1.7} />
            <h2 style={styles.adminTitle}>User management</h2>
          </div>

          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Name</th>
                  <th style={styles.th}>Email</th>
                  <th style={styles.th}>Phone</th>
                  <th style={styles.th}>Created</th>
                  <th style={styles.th}>Account type</th>
                  <th style={styles.th}>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((managedUser) => {
                  const fullName = `${managedUser.first_name} ${managedUser.last_name}`.trim();

                  return (
                    <tr key={managedUser.id}>
                      <td style={styles.td}>{fullName || "No name"}</td>
                      <td style={styles.td}>{managedUser.email}</td>
                      <td style={styles.td}>{managedUser.phone || "-"}</td>
                      <td style={styles.td}>{managedUser.created_at || "-"}</td>
                      <td style={styles.td}>
                        <select
                          value={managedUser.account_type}
                          onChange={(e) => handleManagedUserChange(managedUser.id, e.target.value)}
                          style={styles.select}
                        >
                          {ACCOUNT_TYPES.map((accountType) => (
                            <option key={accountType} value={accountType}>
                              {accountType}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionGroup}>
                          <button
                            type="button"
                            onClick={() => handleManagedUserSave(managedUser)}
                            disabled={!managedUser.isDirty || savingUserId === managedUser.id}
                            style={{
                              ...styles.compactButton,
                              opacity: !managedUser.isDirty || savingUserId === managedUser.id ? 0.55 : 1,
                              cursor: !managedUser.isDirty || savingUserId === managedUser.id ? "not-allowed" : "pointer",
                            }}
                          >
                            {savingUserId === managedUser.id ? "Saving..." : "Save"}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleManagedUserDelete(managedUser)}
                            disabled={managedUser.id === user.id || deletingUserId === managedUser.id}
                            style={{
                              ...styles.compactButton,
                              ...styles.dangerButton,
                              opacity: managedUser.id === user.id || deletingUserId === managedUser.id ? 0.55 : 1,
                              cursor: managedUser.id === user.id || deletingUserId === managedUser.id ? "not-allowed" : "pointer",
                            }}
                            title={managedUser.id === user.id ? "You cannot delete your own account" : "Delete user"}
                          >
                            <Trash2 size={16} strokeWidth={1.8} />
                            <span>{deletingUserId === managedUser.id ? "Deleting..." : "Delete"}</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {adminMessage && <p style={styles.message}>{adminMessage}</p>}
        </section>
      )}
    </div>
  );
}

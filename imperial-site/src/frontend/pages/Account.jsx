import { useEffect, useState } from "react";
import { Link } from "react-router";
import { FileText, LogOut, Save, Trash2, Users } from "lucide-react";
import {
  deleteAdminUser,
  getAccount,
  getAccountOrders,
  getAdminUsers,
  updateAccount,
  updateUserAccountType,
} from "../api/accountApi";
import { clearAuthToken, getAuthToken } from "../api/client";
import { PagePanel, PageShell } from "../components/layout/PageShell";
import ActionButton from "../components/ui/ActionButton";

const ACCOUNT_TYPES = ["Admin", "Staff", "User", "Wholesale Customer"];

const formatMoney = (value) => `$${Number(value || 0).toFixed(2)}`;
const formatStatus = (status) => String(status || "pending").replaceAll("_", " ");

export default function Account() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState(null);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [adminUsers, setAdminUsers] = useState([]);
  const [adminMessage, setAdminMessage] = useState("");
  const [savingUserId, setSavingUserId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [orders, setOrders] = useState([]);
  const [ordersMessage, setOrdersMessage] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState(null);

  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    const fetchAccount = async () => {
      try {
        const data = await getAccount();

        setUser(data);
        setFormData(data);
        fetchOrders();

        if (data.account_type === "Admin") {
          fetchAdminUsers();
        }
      } catch (err) {
        if (err.status === 401) {
          clearAuthToken();
          window.location.href = "/imperial-site/login";
          return;
        }

        setMessage(`Failed to load account details: ${err.message}`);
      }
    };

    fetchAccount();
  }, []);

  const fetchOrders = async () => {
    try {
      const data = await getAccountOrders();
      setOrders(data);
      setSelectedOrderId(data[0]?.id || null);
      setOrdersMessage("");
    } catch (err) {
      if (err.status === 401) {
        clearAuthToken();
        window.location.href = "/imperial-site/login";
        return;
      }

      setOrdersMessage(`Failed to load orders: ${err.message}`);
    }
  };

  const fetchAdminUsers = async () => {
    try {
      const data = await getAdminUsers();

      setAdminUsers(data);
      setAdminMessage("");
    } catch (err) {
      if (err.status === 401) {
        clearAuthToken();
        window.location.href = "/imperial-site/login";
        return;
      }

      setAdminMessage(`Failed to load users: ${err.message}`);
    }
  };

  const handleLogout = () => {
    clearAuthToken();
    window.location.href = "/imperial-site/";
  };

  const handleAccountChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAccountSave = async (e) => {
    e.preventDefault();
    const token = getAuthToken();

    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    setIsSaving(true);
    setMessage("");

    try {
      await updateAccount({
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email,
        phone: formData.phone,
        address: formData.address,
      });

      setUser(formData);
      setMessage("Account details updated.");
    } catch (err) {
      if (err.status === 401) {
        clearAuthToken();
        window.location.href = "/imperial-site/login";
        return;
      }

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
    const token = getAuthToken();

    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    setSavingUserId(managedUser.id);
    setAdminMessage("");

    try {
      const data = await updateUserAccountType(managedUser.id, managedUser.account_type);

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
      if (err.status === 401) {
        clearAuthToken();
        window.location.href = "/imperial-site/login";
        return;
      }

      setAdminMessage(`Failed to update user: ${err.message}`);
    } finally {
      setSavingUserId(null);
    }
  };

  const requestManagedUserDelete = (managedUser) => {
    setDeleteTarget(managedUser);
  };

  const confirmManagedUserDelete = async () => {
    if (!deleteTarget) {
      return;
    }

    const token = getAuthToken();

    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    setDeletingUserId(deleteTarget.id);
    setAdminMessage("");

    try {
      await deleteAdminUser(deleteTarget.id);

      setAdminUsers((prev) => prev.filter((item) => item.id !== deleteTarget.id));
      setAdminMessage("User deleted.");
      setDeleteTarget(null);
    } catch (err) {
      if (err.status === 401) {
        clearAuthToken();
        window.location.href = "/imperial-site/login";
        return;
      }

      setAdminMessage(`Failed to delete user: ${err.message}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  if (!user || !formData) {
    if (message) {
      return <div className="account-loading">{message}</div>;
    }

    return <div className="account-loading">Loading...</div>;
  }

  return (
    <PageShell title="Account" className="account-shell">
      {deleteTarget && (
        <div className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-delete-title">
          <div className="account-modal__card">
            <h3 id="account-delete-title">Delete user</h3>
            <p>
              Delete {deleteTarget.email}? This cannot be undone.
            </p>
            <div className="account-modal__actions">
              <ActionButton
                type="button"
                variant="light"
                onClick={() => setDeleteTarget(null)}
                disabled={deletingUserId === deleteTarget.id}
              >
                Cancel
              </ActionButton>
              <ActionButton
                type="button"
                variant="danger"
                onClick={confirmManagedUserDelete}
                disabled={deletingUserId === deleteTarget.id}
              >
                {deletingUserId === deleteTarget.id ? "Deleting..." : "Delete user"}
              </ActionButton>
            </div>
          </div>
        </div>
      )}

      <div className="account-actions">
        <button onClick={handleLogout} className="account-logout">
          <LogOut size={22} strokeWidth={1.7} />
          <span>Log out</span>
        </button>

        {["Admin", "Staff"].includes(user.account_type) && (
          <a href="/imperial-site/invoice" className="account-action-link">
            <FileText size={18} strokeWidth={1.8} />
            <span>Invoices</span>
          </a>
        )}
      </div>

      <PagePanel title="Order history">
        {ordersMessage && <p className="account-message">{ordersMessage}</p>}
        {orders.length === 0 ? (
          <p className="account-section-text">You haven&apos;t placed any orders yet.</p>
        ) : (
          <div className="account-orders">
            {orders.map((order) => {
              const isOpen = selectedOrderId === order.id;
              const deliveryStatus = order.tracking_status || order.status;
              const canTrack = deliveryStatus !== "delivered";

              return (
                <section key={order.id} className="account-order">
                  <button
                    type="button"
                    className="account-order__summary"
                    aria-expanded={isOpen}
                    onClick={() => setSelectedOrderId(isOpen ? null : order.id)}
                  >
                    <span>
                      <strong>Order #{order.id}</strong>
                      <small>{order.created_at || "No date"}</small>
                    </span>
                    <span>{formatStatus(deliveryStatus)}</span>
                    <strong>{formatMoney(order.total)}</strong>
                  </button>

                  {isOpen && (
                    <div className="account-order__details">
                      <div className="account-order__meta">
                        <p><strong>Delivery address:</strong> {order.shipping_address}</p>
                        <p><strong>Delivery date:</strong> {order.delivery_date || "Not selected"}</p>
                        <p><strong>Driver:</strong> {order.driver_name || "Not assigned yet"}</p>
                        <p><strong>ETA:</strong> {order.eta_text || "Waiting for driver location"}</p>
                      </div>

                      <div className="account-order__items">
                        {order.items.map((item) => (
                          <div key={item.id} className="account-order__item">
                            <span>
                              <strong>{item.item}</strong>
                              <small>Quantity: {item.quantity}</small>
                            </span>
                            <span>{formatMoney(item.unit_price)}</span>
                            <strong>{formatMoney(item.amount)}</strong>
                          </div>
                        ))}
                      </div>

                      <div className="account-order__footer">
                        <div>
                          <span>Subtotal</span>
                          <strong>{formatMoney(order.subtotal)}</strong>
                        </div>
                        <div>
                          <span>Total</span>
                          <strong>{formatMoney(order.total)}</strong>
                        </div>
                        {canTrack && (
                          <Link to={`/delivery-tracking/${order.id}`} className="account-order__track">
                            Track my order
                          </Link>
                        )}
                      </div>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        )}
      </PagePanel>

      <PagePanel title="Account details">
        <form onSubmit={handleAccountSave}>
          <div className="account-details-grid">
            <label className="account-field">
              <span className="account-label">Email</span>
              <input
                type="email"
                name="email"
                value={formData.email}
                disabled
                className="form-control"
              />
            </label>

            {formData.account_type === "Admin" && (
              <label className="account-field">
                <span className="account-label">Account type</span>
                <input
                  value={formData.account_type}
                  disabled
                  className="form-control"
                />
              </label>
            )}

            <label className="account-field">
              <span className="account-label">First name</span>
              <input
                name="first_name"
                value={formData.first_name}
                onChange={handleAccountChange}
                className="form-control"
              />
            </label>

            <label className="account-field">
              <span className="account-label">Last name</span>
              <input
                name="last_name"
                value={formData.last_name}
                onChange={handleAccountChange}
                className="form-control"
              />
            </label>

            <label className="account-field">
              <span className="account-label">Phone</span>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleAccountChange}
                className="form-control"
              />
            </label>

            <label className="account-field account-field--full">
              <span className="account-label">Address</span>
              <input
                name="address"
                value={formData.address}
                onChange={handleAccountChange}
                className="form-control"
              />
            </label>
          </div>

          <ActionButton type="submit" disabled={isSaving} className="admin-save-button">
            <Save size={18} strokeWidth={1.8} />
            <span>{isSaving ? "Saving..." : "Save details"}</span>
          </ActionButton>
          {message && <p className="account-message">{message}</p>}
        </form>
      </PagePanel>

      {user.account_type === "Admin" && (
        <PagePanel
          title={(
            <span className="account-admin-title">
              <Users size={28} strokeWidth={1.7} />
              <span>User management</span>
            </span>
          )}
        >
          <div className="account-table-wrap">
            <table className="data-table account-users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Phone</th>
                  <th>Created</th>
                  <th>Account type</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {adminUsers.map((managedUser) => {
                  const fullName = `${managedUser.first_name} ${managedUser.last_name}`.trim();

                  return (
                    <tr key={managedUser.id}>
                      <td>{fullName || "No name"}</td>
                      <td>{managedUser.email}</td>
                      <td>{managedUser.phone || "-"}</td>
                      <td>{managedUser.created_at || "-"}</td>
                      <td>
                        <select
                          value={managedUser.account_type}
                          onChange={(e) => handleManagedUserChange(managedUser.id, e.target.value)}
                          className="form-control"
                        >
                          {ACCOUNT_TYPES.map((accountType) => (
                            <option key={accountType} value={accountType}>
                              {accountType}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <div className="account-action-group">
                          <ActionButton
                            type="button"
                            size="sm"
                            onClick={() => handleManagedUserSave(managedUser)}
                            disabled={!managedUser.isDirty || savingUserId === managedUser.id}
                          >
                            {savingUserId === managedUser.id ? "Saving..." : "Save"}
                          </ActionButton>

                          <ActionButton
                            type="button"
                            size="sm"
                            variant="danger"
                            onClick={() => requestManagedUserDelete(managedUser)}
                            disabled={managedUser.id === user.id || deletingUserId === managedUser.id}
                            title={managedUser.id === user.id ? "You cannot delete your own account" : "Delete user"}
                          >
                            <Trash2 size={16} strokeWidth={1.8} />
                            <span>{deletingUserId === managedUser.id ? "Deleting..." : "Delete"}</span>
                          </ActionButton>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {adminMessage && <p className="account-message">{adminMessage}</p>}
        </PagePanel>
      )}
    </PageShell>
  );
}

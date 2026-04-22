import { useState, useEffect } from "react";

export default function Account() {
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("details");

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
    });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem("token");
    window.location.href = "/imperial-site/";
  };

  if (!user) {
    return <div style={{ textAlign: "center", padding: "50px" }}>Loading...</div>;
  }

  return (
    <div style={{ maxWidth: "800px", margin: "50px auto", padding: "20px" }}>
      <h2>My Account</h2>

      <div style={{ display: "flex", gap: "20px", marginTop: "30px" }}>
        <div style={{ width: "200px" }}>
          <button
            onClick={() => setActiveTab("details")}
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              margin: "10px 0",
              background: activeTab === "details" ? "#1e40af" : "#f0f0f0",
              color: activeTab === "details" ? "white" : "black",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Account Details
          </button>
          <button
            onClick={() => setActiveTab("address")}
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              margin: "10px 0",
              background: activeTab === "address" ? "#1e40af" : "#f0f0f0",
              color: activeTab === "address" ? "white" : "black",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Address
          </button>
          <button
            onClick={() => setActiveTab("orders")}
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              margin: "10px 0",
              background: activeTab === "orders" ? "#1e40af" : "#f0f0f0",
              color: activeTab === "orders" ? "white" : "black",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Order History
          </button>
          <button
            onClick={handleLogout}
            style={{
              display: "block",
              width: "100%",
              padding: "10px",
              margin: "10px 0",
              background: "#dc2626",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Logout
          </button>
        </div>

        <div style={{ flex: 1 }}>
          {activeTab === "details" && (
            <div>
              <h3>Account Details</h3>
              <div style={{ marginTop: "20px" }}>
                <p><strong>Name:</strong> {user.name}</p>
                <p><strong>Email:</strong> {user.email}</p>
                <p><strong>Phone:</strong> {user.phone}</p>
              </div>
            </div>
          )}

          {activeTab === "address" && (
            <div>
              <h3>Delivery Address</h3>
              <div style={{ marginTop: "20px", border: "1px solid #ccc", padding: "15px", borderRadius: "5px" }}>
                <p>{user.address}</p>
                <button style={{ marginTop: "15px", padding: "10px 15px", background: "#1e40af", color: "white", border: "none", borderRadius: "5px", cursor: "pointer" }}>
                  Edit Address
                </button>
              </div>
            </div>
          )}

          {activeTab === "orders" && (
            <div>
              <h3>Order History</h3>
              <div style={{ marginTop: "20px" }}>
                <div style={{ border: "1px solid #ccc", padding: "15px", borderRadius: "5px", marginBottom: "15px" }}>
                  <p><strong>Order #1001</strong> - King Crab Legs (2 lbs)</p>
                  <p>Date: April 15, 2026</p>
                  <p>Status: Delivered</p>
                </div>
                <div style={{ border: "1px solid #ccc", padding: "15px", borderRadius: "5px", marginBottom: "15px" }}>
                  <p><strong>Order #1002</strong> - Tuna Toro (1 lb)</p>
                  <p>Date: April 10, 2026</p>
                  <p>Status: Delivered</p>
                </div>
                <div style={{ border: "1px solid #ccc", padding: "15px", borderRadius: "5px" }}>
                  <p><strong>Order #1003</strong> - Snow Crab Legs (3 lbs)</p>
                  <p>Date: April 5, 2026</p>
                  <p>Status: Delivered</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

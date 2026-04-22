import { useState, useEffect } from "react";

export default function Invoice() {
  const [invoices, setInvoices] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    invoice_number: "",
    client_name: "",
    client_email: "",
    client_address: "",
    issue_date: new Date().toISOString().split("T")[0],
    due_date: "",
    items: [{ description: "", quantity: 1, unit_price: 0, amount: 0 }],
  });
  const [user_id, setUserId] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    // Get user_id from token or use a default for now
    setUserId(1);
    fetchInvoices(1);
  }, []);

  const fetchInvoices = async (userId) => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/invoices/${userId}`);
      const data = await res.json();
      setInvoices(data);
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleItemChange = (index, field, value) => {
    const newItems = [...formData.items];
    newItems[index][field] = field === "quantity" || field === "unit_price" ? parseFloat(value) : value;
    
    // Calculate amount
    if (field === "quantity" || field === "unit_price") {
      newItems[index].amount = newItems[index].quantity * newItems[index].unit_price;
    }
    
    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, unit_price: 0, amount: 0 }],
    }));
  };

  const calculateTotals = () => {
    const subtotal = formData.items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const tax = subtotal * 0.1; // 10% tax
    const total = subtotal + tax;
    return { subtotal, tax, total };
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.invoice_number || !formData.client_name || !formData.issue_date) {
      alert("Please fill in all required fields (Invoice #, Client Name, Issue Date)");
      return;
    }

    // Validate at least one item with description and price
    const hasValidItem = formData.items.some(item => item.description && item.quantity > 0 && item.unit_price > 0);
    if (!hasValidItem) {
      alert("Please add at least one item with description, quantity, and unit price");
      return;
    }

    const { subtotal, tax, total } = calculateTotals();

    const invoiceData = {
      user_id,
      invoice_number: formData.invoice_number,
      client_name: formData.client_name,
      client_email: formData.client_email,
      client_address: formData.client_address,
      issue_date: formData.issue_date,
      due_date: formData.due_date,
      items: formData.items,
      subtotal,
      tax,
      total,
    };

    try {
      const res = await fetch("http://127.0.0.1:5000/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invoiceData),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Invoice created successfully!");
        setShowCreateForm(false);
        setFormData({
          invoice_number: "",
          client_name: "",
          client_email: "",
          client_address: "",
          issue_date: new Date().toISOString().split("T")[0],
          due_date: "",
          items: [{ description: "", quantity: 1, unit_price: 0, amount: 0 }],
        });
        fetchInvoices(user_id);
      } else {
        alert(`Error: ${data.error || "Failed to create invoice"}`);
        console.error("Server error:", data);
      }
    } catch (err) {
      console.error("Error creating invoice:", err);
      alert("Failed to create invoice: " + err.message);
    }
  };

  const downloadPDF = (invoiceId, invoiceNumber) => {
    window.location.href = `http://127.0.0.1:5000/invoices/${invoiceId}/pdf`;
  };

  const { subtotal, tax, total } = calculateTotals();

  return (
    <div style={{ maxWidth: "1000px", margin: "50px auto", padding: "20px" }}>
      <h2>Invoices</h2>

      <button
        onClick={() => setShowCreateForm(!showCreateForm)}
        style={{
          padding: "10px 20px",
          background: "#1e40af",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: "pointer",
          marginBottom: "20px",
        }}
      >
        {showCreateForm ? "Cancel" : "Create Invoice"}
      </button>

      {showCreateForm && (
        <div style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "5px", marginBottom: "30px" }}>
          <h3>Create New Invoice</h3>
          <form onSubmit={handleCreateInvoice}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "15px" }}>
              <input
                type="text"
                name="invoice_number"
                placeholder="Invoice Number"
                value={formData.invoice_number}
                onChange={handleInputChange}
                required
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
              />
              <input
                type="text"
                name="client_name"
                placeholder="Client Name"
                value={formData.client_name}
                onChange={handleInputChange}
                required
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
              />
              <input
                type="email"
                name="client_email"
                placeholder="Client Email"
                value={formData.client_email}
                onChange={handleInputChange}
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
              />
              <textarea
                name="client_address"
                placeholder="Client Address"
                value={formData.client_address}
                onChange={handleInputChange}
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", minHeight: "60px" }}
              />
              <input
                type="date"
                name="issue_date"
                value={formData.issue_date}
                onChange={handleInputChange}
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
              />
              <input
                type="date"
                name="due_date"
                placeholder="Due Date"
                value={formData.due_date}
                onChange={handleInputChange}
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
              />
            </div>

            <h4>Invoice Items</h4>
            <div style={{ marginBottom: "15px" }}>
              {formData.items.map((item, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <input
                    type="text"
                    placeholder="Description"
                    value={item.description}
                    onChange={(e) => handleItemChange(index, "description", e.target.value)}
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
                  />
                  <input
                    type="number"
                    placeholder="Qty"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
                  />
                  <input
                    type="number"
                    placeholder="Unit Price"
                    value={item.unit_price}
                    onChange={(e) => handleItemChange(index, "unit_price", e.target.value)}
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={item.amount}
                    disabled
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "#f0f0f0" }}
                  />
                </div>
              ))}
              <button
                type="button"
                onClick={addItem}
                style={{
                  padding: "10px 15px",
                  background: "#f0f0f0",
                  border: "1px solid #ccc",
                  borderRadius: "5px",
                  cursor: "pointer",
                }}
              >
                + Add Item
              </button>
            </div>

            <div style={{ marginBottom: "15px", textAlign: "right" }}>
              <p><strong>Subtotal:</strong> ${subtotal.toFixed(2)}</p>
              <p><strong>Tax (10%):</strong> ${tax.toFixed(2)}</p>
              <p style={{ fontSize: "18px", color: "#1e40af" }}><strong>Total:</strong> ${total.toFixed(2)}</p>
            </div>

            <button
              type="submit"
              style={{
                padding: "10px 20px",
                background: "#1e40af",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              Create Invoice
            </button>
          </form>
        </div>
      )}

      <h3>Your Invoices</h3>
      {invoices.length === 0 ? (
        <p>No invoices yet. Create one to get started!</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", border: "1px solid #ccc" }}>
          <thead>
            <tr style={{ background: "#1e40af", color: "white" }}>
              <th style={{ padding: "10px", textAlign: "left" }}>Invoice #</th>
              <th style={{ padding: "10px", textAlign: "left" }}>Client</th>
              <th style={{ padding: "10px", textAlign: "left" }}>Issue Date</th>
              <th style={{ padding: "10px", textAlign: "right" }}>Total</th>
              <th style={{ padding: "10px", textAlign: "center" }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => (
              <tr key={inv.id} style={{ borderBottom: "1px solid #ccc" }}>
                <td style={{ padding: "10px" }}>{inv.invoice_number}</td>
                <td style={{ padding: "10px" }}>{inv.client_name}</td>
                <td style={{ padding: "10px" }}>{inv.issue_date}</td>
                <td style={{ padding: "10px", textAlign: "right" }}>${inv.total.toFixed(2)}</td>
                <td style={{ padding: "10px", textAlign: "center" }}>
                  <button
                    onClick={() => downloadPDF(inv.id, inv.invoice_number)}
                    style={{
                      padding: "8px 15px",
                      background: "#10b981",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                    }}
                  >
                    Download PDF
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

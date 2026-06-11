import { useState, useEffect } from "react";

const formatDateInput = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const formatUpdatedAt = (value) => {
  if (!value) {
    return "Not updated yet";
  }

  if (/\s(?:AEST|AEDT)$/.test(value)) {
    return value;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("token");
  return token ? { Authorization: token } : {};
};

const generateInvoiceNumber = (invoices, date = new Date()) => {
  const year = String(date.getFullYear()).slice(-2);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const period = `${year}${month}`;

  const suffixes = invoices
    .map((invoice) => {
      const match = String(invoice.invoice_number || "").match(new RegExp(`^INV-${period}(\\d{3})$`));
      return match ? Number(match[1]) : 0;
    })
    .filter(Boolean);

  const nextSuffix = String((suffixes.length ? Math.max(...suffixes) : 0) + 1).padStart(3, "0");
  return `INV-${period}${nextSuffix}`;
};

const createInitialFormData = (invoices = []) => {
  const today = new Date();
  const dueDate = formatDateInput(addDays(today, 7));
  return {
    invoice_number: generateInvoiceNumber(invoices, today),
    client_name: "",
    issue_date: formatDateInput(today),
    due_date: dueDate,
    items: [{ description: "", quantity: 1, unit_price: 0, amount: 0 }],
  };
};

export default function Invoice() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ item: "", unit_price: "" });
  const [productMessage, setProductMessage] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState({ client_name: "" });
  const [clientMessage, setClientMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditItems, setShowEditItems] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [formData, setFormData] = useState(createInitialFormData());
  const [user_id, setUserId] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      window.location.href = "/imperial-site/login";
      return;
    }

    const loadInvoicePage = async () => {
      try {
        const res = await fetch("http://127.0.0.1:5000/account", {
          headers: getAuthHeaders(),
        });
        const account = await res.json();

        if (res.status === 401) {
          localStorage.removeItem("token");
          window.location.href = "/imperial-site/login";
          return;
        }

        if (!res.ok || account.account_type !== "Admin") {
          alert("Admin access required.");
          window.location.href = "/imperial-site/account";
          return;
        }

        setUserId(account.id);
        fetchInvoices(account.id);
        fetchProducts();
        fetchClients();
      } catch (err) {
        alert("Failed to check account access: " + err.message);
        window.location.href = "/imperial-site/account";
      }
    };

    loadInvoicePage();
  }, []);

  const fetchInvoices = async (userId) => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/invoices/${userId}`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      setInvoices(data);
      setFormData((prev) =>
        prev.client_name
          ? prev
          : createInitialFormData(data)
      );
    } catch (err) {
      console.error("Failed to fetch invoices:", err);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/products", {
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setProducts(data);
      } else {
        setProductMessage(data.error || "Failed to load products");
      }
    } catch (err) {
      setProductMessage("Failed to load products: " + err.message);
    }
  };

  const fetchClients = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/clients", {
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setClients(data);
      } else {
        setClientMessage(data.error || "Failed to load clients");
      }
    } catch (err) {
      setClientMessage("Failed to load clients: " + err.message);
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

  const handleInvoiceItemSelect = (index, value) => {
    const selectedProduct = products.find((product) => product.item === value);
    const newItems = [...formData.items];

    newItems[index].description = value;
    if (selectedProduct) {
      newItems[index].unit_price = selectedProduct.unit_price;
      newItems[index].amount = newItems[index].quantity * selectedProduct.unit_price;
    }

    setFormData((prev) => ({ ...prev, items: newItems }));
  };

  const handleProductChange = (productId, field, value) => {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId ? { ...product, [field]: value } : product
      )
    );
  };

  const selectedProduct = products.find((product) => product.id === Number(selectedProductId));

  const handleNewProductChange = (e) => {
    const { name, value } = e.target;
    setNewProduct((prev) => ({ ...prev, [name]: value }));
  };

  const selectedClient = clients.find((client) => client.id === Number(selectedClientId));

  const handleClientChange = (clientId, value) => {
    setClients((prev) =>
      prev.map((client) =>
        client.id === clientId ? { ...client, client_name: value } : client
      )
    );
  };

  const handleNewClientChange = (e) => {
    const { name, value } = e.target;
    setNewClient((prev) => ({ ...prev, [name]: value }));
  };

  const handleInvoiceClientSelect = (value) => {
    setFormData((prev) => ({
      ...prev,
      client_name: value,
    }));
  };

  const createClient = async (e) => {
    e.preventDefault();
    setClientMessage("");

    try {
      const res = await fetch("http://127.0.0.1:5000/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(newClient),
      });
      const data = await res.json();

      if (res.ok) {
        setClients((prev) => [...prev, data].sort((a, b) => a.client_name.localeCompare(b.client_name)));
        setNewClient({ client_name: "" });
        setClientMessage("Client created.");
      } else {
        setClientMessage(data.error || "Failed to create client");
      }
    } catch (err) {
      setClientMessage("Failed to create client: " + err.message);
    }
  };

  const updateClient = async (client) => {
    setClientMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/clients/${client.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ client_name: client.client_name }),
      });
      const data = await res.json();

      if (res.ok) {
        setClients((prev) =>
          prev
            .map((item) => (item.id === client.id ? { ...item, ...data } : item))
            .sort((a, b) => a.client_name.localeCompare(b.client_name))
        );
        setClientMessage("Client updated.");
      } else {
        setClientMessage(data.error || "Failed to update client");
      }
    } catch (err) {
      setClientMessage("Failed to update client: " + err.message);
    }
  };

  const deleteClient = async (clientId, clientName) => {
    const confirmed = window.confirm(`Delete client ${clientName}? Existing invoices will not be changed.`);

    if (!confirmed) {
      return;
    }

    setClientMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/clients/${clientId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setClients((prev) => prev.filter((client) => client.id !== clientId));
        if (String(clientId) === String(selectedClientId)) {
          setSelectedClientId("");
        }
        setClientMessage("Client deleted.");
      } else {
        setClientMessage(data.error || "Failed to delete client");
      }
    } catch (err) {
      setClientMessage("Failed to delete client: " + err.message);
    }
  };

  const createProduct = async (e) => {
    e.preventDefault();
    setProductMessage("");

    try {
      const res = await fetch("http://127.0.0.1:5000/products", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(newProduct),
      });
      const data = await res.json();

      if (res.ok) {
        setProducts((prev) => [...prev, data].sort((a, b) => a.item.localeCompare(b.item)));
        setNewProduct({ item: "", unit_price: "" });
        setProductMessage("Product created.");
      } else {
        setProductMessage(data.error || "Failed to create product");
      }
    } catch (err) {
      setProductMessage("Failed to create product: " + err.message);
    }
  };

  const updateProduct = async (product) => {
    setProductMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/products/${product.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          item: product.item,
          unit_price: product.unit_price,
        }),
      });
      const data = await res.json();

      if (res.ok) {
        setProducts((prev) =>
          prev
            .map((item) => (item.id === product.id ? { ...item, ...data } : item))
            .sort((a, b) => a.item.localeCompare(b.item))
        );
        setProductMessage("Product updated.");
      } else {
        setProductMessage(data.error || "Failed to update product");
      }
    } catch (err) {
      setProductMessage("Failed to update product: " + err.message);
    }
  };

  const deleteProduct = async (productId, itemName) => {
    const confirmed = window.confirm(`Delete item ${itemName}? Existing invoices will not be changed.`);

    if (!confirmed) {
      return;
    }

    setProductMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/products/${productId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setProducts((prev) => prev.filter((product) => product.id !== productId));
        if (String(productId) === String(selectedProductId)) {
          setSelectedProductId("");
        }
        setProductMessage("Product deleted.");
      } else {
        setProductMessage(data.error || "Failed to delete product");
      }
    } catch (err) {
      setProductMessage("Failed to delete product: " + err.message);
    }
  };

  const addItem = () => {
    setFormData((prev) => ({
      ...prev,
      items: [...prev.items, { description: "", quantity: 1, unit_price: 0, amount: 0 }],
    }));
  };

  const calculateTotals = () => {
    const total = formData.items.reduce((sum, item) => sum + (item.amount || 0), 0);
    const subtotal = total / 1.1;
    const tax = total - subtotal;
    return { subtotal, tax, total };
  };

  const handleCreateInvoice = async (e) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.invoice_number || !formData.client_name || !formData.issue_date) {
      alert("Please fill in all required fields (Invoice #, Client Name, Issue Date)");
      return;
    }

    // Validate at least one item with product and price
    const hasValidItem = formData.items.some(item => item.description && item.quantity > 0 && item.unit_price > 0);
    if (!hasValidItem) {
      alert("Please add at least one item with product, pkg, and unit price /pkg");
      return;
    }

    const { subtotal, tax, total } = calculateTotals();

    const invoiceData = {
      user_id,
      invoice_number: formData.invoice_number,
      client_name: formData.client_name,
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
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(invoiceData),
      });

      const data = await res.json();

      if (res.ok) {
        alert("Invoice created successfully!");
        setShowCreateForm(false);
        setFormData(createInitialFormData([...invoices, invoiceData]));
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

  const downloadPDF = async (invoiceId, invoiceNumber) => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/invoices/${invoiceId}/pdf`, {
        headers: getAuthHeaders(),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(`Error: ${data.error || "Failed to download PDF"}`);
        return;
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `invoice_${invoiceNumber}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("Failed to download PDF: " + err.message);
    }
  };

  const deleteInvoice = async (invoiceId, invoiceNumber) => {
    const confirmed = window.confirm(`Delete invoice ${invoiceNumber}? This cannot be undone.`);

    if (!confirmed) {
      return;
    }

    try {
      const res = await fetch(`http://127.0.0.1:5000/invoices/${invoiceId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setInvoices((prev) => prev.filter((invoice) => invoice.id !== invoiceId));
      } else {
        alert(`Error: ${data.error || "Failed to delete invoice"}`);
      }
    } catch (err) {
      alert("Failed to delete invoice: " + err.message);
    }
  };

  const toggleCreateInvoice = () => {
    const shouldOpen = !showCreateForm;

    if (shouldOpen) {
      setFormData(createInitialFormData(invoices));
    }

    setShowCreateForm(shouldOpen);
    setShowEditItems(false);
    setShowClients(false);
  };

  const toggleEditItems = () => {
    const shouldOpen = !showEditItems;

    setShowEditItems(shouldOpen);
    setShowCreateForm(false);
    setShowClients(false);
  };

  const toggleClients = () => {
    const shouldOpen = !showClients;

    setShowClients(shouldOpen);
    setShowCreateForm(false);
    setShowEditItems(false);
  };

  const { subtotal, tax, total } = calculateTotals();

  return (
    <div style={{ maxWidth: "1000px", margin: "50px auto", padding: "20px" }}>
      <h2>Invoices</h2>

      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <button
          onClick={toggleCreateInvoice}
          style={{
            padding: "10px 20px",
            background: "#1e40af",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          {showCreateForm ? "Cancel" : "Create Invoice"}
        </button>
        <button
          onClick={toggleEditItems}
          style={{
            padding: "10px 20px",
            background: "#475569",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          {showEditItems ? "Close Items" : "Edit Item"}
        </button>
        <button
          onClick={toggleClients}
          style={{
            padding: "10px 20px",
            background: "#64748b",
            color: "white",
            border: "none",
            borderRadius: "5px",
            cursor: "pointer",
          }}
        >
          {showClients ? "Close Clients" : "Client"}
        </button>
      </div>

      {showClients && (
      <section style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "5px", marginBottom: "30px" }}>
        <h3>Client</h3>
        <form
          onSubmit={createClient}
          style={{ display: "grid", gridTemplateColumns: "2fr auto", gap: "10px", marginBottom: "18px" }}
        >
          <input
            name="client_name"
            placeholder="Client Name"
            value={newClient.client_name}
            onChange={handleNewClientChange}
            required
            style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              background: "#1e40af",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </form>

        {clientMessage && <p style={{ marginBottom: "12px", color: "#475569" }}>{clientMessage}</p>}

        {clients.length === 0 ? (
          <p>No clients yet. Create one above to use it in invoices.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr auto auto", gap: "10px", alignItems: "center" }}>
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "white" }}
            >
              <option value="">Select client to edit</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.client_name}
                </option>
              ))}
            </select>
            <input
              placeholder="Client Name"
              value={selectedClient?.client_name ?? ""}
              disabled={!selectedClient}
              onChange={(e) => handleClientChange(selectedClient.id, e.target.value)}
              style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: selectedClient ? "white" : "#f0f0f0" }}
            />
            <button
              type="button"
              disabled={!selectedClient}
              onClick={() => updateClient(selectedClient)}
              style={{
                padding: "10px 16px",
                background: selectedClient ? "#10b981" : "#94a3b8",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: selectedClient ? "pointer" : "not-allowed",
              }}
            >
              Save
            </button>
            <button
              type="button"
              disabled={!selectedClient}
              onClick={() => deleteClient(selectedClient.id, selectedClient.client_name)}
              style={{
                padding: "10px 16px",
                background: selectedClient ? "#dc2626" : "#94a3b8",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: selectedClient ? "pointer" : "not-allowed",
              }}
            >
              Delete
            </button>
          </div>
        )}
      </section>
      )}

      {showEditItems && (
      <section style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "5px", marginBottom: "30px" }}>
        <h3>Create Item</h3>
        <form
          onSubmit={createProduct}
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr auto", gap: "10px", marginBottom: "18px" }}
        >
          <input
            name="item"
            placeholder="Item"
            value={newProduct.item}
            onChange={handleNewProductChange}
            required
            style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
          />
          <input
            type="number"
            step="0.01"
            name="unit_price"
            placeholder="Unit Price /pkg"
            value={newProduct.unit_price}
            onChange={handleNewProductChange}
            required
            style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
          />
          <button
            type="submit"
            style={{
              padding: "10px 16px",
              background: "#1e40af",
              color: "white",
              border: "none",
              borderRadius: "5px",
              cursor: "pointer",
            }}
          >
            Add
          </button>
        </form>

        {productMessage && <p style={{ marginBottom: "12px", color: "#475569" }}>{productMessage}</p>}

        {products.length === 0 ? (
          <p>No products yet. Create one above to use it in invoices.</p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 2fr 1fr auto auto", gap: "10px", alignItems: "center" }}>
            <select
              value={selectedProductId}
              onChange={(e) => setSelectedProductId(e.target.value)}
              style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "white" }}
            >
              <option value="">Select item to edit</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.item}
                </option>
              ))}
            </select>
            <input
              placeholder="Item name"
              value={selectedProduct?.item ?? ""}
              disabled={!selectedProduct}
              onChange={(e) => handleProductChange(selectedProduct.id, "item", e.target.value)}
              style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: selectedProduct ? "white" : "#f0f0f0" }}
            />
            <input
              type="number"
              step="0.01"
              placeholder="Unit Price /pkg"
              value={selectedProduct?.unit_price ?? ""}
              disabled={!selectedProduct}
              onChange={(e) => handleProductChange(selectedProduct.id, "unit_price", e.target.value)}
              style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: selectedProduct ? "white" : "#f0f0f0" }}
            />
            <button
              type="button"
              disabled={!selectedProduct}
              onClick={() => updateProduct(selectedProduct)}
              style={{
                padding: "10px 16px",
                background: selectedProduct ? "#10b981" : "#94a3b8",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: selectedProduct ? "pointer" : "not-allowed",
              }}
            >
              Save
            </button>
            <button
              type="button"
              disabled={!selectedProduct}
              onClick={() => deleteProduct(selectedProduct.id, selectedProduct.item)}
              style={{
                padding: "10px 16px",
                background: selectedProduct ? "#dc2626" : "#94a3b8",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: selectedProduct ? "pointer" : "not-allowed",
              }}
            >
              Delete
            </button>
            <p style={{ gridColumn: "1 / -1", margin: 0, color: "#64748b", fontSize: "0.9rem" }}>
              Last updated: {formatUpdatedAt(selectedProduct?.updated_at)}
            </p>
          </div>
        )}
      </section>
      )}

      {showCreateForm && (
        <div style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "5px", marginBottom: "30px" }}>
          <h3>Create New Invoice</h3>
          <form onSubmit={handleCreateInvoice}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "15px", marginBottom: "15px" }}>
              <input
                type="text"
                name="invoice_number"
                value={formData.invoice_number}
                readOnly
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "#f0f0f0", color: "#475569" }}
              />
              <select
                name="client_name"
                value={formData.client_name}
                onChange={(e) => handleInvoiceClientSelect(e.target.value)}
                required
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "white" }}
              >
                <option value="">{clients.length ? "Select Client" : "Create clients first"}</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.client_name}>
                    {client.client_name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                name="issue_date"
                value={formData.issue_date}
                readOnly
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "#f0f0f0", color: "#475569" }}
              />
              <input
                type="date"
                value={formData.due_date}
                readOnly
                style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "#f0f0f0", color: "#475569" }}
              />
            </div>

            <h4>Invoice Items</h4>
            <div style={{ marginBottom: "15px" }}>
              {formData.items.map((item, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "10px", marginBottom: "10px" }}>
                  <select
                    value={item.description}
                    onChange={(e) => handleInvoiceItemSelect(index, e.target.value)}
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "white" }}
                  >
                    <option value="">{products.length ? "Select item" : "Create products first"}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.item}>
                        {product.item}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    placeholder="pkg"
                    value={item.quantity}
                    onChange={(e) => handleItemChange(index, "quantity", e.target.value)}
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
                  />
                  <input
                    type="number"
                    placeholder="Unit Price /pkg"
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
              <p><strong>GST included (10%):</strong> ${tax.toFixed(2)}</p>
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
                  <button
                    onClick={() => deleteInvoice(inv.id, inv.invoice_number)}
                    style={{
                      padding: "8px 15px",
                      background: "#dc2626",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                      marginLeft: "8px",
                    }}
                  >
                    Delete
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

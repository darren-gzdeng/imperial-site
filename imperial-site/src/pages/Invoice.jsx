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

const STOCK_HISTORY_PAGE_SIZE = 8;

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
    items: [{ product_id: "", description: "", quantity: 1, unit_price: 0, amount: 0 }],
  };
};

export default function Invoice() {
  const [invoices, setInvoices] = useState([]);
  const [products, setProducts] = useState([]);
  const [newProduct, setNewProduct] = useState({ item: "", unit_price: "", stock_quantity: "", stock_comment: "" });
  const [productMessage, setProductMessage] = useState("");
  const [selectedProductId, setSelectedProductId] = useState("");
  const [stockRows, setStockRows] = useState([]);
  const [stockInputs, setStockInputs] = useState({});
  const [stockComments, setStockComments] = useState({});
  const [stockHistory, setStockHistory] = useState([]);
  const [stockHistoryPage, setStockHistoryPage] = useState(1);
  const [stockHistoryItem, setStockHistoryItem] = useState("");
  const [selectedHistoryProductId, setSelectedHistoryProductId] = useState("");
  const [stockMessage, setStockMessage] = useState("");
  const [clients, setClients] = useState([]);
  const [newClient, setNewClient] = useState({ client_name: "" });
  const [clientMessage, setClientMessage] = useState("");
  const [selectedClientId, setSelectedClientId] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showEditItems, setShowEditItems] = useState(false);
  const [showClients, setShowClients] = useState(false);
  const [showStock, setShowStock] = useState(false);
  const [formData, setFormData] = useState(createInitialFormData());
  const [user_id, setUserId] = useState(null);
  const [accountType, setAccountType] = useState("");

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

        if (!res.ok || !["Admin", "Staff"].includes(account.account_type)) {
          alert("Staff or admin access required.");
          window.location.href = "/imperial-site/account";
          return;
        }

        setUserId(account.id);
        setAccountType(account.account_type);
        fetchInvoices(account.id);
        fetchProducts();
        fetchClients();
        if (account.account_type === "Admin") {
          fetchStock();
        }
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

  const fetchStock = async () => {
    try {
      const res = await fetch("http://127.0.0.1:5000/inventory", {
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setStockRows(data);
        setStockMessage("");
      } else {
        setStockMessage(data.error || "Failed to load stock");
      }
    } catch (err) {
      setStockMessage("Failed to load stock: " + err.message);
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
    const selectedProduct = products.find((product) => String(product.id) === String(value));
    const newItems = [...formData.items];

    newItems[index].product_id = value;
    newItems[index].description = selectedProduct?.item || "";
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
        setNewProduct({ item: "", unit_price: "", stock_quantity: "", stock_comment: "" });
        setProductMessage("Product created.");
        fetchStock();
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
      items: [...prev.items, { product_id: "", description: "", quantity: 1, unit_price: 0, amount: 0 }],
    }));
  };

  const deleteItem = (index) => {
    setFormData((prev) => {
      if (prev.items.length <= 1) {
        return {
          ...prev,
          items: [{ product_id: "", description: "", quantity: 1, unit_price: 0, amount: 0 }],
        };
      }

      return {
        ...prev,
        items: prev.items.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  };

  const handleStockInputChange = (productId, value) => {
    setStockInputs((prev) => ({ ...prev, [productId]: value }));
  };

  const handleStockCommentChange = (productId, value) => {
    setStockComments((prev) => ({ ...prev, [productId]: value }));
  };

  const fetchStockHistory = async (productId) => {
    try {
      const res = await fetch(`http://127.0.0.1:5000/inventory/${productId}/history`, {
        headers: getAuthHeaders(),
      });
      const data = await res.json();

      if (res.ok) {
        setSelectedHistoryProductId(productId);
        setStockHistoryItem(data.item);
        setStockHistory(data.history);
        setStockHistoryPage(1);
        setStockMessage("");
      } else {
        setStockMessage(data.error || "Failed to load stock history");
      }
    } catch (err) {
      setStockMessage("Failed to load stock history: " + err.message);
    }
  };

  const addStock = async (productId) => {
    const quantity = stockInputs[productId];
    const comment = stockComments[productId] || "";
    setStockMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/inventory/${productId}/stock-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ quantity, comment }),
      });
      const data = await res.json();

      if (res.ok) {
        setStockRows((prev) =>
          prev.map((row) =>
            row.product_id === productId
              ? { ...row, stock_quantity: data.stock_quantity }
              : row
          )
        );
        setProducts((prev) =>
          prev.map((product) =>
            product.id === productId
              ? { ...product, stock_quantity: data.stock_quantity }
              : product
          )
        );
        setStockInputs((prev) => ({ ...prev, [productId]: "" }));
        setStockComments((prev) => ({ ...prev, [productId]: "" }));
        setStockMessage("Stock updated.");
        if (String(selectedHistoryProductId) === String(productId)) {
          fetchStockHistory(productId);
        }
      } else {
        setStockMessage(data.error || "Failed to update stock");
      }
    } catch (err) {
      setStockMessage("Failed to update stock: " + err.message);
    }
  };

  const removeStock = async (productId) => {
    const quantity = stockInputs[productId];
    const comment = stockComments[productId] || "";
    setStockMessage("");

    try {
      const res = await fetch(`http://127.0.0.1:5000/inventory/${productId}/stock-out`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ quantity, comment }),
      });
      const data = await res.json();

      if (res.ok) {
        setStockRows((prev) =>
          prev.map((row) =>
            row.product_id === productId
              ? { ...row, stock_quantity: data.stock_quantity }
              : row
          )
        );
        setProducts((prev) =>
          prev.map((product) =>
            product.id === productId
              ? { ...product, stock_quantity: data.stock_quantity }
              : product
          )
        );
        setStockInputs((prev) => ({ ...prev, [productId]: "" }));
        setStockComments((prev) => ({ ...prev, [productId]: "" }));
        setStockMessage("Stock removed.");
        if (String(selectedHistoryProductId) === String(productId)) {
          fetchStockHistory(productId);
        }
      } else {
        setStockMessage(data.error || "Failed to remove stock");
      }
    } catch (err) {
      setStockMessage("Failed to remove stock: " + err.message);
    }
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
        fetchProducts();
        if (accountType === "Admin") {
          fetchStock();
        }
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
        fetchProducts();
        if (accountType === "Admin") {
          fetchStock();
        }
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
    setShowStock(false);
  };

  const toggleEditItems = () => {
    if (accountType !== "Admin") {
      return;
    }

    const shouldOpen = !showEditItems;

    setShowEditItems(shouldOpen);
    setShowCreateForm(false);
    setShowClients(false);
    setShowStock(false);
  };

  const toggleClients = () => {
    if (accountType !== "Admin") {
      return;
    }

    const shouldOpen = !showClients;

    setShowClients(shouldOpen);
    setShowCreateForm(false);
    setShowEditItems(false);
    setShowStock(false);
  };

  const toggleStock = () => {
    if (accountType !== "Admin") {
      return;
    }

    const shouldOpen = !showStock;

    setShowStock(shouldOpen);
    setShowCreateForm(false);
    setShowEditItems(false);
    setShowClients(false);

    if (shouldOpen) {
      fetchStock();
    }
  };

  const { subtotal, tax, total } = calculateTotals();
  const isAdmin = accountType === "Admin";
  const stockHistoryPageCount = Math.max(1, Math.ceil(stockHistory.length / STOCK_HISTORY_PAGE_SIZE));
  const visibleStockHistory = stockHistory.slice(
    (stockHistoryPage - 1) * STOCK_HISTORY_PAGE_SIZE,
    stockHistoryPage * STOCK_HISTORY_PAGE_SIZE
  );
  const stockGridColumns = "minmax(270px, 1.8fr) 96px 88px minmax(220px, 1.4fr) 78px 92px 92px";
  const productEditGridColumns = "1.4fr 2fr 1fr 64px 70px";
  const stockInputStyle = {
    width: "100%",
    height: "38px",
    boxSizing: "border-box",
    padding: "0 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    fontSize: "0.9rem",
  };
  const stockButtonStyle = {
    width: "100%",
    height: "38px",
    border: "none",
    borderRadius: "6px",
    color: "white",
    fontSize: "0.84rem",
    fontWeight: 700,
    cursor: "pointer",
  };

  return (
    <div style={{ maxWidth: "1180px", margin: "50px auto", padding: "20px" }}>
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
        {isAdmin && (
          <>
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
            <button
              onClick={toggleStock}
              style={{
                padding: "10px 20px",
                background: "#0f766e",
                color: "white",
                border: "none",
                borderRadius: "5px",
                cursor: "pointer",
              }}
            >
              {showStock ? "Close Stock" : "Stock Check"}
            </button>
          </>
        )}
      </div>

      {isAdmin && showStock && (
      <section style={{ border: "1px solid #d7dbe2", padding: "20px", borderRadius: "8px", marginBottom: "30px", background: "#ffffff" }}>
        <h3 style={{ margin: "0 0 16px", fontSize: "1.25rem" }}>Stock Check</h3>
        {stockMessage && <p style={{ marginBottom: "12px", color: "#475569" }}>{stockMessage}</p>}

        {stockRows.length === 0 ? (
          <p>No products yet. Create items first.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
          <div style={{ display: "grid", gap: "0", minWidth: "1038px" }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: stockGridColumns,
                columnGap: "12px",
                alignItems: "center",
                padding: "0 0 10px",
                borderBottom: "1px solid #e2e8f0",
                color: "#0f172a",
                fontSize: "0.9rem",
                fontWeight: 700,
              }}
            >
              <span>Item</span>
              <span style={{ textAlign: "right" }}>Stock</span>
              <span>Qty</span>
              <span>Comment</span>
              <span style={{ textAlign: "center" }}>History</span>
              <span style={{ textAlign: "center" }}>In</span>
              <span style={{ textAlign: "center" }}>Out</span>
            </div>
            {stockRows.map((row) => (
              <div
                key={row.product_id}
                style={{
                  display: "grid",
                  gridTemplateColumns: stockGridColumns,
                  columnGap: "12px",
                  alignItems: "center",
                  minHeight: "56px",
                  padding: "8px 0",
                  borderBottom: "1px solid #eef2f7",
                }}
              >
                <span style={{ lineHeight: 1.25 }}>{row.item}</span>
                <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {Number(row.stock_quantity || 0).toFixed(2)}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Qty"
                  value={stockInputs[row.product_id] || ""}
                  onChange={(e) => handleStockInputChange(row.product_id, e.target.value)}
                  style={stockInputStyle}
                />
                <input
                  placeholder="Comment"
                  value={stockComments[row.product_id] || ""}
                  onChange={(e) => handleStockCommentChange(row.product_id, e.target.value)}
                  style={stockInputStyle}
                />
                <button
                  type="button"
                  onClick={() => fetchStockHistory(row.product_id)}
                  style={{
                    ...stockButtonStyle,
                    background: "#475569",
                  }}
                >
                  View
                </button>
                <button
                  type="button"
                  onClick={() => addStock(row.product_id)}
                  style={{
                    ...stockButtonStyle,
                    background: "#0f766e",
                  }}
                >
                  Stock In
                </button>
                <button
                  type="button"
                  onClick={() => removeStock(row.product_id)}
                  style={{
                    ...stockButtonStyle,
                    background: "#b42318",
                  }}
                >
                  Stock Out
                </button>
              </div>
            ))}
          </div>
          </div>
        )}

        {selectedHistoryProductId && (
          <div style={{ marginTop: "24px", borderTop: "1px solid #e2e8f0", paddingTop: "18px" }}>
            <h4 style={{ margin: "0 0 12px" }}>Stock history: {stockHistoryItem}</h4>
            {stockHistory.length === 0 ? (
              <p>No stock history yet.</p>
            ) : (
              <table style={{ width: "100%", tableLayout: "fixed", borderCollapse: "collapse", border: "1px solid #ccc" }}>
                <colgroup>
                  <col style={{ width: "20%" }} />
                  <col style={{ width: "13%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "28%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr style={{ background: "#0f766e", color: "white" }}>
                    <th style={{ padding: "10px", textAlign: "left" }}>Time</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Action</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Change</th>
                    <th style={{ padding: "10px", textAlign: "right" }}>Stock after</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>Comment</th>
                    <th style={{ padding: "10px", textAlign: "left" }}>By</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleStockHistory.map((entry) => (
                    <tr key={entry.id} style={{ borderBottom: "1px solid #ccc" }}>
                      <td style={{ padding: "10px", wordBreak: "break-word" }}>{entry.created_at}</td>
                      <td style={{ padding: "10px", wordBreak: "break-word" }}>{entry.action_type}</td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        {Number(entry.change_quantity || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: "10px", textAlign: "right" }}>
                        {Number(entry.stock_after || 0).toFixed(2)}
                      </td>
                      <td style={{ padding: "10px", wordBreak: "break-word" }}>{entry.comment || "-"}</td>
                      <td style={{ padding: "10px", wordBreak: "break-word" }}>{entry.created_by || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {stockHistory.length > STOCK_HISTORY_PAGE_SIZE && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "10px",
                  marginTop: "12px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setStockHistoryPage((page) => Math.max(1, page - 1))}
                  disabled={stockHistoryPage === 1}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    background: stockHistoryPage === 1 ? "#f1f5f9" : "#ffffff",
                    color: stockHistoryPage === 1 ? "#94a3b8" : "#334155",
                    cursor: stockHistoryPage === 1 ? "not-allowed" : "pointer",
                  }}
                >
                  Previous
                </button>
                <span style={{ color: "#475569", fontSize: "0.9rem" }}>
                  Page {stockHistoryPage} of {stockHistoryPageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setStockHistoryPage((page) => Math.min(stockHistoryPageCount, page + 1))}
                  disabled={stockHistoryPage === stockHistoryPageCount}
                  style={{
                    padding: "8px 12px",
                    border: "1px solid #cbd5e1",
                    borderRadius: "6px",
                    background: stockHistoryPage === stockHistoryPageCount ? "#f1f5f9" : "#ffffff",
                    color: stockHistoryPage === stockHistoryPageCount ? "#94a3b8" : "#334155",
                    cursor: stockHistoryPage === stockHistoryPageCount ? "not-allowed" : "pointer",
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </section>
      )}

      {isAdmin && showClients && (
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

      {isAdmin && showEditItems && (
      <section style={{ border: "1px solid #ccc", padding: "20px", borderRadius: "5px", marginBottom: "30px" }}>
        <h3>Create Item</h3>
        <form
          onSubmit={createProduct}
          style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1.5fr auto", gap: "10px", marginBottom: "18px" }}
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
          <input
            type="number"
            step="0.01"
            min="0"
            name="stock_quantity"
            placeholder="Initial Stock"
            value={newProduct.stock_quantity}
            onChange={handleNewProductChange}
            style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px" }}
          />
          <input
            name="stock_comment"
            placeholder="Stock comment"
            value={newProduct.stock_comment}
            onChange={handleNewProductChange}
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
          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: productEditGridColumns,
                gap: "10px",
                marginBottom: "6px",
                color: "#334155",
                fontSize: "0.85rem",
                fontWeight: 700,
              }}
            >
              <span></span>
              <span style={{ justifySelf: "start" }}>Item name</span>
              <span style={{ justifySelf: "start" }}>Unit price</span>
              <span></span>
              <span></span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: productEditGridColumns, gap: "10px", alignItems: "center" }}>
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
                  width: "100%",
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
                  width: "100%",
                  background: selectedProduct ? "#dc2626" : "#94a3b8",
                  color: "white",
                  border: "none",
                  borderRadius: "5px",
                  cursor: selectedProduct ? "pointer" : "not-allowed",
                }}
              >
                Delete
              </button>
            </div>
            <p style={{ margin: "10px 0 0", color: "#64748b", fontSize: "0.9rem" }}>
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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "2fr 1fr 1fr 1fr auto",
                  gap: "10px",
                  marginBottom: "6px",
                  color: "#334155",
                  fontSize: "0.85rem",
                  fontWeight: 700,
                }}
              >
                <span>Item</span>
                <span>Quantity</span>
                <span>Unit price</span>
                <span>Amount</span>
                <span></span>
              </div>
              {formData.items.map((item, index) => (
                <div key={index} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: "10px", marginBottom: "10px" }}>
                  <select
                    value={item.product_id}
                    onChange={(e) => handleInvoiceItemSelect(index, e.target.value)}
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "white" }}
                  >
                    <option value="">{products.length ? "Select item" : "Create products first"}</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.item} ({Number(product.stock_quantity || 0).toFixed(2)} in stock)
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
                    readOnly
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "#f0f0f0", color: "#475569" }}
                  />
                  <input
                    type="number"
                    placeholder="Amount"
                    value={item.amount}
                    disabled
                    style={{ padding: "10px", border: "1px solid #ccc", borderRadius: "5px", background: "#f0f0f0" }}
                  />
                  <button
                    type="button"
                    onClick={() => deleteItem(index)}
                    style={{
                      padding: "10px 14px",
                      background: "#dc2626",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
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
                  {isAdmin && (
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
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
